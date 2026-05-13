import { ObdaMapping } from '../types';

// ─── Section detection ──────────────────────────────────────────────────────

enum Section { None, PrefixDeclaration, MappingDeclaration }

const SECTION_PREFIX     = '[PrefixDeclaration]';
const SECTION_MAPPING    = '[MappingDeclaration]';
const COLLECTION_OPEN    = '@collection [[';
const COLLECTION_CLOSE   = ']]';

function detectSection(line: string): Section | null {
  const trimmed = line.trim();
  if (trimmed === SECTION_PREFIX) {
    return Section.PrefixDeclaration;
  }
  if (trimmed.startsWith(SECTION_MAPPING)) {
    return Section.MappingDeclaration;
  }
  return null;
}

// ─── Comment detection ──────────────────────────────────────────────────────
// Spec says ; for comments. File uses # (common convention). Support both.

function isComment(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith(';') || trimmed.startsWith('#');
}

// ─── Mapping field keys ─────────────────────────────────────────────────────

type FieldKey = 'mappingId' | 'target' | 'source';

const FIELD_KEYS: FieldKey[] = ['mappingId', 'target', 'source'];

/** Check if a line starts with one of the known field keys.
 *  Returns the key and the content after it, or null. */
function parseFieldStart(line: string): { key: FieldKey; content: string; prefixLen: number } | null {
  const trimmed = line.trimStart();
  const leadingSpaces = line.length - trimmed.length;

  for (const key of FIELD_KEYS) {
    // Field key must be followed by whitespace
    if (trimmed.length > key.length &&
        trimmed.slice(0, key.length) === key &&
        /\s/.test(trimmed[key.length])) {
      const content = trimmed.slice(key.length).trimStart();
      const prefixLen = leadingSpaces + key.length + (trimmed.length - key.length - trimmed.slice(key.length).trimStart().length);
      return { key, content, prefixLen };
    }
  }
  return null;
}

// ─── Raw mapping block ──────────────────────────────────────────────────────

interface RawMappingBlock {
  id: string;
  idLine: number;             // 0-indexed line in the full file
  targetLines: string[];      // raw target text parts
  targetStartLine: number;
  sourceLines: string[];      // raw source text parts
  sourceStartLine: number;
  sourceFirstLineOffset: number;  // chars before SQL content on source's first line
}

// ─── Placeholder extraction ─────────────────────────────────────────────────
// Extract {col} placeholders from target template.
// ex: "ex:penduduk/{nik} a ex:Penduduk ; ex:nama {nama}^^xsd:string ."
// → ['nik', 'nama']

function extractPlaceholders(target: string): string[] {
  const result = new Set<string>();
  const matches = target.matchAll(/\{(\w+)\}/g);
  for (const match of matches) {
    result.add(match[1]);
  }
  return [...result];
}

// ─── SQL column extraction ──────────────────────────────────────────────────
// Parse SELECT column names from SQL source query.

function parseSelectColumns(query: string): string[] {
  // Find SELECT ... FROM boundaries
  const normalized = query.replace(/\s+/g, ' ');
  const selectIdx = normalized.search(/\bSELECT\b/i);
  if (selectIdx === -1) { return []; }

  // Find FROM at depth 0
  const afterSelect = selectIdx + 6; // length of "SELECT"
  let depth = 0;
  let fromIdx = -1;
  for (let i = afterSelect; i < normalized.length - 3; i++) {
    if (normalized[i] === '(') { depth++; }
    else if (normalized[i] === ')') { depth--; }
    else if (depth === 0 &&
             /\bFROM\b/i.test(normalized.slice(i, i + 4)) &&
             (i === 0 || /\s/.test(normalized[i - 1])) &&
             (i + 4 >= normalized.length || /\s/.test(normalized[i + 4]))) {
      fromIdx = i;
      break;
    }
  }

  if (fromIdx === -1) { return []; }

  const selectPart = normalized.slice(afterSelect, fromIdx).trim();

  // Split by comma at depth 0
  const parts: string[] = [];
  depth = 0;
  let current = '';
  for (const ch of selectPart) {
    if (ch === '(') { depth++; current += ch; }
    else if (ch === ')') { depth--; current += ch; }
    else if (ch === ',' && depth === 0) { parts.push(current.trim()); current = ''; }
    else { current += ch; }
  }
  if (current.trim()) { parts.push(current.trim()); }

  // Extract column name or alias from each part
  return parts.map(part => {
    part = part.replace(/\s+/g, ' ').trim();
    // Check for AS alias
    const asMatch = part.match(/\bAS\s+(\w+)\s*$/i);
    if (asMatch) { return asMatch[1]; }
    // Last word is the column name
    const wordMatch = part.match(/(\w+)\s*$/);
    return wordMatch ? wordMatch[1] : part;
  }).filter(c => c && c.toUpperCase() !== 'DISTINCT');
}

// ─── FROM clause extraction ─────────────────────────────────────────────────

interface FromRef {
  fromModel: string;
  fromView: string;
  fromRaw: string;
  fromLine: number;       // absolute line in file
  fromStartChar: number;
  fromEndChar: number;
}

function extractFromRef(
  sourceLines: string[],
  sourceStartLine: number,
  sourceFirstLineOffset: number
): FromRef {
  const empty: FromRef = {
    fromModel: '', fromView: '', fromRaw: '',
    fromLine: sourceStartLine, fromStartChar: 0, fromEndChar: 0,
  };

  for (let i = 0; i < sourceLines.length; i++) {
    const line = sourceLines[i];
    const fromKeywordIdx = line.search(/\bFROM\b/i);
    if (fromKeywordIdx === -1) { continue; }

    // Get the table reference after FROM
    const afterFrom = line.slice(fromKeywordIdx + 4);
    const refMatch = afterFrom.match(/^\s+([\w.]+)/);
    if (!refMatch) { continue; }

    const fromRaw = refMatch[1];
    const dotIdx = fromRaw.indexOf('.');
    const fromModel = dotIdx !== -1 ? fromRaw.slice(0, dotIdx) : '';
    const fromView = dotIdx !== -1 ? fromRaw.slice(dotIdx + 1) : fromRaw;

    const leadingWhitespace = afterFrom.length - afterFrom.trimStart().length;
    let fromStartChar = fromKeywordIdx + 4 + leadingWhitespace;
    // On first source line, add the prefix offset
    if (i === 0) {
      fromStartChar += sourceFirstLineOffset;
    }
    const fromEndChar = fromStartChar + fromRaw.length;

    return {
      fromModel, fromView, fromRaw,
      fromLine: sourceStartLine + i,
      fromStartChar,
      fromEndChar,
    };
  }

  return empty;
}

// ─── Mapping segments (OBDA spec) ─────────────────────────────────────────
// Mandatory blank lines separate consecutive mappings inside @collection [[ ... ]].

interface LineCtx {
  absLine: number;
  text: string;
}

/** Split mapping section lines into segments separated only by blank lines. */
function splitMappingSegments(lines: string[], sectionStartAbs: number): LineCtx[][] {
  const segments: LineCtx[][] = [];
  let current: LineCtx[] = [];

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    const absLine = sectionStartAbs + i;
    if (text.trim() === '') {
      if (current.length) {
        segments.push(current);
        current = [];
      }
      continue;
    }
    current.push({ absLine, text });
  }
  if (current.length) {
    segments.push(current);
  }
  return segments;
}

/** Parse one mapping segment. More than one mappingId in one segment is invalid → null. */
function parseSegmentToRawBlock(segment: LineCtx[]): RawMappingBlock | null {
  let currentKey: FieldKey | null = null;
  let block: Partial<RawMappingBlock> = {};
  let mappingIdSeen = false;

  for (const { absLine, text: line } of segment) {
    if (isComment(line)) {
      continue;
    }

    const field = parseFieldStart(line);
    if (field) {
      if (field.key === 'mappingId') {
        if (mappingIdSeen) {
          return null;
        }
        mappingIdSeen = true;
        block.id = field.content;
        block.idLine = absLine;
        currentKey = field.key;
        continue;
      }

      currentKey = field.key;
      switch (field.key) {
        case 'target':
          block.targetStartLine = absLine;
          block.targetLines = [field.content];
          break;

        case 'source':
          block.sourceStartLine = absLine;
          block.sourceLines = [field.content];
          block.sourceFirstLineOffset = field.prefixLen;
          break;
      }
    } else if (currentKey) {
      switch (currentKey) {
        case 'target':
          (block.targetLines ??= []).push(line.trim());
          break;
        case 'source':
          (block.sourceLines ??= []).push(line);
          break;
      }
    }
  }

  const id = block.id;
  const idLine = block.idLine;
  if (!mappingIdSeen || typeof id !== 'string' || idLine === undefined) {
    return null;
  }
  if (!block.targetLines?.length || !block.sourceLines?.length) {
    return null;
  }

  return block as RawMappingBlock;
}

// ─── Main parser ────────────────────────────────────────────────────────────

export function parseObda(text: string): ObdaMapping[] {
  const lines = text.split('\n');

  // Phase 1: Find the MappingDeclaration section
  let currentSection = Section.None;
  let mappingSectionStart = -1;
  let mappingSectionEnd = lines.length - 1;

  for (let i = 0; i < lines.length; i++) {
    const detected = detectSection(lines[i]);
    if (detected !== null) {
      if (detected === Section.MappingDeclaration) {
        currentSection = Section.MappingDeclaration;
        // The content starts on the next line after @collection [[
        // or on the same line if there's no @collection header
        const headerLine = lines[i].trim();
        if (headerLine.includes(COLLECTION_OPEN)) {
          mappingSectionStart = i + 1;
        } else {
          mappingSectionStart = i + 1;
        }
      } else if (currentSection === Section.MappingDeclaration) {
        // Another section started, end the mapping section
        mappingSectionEnd = i - 1;
        break;
      }
    }

    // Check for ]] closing
    if (currentSection === Section.MappingDeclaration &&
        lines[i].trim() === COLLECTION_CLOSE) {
      mappingSectionEnd = i - 1;
      break;
    }
  }

  if (mappingSectionStart === -1) {
    return [];
  }

  // Phase 2: Extract mapping section lines
  const mappingLines = lines.slice(mappingSectionStart, mappingSectionEnd + 1);

  const segments = splitMappingSegments(mappingLines, mappingSectionStart);
  const rawBlocks: RawMappingBlock[] = [];
  for (const segment of segments) {
    const block = parseSegmentToRawBlock(segment);
    if (block !== null) {
      rawBlocks.push(block);
    }
  }

  // Phase 4: Convert raw blocks to ObdaMapping
  const mappings: ObdaMapping[] = [];

  for (const block of rawBlocks) {
    if (!block.sourceLines?.length || !block.targetLines?.length) {
      continue;
    }

    const targetText = block.targetLines.join(' ');
    const sourceText = block.sourceLines.join('\n');

    const targetPlaceholders = extractPlaceholders(targetText);
    const sourceColumns = parseSelectColumns(sourceText);

    const fromRef = extractFromRef(
      block.sourceLines,
      block.sourceStartLine,
      block.sourceFirstLineOffset
    );

    mappings.push({
      id: block.id,
      idLine: block.idLine,
      targetTemplate: targetText.trim(),
      targetLine: block.targetStartLine,
      targetPlaceholders,
      sourceQuery: sourceText,
      sourceLine: block.sourceStartLine,
      sourceFirstLineOffset: block.sourceFirstLineOffset,
      sourceColumns,
      ...fromRef,
    });
  }

  return mappings;
}

import { ObdaMapping } from '../types';
import {
  parse,
  firstMappingBlock,
  subsequentMappingBlock,
  mappingSection,
  ASTKinds,
} from './obdaParserGenerated';

type MappingBlock = firstMappingBlock | subsequentMappingBlock;

// ─── Placeholder extraction ────────────────────────────────────────────────

function extractPlaceholders(target: string): string[] {
  const result = new Set<string>();
  const matches = target.matchAll(/\{(\w+)\}/g);
  for (const match of matches) {
    result.add(match[1]);
  }
  return [...result];
}

// ─── SQL column extraction ─────────────────────────────────────────────────

function parseSelectColumns(query: string): string[] {
  const normalized = query.replace(/\s+/g, ' ');
  const selectIdx = normalized.search(/\bSELECT\b/i);
  if (selectIdx === -1) { return []; }

  const afterSelect = selectIdx + 6;
  let depth = 0;
  let fromIdx = -1;
  for (let i = afterSelect; i < normalized.length - 3; i++) {
    if (normalized[i] === '(') { 
      depth++; 
    }else if (normalized[i] === ')') { 
      depth--; 
    }else if (depth === 0 &&
             /\bFROM\b/i.test(normalized.slice(i, i + 4)) &&
             (i === 0 || /\s/.test(normalized[i - 1])) &&
             (i + 4 >= normalized.length || /\s/.test(normalized[i + 4]))) {
      fromIdx = i;
      break;
    }
  }

  if (fromIdx === -1) { 
    return []; 
  }

  const selectPart = normalized.slice(afterSelect, fromIdx).trim();

  const parts: string[] = [];
  depth = 0;
  let current = '';
  for (const ch of selectPart) {
    if (ch === '(') { 
      depth++; 
      current += ch; 
    }else if (ch === ')') { 
      depth--; 
      current += ch; 
    }else if (ch === ',' && depth === 0) { 
      parts.push(current.trim()); 
      current = ''; 
    }else { 
      current += ch; 
    }
  }
  if (current.trim()) { 
    parts.push(current.trim()); 
  }

  // Extract column name or alias from each part
  return parts.map(part => {
    part = part.replace(/\s+/g, ' ').trim();
    // Check for AS alias
    const asMatch = part.match(/\bAS\s+(\w+)\s*$/i);
    if (asMatch) { 
      return asMatch[1]; 
    }
    // Last word is the column name
    const wordMatch = part.match(/(\w+)\s*$/);
    return wordMatch ? wordMatch[1] : part;
  }).filter(c => c && c.toUpperCase() !== 'DISTINCT');
}

// ─── FROM clause extraction ────────────────────────────────────────────────

interface FromRef {
  fromModel: string;
  fromView: string;
  fromRaw: string;
  fromLine: number;       
  fromStartChar: number;
  fromEndChar: number;
}

function extractFromRef(
  sourceLines: string[],
  sourceStartLine: number,
  sourceFirstLineOffset: number,
  sourceLineOffsets: number[]
): FromRef {
  const empty: FromRef = {
    fromModel: '', fromView: '', fromRaw: '',
    fromLine: sourceStartLine, fromStartChar: 0, fromEndChar: 0,
  };

  for (let i = 0; i < sourceLines.length; i++) {
    const line = sourceLines[i];
    const fromKeywordIdx = line.search(/\bFROM\b/i);
    if (fromKeywordIdx === -1) { 
      continue; 
    }

    // Get the table reference after FROM
    const afterFrom = line.slice(fromKeywordIdx + 4);
    const refMatch = afterFrom.match(/^\s+([\w.]+)/);
    if (!refMatch) { continue; }

    const fromRaw = refMatch[1];
    const dotIdx = fromRaw.indexOf('.');
    const fromModel = dotIdx !== -1 ? fromRaw.slice(0, dotIdx) : '';
    const fromView = dotIdx !== -1 ? fromRaw.slice(dotIdx + 1) : fromRaw;

    const leadingWhitespace = afterFrom.length - afterFrom.trimStart().length;
    const lineOffset = sourceLineOffsets[i] ?? (i === 0 ? sourceFirstLineOffset : 0);
    let fromStartChar = fromKeywordIdx + 4 + leadingWhitespace + lineOffset;
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

// ─── AST to ObdaMapping conversion ─────────────────────────────────────────

function blockToMapping(block: MappingBlock): ObdaMapping {
  // tsPEG uses 1-based line numbers; our contract uses 0-based
  const idLine = block.idPart.idPos.line - 1;
  const targetLine = block.targetPart.targetPos.line - 1;
  const sourceLine = block.sourcePart.sourcePos.line - 1;

  // sourceFirstLineOffset: column where the first source content starts
  // ("source" keyword + spaces). sourceOffset is captured right before the first source content.
  const sourceFirstLineOffset = block.sourcePart.sourceOffset.offset;

  // Assemble target text (multi-line joined by space)
  const targetText = [
    block.targetPart.firstLine,
    ...block.targetPart.continuations.map(c => c.value),
  ].join(' ').trim();

  // Assemble source text (multi-line joined by newline)
  const sourceFirstLine = block.sourcePart.firstLine;
  const sourceContLines = block.sourcePart.continuations.map(c => c.value);
  const sourceLines = [sourceFirstLine, ...sourceContLines];
  const sourceText = sourceLines.join('\n');

  const sourceLineOffsets: number[] = [sourceFirstLineOffset];
  for (const cont of block.sourcePart.continuations) {
    const contOffset = (cont as { offset?: { offset: number } }).offset?.offset;
    sourceLineOffsets.push(contOffset ?? 0);
  }

  const targetPlaceholders = extractPlaceholders(targetText);
  const sourceColumns = parseSelectColumns(sourceText);

  const fromRef = extractFromRef(
    sourceLines,
    sourceLine,
    sourceFirstLineOffset,
    sourceLineOffsets,
  );

  return {
    id: block.idPart.id.trim(),
    idLine,
    targetTemplate: targetText,
    targetLine,
    targetPlaceholders,
    sourceQuery: sourceText,
    sourceLine,
    sourceFirstLineOffset,
    sourceLineOffsets,
    sourceColumns,
    ...fromRef,
  };
}

// ─── Main parser ───────────────────────────────────────────────────────────

export function parseObda(text: string): ObdaMapping[] {
  const result = parse(text);

  if (!result.ast || result.errs.length > 0) {
    return [];
  }

  // Find the mapping section
  let mapSection: mappingSection | null = null;
  for (const section of result.ast.sections) {
    if (section.kind === ASTKinds.mappingSection) {
      mapSection = section;
      break;
    }
  }

  if (!mapSection) {
    return [];
  }

  const blocks: MappingBlock[] = [];
  if (mapSection.firstBlock) {
    blocks.push(mapSection.firstBlock);
  }
  if (mapSection.restBlocks) {
    blocks.push(...mapSection.restBlocks);
  }

  return blocks.map(blockToMapping);
}

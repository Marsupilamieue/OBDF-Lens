import { XMLParser } from 'fast-xml-parser';
import { VdbData, VdbModel, VdbSource, VdbView } from '../types';

const CDATA_BEGIN = '<![CDATA[';

const vdbXmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  trimValues: true,
  ignoreDeclaration: true,
  allowBooleanAttributes: true,
  unpairedTags: ['source'],
  captureMetaData: true,
});

const xmlMeta = XMLParser.getMetaDataSymbol();

function asArray<T>(x: T | T[] | undefined): T[] {
  if (x === undefined) { 
    return []; 
  }
  return Array.isArray(x) ? x : [x];
}

/** 0-based line and column, matching vscode.Position. */
function posAt(xml: string, index: number): { line: number; col: number } {
  if (index <= 0) { 
    return { line: 0, col: 0 }; 
  }
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < index && i < xml.length; i++) {
    if (xml[i] === '\n') {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, col: index - lineStart };
}

function nodeStartIndex(node: unknown): number | undefined {
  if (!node || typeof node !== 'object') {
    return undefined;
  }
  const m = (node as Record<PropertyKey, unknown>)[xmlMeta as unknown as PropertyKey] as { startIndex?: number } | undefined;
  return typeof m?.startIndex === 'number' ? m.startIndex : undefined;
}

/** DDL inside <![CDATA[...]]>; null if malformed. */
function cdataSliceAfter(xml: string, searchFrom: number): { ddl: string; bodyStartAbs: number } | null {
  const open = xml.indexOf(CDATA_BEGIN, searchFrom);
  if (open === -1) { 
    return null; 
  }
  const bodyStartAbs = open + CDATA_BEGIN.length;
  const close = xml.indexOf(']]>', bodyStartAbs);
  if (close === -1) { 
    return null; 
  }
  return { ddl: xml.slice(bodyStartAbs, close), bodyStartAbs };
}

function extractRawIdentifier(expr: string): string {
  const trimmed = expr.trim();
  if (/^\w+$/.test(trimmed)) { return trimmed; }
  const insideParen = trimmed.match(/\(\s*(\w+)/);
  if (insideParen) { return insideParen[1]; }
  const qualified = trimmed.match(/\w+\.(\w+)/);
  if (qualified) { return qualified[1]; }
  const lastWord = trimmed.match(/(\w+)\s*$/);
  return lastWord ? lastWord[1] : trimmed;
}

// ambil kolom dari sql select
export function parseSelectColumns(
  selectClause: string
): { exposedColumns: string[]; aliasMap: Record<string, string> } {
  const exposedColumns: string[] = [];
  const aliasMap: Record<string, string> = {};

  const normalized = selectClause.replace(/\s+/g, ' ').trim();

  const parts: string[] = [];
  let depth = 0, current = '';
  for (const ch of normalized) {
    if (ch === '(') { 
      depth++; 
      current += ch; 
    } else if (ch === ')') {
      depth--;
      current += ch; 
    } else if (ch === ',' && depth === 0) { 
      parts.push(current.trim()); 
      current = ''; 
    } else { 
      current += ch; 
    }
  }
  if (current.trim()) { 
    parts.push(current.trim()); 
  }

  for (const part of parts) {
    const asMatch = part.match(/\bAS\s+(\w+)\s*$/i);
    if (asMatch) {
      const alias = asMatch[1];
      const beforeAs = part.slice(0, part.lastIndexOf(asMatch[0])).trim();
      // extractRawIdentifier handles complex expressions:
      // "CAST(nominal AS BIGINT)" → "nominal"  (not "BIGINT" — that was the bug)
      // "COALESCE(penghasilan, 0)" → "penghasilan"
      // "nama_program" → "nama_program"
      const raw = extractRawIdentifier(beforeAs);
      exposedColumns.push(alias);
      if (raw.toLowerCase() !== alias.toLowerCase()) {
        aliasMap[raw] = alias;
      }
    } else {
      const colMatch = part.match(/(\w+)\s*$/);
      if (colMatch) {
        exposedColumns.push(colMatch[1]);
      }
    }
  }

  return { exposedColumns, aliasMap };
}

 // ambil source dan table
function parseViewFromClause(ddl: string): { sourceName: string; tableName: string } {
  const fromMatch = ddl.match(/\bFROM\s+([\w]+)\.([\w]+)/i);
  if (fromMatch) {
    return { sourceName: fromMatch[1], tableName: fromMatch[2] };
  }
  return { sourceName: '', tableName: '' };
}


// Parse a CREATE VIEW DDL statement to extract the SELECT column list.
function extractSelectClause(ddl: string): string {
  const normalized = ddl.replace(/\s+/g, ' ');
  const selectIdx = normalized.search(/\bSELECT\b/i);
  if (selectIdx === -1) { return ''; }

  let depth = 0;
  let fromIdx = -1;
  for (let i = selectIdx + 6; i < normalized.length - 4; i++) {
    if (normalized[i] === '(') { 
      depth++; 
    }else if (normalized[i] === ')') { 
      depth--; 
    }else if (depth === 0 && /\bFROM\b/i.test(normalized.slice(i, i + 4)) &&
             /\s/.test(normalized[i - 1] || ' ') && /\s/.test(normalized[i + 4] || ' ')) {
      fromIdx = i;
      break;
    }
  }
  if (fromIdx === -1) { 
    return ''; 
  }
  return normalized.slice(selectIdx + 6, fromIdx).trim();
}

function parseViewsFromDdl(
  ddl: string,
  fullXml: string,
  cdataBodyStartAbs: number
): VdbView[] {
  const views: VdbView[] = [];
  const createViewRegex = /CREATE\s+VIEW\s+(\w+)\s+AS\s+([\s\S]+?)(?=CREATE\s+VIEW\s+|\s*$)/gi;
  let viewMatch: RegExpExecArray | null;
  while ((viewMatch = createViewRegex.exec(ddl)) !== null) {
    const viewName = viewMatch[1];
    const viewBody = viewMatch[2];
    const viewBodyWithSelect = /^\s*SELECT\b/i.test(viewBody)
      ? viewBody
      : 'SELECT ' + viewBody;
    const selectClause = extractSelectClause(viewBodyWithSelect);
    const { exposedColumns, aliasMap } = parseSelectColumns(selectClause);
    const { sourceName, tableName } = parseViewFromClause(viewBody);

    const absViewStart = cdataBodyStartAbs + viewMatch.index;
    const { line: viewLine, col: viewDdlStartChar } = posAt(fullXml, absViewStart);

    views.push({
      name: viewName,
      exposedColumns,
      aliasMap,
      sourceName,
      tableName,
      ddl: viewMatch[0],
      viewLine,
      viewDdlStartChar,
    });
  }
  return views;
}

// Parse vdb.xml text and return structured VdbData.
export function parseVdb(text: string): VdbData {
  const models: VdbModel[] = [];
  const sources: VdbSource[] = [];

  let root: { vdb?: unknown };
  try {
    root = vdbXmlParser.parse(text) as { vdb?: unknown };
  } catch {
    return { models, sources };
  }

  const vdb = root.vdb;
  if (!vdb || typeof vdb !== 'object') {
    return { models, sources };
  }

  for (const model of asArray((vdb as Record<string, unknown>).model as Record<string, unknown> | Record<string, unknown>[] | undefined)) {
    if (!model || typeof model !== 'object') { 
      continue; 
    }

    const type = String(model['@_type'] ?? '');
    const name = String(model['@_name'] ?? '');

    if (type === 'PHYSICAL') {
      for (const src of asArray(model.source as Record<string, unknown> | Record<string, unknown>[] | undefined)) {
        if (!src || typeof src !== 'object') { 
          continue; 
        }
        const srcName = String(src['@_name'] ?? '');
        const translatorName = String(src['@_translator-name'] ?? '');
        const start = nodeStartIndex(src);
        const line = start !== undefined ? posAt(text, start).line : 0;
        sources.push({ name: srcName, translatorName, line });
      }
      continue;
    }

    if (type === 'VIRTUAL') {
      const modelLine = (() => {
        const s = nodeStartIndex(model);
        return s !== undefined ? posAt(text, s).line : 0;
      })();

      const views: VdbView[] = [];
      for (const md of asArray(model.metadata as Record<string, unknown> | Record<string, unknown>[] | undefined)) {
        if (!md || typeof md !== 'object') { 
          continue; 
        }
        if (String(md['@_type'] ?? '') !== 'DDL') { 
          continue; 
        }
        const mdStart = nodeStartIndex(md);
        if (mdStart === undefined) { 
          continue; 
        }
        const extracted = cdataSliceAfter(text, mdStart);
        if (!extracted) { 
          continue; 
        }
        views.push(...parseViewsFromDdl(extracted.ddl, text, extracted.bodyStartAbs));
      }

      models.push({ name, views, modelLine });
    }
  }

  return { models, sources };
}
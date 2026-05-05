import { ObdaMapping } from '../types';

 // Extract placeholder names from an Ontop target template.
 // example: "ex:penduduk/{nik} a ex:Penduduk ; ex:nama {nama}^^xsd:string ."
 // ->['nik', 'nama']
function extractPlaceholders(target: string): string[] {
  const matches = target.matchAll(/\{(\w+)\}/g);
  const result = new Set<string>();
  for (const match of matches) { 
    result.add(match[1]); 
  }
  return [...result];
}

// Parse SELECT column names from a SQL source query. 
// Returns a simple list of column names/aliases used in SELECT
function parseSelectColumns(query: string): string[] {
  const selectMatch = query.match(/SELECT\s+([\s\S]+?)\s+FROM\b/i);
  if (!selectMatch) { 
    return []; 
  }

  const selectPart = selectMatch[1];
  const cols: string[] = [];

  let depth = 0, current = '';
  for (const ch of selectPart) {
    if (ch === '(') { 
      depth++; 
      current += ch; 
    }else if (ch === ')') {
      depth--;
      current += ch; 
    }else if (ch === ',' && depth === 0) { 
      cols.push(current.trim()); 
      current = ''; 
    }else { 
      current += ch; 
    }
  }

  if (current.trim()) { 
    cols.push(current.trim()); 
  }

  return cols.map(col => {
    col = col.replace(/\s+/g, ' ').trim();
    const asMatch = col.match(/\bAS\s+(\w+)\s*$/i);
    if (asMatch) { 
      return asMatch[1]; 
    }
    const wordMatch = col.match(/(\w+)\s*$/);
    return wordMatch ? wordMatch[1] : col;
  }).filter(c => c && c.toUpperCase() !== 'DISTINCT');
}

// Parse an .obda file and return all mapping entries
export function parseObda(text: string): ObdaMapping[] {
  const lines = text.split('\n');
  const mappings: ObdaMapping[] = [];

  const mappingIdIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*mappingId\s+\S/.test(lines[i])) {
      mappingIdIndices.push(i);
    }
  }

  for (let mi = 0; mi < mappingIdIndices.length; mi++) {
    const startLine = mappingIdIndices[mi];
    const endLine = mi + 1 < mappingIdIndices.length
      ? mappingIdIndices[mi + 1] - 1
      : lines.length - 1;

    const idMatch = lines[startLine].match(/^\s*mappingId\s+(\S+)/);
    const id = idMatch ? idMatch[1] : '';

    let targetLine = -1;
    let targetText = '';
    let sourceLine = -1;
    let sourceText = '';

    for (let i = startLine + 1; i <= endLine; i++) {
      if (/^\s*target\s+/.test(lines[i]) && targetLine === -1) {
        targetLine = i;
        const targetPrefix = lines[i].match(/^\s*target\s+/)?.[0] ?? '';
        targetText = lines[i].slice(targetPrefix.length);
        let j = i + 1;
        while (j <= endLine && /^\s{2,}/.test(lines[j]) && !/^\s*source\s+/.test(lines[j])) {
          targetText += ' ' + lines[j].trim();
          j++;
        }
      } else if (/^\s*source\s+/.test(lines[i]) && sourceLine === -1) {
        sourceLine = i;
        const sourcePrefix = lines[i].match(/^\s*source\s+/)?.[0] ?? '';
        sourceText = lines[i].slice(sourcePrefix.length);
        let j = i + 1;
        while (j <= endLine && /^\s{2,}/.test(lines[j])) {
          sourceText += '\n' + lines[j];
          j++;
        }
      }
    }

    if (!id || sourceLine === -1 || targetLine === -1) { continue; }

    const targetPlaceholders = extractPlaceholders(targetText);
    const sourceColumns = parseSelectColumns(sourceText);
    const sourceFirstLineOffset =
      lines[sourceLine].match(/^\s*source\s+/)?.[0].length ?? 0;

    const sourceLines = sourceText.split('\n');
    let fromModel = '';
    let fromView = '';
    let fromRaw = '';
    let fromLine = sourceLine;
    let fromStartChar = 0;
    let fromEndChar = 0;

    for (let i = 0; i < sourceLines.length; i++) {
      const fm = sourceLines[i].match(/\bFROM\s+([\w.]+)/i);
      if (fm) {
        fromRaw = fm[1];
        const dotIdx = fromRaw.indexOf('.');
        fromModel = dotIdx !== -1 ? fromRaw.slice(0, dotIdx) : '';
        fromView = dotIdx !== -1 ? fromRaw.slice(dotIdx + 1) : fromRaw;
        fromLine = sourceLine + i;
        const line = sourceLines[i];
        const fromKeywordIdx = line.search(/\bFROM\b/i);
        const afterFrom = line.slice(fromKeywordIdx + 4);
        const leadingWhitespace = afterFrom.length - afterFrom.trimStart().length;

        fromStartChar = fromKeywordIdx + 4 + leadingWhitespace;
        fromEndChar = fromStartChar + fromRaw.length;
        break;
      }
    }

    mappings.push({
      id,
      idLine: startLine,
      targetTemplate: targetText.trim(),
      targetLine,
      targetPlaceholders,
      sourceQuery: sourceText,
      sourceLine,
      sourceFirstLineOffset,
      sourceColumns,
      fromModel,
      fromView,
      fromRaw,
      fromLine,
      fromStartChar,
      fromEndChar,
    });
  }

  return mappings;
}

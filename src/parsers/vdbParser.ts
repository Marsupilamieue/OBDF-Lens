import { VdbData, VdbModel, VdbSource, VdbView } from '../types';

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
      const rawMatch = beforeAs.match(/(\w+)\s*$/);
      const raw = rawMatch ? rawMatch[1] : beforeAs;
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

// Parse vdb.xml text and return structured VdbData.
export function parseVdb(text: string): VdbData {
  const lines = text.split('\n');
  const models: VdbModel[] = [];
  const sources: VdbSource[] = [];

  // Parse physical sources: <source name="X" translator-name="Y" connection-jndi-name="Z"/>
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const srcMatch = line.match(/<source\s[^>]*name="([^"]+)"[^>]*translator-name="([^"]+)"/i);
    if (srcMatch) {
      sources.push({
        name: srcMatch[1],
        translatorName: srcMatch[2],
        line: i,
      });
    }
  }

  // Parse virtual models: <model name="X" type="VIRTUAL">
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const modelMatch = line.match(/<model\s[^>]*name="([^"]+)"[^>]*type="VIRTUAL"/i)
      || line.match(/<model\s[^>]*type="VIRTUAL"[^>]*name="([^"]+)"/i);
    if (!modelMatch) { 
      continue; 
    }

    const modelName = modelMatch[1];
    const modelLine = i;
    const views: VdbView[] = [];

    // cari </model>
    let modelEndLine = lines.length - 1;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].includes('</model>')) { 
        modelEndLine = j; 
        break; 
      }
    }

    // cari vdata model
    let j = i + 1;
    while (j <= modelEndLine) {
      const cdataStart = lines[j].indexOf('<![CDATA[');
      if (cdataStart !== -1) {

        // ambil ddl sampe ]]>
        let ddl = lines[j].slice(cdataStart + 9);
        let cdataLine = j;
        let cdataEndLine = j;
        if (!ddl.includes(']]>')) {
          j++;
          while (j <= modelEndLine) {
            const endIdx = lines[j].indexOf(']]>');
            if (endIdx !== -1) {
              ddl += '\n' + lines[j].slice(0, endIdx);
              cdataEndLine = j;
              break;
            }
            ddl += '\n' + lines[j];
            j++;
          }
        } else {
          const endIdx = ddl.indexOf(']]>');
          ddl = ddl.slice(0, endIdx);
          cdataEndLine = j;
        }

        // create view
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
          
          const viewLineInDdl = ddl.slice(0, viewMatch.index).split('\n').length - 1;
          const viewLine = cdataLine + viewLineInDdl;
          const lastLineBeforeView = ddl.slice(0, viewMatch.index).split('\n').pop() ?? '';
          const viewDdlStartChar = viewLineInDdl === 0
            ? (cdataStart + 9) + lastLineBeforeView.length
            : lastLineBeforeView.length;

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
      }
      j++;
    }

    models.push({ name: modelName, views, modelLine });
    i = modelEndLine;
  }

  return { models, sources };
}

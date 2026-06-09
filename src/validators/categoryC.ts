import * as vscode from 'vscode';
import { VdbData, VdbView, ObdfDiagnosticData, QuickFix } from '../types';
import { findClosest } from '../utils/similarity';
import { extractSelectClauseFromDdl, parseSelectColumnRefs, SelectColumnRef } from '../parsers/vdbParser';

function findInDdl(view: VdbView, identifier: string, startFrom: number = 0): vscode.Range {
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escaped}\\b`, 'i');
  const match = view.ddl.slice(startFrom).match(regex);
  if (!match || match.index === undefined) {
    return new vscode.Range(view.viewLine, 0, view.viewLine, 200);
  }
  const charIdx = startFrom + match.index;
  const endCharIdx = charIdx + identifier.length;

  const toStart = view.ddl.slice(0, charIdx).split('\n');
  const startLineOffset = toStart.length - 1;
  const startCharOnLine = toStart[toStart.length - 1].length;

  const toEnd = view.ddl.slice(0, endCharIdx).split('\n');
  const endLineOffset = toEnd.length - 1;
  const endCharOnLine = toEnd[toEnd.length - 1].length;

  const absStartLine = view.viewLine + startLineOffset;
  const absStartChar = startLineOffset === 0
    ? view.viewDdlStartChar + startCharOnLine
    : startCharOnLine;

  const absEndLine = view.viewLine + endLineOffset;
  const absEndChar = endLineOffset === 0
    ? view.viewDdlStartChar + endCharOnLine
    : endCharOnLine;

  return new vscode.Range(absStartLine, absStartChar, absEndLine, absEndChar);
}

export interface DbConnectionConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export interface DbMetaProvider {
  getTables: (sourceName: string, connConfig: DbConnectionConfig) => Promise<string[]>;
  getColumns: (sourceName: string, tableName: string, connConfig: DbConnectionConfig) => Promise<string[]>;
}

// query db
async function queryDbMeta(
  config: DbConnectionConfig,
  query: string,
  params: string[]
): Promise<string[]> {
  let pg: typeof import('pg');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    pg = require('pg');
  } catch {
    throw new Error('Package not found');
  }

  const client = new pg.Client(config);
  await client.connect();
  try {
    const result = await client.query(query, params);
    return result.rows.map((r: Record<string, string>) => Object.values(r)[0] as string);
  } finally {
    await client.end();
  }
}

function pct(score: number): string {
  return Math.round(score * 100) + '%';
}

/** Map SQL table alias (lowercase) → physical table name from FROM/JOIN clauses. */
function parseAliasToTableMap(ddl: string): Map<string, string> {
  const map = new Map<string, string>();

  const fromMatch = ddl.match(/\bFROM\s+[\w]+\.([\w]+)(?:\s+(?:AS\s+)?(\w+))?/i);
  if (fromMatch) {
    const tableName = fromMatch[1];
    const alias = (fromMatch[2] ?? tableName).toLowerCase();
    map.set(alias, tableName);
  }

  const joinRegex = /\bJOIN\s+[\w]+\.([\w]+)(?:\s+(?:AS\s+)?(\w+))?/gi;
  let joinMatch: RegExpExecArray | null;
  while ((joinMatch = joinRegex.exec(ddl)) !== null) {
    const tableName = joinMatch[1];
    const alias = (joinMatch[2] ?? tableName).toLowerCase();
    map.set(alias, tableName);
  }

  return map;
}

interface JoinConditionRef {
  alias: string;
  column: string;
  index: number;
}

function parseJoinConditions(ddl: string): JoinConditionRef[] {
  const refs: JoinConditionRef[] = [];
  const onRegex = /\bON\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/gi;
  let onMatch: RegExpExecArray | null;
  while ((onMatch = onRegex.exec(ddl)) !== null) {
    refs.push(
      { alias: onMatch[1], column: onMatch[2], index: onMatch.index ?? 0 },
      { alias: onMatch[3], column: onMatch[4], index: onMatch.index ?? 0 },
    );
  }
  return refs;
}

function reportJoinColumnError(
  view: VdbView,
  vdbUri: string,
  joinCol: string,
  tableName: string,
  tableColumns: string[],
  joinIndex: number,
  diagnostics: vscode.Diagnostic[],
): void {
  const closest = findClosest(joinCol, tableColumns);
  const c4Range = findInDdl(view, joinCol, joinIndex);

  const data: ObdfDiagnosticData = {
    code: 'C4',
    fixes: closest ? [{
      title: `Ganti '${joinCol}' → '${closest.match}' di JOIN condition`,
      edits: [toFixEdit(vdbUri, c4Range, closest.match)],
    }] : [],
  };

  let msg = `[C4] Kolom '${joinCol}' tidak ditemukan di tabel '${tableName}' (JOIN condition)\n`;
  msg += `Source: ${view.sourceName}.${tableName} (Tabel ditemukan)\n`;
  if (closest) {
    msg += `Suggestion: Maksud kamu '${closest.match}'? (similarity: ${pct(closest.score)})\n`;
  }
  msg += `Kolom yang tersedia di '${tableName}':\n`;
  msg += tableColumns.map(c => c === closest?.match
    ? `  • ${c}   ← paling mirip dengan '${joinCol}'`
    : `  • ${c}`
  ).join('\n');

  const diag = new vscode.Diagnostic(c4Range, msg, vscode.DiagnosticSeverity.Error);
  diag.code = 'C4';
  diag.source = 'OBDF Lens';
  (diag as any).data = data;
  diagnostics.push(diag);
}

function reportSelectColumnError(
  view: VdbView,
  vdbUri: string,
  ref: SelectColumnRef,
  tableName: string,
  tableColumns: string[],
  diagnostics: vscode.Diagnostic[],
): void {
  const closest = findClosest(ref.column, tableColumns);
  const selectIdx = view.ddl.search(/\bSELECT\b/i);
  const c3Range = findInDdl(view, ref.display, selectIdx !== -1 ? selectIdx : 0);
  const replacement = closest
    ? (ref.tableAlias ? `${ref.tableAlias}.${closest.match}` : closest.match)
    : undefined;

  const data: ObdfDiagnosticData = {
    code: 'C3',
    fixes: replacement ? [{
      title: `Ganti kolom '${ref.display}' → '${replacement}'`,
      edits: [toFixEdit(vdbUri, c3Range, replacement)],
    }] : [],
  };

  let msg = `[C3] Kolom '${ref.display}' tidak ditemukan di tabel '${tableName}'\n`;
  msg += `Source: ${view.sourceName}.${tableName} (Tabel ditemukan)\n`;
  if (closest) {
    msg += `Suggestion: Maksud kamu '${closest.match}'? (similarity: ${pct(closest.score)})\n`;
  }
  msg += `Kolom yang tersedia di '${tableName}':\n`;
  msg += tableColumns.map(c => c === closest?.match
    ? `  • ${c}   <- paling mirip dengan '${ref.display}'`
    : `  • ${c}`
  ).join('\n');

  const diag = new vscode.Diagnostic(c3Range, msg, vscode.DiagnosticSeverity.Error);
  diag.code = 'C3';
  diag.source = 'OBDF Lens';
  (diag as any).data = data;
  diagnostics.push(diag);
}

/** Convert a vscode.Range to the flat FixEdit shape expected by types.ts. */
function toFixEdit(uri: string, range: vscode.Range, newText: string) {
  return {
    uri,
    startLine: range.start.line,
    startChar: range.start.character,
    endLine: range.end.line,
    endChar: range.end.character,
    newText,
  };
}

// Category C: Validate vdb.xml virtual view DDL against physical database.
export async function validateCategoryC(
  vdbData: VdbData,
  vdbUri: string,
  options?: {
    metaProvider?: DbMetaProvider;
    connections?: Record<string, DbConnectionConfig>;
  }
): Promise<vscode.Diagnostic[]> {
  const diagnostics: vscode.Diagnostic[] = [];
  const config = vscode.workspace.getConfiguration('obdf-lens');
  const connections = options?.connections ?? config.get<Record<string, DbConnectionConfig>>('connections') ?? {};
  const metaProvider = options?.metaProvider;

  if (Object.keys(connections).length === 0) {
    const firstView = vdbData.models.flatMap((m) => m.views)[0];
    const range = firstView
      ? new vscode.Range(firstView.viewLine, 0, firstView.viewLine, 200)
      : new vscode.Range(0, 0, 0, 200);
    const diag = new vscode.Diagnostic(
      range,
      '[OBDF] Konfigurasi obdf-lens.connections belum diset — validasi vdb.xml ke DB fisik (C1–C4) dilewati.',
      vscode.DiagnosticSeverity.Warning
    );
    diag.source = 'OBDF Lens';
    diagnostics.push(diag);
    return diagnostics;
  }

  const tableCache: Record<string, string[]> = {};   
  const columnCache: Record<string, string[]> = {};  

  async function getTables(sourceName: string, connConfig: DbConnectionConfig): Promise<string[]> {
    if (tableCache[sourceName]) { 
      return tableCache[sourceName]; 
    }
    const tables = metaProvider
      ? await metaProvider.getTables(sourceName, connConfig)
      : await queryDbMeta(
        connConfig,
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
        []
      );
    tableCache[sourceName] = tables;
    return tables;
  }

  async function getColumns(sourceName: string, tableName: string, connConfig: DbConnectionConfig): Promise<string[]> {
    const key = `${sourceName}.${tableName}`;
    if (columnCache[key]) { return columnCache[key]; }
    try {
      const columns = metaProvider
        ? await metaProvider.getColumns(sourceName, tableName, connConfig)
        : await queryDbMeta(
          connConfig,
          `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
          [tableName]
        );
      columnCache[key] = columns;
      return columns;
    } catch {
      return [];
    }
  }

  for (const model of vdbData.models) {
    for (const view of model.views) {
      if (!view.sourceName || !view.tableName) { 
        continue; 
      }

      const connConfig = connections[view.sourceName];

      // C1a: sourceName from DDL has no matching connection config → unknown/mistyped source.
      // Emit C1 immediately — we cannot reach the DB at all.
      if (!connConfig) {
        const knownSources = Object.keys(connections);
        // Only report C1 when there are configured connections to compare against;
        // if the user has zero connections for this source we skip silently (already
        // handled by the early-exit above for empty connections map).
        const closest = findClosest(view.sourceName, knownSources);
        const data: ObdfDiagnosticData = { code: 'C1', fixes: [] };
        let msg = `[C1] Source '${view.sourceName}' tidak dikenali (tidak ada di konfigurasi connections)\n`;
        if (closest) {
          msg += `Suggestion: Maksud kamu '${closest.match}'? (similarity: ${pct(closest.score)})\n`;
        }
        msg += `Source yang terkonfigurasi:\n`;
        msg += knownSources.map(s => `  • ${s}`).join('\n');

        const fromIdx = view.ddl.search(/\bFROM\b/i);
        const c1Range = findInDdl(view, view.sourceName, fromIdx !== -1 ? fromIdx : 0);
        const diag = new vscode.Diagnostic(c1Range, msg, vscode.DiagnosticSeverity.Error);
        diag.code = 'C1';
        diag.source = 'OBDF Lens';
        (diag as any).data = data;
        diagnostics.push(diag);
        continue;
      }

      // C1b: Connection config exists but the actual DB connection fails at runtime.
      let tables: string[];
      try {
        tables = await getTables(view.sourceName, connConfig);
      } catch (err) {
        const data: ObdfDiagnosticData = { code: 'C1', fixes: [] };
        const fromIdx = view.ddl.search(/\bFROM\b/i);
        const c1bRange = findInDdl(view, view.sourceName, fromIdx !== -1 ? fromIdx : 0);
        const anyErr = err as any;
        const firstCause = anyErr?.errors?.[0];
        const causeMsg = firstCause instanceof Error
          ? firstCause.message
          : firstCause?.message || (firstCause?.address ? `${firstCause.address}:${firstCause.port}` : null);
        const errMsg = [anyErr?.code, causeMsg].filter(Boolean).join(' — ')
          || (err instanceof Error ? err.message : null)
          || 'Gagal terhubung ke basis data';
        const msg = `[C1] Source '${view.sourceName}' tidak bisa dikoneksi\nError: ${errMsg}`;

        const diag = new vscode.Diagnostic(c1bRange, msg, vscode.DiagnosticSeverity.Error);
        diag.code = 'C1';
        diag.source = 'OBDF Lens';
        (diag as any).data = data;
        diagnostics.push(diag);
        continue;
      }

      // C2: Check table exists in DB
      const tableExists = tables.some(t => 
        t.toLowerCase() === view.tableName.toLowerCase()
      );

      if (!tableExists) {
        const closest = findClosest(view.tableName, tables);
        const fromIdx = view.ddl.search(/\bFROM\b/i);
        const c2Range = findInDdl(view, view.tableName, fromIdx !== -1 ? fromIdx : 0);

        const data: ObdfDiagnosticData = {
          code: 'C2',
          fixes: closest ? [{
            title: `Ganti tabel '${view.tableName}' → '${closest.match}'`,
            edits: [toFixEdit(vdbUri, c2Range, closest.match)],
          }] : [],
        };

        let msg = `[C2] Tabel '${view.tableName}' tidak ditemukan di database source\n`;
        msg += `Source: ${view.sourceName} (Connected)\n`;
        if (closest) {
          msg += `Suggestion: Maksud kamu '${closest.match}'? (similarity: ${pct(closest.score)})\n`;
        }
        msg += `Tabel yang tersedia di ${view.sourceName}:\n`;
        msg += tables.map(t => t === closest?.match
          ? `  • ${t}   <- paling mirip`
          : `  • ${t}`
        ).join('\n');

        const diag = new vscode.Diagnostic(c2Range, msg, vscode.DiagnosticSeverity.Error);
        diag.code = 'C2';
        diag.source = 'OBDF Lens';
        (diag as any).data = data;
        diagnostics.push(diag);
        continue;
      }

      const dbColumns = await getColumns(view.sourceName, view.tableName, connConfig);
      if (dbColumns.length === 0) { 
        continue; 
      }

      const aliasToTable = parseAliasToTableMap(view.ddl);
      const selectRefs = parseSelectColumnRefs(extractSelectClauseFromDdl(view.ddl));

      // C3: Check SELECT columns against the physical table for each alias (or FROM table)
      for (const ref of selectRefs) {
        const tableName = ref.tableAlias
          ? aliasToTable.get(ref.tableAlias.toLowerCase()) ?? view.tableName
          : view.tableName;

        const tableColumns = tableName === view.tableName
          ? dbColumns
          : await getColumns(view.sourceName, tableName, connConfig);
        if (tableColumns.length === 0) {
          continue;
        }

        const exists = tableColumns.some(c => c.toLowerCase() === ref.column.toLowerCase());
        if (!exists) {
          reportSelectColumnError(
            view, vdbUri, ref, tableName, tableColumns, diagnostics,
          );
        }
      }

      // C4: Check JOIN ON columns against the physical table for each alias
      const joinRefs = parseJoinConditions(view.ddl);
      for (const ref of joinRefs) {
        const tableName = aliasToTable.get(ref.alias.toLowerCase());
        if (!tableName) {
          continue;
        }

        const tableColumns = tableName === view.tableName
          ? dbColumns
          : await getColumns(view.sourceName, tableName, connConfig);
        if (tableColumns.length === 0) {
          continue;
        }

        const exists = tableColumns.some(c => c.toLowerCase() === ref.column.toLowerCase());
        if (!exists) {
          reportJoinColumnError(
            view, vdbUri, ref.column, tableName, tableColumns, ref.index, diagnostics,
          );
        }
      }
    }
  }

  return diagnostics;
}
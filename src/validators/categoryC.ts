import * as vscode from 'vscode';
import { VdbData, VdbView, ObdfDiagnosticData, QuickFix } from '../types';
import { findClosest } from '../utils/similarity';

// Find the range of an identifier (whole-word) within view.ddl.
function findInDdl(view: VdbView, identifier: string, startFrom: number = 0): vscode.Range {
  const regex = new RegExp(`\\b${identifier}\\b`, 'i');
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
  const absStartChar = startLineOffset === 0 ? view.viewDdlStartChar + startCharOnLine : startCharOnLine;
  const absEndLine = view.viewLine + endLineOffset;
  const absEndChar = endLineOffset === 0 ? view.viewDdlStartChar + endCharOnLine : endCharOnLine;

  return new vscode.Range(absStartLine, absStartChar, absEndLine, absEndChar);
}

export interface DbConnectionConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

// Query DB
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

// Category C: Validate vdb.xml virtual view DDL against physical database.
export async function validateCategoryC(
  vdbData: VdbData,
  vdbUri: string
): Promise<vscode.Diagnostic[]> {
  const diagnostics: vscode.Diagnostic[] = [];
  const config = vscode.workspace.getConfiguration('obdf-lens');
  const connections = config.get<Record<string, DbConnectionConfig>>('connections') ?? {};

  if (Object.keys(connections).length === 0) {
    return diagnostics; 
  }

  const tableCache: Record<string, string[]> = {};   
  const columnCache: Record<string, string[]> = {};  

  async function getTables(sourceName: string, connConfig: DbConnectionConfig): Promise<string[]> {
    if (tableCache[sourceName]) { 
      return tableCache[sourceName]; 
    }
    try {
      const tables = await queryDbMeta(
        connConfig,
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
        []
      );
      tableCache[sourceName] = tables;
      return tables;
    } catch (err) {
      return [];
    }
  }

  async function getColumns(sourceName: string, tableName: string, connConfig: DbConnectionConfig): Promise<string[]> {
    const key = `${sourceName}.${tableName}`;
    if (columnCache[key]) { return columnCache[key]; }
    try {
      const columns = await queryDbMeta(
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
      if (!connConfig) { 
        continue; 
      }  

      const range = new vscode.Range(view.viewLine, 0, view.viewLine, 200);

      // C1: Check if source can be connected
      let tables: string[];
      try {
        tables = await getTables(view.sourceName, connConfig);
      } catch (err) {
        const data: ObdfDiagnosticData = { 
          code: 'C1', 
          fixes: [] 
        };
        const knownSources = Object.keys(connections);
        const closest = findClosest(view.sourceName, knownSources);
        let msg = `[C1] Source '${view.sourceName}' tidak bisa dikoneksi\n`;
        if (closest) {
          msg += `Suggestion: Maksud kamu '${closest.match}'? (similarity: ${pct(closest.score)})\n`;
        }
        msg += `Error: ${err instanceof Error ? err.message : String(err)}`;

        const diag = new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Error);
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
        const data: ObdfDiagnosticData = {
          code: 'C2',
          fixes: closest ? [{
            title: `Ganti dengan '${closest.match}'`,
            edits: [], 
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

        const fromIdx = view.ddl.search(/\bFROM\b/i);
        const c2Range = findInDdl(view, view.tableName, fromIdx !== -1 ? fromIdx : 0);
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

      // C3: Check SELECT columns exist in physical table
      for (const col of view.exposedColumns) {
        const rawCol = Object.entries(view.aliasMap).find(([, alias]) =>
          alias.toLowerCase() === col.toLowerCase()
        )?.[0] ?? col;

        if (rawCol === '*') { 
          continue; 
        }

        const exists = dbColumns.some(c => c.toLowerCase() === rawCol.toLowerCase());
        if (!exists) {
          const closest = findClosest(rawCol, dbColumns);
          const data: ObdfDiagnosticData = {
            code: 'C3',
            fixes: closest ? [{
              title: `Ganti dengan '${closest.match}'`,
              edits: [],
            }] : [],
          };

          let msg = `[C3] Kolom '${rawCol}' tidak ditemukan di tabel '${view.tableName}'\n`;
          msg += `Source: ${view.sourceName}.${view.tableName} (Tabel ditemukan)\n`;
          if (closest) {
            msg += `Suggestion: Maksud kamu '${closest.match}'? (similarity: ${pct(closest.score)})\n`;
          }
          msg += `Kolom yang tersedia di '${view.tableName}':\n`;
          msg += dbColumns.map(c => c === closest?.match
            ? `  • ${c}   <- paling mirip dengan '${rawCol}'`
            : `  • ${c}`
          ).join('\n');

          const selectIdx = view.ddl.search(/\bSELECT\b/i);
          const c3Range = findInDdl(view, rawCol, selectIdx !== -1 ? selectIdx : 0);
          const diag = new vscode.Diagnostic(
            c3Range,
            msg,
            vscode.DiagnosticSeverity.Error
          );
          diag.code = 'C3';
          diag.source = 'OBDF Lens';
          (diag as any).data = data;
          diagnostics.push(diag);
        }
      }

      // C4: Check JOIN ON clause columns
      const joinMatches = [...view.ddl.matchAll(/JOIN\s+\w+\.\w+\s+\w+\s+ON\s+\w+\.(\w+)\s*=\s*\w+\.(\w+)/gi)];
      for (const jm of joinMatches) {
        const leftCol = jm[1];
        const rightCol = jm[2];

        for (const joinCol of [leftCol, rightCol]) {
          const exists = dbColumns.some(c => c.toLowerCase() === joinCol.toLowerCase());
          if (!exists) {
            const closest = findClosest(joinCol, dbColumns);
            const data: ObdfDiagnosticData = {
              code: 'C4',
              fixes: closest ? [{
                title: `Ganti '${joinCol}' -> '${closest.match}' di JOIN condition`,
                edits: [],
              }] : [],
            };

            let msg = `[C4] Kolom '${joinCol}' tidak ditemukan di tabel '${view.tableName}' (JOIN condition)\n`;
            msg += `Source: ${view.sourceName}.${view.tableName} (Tabel ditemukan)\n`;
            if (closest) {
              msg += `Suggestion: Maksud kamu '${closest.match}'? (similarity: ${pct(closest.score)})\n`;
            }
            msg += `Kolom yang tersedia di '${view.tableName}':\n`;
            msg += dbColumns.map(c => c === closest?.match
              ? `  • ${c}   ← paling mirip dengan '${joinCol}'`
              : `  • ${c}`
            ).join('\n');

            const c4Range = findInDdl(view, joinCol, jm.index ?? 0);
            const diag = new vscode.Diagnostic(
              c4Range,
              msg,
              vscode.DiagnosticSeverity.Error
            );
            diag.code = 'C4';
            diag.source = 'OBDF Lens';
            (diag as any).data = data;
            diagnostics.push(diag);
          }
        }
      }
    }
  }

  return diagnostics;
}

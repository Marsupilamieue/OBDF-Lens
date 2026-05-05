import * as vscode from 'vscode';
import { ObdaMapping, VdbData, VdbView, ObdfDiagnosticData, QuickFix } from '../types';
import { findClosest } from '../utils/similarity';

function pct(score: number): string {
  return Math.round(score * 100) + '%';
}

// Category B: Validate .obda column references against vdb.xml view columns.
export function validateCategoryB(
  mappings: ObdaMapping[],
  vdbData: VdbData,
  obdaUri: string,
  vdbUri: string
): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];

  for (const mapping of mappings) {
    if (!mapping.fromModel || !mapping.fromView) { 
      continue; 
    }

    const model = vdbData.models.find(m => m.name.toLowerCase() === mapping.fromModel.toLowerCase());

    if (!model) { 
      continue; 
    }  // A2 

    const view = model.views.find(v => v.name.toLowerCase() === mapping.fromView.toLowerCase());

    if (!view) { 
      continue; 
    }  // A1 

    // B5: Check placeholders in target have corresponding SELECT columns
    for (const placeholder of mapping.targetPlaceholders) {
      if (!mapping.sourceColumns.some(c => c.toLowerCase() === placeholder.toLowerCase())) {
        const targetLineIdx = mapping.targetLine;
        const targetRange = new vscode.Range(targetLineIdx, 0, targetLineIdx, 200);
        const data: ObdfDiagnosticData = {
          code: 'B5',
          fixes: [{
            title: `Tambah '${placeholder}' ke SELECT source`,
            edits: [], 
          }],
        };

        const msg = `[B5] Placeholder '{${placeholder}}' di target tidak ada di SELECT source\n` +
          `mapping: '${mapping.id}'\n` +
          `Kolom '${placeholder}' dipakai di target template tapi tidak di-SELECT di source query.\n` +
          `Suggestion: Tambahkan '${placeholder}' ke SELECT source.\n` +
          `Catatan: Pastikan '${placeholder}' juga diekspos oleh view '${view.name}' di vdb.xml.`;

        const diag = new vscode.Diagnostic(targetRange, msg, vscode.DiagnosticSeverity.Error);
        diag.code = 'B5';
        diag.source = 'OBDF Lens';
        (diag as any).data = data;
        diagnostics.push(diag);
      }
    }

    // B1/B2/B3/B4: Check SELECT columns against view exposed columns
    for (const col of mapping.sourceColumns) {
      if (col === '*') { 
        continue; 
      }

      const colLower = col.toLowerCase();
      const exposed = view.exposedColumns.map(c => c.toLowerCase());

      if (exposed.includes(colLower)) { 
        continue; 
      } 

      // Column not in view - diagnose
      const colLine = findColumnLine(mapping.sourceQuery, col, mapping.sourceLine, mapping.sourceFirstLineOffset);
      const range = new vscode.Range(colLine.line, colLine.startChar, colLine.line, colLine.endChar);

      // Check if it's an alias situation (B4)
      const rawName = Object.entries(view.aliasMap).find(([raw, alias]) =>
        raw.toLowerCase() === colLower
      );

      if (rawName) {
        const [raw, alias] = rawName;
        const data: ObdfDiagnosticData = {
          code: 'B4',
          fixes: [{
            title: `Ganti '${col}' -> '${alias}' di .obda`,
            edits: [{
              uri: obdaUri,
              startLine: colLine.line, startChar: colLine.startChar,
              endLine: colLine.line, endChar: colLine.endChar,
              newText: alias,
            }],
          }],
        };
        const msg = `[B4] Kolom '${col}' tidak ditemukan di view '${view.name}'\n` +
          `Kolom ini di-alias di vdb.xml:\n    ${raw}  ->  ${alias}\n` +
          `View hanya mengekspos nama alias-nya: '${alias}'\n` +
          `Suggestion: Gunakan nama alias, bukan nama kolom asli.\n` +
          `Kolom yang tersedia di '${view.name}':\n` +
          view.exposedColumns.map(c => `  • ${c}`).join('\n');
        const diag = new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Error);
        diag.code = 'B4';
        diag.source = 'OBDF Lens';
        (diag as any).data = data;
        diagnostics.push(diag);
        continue;
      }

      // Check similarity (B2)
      const closest = findClosest(col, view.exposedColumns);
      if (closest) {
        const data: ObdfDiagnosticData = {
          code: 'B2',
          fixes: [{
            title: `Ganti dengan '${closest.match}'`,
            edits: [{
              uri: obdaUri,
              startLine: colLine.line, startChar: colLine.startChar,
              endLine: colLine.line, endChar: colLine.endChar,
              newText: closest.match,
            }],
          }],
        };
        const msg = `[B2] Kolom '${col}' tidak ditemukan di view '${view.name}'\n` +
          `Suggestion: Maksud kamu '${closest.match}'? (similarity: ${pct(closest.score)})\n` +
          `Kolom yang tersedia di '${view.name}':\n` +
          view.exposedColumns.map(c =>
            c === closest.match ? `  • ${c}   ← paling mirip` : `  • ${c}`
          ).join('\n');
        const diag = new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Error);
        diag.code = 'B2';
        diag.source = 'OBDF Lens';
        (diag as any).data = data;
        diagnostics.push(diag);
        continue;
      }

      // B1/B3: Column not in view at all - we can't distinguish B1 vs B3 without DB access
      // Report as B1 (column might be in physical table but not in view)
      const data: ObdfDiagnosticData = {
        code: 'B1',
        fixes: [
          {
            title: `Hapus '${col}' dari SELECT source`,
            edits: [],
          },
        ],
      };
      const msg = `[B1] Kolom '${col}' tidak diekspos oleh view '${view.name}'\n` +
        `Kolom ini mungkin ada di tabel fisik tapi tidak di-SELECT di vdb.xml, atau tidak ada sama sekali.\n` +
        `Suggestion (pilih salah satu):\n` +
        `  Opsi 1 - Tambah kolom ke view di vdb.xml\n` +
        `  Opsi 2 - Hapus referensi '${col}' dari .obda\n` +
        `Kolom yang tersedia di '${view.name}':\n` +
        view.exposedColumns.map(c => `  • ${c}`).join('\n');
      const diag = new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Error);
      diag.code = 'B1';
      diag.source = 'OBDF Lens';
      (diag as any).data = data;
      diagnostics.push(diag);
    }
  }

  return diagnostics;
}

/** Find the line and character position of a column name in the source query text */
function findColumnLine(
  sourceQuery: string,
  col: string,
  sourceStartLine: number,
  firstLineOffset: number = 0
): { line: number; startChar: number; endChar: number } {
  const lines = sourceQuery.split('\n');
  for (let i = 0; i < lines.length; i++) {
    // Match column name as whole word
    const regex = new RegExp(`\\b${col}\\b`, 'i');
    const match = lines[i].match(regex);
    if (match && match.index !== undefined) {
      const offset = i === 0 ? firstLineOffset : 0;
      return {
        line: sourceStartLine + i,
        startChar: match.index + offset,
        endChar: match.index + col.length + offset,
      };
    }
  }
  return { line: sourceStartLine, startChar: firstLineOffset, endChar: firstLineOffset + col.length };
}

import * as vscode from 'vscode';
import { ObdaMapping, VdbData, VdbView, ObdfDiagnosticData, QuickFix } from '../types';
import { findClosest } from '../utils/similarity';

function pct(score: number): string {
  return Math.round(score * 100) + '%';
}

// Category B: validasi .obda kolom ke vdb
export function validateCategoryB(
  mappings: ObdaMapping[],
  vdbData: VdbData,
  obdaUri: string,
  vdbUri: string,
  obdaText: string
): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];
  const obdaLines = obdaText.split(/\r?\n/);

  for (const mapping of mappings) {
    if (!mapping.fromModel || !mapping.fromView) { 
      continue; 
    }

    const model = vdbData.models.find(m => m.name.toLowerCase() === mapping.fromModel.toLowerCase());

    // harus ada modelnya dulu
    if (!model) { 
      continue; 
    }  // A2 

    const view = model.views.find(v => v.name.toLowerCase() === mapping.fromView.toLowerCase());

    // harus ada view nya bener
    if (!view) { 
      continue; 
    }  // A1 

    // B5
    for (const placeholder of mapping.targetPlaceholders) {
      if (!mapping.sourceColumns.some(c => c.toLowerCase() === placeholder.toLowerCase())) {
        const targetRange = findTargetPlaceholderRange(mapping, placeholder, obdaLines);
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

    // B1 B2 B3 B4 cek kolom dengan yang exposed dari vdb
    for (const col of mapping.sourceColumns) {
      if (col === '*') { 
        continue; 
      }

      const colLower = col.toLowerCase();
      const exposed = view.exposedColumns.map(c => c.toLowerCase());

      if (exposed.includes(colLower)) { 
        continue; 
      } 

      const colLine = findColumnLine(
        mapping.sourceQuery,
        col,
        mapping.sourceLine,
        mapping.sourceLineOffsets
      );
      const range = new vscode.Range(colLine.line, colLine.startChar, colLine.line, colLine.endChar);

      // B4
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

      // B2, similarity
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

      // B1
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

function findTargetPlaceholderRange(
  mapping: ObdaMapping,
  placeholder: string,
  obdaLines: string[]
): vscode.Range {
  const lineCount = Math.max(mapping.targetLines.length, 1);
  const escaped = escapeRegExp(placeholder);
  const regex = new RegExp(`\\{${escaped}\\}`, 'i');
  for (let i = 0; i < lineCount; i++) {
    const lineIdx = mapping.targetLine + i;
    const lineText = obdaLines[lineIdx];
    if (lineText === undefined) {
      continue;
    }
    const match = lineText.match(regex);
    if (match && match.index !== undefined) {
      const start = match.index + 1;
      const end = start + placeholder.length;
      return new vscode.Range(lineIdx, start, lineIdx, end);
    }
  }

  const fallbackLine = mapping.targetLine;
  const fallbackOffset = mapping.targetLineOffsets[0] ?? 0;
  return new vscode.Range(fallbackLine, fallbackOffset, fallbackLine, fallbackOffset + placeholder.length);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findColumnLine(
  sourceQuery: string,
  col: string,
  sourceStartLine: number,
  lineOffsets: number[] = []
): { line: number; startChar: number; endChar: number } {
  const lines = sourceQuery.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const regex = new RegExp(`\\b${col}\\b`, 'i');
    const match = lines[i].match(regex);
    if (match && match.index !== undefined) {
      const offset = lineOffsets[i] ?? 0;
      return {
        line: sourceStartLine + i,
        startChar: match.index + offset,
        endChar: match.index + col.length + offset,
      };
    }
  }
  const fallbackOffset = lineOffsets[0] ?? 0;
  return { line: sourceStartLine, startChar: fallbackOffset, endChar: fallbackOffset + col.length };
}

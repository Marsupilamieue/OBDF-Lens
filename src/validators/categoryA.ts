import * as vscode from 'vscode';
import { ObdaMapping, VdbData, ObdfDiagnosticData, QuickFix } from '../types';
import { findClosest } from '../utils/similarity';

function pct(score: number): string {
  return Math.round(score * 100) + '%';
}

// Category A: validate .obda ke vdb
export function validateCategoryA(
  mappings: ObdaMapping[],
  vdbData: VdbData,
  obdaUri: string,
  vdbUri: string
): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];
  const allModelNames = vdbData.models.map(m => m.name);
  const allViewsByModel: Record<string, string[]> = {};

  for (const m of vdbData.models) {
    allViewsByModel[m.name] = m.views.map(v => v.name);
  }

  const allViews = vdbData.models.flatMap(m => m.views.map(v => ({ 
    model: m.name, view: v.name })
  ));

  for (const mapping of mappings) {
    if (!mapping.fromRaw) { 
      continue;
    }

    const range = new vscode.Range(
      mapping.fromLine, mapping.fromStartChar,
      mapping.fromLine, mapping.fromEndChar
    );

    // A4
    if (!mapping.fromModel) {
      const match = allViews.find(v => 
        v.view.toLowerCase() === mapping.fromView.toLowerCase()
      );
      const data: ObdfDiagnosticData = { code: 'A4', fixes: [] };

      if (match) {
        const fix: QuickFix = {
          title: `Ganti dengan '${match.model}.${match.view}'`,
          edits: [{
            uri: obdaUri,
            startLine: mapping.fromLine, startChar: mapping.fromStartChar,
            endLine: mapping.fromLine, endChar: mapping.fromEndChar,
            newText: `${match.model}.${match.view}`,
          }],
        };
        data.fixes.push(fix);

        const diag = new vscode.Diagnostic(
          range,
          `[A4] Format referensi tidak lengkap: '${mapping.fromView}'\nTeiid memerlukan format 'NamaModel.NamaView'\nSuggestion: View '${mapping.fromView}' ditemukan di model '${match.model}'\nQuick Fix: Ganti dengan '${match.model}.${match.view}'`,
          vscode.DiagnosticSeverity.Warning
        );
        diag.code = 'A4';
        diag.source = 'OBDF Lens';
        (diag as any).data = data;
        diagnostics.push(diag);
      } else {
        const diag = new vscode.Diagnostic(
          range,
          `[A4] Format referensi tidak lengkap: '${mapping.fromView}'\nTeiid memerlukan format 'NamaModel.NamaView'\nView '${mapping.fromView}' tidak ditemukan di vdb.xml`,
          vscode.DiagnosticSeverity.Warning
        );
        diag.code = 'A4';
        diag.source = 'OBDF Lens';
        (diag as any).data = data;
        diagnostics.push(diag);
      }
      continue;
    }

    // ada nama model berarti
    const modelMatch = vdbData.models.find(m => 
      m.name.toLowerCase() === mapping.fromModel.toLowerCase()
    );

    if (!modelMatch) {
      // A2
      const closest = findClosest(mapping.fromModel, allModelNames);
      const data: ObdfDiagnosticData = { code: 'A2', fixes: [] };

      let msg = `[A2] Model '${mapping.fromModel}' tidak terdaftar di vdb.xml\n`;
      msg += `Model yang tersedia di vdb.xml:\n`;
      msg += allModelNames.map(n => `  • ${n}`).join('\n');

      if (closest) {
        msg += `\n\nSuggestion: Maksud kamu '${closest.match}'? (similarity: ${pct(closest.score)})`;
        const fix: QuickFix = {
          title: `Ganti dengan '${closest.match}.${mapping.fromView}'`,
          edits: [{
            uri: obdaUri,
            startLine: mapping.fromLine, startChar: mapping.fromStartChar,
            endLine: mapping.fromLine, endChar: mapping.fromEndChar,
            newText: `${closest.match}.${mapping.fromView}`,
          }],
        };
        data.fixes.push(fix);
      }

      const diag = new vscode.Diagnostic(range, msg, vscode.DiagnosticSeverity.Error);
      diag.code = 'A2';
      diag.source = 'OBDF Lens';
      (diag as any).data = data;
      diagnostics.push(diag);
      continue;
    }

    // kelo model ketemu
    const viewMatch = modelMatch.views.find(v => 
      v.name.toLowerCase() === mapping.fromView.toLowerCase()
    );

    if (!viewMatch) {
      const viewNames = modelMatch.views.map(v => v.name);
      const closest = findClosest(mapping.fromView, viewNames);
      const data: ObdfDiagnosticData = { code: 'A1', fixes: [] };

      let msg: string;
      let code: string;
      let severity: vscode.DiagnosticSeverity;

      if (viewNames.length === 0) {
        // A3
        code = 'A3';
        msg = `[A3] View '${mapping.fromRaw}' tidak ditemukan di vdb.xml\nSeperti view ini belum didefinisikan sama sekali.\n`;
        msg += `\nSuggestion: Tambahkan virtual model berikut ke vdb.xml:\n`;
        msg += `<model name="${mapping.fromModel}" type="VIRTUAL">\n`;
        msg += `  <metadata type="DDL"><![CDATA[\n`;
        msg += `    CREATE VIEW ${mapping.fromView} AS\n`;
        msg += `      SELECT *\n`;
        msg += `      FROM ${modelMatch.name}.${mapping.fromView.replace('v_', '')};\n`;
        msg += `  ]]></metadata>\n`;
        msg += `</model>`;
        severity = vscode.DiagnosticSeverity.Error;
        data.code = 'A3';
      } else if (closest) {
        code = 'A1';
        msg = `[A1] View '${mapping.fromView}' tidak ditemukan di vdb.xml\n`;
        msg += `Suggestion: Maksud kamu '${closest.match}'? (similarity: ${pct(closest.score)})\n`;
        msg += `Tersedia di model '${modelMatch.name}'`;
        severity = vscode.DiagnosticSeverity.Error;
        data.code = 'A1';
        const fix: QuickFix = {
          title: `Ganti dengan '${modelMatch.name}.${closest.match}'`,
          edits: [{
            uri: obdaUri,
            startLine: mapping.fromLine, startChar: mapping.fromStartChar,
            endLine: mapping.fromLine, endChar: mapping.fromEndChar,
            newText: `${modelMatch.name}.${closest.match}`,
          }],
        };
        data.fixes.push(fix);
      } else {
        code = 'A1';
        msg = `[A1] View '${mapping.fromView}' tidak ditemukan di vdb.xml\n`;
        msg += `View yang tersedia di model '${modelMatch.name}':\n`;
        msg += viewNames.map(n => `  • ${n}`).join('\n');
        severity = vscode.DiagnosticSeverity.Error;
        data.code = 'A1';
      }

      const diag = new vscode.Diagnostic(range, msg, severity!);
      diag.code = code;
      diag.source = 'OBDF Lens';
      (diag as any).data = data;
      diagnostics.push(diag);
    }
  }

  return diagnostics;
}

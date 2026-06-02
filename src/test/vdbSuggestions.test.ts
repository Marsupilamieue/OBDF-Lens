import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { parseVdb } from '../parsers/vdbParser';
import { DbMetaProvider, validateCategoryC } from '../validators/categoryC';
import { VdbView } from '../types';

type Expectation = {
  code: string;
  view: string;
  suggestion: string;
};

const EXPECT_RE = /<!--\s*EXPECT\s+code=(C\d)\s+view=(\w+)\s+suggestion=([\w_]+)\s*-->/g;

function parseExpectations(xml: string): Expectation[] {
  const list: Expectation[] = [];
  let match: RegExpExecArray | null;
  while ((match = EXPECT_RE.exec(xml)) !== null) {
    list.push({
      code: match[1],
      view: match[2],
      suggestion: match[3],
    });
  }
  return list;
}

function extractSuggestion(message: string): string | undefined {
  const match = message.match(/Suggestion:\s+Maksud kamu '([^']+)'/);
  return match ? match[1] : undefined;
}

function findViewForDiagnostic(diag: vscode.Diagnostic, views: VdbView[]): VdbView | undefined {
  const line = diag.range.start.line;
  return views.find((view) => {
    const lineCount = view.ddl.split('\n').length;
    const start = view.viewLine;
    const end = view.viewLine + Math.max(0, lineCount - 1);
    return line >= start && line <= end;
  });
}

suite('VDB suggestion correctness', () => {
  test('bulk C1-C4 suggestions from vdb cases', async () => {
    const casesDir = path.resolve(__dirname, '..', '..', 'sample', 'vdb_cases');
    const caseFiles = fs.readdirSync(casesDir).filter((file) => file.endsWith('.xml'));

    const columnsMap: Record<string, string[]> = {
      master_penduduk: ['nik', 'nama', 'tanggal_lahir', 'pekerjaan', 'penghasilan'],
      eligibility: ['eligibility_id', 'program_id', 'nik', 'status_eligible', 'validated_at', 'validated_by'],
      master_program_bansos: ['program_id', 'nama_program', 'nominal'],
      master_penerima: ['penerima_id', 'nik', 'nama_penerima'],
      master_keluarga: ['no_kk', 'alamat', 'nik_id'],
      keluarga_rel: ['left_id', 'right_id'],
    };

    const tables = Object.keys(columnsMap);

    const metaProvider: DbMetaProvider = {
      getTables: async (sourceName) => {
        if (sourceName === 'bansos_db_c1') {
          throw new Error('Connection failed');
        }
        return tables;
      },
      getColumns: async (_sourceName, tableName) => columnsMap[tableName] ?? [],
    };

    const connections = {
      bansos_db: {
        host: 'localhost',
        port: 5432,
        database: 'test',
        user: 'test',
        password: 'test',
      },
      bansos_db_c1: {
        host: 'localhost',
        port: 5432,
        database: 'test',
        user: 'test',
        password: 'test',
      },
    };

    let correct = 0;
    let total = 0;
    const mismatches: string[] = [];

    for (const file of caseFiles) {
      const vdbPath = path.join(casesDir, file);
      const xml = fs.readFileSync(vdbPath, 'utf8');
      const expected = parseExpectations(xml);
      if (expected.length === 0) {
        continue;
      }

      const vdbData = parseVdb(xml);
      const views = vdbData.models.flatMap((model) => model.views);

      const diags = await validateCategoryC(vdbData, '/vdb.xml', {
        metaProvider,
        connections,
      });

      const byView: Record<string, vscode.Diagnostic[]> = {};
      for (const diag of diags) {
        const view = findViewForDiagnostic(diag, views);
        if (!view) {
          continue;
        }
        if (!byView[view.name]) {
          byView[view.name] = [];
        }
        byView[view.name].push(diag);
      }

      for (const exp of expected) {
        const diagsForView = byView[exp.view] ?? [];
        const diag = diagsForView.find((d) => String(d.code) === exp.code);
        if (!diag) {
          const msg = `missing diagnostic for view ${exp.view} (code ${exp.code})`;
          mismatches.push(msg);
          console.log(`[FAIL] ${msg}`);
          continue;
        }

        const actual = extractSuggestion(diag.message);
        if (actual !== exp.suggestion) {
          const msg = `view ${exp.view} expected suggestion ${exp.suggestion} but got ${actual}`;
          mismatches.push(msg);
          console.log(`[FAIL] ${msg}`);
          continue;
        }

        console.log(`[PASS] view ${exp.view} suggestion ${exp.suggestion}`);
        correct++;
      }

      total += expected.length;
    }

    const percent = total === 0 ? 0 : Math.round((correct / total) * 100);
    assert.strictEqual(
      mismatches.length,
      0,
      `correctness ${percent}%\n` + mismatches.join('\n')
    );
  });
});

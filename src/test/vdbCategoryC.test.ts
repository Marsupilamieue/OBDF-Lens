import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { parseVdb } from '../parsers/vdbParser';
import { validateCategoryC } from '../validators/categoryC';
import {
  diagCodes,
  extractSuggestion,
  findViewForDiagnostic,
  mockCategoryCOptions,
  parseExpectations,
  parsePositiveExpectations,
} from './helpers';

const CASES_DIR = path.resolve(__dirname, '..', '..', 'sample', 'vdb_cases');

function discoverVdbCaseFiles(): string[] {
  return fs.readdirSync(CASES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(CASES_DIR, entry.name, 'vdb.xml'))
    .filter((vdbPath) => fs.existsSync(vdbPath))
    .sort();
}

function caseLabel(vdbPath: string): string {
  return path.relative(CASES_DIR, vdbPath);
}

function logPass(label: string, view: string, detail: string): void {
  console.log(`[PASS] ${label} ${view} ${detail}`);
}

function logFail(label: string, view: string, detail: string): void {
  console.log(`[FAIL] ${label} ${view} ${detail}`);
}

async function assertCaseFile(vdbPath: string): Promise<void> {
  const label = caseLabel(vdbPath);
  const xml = fs.readFileSync(vdbPath, 'utf8');
  const negative = parseExpectations(xml);
  const positive = parsePositiveExpectations(xml);
  const vdbData = parseVdb(xml);
  const views = vdbData.models.flatMap((m) => m.views);
  const diags = await validateCategoryC(vdbData, vdbPath, mockCategoryCOptions());

  console.log(`\n--- ${label} (${negative.length} negative, ${positive.length} positive) ---`);

  const byView: Record<string, typeof diags> = {};
  for (const diag of diags) {
    const view = findViewForDiagnostic(diag, views);
    if (view) {
      (byView[view.name] ??= []).push(diag);
    }
  }

  const failures: string[] = [];

  for (const exp of negative) {
    const viewLabel = `${exp.view} [${exp.code}]`;
    const diag = (byView[exp.view] ?? []).find((d) => String(d.code) === exp.code);
    if (!diag) {
      const msg = 'diagnostic missing';
      failures.push(`${viewLabel}: ${msg}`);
      logFail(label, viewLabel, msg);
      continue;
    }

    const actual = extractSuggestion(diag.message);
    const expectNone = exp.suggestion === 'none';

    if (expectNone) {
      if (actual !== undefined) {
        const msg = `expected no suggestion, got '${actual}'`;
        failures.push(`${viewLabel}: ${msg}`);
        logFail(label, viewLabel, msg);
      } else {
        logPass(label, viewLabel, '(no suggestion, below threshold)');
      }
    } else if (actual !== exp.suggestion) {
      const msg = `expected '${exp.suggestion}', got '${actual ?? 'none'}'`;
      failures.push(`${viewLabel}: ${msg}`);
      logFail(label, viewLabel, msg);
    } else {
      logPass(label, viewLabel, `→ ${exp.suggestion}`);
    }
  }

  const expectedCountByView: Record<string, number> = {};
  for (const exp of negative) {
    expectedCountByView[exp.view] = (expectedCountByView[exp.view] ?? 0) + 1;
  }
  for (const [viewName, expectedCount] of Object.entries(expectedCountByView)) {
    const actualDiags = byView[viewName] ?? [];
    if (actualDiags.length !== expectedCount) {
      const msg = `expected ${expectedCount} diagnostic(s), got ${actualDiags.length} (${diagCodes(actualDiags).join(', ')})`;
      failures.push(`${viewName}: ${msg}`);
      logFail(label, viewName, msg);
    }
  }

  for (const viewName of positive) {
    const viewLabel = `${viewName} (clean)`;
    if ((byView[viewName] ?? []).length > 0) {
      const msg = `expected clean, got ${diagCodes(byView[viewName]).join(', ')}`;
      failures.push(`${viewLabel}: ${msg}`);
      logFail(label, viewLabel, msg);
    } else {
      logPass(label, viewLabel, '→ OK');
    }
  }

  assert.strictEqual(failures.length, 0, failures.join('\n'));
}

suite('[Category C] vdb.xml to Physical DB', () => {

  const caseFiles = discoverVdbCaseFiles();

  test('discovered vdb.xml case folders', () => {
    assert.ok(caseFiles.length > 0, 'no vdb.xml found under sample/vdb_cases/*/');
    console.log(`Found ${caseFiles.length} case(s): ${caseFiles.map(caseLabel).join(', ')}`);
  });

  test('warns when no DB connections configured', async () => {
    console.log('\n--- no connections configured ---');
    const vdbPath = caseFiles[0];
    const xml = fs.readFileSync(vdbPath, 'utf8');
    const diags = await validateCategoryC(parseVdb(xml), vdbPath, { connections: {} });
    assert.strictEqual(diags.length, 1);
    assert.ok(diags[0].message.includes('obdf-lens.connections'));
    console.log('[PASS] Category C warns when connections empty');
  });

  test('C1b: source connection failure', async () => {
    console.log('\n--- C1b connection failure (inline) ---');
    const vdb = parseVdb(`
<vdb name="c1b" version="1">
  <model name="vm_x" type="VIRTUAL">
    <metadata type="DDL"><![CDATA[
      CREATE VIEW v_x AS SELECT nik FROM bansos_db.master_penduduk;
    ]]></metadata>
  </model>
</vdb>`);
    const diags = await validateCategoryC(vdb, '/vdb.xml', {
      connections: { bansos_db: { host: 'x', port: 1, database: 'x', user: 'x', password: 'x' } },
      metaProvider: {
        getTables: async () => { throw new Error('Connection refused'); },
        getColumns: async () => [],
      },
    });
    assert.deepStrictEqual(diagCodes(diags), ['C1']);
    console.log('[PASS] v_x [C1] → connection refused');
  });

  for (const vdbPath of caseFiles) {
    test(caseLabel(vdbPath), async () => {
      await assertCaseFile(vdbPath);
    });
  }
});

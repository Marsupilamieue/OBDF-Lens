import * as fs from 'fs';
import * as path from 'path';
import { parseVdb } from '../parsers/vdbParser';
import { validateCategoryC } from '../validators/categoryC';
import {
  parseExpectations,
  parsePositiveExpectations,
  extractSuggestion,
  createMultiSourceMockOptions,
  BANSOS_COLUMNS,
  DUKCAPIL_COLUMNS,
  DTKS_COLUMNS,
  BPJS_COLUMNS,
} from './helpers';

// ----------------------------------------------------------------
// Warna terminal
// ----------------------------------------------------------------
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';

const CASES_DIR = path.resolve(__dirname, '..', '..', 'sample', 'vdb_cases');

async function runCase(vdbPath: string): Promise<{
  label: string;
  pass: number;
  fail: number;
  failures: string[];
  log: string[];
}> {
  const label = path.relative(CASES_DIR, vdbPath);
  const xml   = fs.readFileSync(vdbPath, 'utf8');
  const negative = parseExpectations(xml);
  const positive = parsePositiveExpectations(xml);
  const vdbData  = parseVdb(xml);
  const views    = vdbData.models.flatMap(m => m.views);

  const isMulti = vdbPath.includes('vdb_multi');
  const opts    = isMulti
    ? createMultiSourceMockOptions()
    : {
        connections: { bansos_db: { host: 'localhost', port: 5432, database: 'bansos', user: 'test', password: 'test' } },
        metaProvider: {
          getTables: async (sourceName: string) => {
            if (sourceName !== 'bansos_db') { throw new Error('Connection failed'); }
            return Object.keys(BANSOS_COLUMNS);
          },
          getColumns: async (_s: string, t: string) => BANSOS_COLUMNS[t] ?? [],
        },
      };

  const diags = await validateCategoryC(vdbData, vdbPath, opts);

  // group diags by view
  const byView: Record<string, typeof diags> = {};
  for (const diag of diags) {
    const line = diag.range.start.line;
    const view = views.find(v => {
      const lines = v.ddl.split('\n').length;
      return line >= v.viewLine && line <= v.viewLine + Math.max(0, lines - 1);
    });
    if (view) { (byView[view.name] ??= []).push(diag); }
  }

  const failures: string[] = [];
  const log: string[] = [];

  for (const exp of negative) {
    const viewLabel = `${exp.view} [${exp.code}]`;
    const diag = (byView[exp.view] ?? []).find(d => String(d.code) === exp.code);
    if (!diag) {
      failures.push(`${viewLabel}: diagnostic missing`);
      log.push(`${RED}[FAIL]${RESET} ${viewLabel} — diagnostic missing`);
      continue;
    }
    const actual = extractSuggestion(diag.message);
    const expectNone = exp.suggestion === 'none';
    if (expectNone) {
      if (actual !== undefined) {
        failures.push(`${viewLabel}: expected no suggestion, got '${actual}'`);
        log.push(`${RED}[FAIL]${RESET} ${viewLabel} — expected no suggestion, got '${actual}'`);
      } else {
        log.push(`${GREEN}[PASS]${RESET} ${viewLabel} — (no suggestion, below threshold)`);
      }
    } else if (actual !== exp.suggestion) {
      failures.push(`${viewLabel}: expected '${exp.suggestion}', got '${actual ?? 'none'}'`);
      log.push(`${RED}[FAIL]${RESET} ${viewLabel} — expected '${exp.suggestion}', got '${actual ?? 'none'}'`);
    } else {
      log.push(`${GREEN}[PASS]${RESET} ${viewLabel} → ${exp.suggestion}`);
    }
  }

  // count check
  const expectedCount: Record<string, number> = {};
  for (const e of negative) { expectedCount[e.view] = (expectedCount[e.view] ?? 0) + 1; }
  for (const [v, ec] of Object.entries(expectedCount)) {
    const ac = (byView[v] ?? []).length;
    if (ac !== ec) {
      const got = (byView[v] ?? []).map(d => d.code).join(', ');
      failures.push(`${v}: expected ${ec} diag(s), got ${ac} (${got})`);
      log.push(`${RED}[FAIL]${RESET} ${v} — expected ${ec} diag(s), got ${ac} (${got})`);
    }
  }

  // positive
  for (const vn of positive) {
    if ((byView[vn] ?? []).length > 0) {
      const got = (byView[vn]).map(d => d.code).join(', ');
      failures.push(`${vn} (clean): expected no diagnostics, got ${got}`);
      log.push(`${RED}[FAIL]${RESET} ${vn} (clean) — expected no errors, got: ${got}`);
    } else {
      log.push(`${GREEN}[PASS]${RESET} ${vn} (clean) → OK`);
    }
  }

  return { label, pass: log.filter(l => l.includes('[PASS]')).length, fail: failures.length, failures, log };
}

async function main() {
  const caseFiles = fs.readdirSync(CASES_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => path.join(CASES_DIR, e.name, 'vdb.xml'))
    .filter(p => fs.existsSync(p))
    .sort();

  let totalPass = 0, totalFail = 0;
  const results: Awaited<ReturnType<typeof runCase>>[] = [];

  for (const f of caseFiles) {
    const r = await runCase(f);
    results.push(r);
    const status = r.fail === 0 ? `${GREEN}PASSED${RESET}` : `${RED}FAILED${RESET}`;
    console.log(`${BOLD}${YELLOW}--- ${r.label} ---${RESET} ${status} (${r.pass} pass, ${r.fail} fail)`);
    r.log.forEach(l => console.log('  ' + l));
    console.log('');
    totalPass += r.pass;
    totalFail += r.fail;
  }

  if (totalFail > 0) {
    console.log(`${RED}FAILURES:${RESET}`);
    for (const r of results.filter(r => r.fail > 0)) {
      console.log(`  ${YELLOW}${r.label}:${RESET}`);
      r.failures.forEach(f => console.log(`    ${RED}✗${RESET} ${f}`));
    }
    process.exit(1);
  } else {
    console.log(`${GREEN}All tests passed!${RESET}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });

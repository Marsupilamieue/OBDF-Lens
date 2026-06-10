import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { DbConnectionConfig, DbMetaProvider } from '../validators/categoryC';
import { VdbView } from '../types';

export type CaseExpectation = {
  code: string;
  view: string;
  suggestion: string;
};

const EXPECT_RE = /<!--\s*EXPECT\s+code=(\w+)\s+view=(\w+)\s+suggestion=([\w_]+)\s*-->/g;
const EXPECT_POSITIVE_RE = /<!--\s*EXPECT_POSITIVE\s+view=(\w+)\s*-->/g;

export function readSample(relativePath: string): string {
  return fs.readFileSync(path.resolve(__dirname, '..', '..', relativePath), 'utf8');
}

export function parseExpectations(xml: string): CaseExpectation[] {
  const list: CaseExpectation[] = [];
  let match: RegExpExecArray | null;
  while ((match = EXPECT_RE.exec(xml)) !== null) {
    list.push({ code: match[1], view: match[2], suggestion: match[3] });
  }
  return list;
}

export function parsePositiveExpectations(xml: string): string[] {
  const list: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = EXPECT_POSITIVE_RE.exec(xml)) !== null) {
    list.push(match[1]);
  }
  return list;
}

export function extractSuggestion(message: string): string | undefined {
  const match = message.match(/Suggestion:\s+Maksud kamu '([^']+)'/);
  return match ? match[1] : undefined;
}

export function diagCodes(diags: vscode.Diagnostic[]): string[] {
  return diags.map((d) => String(d.code));
}

export function findDiag(
  diags: vscode.Diagnostic[],
  code: string,
  mappingId?: string
): vscode.Diagnostic | undefined {
  return diags.find((d) => {
    if (String(d.code) !== code) {
      return false;
    }
    if (mappingId && !d.message.includes(mappingId)) {
      return false;
    }
    return true;
  });
}

export function findViewForDiagnostic(
  diag: vscode.Diagnostic,
  views: VdbView[]
): VdbView | undefined {
  const line = diag.range.start.line;
  return views.find((view) => {
    const lineCount = view.ddl.split('\n').length;
    const start = view.viewLine;
    const end = view.viewLine + Math.max(0, lineCount - 1);
    return line >= start && line <= end;
  });
}

/** Column metadata aligned with sample/vdb_cases and sample/db/setup.sql. */
export const BANSOS_COLUMNS: Record<string, string[]> = {
  master_penduduk: [
    'nik', 'no_kk', 'nama', 'tanggal_lahir', 'pekerjaan', 'penghasilan',
    'status_hidup', 'created_at',
  ],
  master_wilayah: ['wilayah_id', 'provinsi', 'kabupaten', 'kecamatan', 'desa'],
  master_keluarga: ['no_kk', 'wilayah_id', 'alamat', 'created_at'],
  eligibility: [
    'eligibility_id', 'program_id', 'nik', 'status_eligible',
    'validated_at', 'validated_by',
  ],
  master_program_bansos: ['program_id', 'nama_program', 'nominal'],
  master_penerima: ['penerima_id', 'nik', 'nama_penerima'],
  keluarga_rel: ['left_id', 'right_id'],
  transaksi_bansos: [
    'transaksi_id', 'eligibility_id', 'nik', 'program_id', 'tanggal', 'nominal',
    'status', 'created_at',
  ],
};

export const BANSOS_TABLES = Object.keys(BANSOS_COLUMNS);

export const MOCK_CONNECTION: DbConnectionConfig = {
  host: 'localhost',
  port: 5432,
  database: 'bansos',
  user: 'test',
  password: 'test',
};

export function createMockMetaProvider(
  columnsMap: Record<string, string[]> = BANSOS_COLUMNS
): DbMetaProvider {
  return {
    getTables: async (sourceName) => {
      if (sourceName !== 'bansos_db') {
        throw new Error('Connection failed');
      }
      return Object.keys(columnsMap);
    },
    getColumns: async (_sourceName, tableName) => columnsMap[tableName] ?? [],
  };
}

export function mockCategoryCOptions(
  columnsMap: Record<string, string[]> = BANSOS_COLUMNS
) {
  return {
    metaProvider: createMockMetaProvider(columnsMap),
    connections: { bansos_db: MOCK_CONNECTION },
  };
}

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { DbConnectionConfig, DbMetaProvider } from '../db/DbAdapter';
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
  master_program_bansos: ['program_id', 'nama_program', 'nominal', 'periode', 'aktif'],
  master_penerima: ['penerima_id', 'nik', 'nama_penerima'],
  keluarga_rel: ['left_id', 'right_id'],
  transaksi_bansos: [
    'transaksi_id', 'eligibility_id', 'nik', 'program_id', 'tanggal', 'nominal',
    'status', 'created_at',
  ],
};

export const DUKCAPIL_COLUMNS: Record<string, string[]> = {
  penduduk: [
    'no_ktp', 'no_kk_ref', 'nama_lengkap', 'tempat_lahir', 'tgl_lahir',
    'jenis_kelamin', 'agama', 'status_perkawinan', 'pendidikan_terakhir',
    'pekerjaan_dukcapil', 'created_at',
  ],
  kartu_keluarga: [
    'no_kk', 'alamat_jalan', 'rt', 'rw', 'kelurahan',
    'kecamatan', 'kota', 'provinsi', 'kode_pos', 'created_at',
  ],
  akta_kelahiran: [
    'akta_id', 'no_ktp', 'nomor_akta', 'tempat_lahir', 'tgl_lahir',
    'nama_ayah', 'nama_ibu',
  ],
};

/** Column metadata for dtks_db. */
export const DTKS_COLUMNS: Record<string, string[]> = {
  keluarga_penerima_manfaat: [
    'kpm_id', 'no_ktp_kepala', 'nama_kepala_keluarga', 'no_kk',
    'desil_kesejahteraan', 'status_kemiskinan', 'sumber_data', 'updated_at',
  ],
  anggota_kpm: [
    'anggota_id', 'kpm_id', 'no_ktp_anggota', 'nama_anggota',
    'hubungan_keluarga', 'usia',
  ],
  program_kpm: [
    'kpm_program_id', 'kpm_id', 'kode_program', 'nama_program',
    'tgl_penetapan', 'status_aktif',
  ],
};

/** Column metadata for bpjs_db (bpjs_kes). */
export const BPJS_COLUMNS: Record<string, string[]> = {
  peserta: [
    'peserta_id', 'no_ktp', 'nama_peserta', 'kelas_layanan',
    'jenis_kepesertaan', 'status_aktif', 'tgl_daftar', 'tgl_akhir',
  ],
  fasilitas_kesehatan: [
    'faskes_id', 'kode_faskes', 'nama_faskes', 'jenis_faskes', 'wilayah_kode',
  ],
  kunjungan: [
    'kunjungan_id', 'peserta_id', 'faskes_id', 'tgl_kunjungan',
    'diagnosa', 'biaya', 'ditanggung_bpjs',
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

const MULTI_SOURCE_MAP: Record<string, Record<string, string[]>> = {
  bansos_db:   BANSOS_COLUMNS,
  dukcapil_db: DUKCAPIL_COLUMNS,
  dtks_db:     DTKS_COLUMNS,
  bpjs_db:     BPJS_COLUMNS,
};

export function createMultiSourceMockOptions() {
  const connections: Record<string, DbConnectionConfig> = {};
  for (const sourceName of Object.keys(MULTI_SOURCE_MAP)) {
    if (sourceName === 'bpjs_db') {
      connections[sourceName] = { dialect: 'mysql', host: 'localhost', port: 3306, database: sourceName, user: 'test', password: 'test' };
    } else if (sourceName === 'dtks_db') {
      connections[sourceName] = { dialect: 'sqlite', filename: '/mock/dtks.db' };
    } else {
      connections[sourceName] = { dialect: 'postgresql', host: 'localhost', port: 5432, database: sourceName, user: 'test', password: 'test' };
    }
  }
  const metaProvider: DbMetaProvider = {
    getTables: async (sourceName) => {
      const cols = MULTI_SOURCE_MAP[sourceName];
      if (!cols) { throw new Error(`Unknown source: ${sourceName}`); }
      return Object.keys(cols);
    },
    getColumns: async (sourceName, tableName) => {
      return MULTI_SOURCE_MAP[sourceName]?.[tableName] ?? [];
    },
  };
  return { connections, metaProvider };
}

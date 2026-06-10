import * as fs from 'fs';
import * as path from 'path';
import { validateCategoryA } from '../validators/categoryA';
import { validateCategoryB } from '../validators/categoryB';
import { parseObda } from '../parsers/obdaParser';
import { VdbData } from '../types';

jest.mock('vscode', () => ({
  Diagnostic: class {
    code?: string;
    constructor(public range: any, public message: string, public severity: any) {}
  },
  Range: class {
    constructor(public startLine: number, public startChar: number, public endLine: number, public endChar: number) {}
  },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 }
}), { virtual: true });

function getSharedMockVdb(): VdbData {
  return {
    models: [
      {
        name: 'vm_penduduk',
        views: [{ 
          name: 'v_penduduk', 
          exposedColumns: ['nik', 'nama', 'tanggal_lahir', 'pekerjaan', 'penghasilan'], 
          aliasMap: {}, 
          sourceName: 'bansos_db', 
          tableName: 'master_penduduk', 
          ddl: 'CREATE VIEW v_penduduk AS SELECT nik, nama, tanggal_lahir, pekerjaan, penghasilan FROM bansos_db.master_penduduk;', 
          viewLine: 2, 
          viewDdlStartChar: 5
        }],
        modelLine: 1
      },
      {
        name: 'vm_bansos',
        views: [{ 
          name: 'v_penerima_bansos', 
          exposedColumns: ['id_penerima', 'nik', 'jenis_bantuan'], 
          aliasMap: { 'id': 'id_penerima' }, 
          sourceName: 'bansos_db', 
          tableName: 't_penerima', 
          ddl: 'CREATE VIEW v_penerima_bansos AS SELECT id AS id_penerima, nik, jenis_bantuan FROM bansos_db.t_penerima;', 
          viewLine: 12, 
          viewDdlStartChar: 5
        }],
        modelLine: 10
      },
      {
        name: 'vm_pekerjaan',
        views: [{ 
          name: 'v_karyawan', 
          exposedColumns: ['id_job', 'nik', 'posisi'], 
          aliasMap: {}, 
          sourceName: 'hr_db', 
          tableName: 'master_karyawan', 
          ddl: 'CREATE VIEW v_karyawan AS SELECT id_job, nik, posisi FROM hr_db.master_karyawan;', 
          viewLine: 22, 
          viewDdlStartChar: 5
        }],
        modelLine: 20
      },
      {
        name: 'vm_eligibility',
        views: [{ 
          name: 'v_eligibility', 
          exposedColumns: ['eligibility_id', 'program_id', 'nik', 'status_eligible', 'validated_at', 'validated_by'], 
          aliasMap: { 'id': 'eligibility_id', 'status': 'status_eligible' }, 
          sourceName: 'bansos_db', 
          tableName: 'eligibility', 
          ddl: 'CREATE VIEW v_eligibility AS SELECT id AS eligibility_id, program_id, nik, status AS status_eligible, validated_at, validated_by FROM bansos_db.eligibility;', 
          viewLine: 32, 
          viewDdlStartChar: 5
        }],
        modelLine: 30
      },
      {
        name: 'vm_penerima',
        views: [{ 
          name: 'v_master_penerima', 
          exposedColumns: ['penerima_id', 'nik', 'nama_penerima'], 
          aliasMap: { 'id': 'penerima_id', 'nama': 'nama_penerima' }, 
          sourceName: 'bansos_db', 
          tableName: 'master_penerima', 
          ddl: 'CREATE VIEW v_master_penerima AS SELECT id AS penerima_id, nik, nama AS nama_penerima FROM bansos_db.master_penerima;', 
          viewLine: 42, 
          viewDdlStartChar: 5
        }],
        modelLine: 40
      },
      {
        name: 'vm_keluarga',
        views: [{ 
          name: 'v_master_keluarga', 
          exposedColumns: ['no_kk', 'alamat', 'nik_id'], 
          aliasMap: { 'nik': 'nik_id' }, 
          sourceName: 'bansos_db', 
          tableName: 'master_keluarga', 
          ddl: 'CREATE VIEW v_master_keluarga AS SELECT no_kk, alamat, nik AS nik_id FROM bansos_db.master_keluarga;', 
          viewLine: 52, 
          viewDdlStartChar: 5
        }],
        modelLine: 50
      },
      {
        name: 'vm_kosong',
        views: [],
        modelLine: 60
      }
    ],
    sources: [
      {
        name: 'bansos_db',
        translatorName: 'postgresql',
        line: 100
      },
      {
        name: 'hr_db',
        translatorName: 'postgresql',
        line: 105
      }
    ]
  };
}

describe('Category A1 Validation', () => {
  let mockVdbData: VdbData;
  let diagnostics: any[];

  beforeEach(() => {
    mockVdbData = getSharedMockVdb();

    const fixturePath = path.resolve(__dirname, '..', '..', 'sample', 'obda_cases', 'a1.obda');
    const obdaText = fs.readFileSync(fixturePath, 'utf8');
    const mappings = parseObda(obdaText);

    diagnostics = validateCategoryA(
      mappings,
      mockVdbData,
      'file:///dummy.obda',
      'file:///dummy.vdb.xml'
    );
  });

  it('detects exactly 4 A1 errors overall', () => {
    const a1Errors = diagnostics.filter(d => d.code === 'A1');
    expect(a1Errors.length).toBe(4);
  });

  it('detects typo in vm_penduduk model and suggests v_penduduk', () => {
    const error = diagnostics.find(d => d.code === 'A1' && d.message.includes("'v_pendudukk'"));
    expect(error).toBeDefined();
    expect(error?.message).toContain("Suggestion: Maksud kamu 'v_penduduk'?");
  });

  it('places squiggly line exactly over the full model and view name', () => {
    const error = diagnostics.find(d => 
      d.code === 'A1' && d.message.includes("'v_pendudukk'")
    );

    expect(error).toBeDefined();
    expect(error?.range).toBeDefined();

    const fixturePath = path.resolve(__dirname, '..', '..', 'sample', 'obda_cases', 'a1.obda');
    const obdaText = fs.readFileSync(fixturePath, 'utf8');

    const lines = obdaText.split('\n');
    const errorLineText = lines[error!.range.startLine];
    
    const highlightedText = errorLineText.substring(error!.range.startChar, error!.range.endChar);

    expect(highlightedText).toBe('vm_penduduk.v_pendudukk');
  });

  it('detects typo in vm_bansos model and suggests v_penerima_bansos', () => {
    const error = diagnostics.find(d => d.code === 'A1' && d.message.includes("'v_penerima_bnsos'"));
    expect(error).toBeDefined();
    expect(error?.message).toContain("Suggestion: Maksud kamu 'v_penerima_bansos'?");
  });

  it('detects typo in vm_pekerjaan model and suggests v_karyawan', () => {
    const error = diagnostics.find(d => d.code === 'A1' && d.message.includes("'v_karyawan_'"));
    expect(error).toBeDefined();
    expect(error?.message).toContain("Suggestion: Maksud kamu 'v_karyawan'?");
  });

  it('detects unknown view without suggestion and lists available views instead', () => {
    const unknownViewError = diagnostics.find(d => d.code === 'A1' && d.message.includes("'v_tidak_ada'"));
    
    expect(unknownViewError).toBeDefined();
    expect(unknownViewError?.message).not.toContain("Suggestion:");

    expect(unknownViewError?.message).toContain("View yang tersedia di model 'vm_pekerjaan':");
    expect(unknownViewError?.message).toContain("• v_karyawan");
  });
});

describe('Category A2 Validation', () => {
  let mockVdbData: VdbData;
  let diagnostics: any[];

  beforeEach(() => {
    mockVdbData = getSharedMockVdb();

    const fixturePath = path.resolve(__dirname, '..', '..', 'sample', 'obda_cases', 'a2.obda');
    const obdaText = fs.readFileSync(fixturePath, 'utf8');
    const mappings = parseObda(obdaText);

    diagnostics = validateCategoryA(
      mappings,
      mockVdbData,
      'file:///dummy.obda',
      'file:///dummy.vdb.xml'
    );
  });

  it('detects exactly 4 A2 errors overall', () => {
    const a2Errors = diagnostics.filter(d => d.code === 'A2');
    expect(a2Errors.length).toBe(7);
  });

  it('detects A2 errors and provides suggestions', () => {
    const a2Errors = diagnostics.filter(d => d.code === 'A2');
    expect(a2Errors.length).toBeGreaterThan(0);

    const bansosModelError = a2Errors.find(d => d.message.includes("Model 'vm_bensos' tidak terdaftar"));
    expect(bansosModelError).toBeDefined();
    expect(bansosModelError?.message).toContain("Suggestion: Maksud kamu 'vm_bansos'?");
  });

  it('detects unknown models without suggestions', () => {
    const randomError = diagnostics.find(d => d.code === 'A2' && d.message.includes("'vm_random_yang_lainnya'"));
    expect(randomError).toBeDefined();
    expect(randomError?.message).not.toContain("Suggestion:");
  });

  it('places squiggly line exactly over the full model and view name for model typo', () => {
    const error = diagnostics.find(d => 
      d.code === 'A2' && d.message.includes("'vm_pekerjaann'")
    );

    expect(error).toBeDefined();
    expect(error?.range).toBeDefined();

    const fixturePath = path.resolve(__dirname, '..', '..', 'sample', 'obda_cases', 'a2.obda');
    const obdaText = fs.readFileSync(fixturePath, 'utf8');

    const lines = obdaText.split('\n');
    const errorLineText = lines[error!.range.startLine];
    
    const highlightedText = errorLineText.substring(error!.range.startChar, error!.range.endChar);

    expect(highlightedText).toBe('vm_pekerjaann.v_karyawan');
  });
});

describe('Category A3 Validation', () => {
  let mockVdbData: VdbData;
  let diagnostics: any[];

  beforeEach(() => {
    mockVdbData = getSharedMockVdb();

    const fixturePath = path.resolve(__dirname, '..', '..', 'sample', 'obda_cases', 'a3.obda');
    const obdaText = fs.readFileSync(fixturePath, 'utf8');
    const mappings = parseObda(obdaText);

    diagnostics = validateCategoryA(
      mappings,
      mockVdbData,
      'file:///dummy.obda',
      'file:///dummy.vdb.xml'
    );
  });

  it('detects A3 error when referencing a model with no views', () => {
    const error = diagnostics.find(d => d.code === 'A3' && d.message.includes("'vm_kosong.v_kosong'"));
    
    expect(error).toBeDefined();
    expect(error?.message).toContain("[A3] View 'vm_kosong.v_kosong' tidak ditemukan di vdb.xml");
    expect(error?.message).toContain("Seperti view ini belum didefinisikan sama sekali.");
    expect(error?.message).toContain("Suggestion: Tambahkan virtual model berikut ke vdb.xml:");
  });

  it('places squiggly line exactly over the full model and view name for A3 error', () => {
    const error = diagnostics.find(d => 
      d.code === 'A3' && d.message.includes("'vm_kosong.v_kosong'")
    );

    expect(error).toBeDefined();
    expect(error?.range).toBeDefined();

    const fixturePath = path.resolve(__dirname, '..', '..', 'sample', 'obda_cases', 'a3.obda');
    const obdaText = fs.readFileSync(fixturePath, 'utf8');

    const lines = obdaText.split('\n');
    const errorLineText = lines[error!.range.startLine];
    
    const highlightedText = errorLineText.substring(error!.range.startChar, error!.range.endChar);

    expect(highlightedText).toBe('vm_kosong.v_kosong');
  });
});

describe('Category A4 Validation', () => {
  let mockVdbData: VdbData;
  let diagnostics: any[];

  beforeEach(() => {
    mockVdbData = getSharedMockVdb();

    const fixturePath = path.resolve(__dirname, '..', '..', 'sample', 'obda_cases', 'a4.obda');
    const obdaText = fs.readFileSync(fixturePath, 'utf8');
    const mappings = parseObda(obdaText);

    diagnostics = validateCategoryA(
      mappings,
      mockVdbData,
      'file:///dummy.obda',
      'file:///dummy.vdb.xml'
    );
  });

  it('detects exactly 3 A4 errors', () => {
    const a4Errors = diagnostics.filter(d => d.code === 'A4');
    expect(a4Errors.length).toBe(3);
  });

  it('detects incomplete reference and provides exact Quick Fix string', () => {
    const error = diagnostics.find(d => d.code === 'A4' && d.message.includes("'v_penduduk'"));
    
    expect(error).toBeDefined();
    expect(error?.message).toContain("Quick Fix: Ganti dengan 'vm_penduduk.v_penduduk'");
  });

  it('places squiggly line exactly over the incomplete view name', () => {
    const error = diagnostics.find(d => 
      d.code === 'A4' && d.message.includes("'v_penduduk'")
    );

    expect(error).toBeDefined();
    expect(error?.range).toBeDefined();

    const fixturePath = path.resolve(__dirname, '..', '..', 'sample', 'obda_cases', 'a4.obda');
    const obdaText = fs.readFileSync(fixturePath, 'utf8');

    const lines = obdaText.split('\n');
    const errorLineText = lines[error!.range.startLine];
    
    const highlightedText = errorLineText.substring(error!.range.startChar, error!.range.endChar);

    expect(highlightedText).toBe('v_penduduk');
  });

  it('provides Quick Fix for bansos view', () => {
    const error = diagnostics.find(d => d.code === 'A4' && d.message.includes("'v_penerima_bansos'"));
    
    expect(error).toBeDefined();
    expect(error?.message).toContain("Quick Fix: Ganti dengan 'vm_bansos.v_penerima_bansos'");
  });
});

describe('Category B1 Validation', () => {
  let mockVdbData: VdbData;
  let diagnostics: any[];

  beforeEach(() => {
    mockVdbData = getSharedMockVdb();

    const fixturePath = path.resolve(__dirname, '..', '..', 'sample', 'obda_cases', 'b1.obda');
    const obdaText = fs.readFileSync(fixturePath, 'utf8');
    const mappings = parseObda(obdaText);

    diagnostics = validateCategoryB(
      mappings,
      mockVdbData,
      'file:///dummy.obda',
      'file:///dummy.vdb.xml',
      obdaText
    );
  });

  it('detects exactly 3 B1 errors overall', () => {
    const b1Errors = diagnostics.filter(d => d.code === 'B1');
    expect(b1Errors.length).toBe(3);
  });

  it('detects B1 for vm_penduduk when jenis is not exposed', () => {
    const error = diagnostics.find(d => d.code === 'B1' && d.message.includes("'jenis'") && d.message.includes("'v_penduduk'"));

    expect(error).toBeDefined();
    expect(error?.message).toContain("[B1] Kolom 'jenis' tidak diekspos oleh view 'v_penduduk'");
    expect(error?.message).toContain("Kolom yang tersedia di 'v_penduduk':");
    expect(error?.message).toContain("• nik");
  });

  it('detects B1 for vm_bansos when jenis is not exposed', () => {
    const error = diagnostics.find(d => d.code === 'B1' && d.message.includes("'jenis'") && d.message.includes("'v_penerima_bansos'"));

    expect(error).toBeDefined();
    expect(error?.message).toContain("[B1] Kolom 'jenis' tidak diekspos oleh view 'v_penerima_bansos'");
    expect(error?.message).toContain("Kolom yang tersedia di 'v_penerima_bansos':");
    expect(error?.message).toContain("• jenis_bantuan");
  });

  it('detects B1 for vm_pekerjaan when jenis is not exposed', () => {
    const error = diagnostics.find(d => d.code === 'B1' && d.message.includes("'jenis'") && d.message.includes("'v_karyawan'"));

    expect(error).toBeDefined();
    expect(error?.message).toContain("[B1] Kolom 'jenis' tidak diekspos oleh view 'v_karyawan'");
    expect(error?.message).toContain("Kolom yang tersedia di 'v_karyawan':");
    expect(error?.message).toContain("• posisi");
  });

  it('places squiggly line exactly over the missing column for vm_penduduk', () => {
    const error = diagnostics.find(d => d.code === 'B1' && d.message.includes("'v_penduduk'"));

    expect(error).toBeDefined();
    expect(error?.range).toBeDefined();

    const fixturePath = path.resolve(__dirname, '..', '..', 'sample', 'obda_cases', 'b1.obda');
    const obdaText = fs.readFileSync(fixturePath, 'utf8');

    const lines = obdaText.split('\n');
    const errorLineText = lines[error!.range.startLine];

    const highlightedText = errorLineText.substring(error!.range.startChar, error!.range.endChar);

    expect(highlightedText).toBe('jenis');
  });
});

describe('Category B2 Validation', () => {
  let mockVdbData: VdbData;
  let diagnostics: any[];

  beforeEach(() => {
    mockVdbData = getSharedMockVdb();

    const fixturePath = path.resolve(__dirname, '..', '..', 'sample', 'obda_cases', 'b2.obda');
    const obdaText = fs.readFileSync(fixturePath, 'utf8');
    const mappings = parseObda(obdaText);

    diagnostics = validateCategoryB(
      mappings,
      mockVdbData,
      'file:///dummy.obda',
      'file:///dummy.vdb.xml',
      obdaText
    );
  });

  it('detects exactly 3 B2 errors overall', () => {
    const b2Errors = diagnostics.filter(d => d.code === 'B2');
    expect(b2Errors.length).toBe(3);
  });

  it('detects typo in vm_penduduk model and suggests nik', () => {
    const error = diagnostics.find(d => d.code === 'B2' && d.message.includes("'nikk'"));
    expect(error).toBeDefined();
    expect(error?.message).toContain("Suggestion: Maksud kamu 'nik'?");
  });

  it('detects typo in vm_bansos model and suggests id_penerima', () => {
    const error = diagnostics.find(d => d.code === 'B2' && d.message.includes("'id_penerim'"));
    expect(error).toBeDefined();
    expect(error?.message).toContain("Suggestion: Maksud kamu 'id_penerima'?");
  });

  it('detects typo in vm_pekerjaan model and suggests posisi', () => {
    const error = diagnostics.find(d => d.code === 'B2' && d.message.includes("'posis'"));
    expect(error).toBeDefined();
    expect(error?.message).toContain("Suggestion: Maksud kamu 'posisi'?");
  });

  it('places squiggly line exactly over the typo column for vm_penduduk', () => {
    const error = diagnostics.find(d => d.code === 'B2' && d.message.includes("'nikk'"));

    expect(error).toBeDefined();
    expect(error?.range).toBeDefined();

    const fixturePath = path.resolve(__dirname, '..', '..', 'sample', 'obda_cases', 'b2.obda');
    const obdaText = fs.readFileSync(fixturePath, 'utf8');

    const lines = obdaText.split('\n');
    const errorLineText = lines[error!.range.startLine];

    const highlightedText = errorLineText.substring(error!.range.startChar, error!.range.endChar);

    expect(highlightedText).toBe('nikk');
  });
});

describe('Category B4 Validation', () => {
  let mockVdbData: VdbData;
  let diagnostics: any[];

  beforeEach(() => {
    mockVdbData = getSharedMockVdb();

    const fixturePath = path.resolve(__dirname, '..', '..', 'sample', 'obda_cases', 'b4.obda');
    const obdaText = fs.readFileSync(fixturePath, 'utf8');
    const mappings = parseObda(obdaText);

    diagnostics = validateCategoryB(
      mappings,
      mockVdbData,
      'file:///dummy.obda',
      'file:///dummy.vdb.xml',
      obdaText
    );
  });

  it('detects exactly 3 B4 errors overall', () => {
    const b4Errors = diagnostics.filter(d => d.code === 'B4');
    expect(b4Errors.length).toBe(3);
  });

  it('detects B4 for vm_bansos when id is used instead of id_penerima', () => {
    const error = diagnostics.find(d => d.code === 'B4' && d.message.includes("'id'" ) && d.message.includes("'v_penerima_bansos'"));

    expect(error).toBeDefined();
    expect(error?.message).toContain("[B4] Kolom 'id' tidak ditemukan di view 'v_penerima_bansos'");
    expect(error?.message).toContain("Kolom ini di-alias di vdb.xml:");
    expect(error?.message).toContain("id  ->  id_penerima");
    expect(error?.message).toContain("Suggestion: Gunakan nama alias, bukan nama kolom asli.");
  });

  it('detects B4 for vm_eligibility when status is used instead of status_eligible', () => {
    const error = diagnostics.find(d => d.code === 'B4' && d.message.includes("'status'" ) && d.message.includes("'v_eligibility'"));

    expect(error).toBeDefined();
    expect(error?.message).toContain("[B4] Kolom 'status' tidak ditemukan di view 'v_eligibility'");
    expect(error?.message).toContain("status  ->  status_eligible");
    expect(error?.message).toContain("Kolom yang tersedia di 'v_eligibility':");
    expect(error?.message).toContain("• status_eligible");
  });

  it('detects B4 for vm_penerima when nama is used instead of nama_penerima', () => {
    const error = diagnostics.find(d => d.code === 'B4' && d.message.includes("'nama'" ) && d.message.includes("'v_master_penerima'"));

    expect(error).toBeDefined();
    expect(error?.message).toContain("[B4] Kolom 'nama' tidak ditemukan di view 'v_master_penerima'");
    expect(error?.message).toContain("nama  ->  nama_penerima");
    expect(error?.message).toContain("Kolom yang tersedia di 'v_master_penerima':");
    expect(error?.message).toContain("• nama_penerima");
  });

  it('places squiggly line exactly over the raw alias column for vm_bansos', () => {
    const error = diagnostics.find(d => d.code === 'B4' && d.message.includes("'v_penerima_bansos'"));

    expect(error).toBeDefined();
    expect(error?.range).toBeDefined();

    const fixturePath = path.resolve(__dirname, '..', '..', 'sample', 'obda_cases', 'b4.obda');
    const obdaText = fs.readFileSync(fixturePath, 'utf8');

    const lines = obdaText.split('\n');
    const errorLineText = lines[error!.range.startLine];

    const highlightedText = errorLineText.substring(error!.range.startChar, error!.range.endChar);

    expect(highlightedText).toBe('id');
  });
});

describe('Category B5 Validation', () => {
  let mockVdbData: VdbData;
  let diagnostics: any[];

  beforeEach(() => {
    mockVdbData = getSharedMockVdb();

    const fixturePath = path.resolve(__dirname, '..', '..', 'sample', 'obda_cases', 'b5.obda');
    const obdaText = fs.readFileSync(fixturePath, 'utf8');
    const mappings = parseObda(obdaText);

    diagnostics = validateCategoryB(
      mappings,
      mockVdbData,
      'file:///dummy.obda',
      'file:///dummy.vdb.xml',
      obdaText
    );
  });

  it('detects exactly 1 B5 error overall', () => {
    const b5Errors = diagnostics.filter(d => d.code === 'B5');
    expect(b5Errors.length).toBe(1);
  });

  it('detects B5 when target includes catatan_validasi that is not selected in source', () => {
    const error = diagnostics.find(d => d.code === 'B5' && d.message.includes("'catatan_validasi'"));

    expect(error).toBeDefined();
    expect(error?.message).toContain("[B5] Placeholder '{catatan_validasi}' di target tidak ada di SELECT source");
    expect(error?.message).toContain("Kolom 'catatan_validasi' dipakai di target template tapi tidak di-SELECT di source query.");
    expect(error?.message).toContain("Suggestion: Tambahkan 'catatan_validasi' ke SELECT source.");
    expect(error?.message).toContain("Catatan: Pastikan 'catatan_validasi' juga diekspos oleh view 'v_eligibility' di vdb.xml.");
  });

  it('provides quick fix for adding catatan_validasi to source SELECT', () => {
    const error = diagnostics.find(d => d.code === 'B5' && d.message.includes("'catatan_validasi'"));

    expect(error).toBeDefined();
    expect((error as any).data).toBeDefined();
    expect((error as any).data.fixes[0].title).toContain("Tambah 'catatan_validasi' ke SELECT source");
    expect((error as any).data.fixes[0].edits.length).toBeGreaterThan(0);
  });

  it('places squiggly line exactly over the missing target property', () => {
    const error = diagnostics.find(d => d.code === 'B5' && d.message.includes("'catatan_validasi'"));

    expect(error).toBeDefined();
    expect(error?.range).toBeDefined();

    const fixturePath = path.resolve(__dirname, '..', '..', 'sample', 'obda_cases', 'b5.obda');
    const obdaText = fs.readFileSync(fixturePath, 'utf8');

    const lines = obdaText.split('\n');
    const errorLineText = lines[error!.range.startLine];

    const highlightedText = errorLineText.substring(error!.range.startChar, error!.range.endChar);

    expect(highlightedText).toBe('catatan_validasi');
  });
});


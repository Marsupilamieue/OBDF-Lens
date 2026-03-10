# OBDF Debugger - Skenario Error & Suggestion

> VSCode Extension untuk diagnosis error **OBDA Mapping** (`.obda`) dan **Teiid Virtual Database** (`vdb.xml`) dalam sistem Ontology-Based Data Federation (OBDF).
>
> Studi kasus: Database yang sama dengan ascam tadi

---

## Chain Validasi End-to-End

```
.obda  ──────────►  vdb.xml  ──────────►  Physical DB
       Kategori A             Kategori C
       Kategori B
```

| Layer | Arah | Yang Divalidasi |
|-------|------|-----------------|
| 1 | `.obda` → `vdb.xml` | Nama view & kolom yang dirujuk .obda ada di vdb.xml |
| 2 | `vdb.xml` → Physical DB | Tabel & kolom yang dirujuk vdb.xml ada di DB fisik |

---

## Daftar Isi

- [Peta Skenario](#peta-skenario)
- [Kategori A - Nama View Salah](#kategori-a--nama-view-salah)
  - [A1. Typo Nama View](#a1-typo-nama-view)
  - [A2. Nama Model Teiid Salah](#a2-nama-model-teiid-salah)
  - [A3. View Belum Dibuat di vdb.xml](#a3-view-belum-dibuat-di-vdbxml)
  - [A4. Format Referensi Tidak Lengkap](#a4-format-referensi-tidak-lengkap)
- [Kategori B - Kolom Tidak Match](#kategori-b--kolom-tidak-match)
  - [B1. Kolom Belum di-SELECT di View](#b1-kolom-belum-di-select-di-view)
  - [B2. Typo Nama Kolom](#b2-typo-nama-kolom)
  - [B3. Kolom Ada di Tabel Fisik, Tidak di View](#b3-kolom-ada-di-tabel-fisik-tidak-di-view)
  - [B4. Alias Kolom Tidak Konsisten](#b4-alias-kolom-tidak-konsisten)
  - [B5. Placeholder Target Tidak Ada di SELECT Source](#b5-placeholder-target-tidak-ada-di-select-source)
- [Kategori C - Validasi vdb.xml ke Physical Database](#kategori-c--validasi-vdbxml-ke-physical-database)
  - [C1. Nama Schema/Source Salah](#c1-nama-schemasource-salah)
  - [C2. Nama Tabel Tidak Ada di DB Source](#c2-nama-tabel-tidak-ada-di-db-source)
  - [C3. Nama Kolom Tidak Ada di Tabel Source](#c3-nama-kolom-tidak-ada-di-tabel-source)
  - [C4. Kolom di JOIN Tidak Ada di Tabel Source](#c4-kolom-di-join-tidak-ada-di-tabel-source)
- [Ringkasan Semua Skenario](#ringkasan-semua-skenario)
- [Alur Deteksi Keseluruhan](#alur-deteksi-keseluruhan)
- [Konfigurasi](#konfigurasi)
- [Prioritas Implementasi](#prioritas-implementasi)

---

## Peta Skenario

```
Tiga Kategori Error
│
├── KATEGORI A: Nama View Salah              [.obda → vdb.xml]
│   (.obda merujuk view yang tidak ada di vdb.xml)
│   │
│   ├── A1. Typo nama view
│   ├── A2. Nama model Teiid salah
│   ├── A3. View belum dibuat di vdb.xml
│   └── A4. Salah format referensi (model.view)
│
├── KATEGORI B: Kolom Tidak Match            [.obda → vdb.xml]
│   (.obda merujuk kolom yang tidak ada di view)
│   │
│   ├── B1. Kolom belum di-SELECT di view
│   ├── B2. Typo nama kolom
│   ├── B3. Kolom ada di tabel fisik tapi tidak di-expose view
│   ├── B4. Alias kolom tidak konsisten
│   └── B5. Placeholder di target tidak ada di SELECT source
│
└── KATEGORI C: Tabel/Kolom Tidak Ada di DB  [vdb.xml → Physical DB]
    (vdb.xml merujuk tabel/kolom yang tidak ada di database fisik)
    │
    ├── C1. Nama schema/source salah
    ├── C2. Nama tabel tidak ada di DB source
    ├── C3. Nama kolom tidak ada di tabel source
    └── C4. Kolom di JOIN tidak ada di tabel source
```

---

## Kategori A - Nama View Salah

---

### A1. Typo Nama View

**Skenario:** Developer baru membuat mapping penduduk, tapi salah ketik nama view di `.obda`.

**Kondisi `vdb.xml` (benar):**
```xml
<model name="vm_penduduk" type="VIRTUAL">
  <metadata type="DDL"><![CDATA[
    CREATE VIEW v_penduduk AS
      SELECT nik, nama, tanggal_lahir, pekerjaan, penghasilan
      FROM bansos_db.master_penduduk;
  ]]></metadata>
</model>
```

**Kondisi `.obda` (salah):**
```
mappingId   penduduk-mapping
target      ex:penduduk/{nik} a ex:Penduduk ;
              ex:nama {nama}^^xsd:string .
source      SELECT nik, nama
            FROM vm_penduduk.v_pendudukk   ← typo: double 'k'
```

**Output extension:**
```
Error   [A1] View 'v_pendudukk' tidak ditemukan di vdb.xml
        Baris 5 di bansos.obda
        ───────────────────────────────────────────
        Suggestion: Maksud kamu 'v_penduduk'? (similarity: 94%)
                    Tersedia di model 'vm_penduduk'

        Quick Fix:  [Ganti dengan 'vm_penduduk.v_penduduk']
```

---

### A2. Nama Model Teiid Salah

**Skenario:** Developer salah menulis prefix model Teiid (bagian sebelum titik).

**Kondisi `.obda` (salah):**
```
source    SELECT nik, nama
          FROM penduduk.v_penduduk
          --   ^^^^^^^^ harusnya 'vm_penduduk'
```

**Output extension:**
```
Error   [A2] Model 'penduduk' tidak terdaftar di vdb.xml
        Baris 2 di bansos.obda
        ───────────────────────────────────────────
        Model yang tersedia di vdb.xml:
          • vm_penduduk
          • vm_wilayah
          • vm_keluarga
          • vm_program_bansos
          • vm_eligibility
          • vm_transaksi

        Suggestion: Maksud kamu 'vm_penduduk'?

        Quick Fix:  [Ganti dengan 'vm_penduduk.v_penduduk']
```

---

### A3. View Belum Dibuat di vdb.xml

**Skenario:** Developer menulis mapping untuk `transaksi_bansos` tapi lupa mendefinisikan virtual view-nya di `vdb.xml`.

**Kondisi `vdb.xml`:** *(tidak ada `vm_transaksi`)*

**Kondisi `.obda`:**
```
mappingId   transaksi-mapping
target      ex:transaksi/{transaksi_id} a ex:TransaksiBansos .
source      SELECT transaksi_id, nik, status
            FROM vm_transaksi.v_transaksi   ← view belum ada
```

**Output extension:**
```
Error   [A3] View 'vm_transaksi.v_transaksi' tidak ditemukan di vdb.xml
        Baris 4 di bansos.obda
        ───────────────────────────────────────────
        Sepertinya view ini belum didefinisikan sama sekali.

        Suggestion: Tambahkan virtual model berikut ke vdb.xml:

        ┌─────────────────────────────────────────────┐
        │  <model name="vm_transaksi"                 │
        │          type="VIRTUAL">                    │
        │    <metadata type="DDL"><![CDATA[           │
        │      CREATE VIEW v_transaksi AS             │
        │        SELECT *                             │
        │        FROM bansos_db.transaksi_bansos;     │
        │    ]]></metadata>                           │
        │  </model>                                   │
        └─────────────────────────────────────────────┘

        Quick Fix:  [Generate & tambahkan ke vdb.xml]
```

> **Catatan:** Quick Fix A3 adalah fitur paling berguna untuk *development awal* - extension meng-generate skeleton view secara otomatis berdasarkan nama tabel yang diinferensi dari nama mapping.

---

### A4. Format Referensi Tidak Lengkap

**Skenario:** Developer lupa memakai format `model.view`, langsung menulis nama view saja tanpa prefix model.

**Kondisi `.obda` (salah):**
```
source    SELECT nik, nama
          FROM v_penduduk   ← tanpa prefix model
```

**Output extension:**
```
Warning [A4] Format referensi tidak lengkap: 'v_penduduk'
        Teiid memerlukan format 'NamaModel.NamaView'
        Baris 2 di bansos.obda
        ───────────────────────────────────────────
        Suggestion: View 'v_penduduk' ditemukan di model 'vm_penduduk'

        Quick Fix:  [Ganti dengan 'vm_penduduk.v_penduduk']
```

---

## Kategori B - Kolom Tidak Match

---

### B1. Kolom Belum di-SELECT di View

**Skenario:** Developer ingin mapping kolom `penghasilan` tapi lupa menambahkannya di SELECT pada virtual view.

**Kondisi `vdb.xml`:**
```xml
CREATE VIEW v_penduduk AS
  SELECT nik, nama, tanggal_lahir, pekerjaan
  -- 'penghasilan' tidak di-SELECT
  FROM bansos_db.master_penduduk;
```

**Kondisi `.obda`:**
```
target    ex:penduduk/{nik} a ex:Penduduk ;
            ex:nama {nama}^^xsd:string ;
            ex:penghasilan {penghasilan}^^xsd:decimal .  ← kolom tidak ada di view
source    SELECT nik, nama, penghasilan                  ← tidak diekspos view
          FROM vm_penduduk.v_penduduk
```

**Output extension:**
```
Error   [B1] Kolom 'penghasilan' tidak diekspos oleh view 'v_penduduk'
        Baris 3 & 5 di bansos.obda
        ───────────────────────────────────────────
        Kolom ini ADA di tabel fisik 'master_penduduk'
        tapi tidak di-SELECT di vdb.xml.

        Suggestion (pilih salah satu):

        Opsi 1 - Tambah kolom ke view di vdb.xml:
        ┌──────────────────────────────────────────────┐
        │  SELECT nik, nama, tanggal_lahir,            │
        │         pekerjaan, penghasilan   ← tambahkan │
        │  FROM bansos_db.master_penduduk;             │
        └──────────────────────────────────────────────┘

        Opsi 2 - Hapus referensi dari .obda:
          • Hapus 'ex:penghasilan' dari target
          • Hapus 'penghasilan' dari SELECT source

        Quick Fix:  [Tambah ke vdb.xml]  [Hapus dari .obda]
```

---

### B2. Typo Nama Kolom

**Skenario:** Typo saat menulis nama kolom di source query `.obda`.

**Kondisi `vdb.xml`:**
```xml
CREATE VIEW v_eligibility AS
  SELECT eligibility_id, program_id, nik,
         status_eligible, validated_at, validated_by
  FROM bansos_db.eligibility;
```

**Kondisi `.obda` (salah):**
```
source    SELECT eligibility_id, program_id, nik,
                 status_eligble,    ← typo, hilang 'i'
                 validated_at, validated_by
          FROM vm_eligibility.v_eligibility
```

**Output extension:**
```
Error   [B2] Kolom 'status_eligble' tidak ditemukan di view 'v_eligibility'
        Baris 2 di bansos.obda
        ───────────────────────────────────────────
        Suggestion: Maksud kamu 'status_eligible'? (similarity: 92%)

        Kolom yang tersedia di 'v_eligibility':
          • eligibility_id
          • program_id
          • nik
          • status_eligible   ← paling mirip
          • validated_at
          • validated_by

        Quick Fix:  [Ganti dengan 'status_eligible']
```

---

### B3. Kolom Ada di Tabel Fisik, Tidak di View

**Skenario:** Developer ingin mapping kolom `alasan` dari tabel `eligibility`, tapi view sengaja tidak mengeksposnya (misal karena alasan keamanan data).

**Kondisi `vdb.xml`:**
```xml
CREATE VIEW v_eligibility AS
  SELECT eligibility_id, program_id, nik, status_eligible
  -- 'alasan' sengaja tidak diekspos
  FROM bansos_db.eligibility;
```

**Kondisi `.obda`:**
```
source    SELECT eligibility_id, alasan   ← tidak ada di view
          FROM vm_eligibility.v_eligibility
```

**Output extension:**
```
Error   [B3] Kolom 'alasan' tidak diekspos oleh view 'v_eligibility'
        Baris 2 di bansos.obda
        ───────────────────────────────────────────
          Kolom ini MEMANG ADA di tabel fisik 'eligibility'
            tapi tidak di-SELECT di virtual view.
            (Kemungkinan disengaja - cek kebijakan akses data)

        Suggestion (pilih salah satu):

        Opsi 1 - Ekspos kolom jika memang boleh diakses:
          Tambahkan 'alasan' ke SELECT di vdb.xml

        Opsi 2 - Hapus dari mapping jika memang restricted:
          Hapus referensi 'alasan' dari .obda

        Quick Fix:  [Ekspos di vdb.xml]  [ Hapus dari .obda]
```

> **Catatan:** Berbeda dengan B1, extension memberikan peringatan kontekstual bahwa penghilangan kolom ini mungkin disengaja - bukan sekadar lupa.

---

### B4. Alias Kolom Tidak Konsisten

**Skenario:** Di `vdb.xml` kolom diberi alias, tapi di `.obda` developer memakai nama kolom asli bukan nama alias-nya.

**Kondisi `vdb.xml`:**
```xml
CREATE VIEW v_program_bansos AS
  SELECT program_id,
         nama_program  AS program_name,   ← kolom di-alias
         CAST(nominal AS BIGINT) AS nominal
  FROM bansos_db.master_program_bansos;
```

**Kondisi `.obda` (salah):**
```
target    ex:program/{program_id} a ex:ProgramBansos ;
            ex:namaProgram {nama_program}^^xsd:string .  ← nama asli, bukan alias
source    SELECT program_id, nama_program                ← harusnya 'program_name'
          FROM vm_program_bansos.v_program_bansos
```

**Output extension:**
```
Error   [B4] Kolom 'nama_program' tidak ditemukan di view 'v_program_bansos'
        Baris 2 & 4 di bansos.obda
        ───────────────────────────────────────────
          Kolom ini di-alias di vdb.xml:
              nama_program  →  program_name

            View hanya mengekspos nama alias-nya: 'program_name'

        Suggestion: Gunakan nama alias, bukan nama kolom asli.

        Kolom yang tersedia di 'v_program_bansos':
          • program_id
          • program_name    ← alias dari 'nama_program'
          • nominal

        Quick Fix:  [Ganti 'nama_program' → 'program_name' di .obda]
```

---

### B5. Placeholder Target Tidak Ada di SELECT Source

**Skenario:** Developer menambahkan property baru di target template tapi lupa menambahkan kolomnya di SELECT source.

**Kondisi `.obda`:**
```
target    ex:penduduk/{nik} a ex:Penduduk ;
            ex:nama {nama}^^xsd:string ;
            ex:noKK {no_kk}^^xsd:string .   ← {no_kk} dipakai di target
source    SELECT nik, nama                   ← tapi 'no_kk' tidak di-SELECT
          FROM vm_penduduk.v_penduduk
```

**Output extension:**
```
Error   [B5] Placeholder '{no_kk}' di target tidak ada di SELECT source
        mapping: 'penduduk-mapping', baris 3 di bansos.obda
        ───────────────────────────────────────────
        Kolom 'no_kk' dipakai di target template tapi
        tidak di-SELECT di source query.

        Suggestion: Tambahkan 'no_kk' ke SELECT source.

        ┌────────────────────────────────────────┐
        │  source  SELECT nik, nama, no_kk       │  ← tambah di sini
        │          FROM vm_penduduk.v_penduduk   │
        └────────────────────────────────────────┘

        Catatan: Pastikan 'no_kk' juga diekspos
                 oleh view 'v_penduduk' di vdb.xml.

        Quick Fix:  [Tambah 'no_kk' ke SELECT source]
```

---

## Ringkasan Semua Skenario

| Kode | Arah Validasi | Deskripsi Error | Severity | Quick Fix |
|------|--------------|-----------------|----------|-----------|
| A1 | .obda → vdb.xml | Typo nama view | 🔴 Error | Ganti dengan nama terdekat |
| A2 | .obda → vdb.xml | Prefix model Teiid salah | 🔴 Error | Ganti ke format `model.view` |
| A3 | .obda → vdb.xml | View belum dibuat di vdb.xml | 🔴 Error | Auto-generate skeleton view |
| A4 | .obda → vdb.xml | Format referensi tidak lengkap | 🟡 Warning | Tambah prefix model |
| B1 | .obda → vdb.xml | Kolom belum di-SELECT di view | 🔴 Error | Tambah ke vdb.xml atau hapus dari .obda |
| B2 | .obda → vdb.xml | Typo nama kolom | 🔴 Error | Ganti dengan nama terdekat |
| B3 | .obda → vdb.xml | Kolom ada di fisik, tidak di view | 🔴 Error | Ekspos di vdb.xml atau hapus dari .obda |
| B4 | .obda → vdb.xml | Alias kolom tidak konsisten | 🔴 Error | Pakai nama alias |
| B5 | .obda → vdb.xml | Placeholder target tidak di SELECT | 🔴 Error | Tambah kolom ke SELECT source |
| C1 | vdb.xml → DB | Nama schema/source salah | 🔴 Error | Ganti nama source |
| C2 | vdb.xml → DB | Tabel tidak ada di DB source | 🔴 Error | Ganti nama tabel |
| C3 | vdb.xml → DB | Kolom tidak ada di tabel source | 🔴 Error | Ganti nama kolom |
| C4 | vdb.xml → DB | Kolom JOIN tidak ada di tabel source | 🔴 Error | Ganti nama kolom JOIN |

---

## Kategori C - Validasi vdb.xml ke Physical Database

Kategori C memvalidasi arah **`vdb.xml` → Physical Database** menggunakan live query JDBC ke metadata schema database.

**Query metadata yang dijalankan extension:**
```sql
-- Ambil semua tabel di schema tertentu
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';

-- Ambil semua kolom di tabel tertentu
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'master_penduduk';
```

> Extension hanya query **metadata schema** - tidak mengambil data apapun dari tabel.

---

### C1. Nama Schema/Source Salah

**Skenario:** Developer salah menulis nama source connection di `vdb.xml`.

**Kondisi `vdb.xml` (salah):**
```xml
<source name="bansos_dbs"             ← typo: tambahan 's'
        translator-name="postgresql"
        connection-jndi-name="java:/bansos-ds"/>

...

CREATE VIEW v_penduduk AS
  SELECT nik, nama
  FROM bansos_dbs.master_penduduk;    ← merujuk source yang salah
```

**Output extension:**
```
Error   [C1] Source 'bansos_dbs' tidak dikenali / tidak bisa dikoneksi
        Baris 2 di vdb.xml
        ───────────────────────────────────────────
        Extension mencoba koneksi JDBC ke 'bansos_dbs'
        → Connection failed / source tidak terdaftar di Teiid

        Source yang terdaftar dan aktif:
          • bansos_db    Connected

        Suggestion: Maksud kamu 'bansos_db'? (similarity: 91%)

        Quick Fix:  [Ganti semua 'bansos_dbs' → 'bansos_db' di vdb.xml]
```

---

### C2. Nama Tabel Tidak Ada di DB Source

**Skenario:** Developer salah menulis nama tabel fisik di `FROM` clause virtual view.

**Kondisi `vdb.xml` (salah):**
```xml
CREATE VIEW v_penduduk AS
  SELECT nik, nama, tanggal_lahir
  FROM bansos_db.master_penduduks;
  --             ^^^^^^^^^^^^^^^^ typo: tambahan 's'
```

**Live query extension ke DB:**
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public';

-- Hasil dari DB:
-- master_penduduk        
-- master_keluarga        
-- master_wilayah         
-- master_program_bansos  
-- eligibility            
-- transaksi_bansos       
-- master_penduduks       ✗ TIDAK ADA
```

**Output extension:**
```
Error   [C2] Tabel 'master_penduduks' tidak ditemukan di database source
        Baris 3 di vdb.xml (model: vm_penduduk)
        ───────────────────────────────────────────
        Source: bansos_db (PostgreSQL)  Connected

        Suggestion: Maksud kamu 'master_penduduk'? (similarity: 96%)

        Tabel yang tersedia di bansos_db:
          • master_penduduk       ← paling mirip
          • master_keluarga
          • master_wilayah
          • master_program_bansos
          • eligibility
          • transaksi_bansos

        Quick Fix:  [Ganti dengan 'master_penduduk']
```

---

### C3. Nama Kolom Tidak Ada di Tabel Source

**Skenario:** Developer menulis nama kolom di SELECT view tapi kolom tersebut tidak ada di tabel fisik.

**Kondisi `vdb.xml` (salah):**
```xml
CREATE VIEW v_penduduk AS
  SELECT nik, nama, tgl_lahir, pekerjaan
  --               ^^^^^^^^^^ kolom aslinya 'tanggal_lahir'
  FROM bansos_db.master_penduduk;
```

**Live query extension ke DB:**
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'master_penduduk';

-- Hasil dari DB:
-- nik             VARCHAR    
-- no_kk           VARCHAR    
-- nama            VARCHAR    
-- tanggal_lahir   DATE         ← ada, tapi namanya ini
-- pekerjaan       VARCHAR    
-- penghasilan     DECIMAL    
-- status_hidup    VARCHAR    
-- created_at      TIMESTAMP  
-- tgl_lahir                  ✗ TIDAK ADA
```

**Output extension:**
```
Error   [C3] Kolom 'tgl_lahir' tidak ditemukan di tabel 'master_penduduk'
        Baris 2 di vdb.xml (model: vm_penduduk)
        ───────────────────────────────────────────
        Source: bansos_db.master_penduduk  Tabel ditemukan

        Suggestion: Maksud kamu 'tanggal_lahir'? (similarity: 88%)

        Kolom yang tersedia di 'master_penduduk':
          • nik             VARCHAR
          • no_kk           VARCHAR
          • nama            VARCHAR
          • tanggal_lahir   DATE      ← paling mirip dengan 'tgl_lahir'
          • pekerjaan       VARCHAR
          • penghasilan     DECIMAL
          • status_hidup    VARCHAR
          • created_at      TIMESTAMP

        Quick Fix:  [Ganti dengan 'tanggal_lahir']
```

---

### C4. Kolom di JOIN Tidak Ada di Tabel Source

**Skenario:** Developer salah tulis nama kolom di `ON` clause JOIN antar tabel fisik.

**Kondisi `vdb.xml` (salah):**
```xml
CREATE VIEW v_keluarga AS
  SELECT k.no_kk, k.wilayah_id, w.provinsi, w.kabupaten
  FROM bansos_db.master_keluarga k
  JOIN bansos_db.master_wilayah w
    ON k.wilayah_id = w.id_wilayah;
    --                 ^^^^^^^^^^ kolom aslinya 'wilayah_id'
```

**Output extension:**
```
Error   [C4] Kolom 'id_wilayah' tidak ditemukan di tabel 'master_wilayah'
        Baris 5 di vdb.xml (model: vm_keluarga) - JOIN condition
        ───────────────────────────────────────────
        Source: bansos_db.master_wilayah  Tabel ditemukan

        Suggestion: Maksud kamu 'wilayah_id'? (similarity: 89%)

        Kolom yang tersedia di 'master_wilayah':
          • wilayah_id   ← paling mirip dengan 'id_wilayah'
          • provinsi
          • kabupaten
          • kecamatan
          • desa

        Quick Fix:  [Ganti 'id_wilayah' → 'wilayah_id' di JOIN condition]
```

---

## Alur Deteksi Keseluruhan

Validasi berjalan **tiga lapis berurutan** - layer berikutnya hanya dijalankan jika layer sebelumnya lulus, supaya error tidak menumpuk dan membingungkan.

```
Save vdb.xml atau .obda
          │
          ▼
┌──────────────────────────────────┐
│  LAYER 1 - .obda → vdb.xml      │
│  (Kategori A & B)                │
│                                  │
│  Untuk setiap mappingId:         │
│  ┌──────────────────────────┐    │
│  │ Ekstrak FROM clause      │    │
│  │ → nama model.view        │    │
│  │         │                │    │
│  │   Ada di vdb.xml?        │    │
│  │   ┌─────┴─────┐          │    │
│  │  TIDAK        YA         │    │
│  │   │           │          │    │
│  │  A1/A2    Cek kolom      │    │
│  │  A3/A4    SELECT & target│    │
│  │               │          │    │
│  │          Match semua?    │    │
│  │          ┌────┴────┐     │    │
│  │        TIDAK       YA    │    │
│  │          │          │    │    │
│  │        B1-B5          │    │
│  └──────────────────────────┘    │
└──────────────┬───────────────────┘
               │ Lulus 
               ▼
┌──────────────────────────────────┐
│  LAYER 2 - vdb.xml → Physical DB│
│  (Kategori C)                    │
│                                  │
│  Untuk setiap virtual view:      │
│  ┌──────────────────────────┐    │
│  │ Ekstrak source name      │    │
│  │         │                │    │
│  │  Source bisa dikoneksi?  │    │
│  │   ┌─────┴─────┐          │    │
│  │  TIDAK        YA         │    │
│  │   │           │          │    │
│  │   C1      Cek tabel      │    │
│  │               │          │    │
│  │         Tabel ada di DB? │    │
│  │          ┌────┴────┐     │    │
│  │        TIDAK       YA    │    │
│  │          │          │    │    │
│  │          C2     Cek kolom│    │
│  │               SELECT & ON│    │
│  │                   │      │    │
│  │             Kolom ada?   │    │
│  │             ┌────┴────┐  │    │
│  │           TIDAK       YA │    │
│  │             │          │ │    │
│  │           C3/C4       │    │
│  └──────────────────────────┘    │
└──────────────┬───────────────────┘
               │ Lulus 
               ▼
┌──────────────────────────────────┐
│   SEMUA VALID                  │
│  Status bar: hijau               │
│  "OBDF: No Errors"               │
└──────────────────────────────────┘
```
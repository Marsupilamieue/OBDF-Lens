-- ============================================================
-- OBDF Lens - Database Setup Script
-- Database: bansos
-- ============================================================

-- Buat database (jalankan sebagai superuser)
-- CREATE DATABASE bansos;
-- \c bansos

-- ============================================================
-- SCHEMA
-- ============================================================

CREATE TABLE IF NOT EXISTS master_penduduk (
  nik           VARCHAR(16) PRIMARY KEY,
  no_kk         VARCHAR(16) NOT NULL,
  nama          VARCHAR(100) NOT NULL,
  tanggal_lahir DATE NOT NULL,
  pekerjaan     VARCHAR(100),
  penghasilan   DECIMAL(15, 2) DEFAULT 0,
  status_hidup  VARCHAR(10) DEFAULT 'hidup' CHECK (status_hidup IN ('hidup', 'meninggal')),
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS master_wilayah (
  wilayah_id  VARCHAR(10) PRIMARY KEY,
  provinsi    VARCHAR(50) NOT NULL,
  kabupaten   VARCHAR(50) NOT NULL,
  kecamatan   VARCHAR(50) NOT NULL,
  desa        VARCHAR(50) NOT NULL
);

CREATE TABLE IF NOT EXISTS master_keluarga (
  no_kk       VARCHAR(16) PRIMARY KEY,
  wilayah_id  VARCHAR(10) REFERENCES master_wilayah(wilayah_id),
  alamat      VARCHAR(200),
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS master_program_bansos (
  program_id   SERIAL PRIMARY KEY,
  nama_program VARCHAR(100) NOT NULL,
  nominal      BIGINT NOT NULL,
  periode      VARCHAR(20),
  aktif        BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS eligibility (
  eligibility_id  SERIAL PRIMARY KEY,
  program_id      INT REFERENCES master_program_bansos(program_id),
  nik             VARCHAR(16) REFERENCES master_penduduk(nik),
  status_eligible VARCHAR(20) DEFAULT 'pending' CHECK (status_eligible IN ('eligible', 'not_eligible', 'pending')),
  alasan          TEXT,
  validated_at    TIMESTAMP,
  validated_by    VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS transaksi_bansos (
  transaksi_id  SERIAL PRIMARY KEY,
  eligibility_id INT REFERENCES eligibility(eligibility_id),
  nik           VARCHAR(16) REFERENCES master_penduduk(nik),
  program_id    INT REFERENCES master_program_bansos(program_id),
  tanggal       DATE NOT NULL,
  nominal       BIGINT NOT NULL,
  status        VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'cair', 'gagal')),
  created_at    TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- DUMMY DATA
-- ============================================================

-- Wilayah
INSERT INTO master_wilayah (wilayah_id, provinsi, kabupaten, kecamatan, desa) VALUES
  ('JB-001', 'Jawa Barat', 'Bandung', 'Coblong', 'Dago'),
  ('JB-002', 'Jawa Barat', 'Bandung', 'Cimahi Utara', 'Citeureup'),
  ('JT-001', 'Jawa Tengah', 'Semarang', 'Banyumanik', 'Padangsari'),
  ('JT-002', 'Jawa Tengah', 'Solo', 'Laweyan', 'Pajang'),
  ('JK-001', 'DKI Jakarta', 'Jakarta Selatan', 'Mampang Prapatan', 'Tegal Parang')
ON CONFLICT DO NOTHING;

-- Keluarga
INSERT INTO master_keluarga (no_kk, wilayah_id, alamat) VALUES
  ('3273011234560001', 'JB-001', 'Jl. Dago No. 12'),
  ('3273011234560002', 'JB-002', 'Jl. Cimahi Baru No. 5'),
  ('3374011234560001', 'JT-001', 'Jl. Banyumanik Raya No. 8'),
  ('3372011234560001', 'JT-002', 'Jl. Laweyan No. 21'),
  ('3171011234560001', 'JK-001', 'Jl. Mampang No. 7')
ON CONFLICT DO NOTHING;

-- Penduduk
INSERT INTO master_penduduk (nik, no_kk, nama, tanggal_lahir, pekerjaan, penghasilan, status_hidup) VALUES
  ('3273010101850001', '3273011234560001', 'Budi Santoso',       '1985-01-01', 'Buruh',          800000,  'hidup'),
  ('3273010202900002', '3273011234560001', 'Siti Aminah',        '1990-02-02', 'Ibu Rumah Tangga', 0,     'hidup'),
  ('3273010303750003', '3273011234560002', 'Agus Wijaya',        '1975-03-03', 'Petani',          1200000, 'hidup'),
  ('3374010404800004', '3374011234560001', 'Dewi Rahayu',        '1980-04-04', 'Pedagang',        950000,  'hidup'),
  ('3372010505700005', '3372011234560001', 'Hendra Gunawan',     '1970-05-05', 'Nelayan',         750000,  'hidup'),
  ('3171010606880006', '3171011234560001', 'Fitri Handayani',    '1988-06-06', 'Cleaning Service', 600000, 'hidup'),
  ('3273010707650007', '3273011234560001', 'Pak Tua Suwarno',    '1965-07-07', 'Tidak Bekerja',   0,       'hidup'),
  ('3374010808720008', '3374011234560001', 'Nurul Hidayah',      '1972-08-08', 'Buruh Tani',      700000,  'hidup'),
  ('3372010909600009', '3372011234560001', 'Rustam Effendi',     '1960-09-09', 'Pensiunan',       1500000, 'hidup'),
  ('3171011010950010', '3171011234560001', 'Rina Marlina',       '1995-10-10', 'Mahasiswi',       0,       'hidup')
ON CONFLICT DO NOTHING;

-- Program Bansos
INSERT INTO master_program_bansos (nama_program, nominal, periode, aktif) VALUES
  ('PKH - Program Keluarga Harapan',     900000,  'Triwulan', TRUE),
  ('BPNT - Bantuan Pangan Non Tunai',    200000,  'Bulanan',  TRUE),
  ('BST - Bantuan Sosial Tunai',         600000,  'Bulanan',  TRUE),
  ('BLT Dana Desa',                      300000,  'Bulanan',  TRUE),
  ('Kartu Prakerja',                     600000,  'Sekali',   FALSE)
ON CONFLICT DO NOTHING;

-- Eligibility
INSERT INTO eligibility (program_id, nik, status_eligible, alasan, validated_at, validated_by) VALUES
  (1, '3273010101850001', 'eligible',     NULL,                     '2024-01-10', 'Admin Kemensos'),
  (1, '3273010202900002', 'eligible',     NULL,                     '2024-01-10', 'Admin Kemensos'),
  (1, '3273010303750003', 'not_eligible', 'Penghasilan di atas UMR','2024-01-11', 'Admin Kemensos'),
  (2, '3374010404800004', 'eligible',     NULL,                     '2024-01-12', 'Admin Dinsos'),
  (2, '3372010505700005', 'eligible',     NULL,                     '2024-01-12', 'Admin Dinsos'),
  (3, '3171010606880006', 'eligible',     NULL,                     '2024-01-13', 'Admin Dinsos'),
  (3, '3273010707650007', 'eligible',     NULL,                     '2024-01-13', 'Admin Dinsos'),
  (4, '3374010808720008', 'eligible',     NULL,                     '2024-01-14', 'Admin Desa'),
  (4, '3372010909600009', 'pending',      NULL,                     NULL,         NULL),
  (1, '3171011010950010', 'pending',      NULL,                     NULL,         NULL)
ON CONFLICT DO NOTHING;

-- Transaksi Bansos
INSERT INTO transaksi_bansos (eligibility_id, nik, program_id, tanggal, nominal, status) VALUES
  (1, '3273010101850001', 1, '2024-01-15', 900000, 'cair'),
  (2, '3273010202900002', 1, '2024-01-15', 900000, 'cair'),
  (4, '3374010404800004', 2, '2024-01-16', 200000, 'cair'),
  (5, '3372010505700005', 2, '2024-01-16', 200000, 'cair'),
  (6, '3171010606880006', 3, '2024-01-17', 600000, 'cair'),
  (7, '3273010707650007', 3, '2024-01-17', 600000, 'cair'),
  (8, '3374010808720008', 4, '2024-01-18', 300000, 'pending'),
  (1, '3273010101850001', 1, '2024-04-15', 900000, 'cair'),
  (2, '3273010202900002', 1, '2024-04-15', 900000, 'cair'),
  (4, '3374010404800004', 2, '2024-02-16', 200000, 'gagal')
ON CONFLICT DO NOTHING;

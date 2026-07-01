-- ============================================================
-- OBDF Lens - Database Setup Script
-- Database: dtks
-- Sumber: Data Terpadu Kesejahteraan Sosial (Kemensos)

-- SCHEMA

CREATE TABLE IF NOT EXISTS keluarga_penerima_manfaat (
  kpm_id               SERIAL PRIMARY KEY,
  no_ktp_kepala        VARCHAR(16) NOT NULL UNIQUE,  
  nama_kepala_keluarga VARCHAR(100),
  no_kk                VARCHAR(16),
  desil_kesejahteraan  INT CHECK (desil_kesejahteraan BETWEEN 1 AND 10),
  status_kemiskinan    VARCHAR(20)
                         CHECK (status_kemiskinan IN ('sangat_miskin', 'miskin', 'rentan', 'hampir_miskin')),
  sumber_data          VARCHAR(20),  -- BPS, PBDT, SUSENAS
  updated_at           TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS anggota_kpm (
  anggota_id        SERIAL PRIMARY KEY,
  kpm_id            INT REFERENCES keluarga_penerima_manfaat(kpm_id),
  no_ktp_anggota    VARCHAR(16),  
  nama_anggota      VARCHAR(100),
  hubungan_keluarga VARCHAR(30)   -- kepala, istri, anak, orang_tua
                      CHECK (hubungan_keluarga IN ('kepala', 'istri', 'anak', 'orang_tua', 'saudara', 'lainnya')),
  usia              INT
);

CREATE TABLE IF NOT EXISTS program_kpm (
  kpm_program_id   SERIAL PRIMARY KEY,
  kpm_id           INT REFERENCES keluarga_penerima_manfaat(kpm_id),
  kode_program     VARCHAR(20),   -- PKH, BPNT, BST, BLT_DD, PRAKERJA
  nama_program     VARCHAR(100),
  tgl_penetapan    DATE,
  status_aktif     BOOLEAN DEFAULT TRUE
);

-- ============================================================
-- DATA
-- ============================================================

-- Keluarga Penerima Manfaat (12 KPM)
INSERT INTO keluarga_penerima_manfaat (no_ktp_kepala, nama_kepala_keluarga, no_kk, desil_kesejahteraan, status_kemiskinan, sumber_data) VALUES
  ('3273010101850001', 'Budi Santoso',        '3273011234560001',  1, 'sangat_miskin', 'PBDT'),
  ('3273010303750003', 'Agus Wijaya',         '3273011234560002',  2, 'miskin',         'PBDT'),
  ('3374010404800004', 'Dewi Rahayu',         '3374011234560001',  3, 'miskin',         'SUSENAS'),
  ('3372010505700005', 'Hendra Gunawan',      '3372011234560001',  2, 'miskin',         'BPS'),
  ('3171010606880006', 'Fitri Handayani',     '3171011234560001',  4, 'rentan',         'PBDT'),
  ('3273010707650007', 'Suwarno',             '3273011234560001',  1, 'sangat_miskin',  'PBDT'),
  ('3374010808720008', 'Nurul Hidayah',       '3374011234560001',  2, 'miskin',         'BPS'),
  ('3372010909600009', 'Rustam Effendi',      '3372011234560001',  5, 'hampir_miskin',  'SUSENAS'),
  ('3578010101780013', 'Bambang Sutrisno',    '3578011234560001',  3, 'miskin',         'PBDT'),
  ('6471010202750016', 'Hj. Salmah',          '6471011234560001',  2, 'miskin',         'BPS'),
  ('3273010101700017', 'Sarno',               '3273011234560001',  1, 'sangat_miskin',  'PBDT'),
  ('3372010101550019', 'Mbah Simin',          '3372011234560001',  1, 'sangat_miskin',  'PBDT')
ON CONFLICT DO NOTHING;

-- Anggota KPM (15 anggota)
INSERT INTO anggota_kpm (kpm_id, no_ktp_anggota, nama_anggota, hubungan_keluarga, usia) VALUES
  (1,  '3273010101850001', 'Budi Santoso',       'kepala',    40),
  (1,  '3273010202900002', 'Siti Aminah',        'istri',     35),
  (1,  '3273010707650007', 'Suwarno',            'orang_tua', 60),
  (2,  '3273010303750003', 'Agus Wijaya',        'kepala',    50),
  (3,  '3374010404800004', 'Dewi Rahayu',        'kepala',    45),
  (4,  '3372010505700005', 'Hendra Gunawan',     'kepala',    55),
  (5,  '3171010606880006', 'Fitri Handayani',    'kepala',    37),
  (6,  '3273010707650007', 'Suwarno',            'kepala',    60),
  (7,  '3374010808720008', 'Nurul Hidayah',      'kepala',    53),
  (8,  '3372010909600009', 'Rustam Effendi',     'kepala',    65),
  (9,  '3578010101780013', 'Bambang Sutrisno',   'kepala',    47),
  (9,  '3578010202830014', 'Wulandari',          'istri',     42),
  (10, '6471010202750016', 'Hj. Salmah',         'kepala',    50),
  (11, '3273010101700017', 'Sarno',              'kepala',    55),
  (12, '3372010101550019', 'Mbah Simin',         'kepala',    70)
ON CONFLICT DO NOTHING;

-- Program KPM (15 record)
INSERT INTO program_kpm (kpm_id, kode_program, nama_program, tgl_penetapan, status_aktif) VALUES
  (1,  'PKH',    'Program Keluarga Harapan',     '2023-01-01', TRUE),
  (1,  'BPNT',   'Bantuan Pangan Non Tunai',     '2023-01-01', TRUE),
  (2,  'BPNT',   'Bantuan Pangan Non Tunai',     '2023-06-01', TRUE),
  (3,  'BST',    'Bantuan Sosial Tunai',         '2023-01-01', TRUE),
  (4,  'PKH',    'Program Keluarga Harapan',     '2023-03-01', TRUE),
  (5,  'BST',    'Bantuan Sosial Tunai',         '2023-01-01', FALSE),
  (6,  'PKH',    'Program Keluarga Harapan',     '2022-01-01', TRUE),
  (7,  'BLT_DD', 'BLT Dana Desa',               '2023-07-01', TRUE),
  (8,  'PKH',    'Program Keluarga Harapan',     '2022-06-01', TRUE),
  (9,  'BPNT',   'Bantuan Pangan Non Tunai',     '2024-01-01', TRUE),
  (9,  'BST',    'Bantuan Sosial Tunai',         '2024-01-01', TRUE),
  (10, 'PKH',    'Program Keluarga Harapan',     '2023-01-01', TRUE),
  (11, 'BST',    'Bantuan Sosial Tunai',         '2023-01-01', TRUE),
  (11, 'BLT_DD', 'BLT Dana Desa',               '2023-07-01', TRUE),
  (12, 'PKH',    'Program Keluarga Harapan',     '2022-06-01', TRUE)
ON CONFLICT DO NOTHING;

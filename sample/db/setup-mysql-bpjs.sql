-- OBDF Lens - Database Setup Script
-- Database: bpjs_kes (MySQL)
-- Sumber: BPJS Kesehatan

-- CREATE DATABASE IF NOT EXISTS bpjs_kes;
-- USE bpjs_kes;

-- SCHEMA

CREATE TABLE IF NOT EXISTS peserta (
  peserta_id        INT AUTO_INCREMENT PRIMARY KEY,
  no_ktp            VARCHAR(16) NOT NULL UNIQUE,  
  nama_peserta      VARCHAR(100),
  kelas_layanan     INT CHECK (kelas_layanan IN (1, 2, 3)),
  jenis_kepesertaan VARCHAR(30),  -- PBI (disubsidi), Mandiri, PPU (pekerja), PBPU
  status_aktif      BOOLEAN DEFAULT TRUE,
  tgl_daftar        DATE,
  tgl_akhir         DATE
);

CREATE TABLE IF NOT EXISTS fasilitas_kesehatan (
  faskes_id    INT AUTO_INCREMENT PRIMARY KEY,
  kode_faskes  VARCHAR(10) UNIQUE,
  nama_faskes  VARCHAR(100),
  jenis_faskes VARCHAR(30),  -- puskesmas, klinik, rs_tipe_c, rs_tipe_b, rs_tipe_a
  wilayah_kode VARCHAR(10)  
);

CREATE TABLE IF NOT EXISTS kunjungan (
  kunjungan_id     INT AUTO_INCREMENT PRIMARY KEY,
  peserta_id       INT,
  faskes_id        INT,
  tgl_kunjungan    DATE,
  diagnosa         VARCHAR(200),
  biaya            BIGINT,
  ditanggung_bpjs  BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (peserta_id) REFERENCES peserta(peserta_id),
  FOREIGN KEY (faskes_id) REFERENCES fasilitas_kesehatan(faskes_id)
);

-- ============================================================
-- DATA
-- ============================================================

-- Fasilitas Kesehatan (8 faskes)
INSERT IGNORE INTO fasilitas_kesehatan (kode_faskes, nama_faskes, jenis_faskes, wilayah_kode) VALUES
  ('FK-JB-001', 'Puskesmas Coblong',       'puskesmas', 'JB-001'),
  ('FK-JB-002', 'Klinik Pratama Cimahi',   'klinik',    'JB-002'),
  ('FK-JT-001', 'Puskesmas Banyumanik',    'puskesmas', 'JT-001'),
  ('FK-JT-002', 'RSUD Moewardi Solo',      'rs_tipe_b', 'JT-002'),
  ('FK-JK-001', 'RS Fatmawati Jakarta',    'rs_tipe_b', 'JK-001'),
  ('FK-JK-002', 'Puskesmas Mampang',       'puskesmas', 'JK-001'),
  ('FK-JT-003', 'Puskesmas Rungkut',       'puskesmas', 'JT-003'),
  ('FK-KT-001', 'RSUD Kanujoso Balikpapan','rs_tipe_c', 'KT-001');

-- Peserta BPJS (20 baris — no_ktp sinkron dengan bansos & dukcapil)
INSERT IGNORE INTO peserta (no_ktp, nama_peserta, kelas_layanan, jenis_kepesertaan, status_aktif, tgl_daftar) VALUES
  ('3273010101850001', 'Budi Santoso',          3, 'PBI',     TRUE,  '2019-01-01'),
  ('3273010202900002', 'Siti Aminah',           3, 'PBI',     TRUE,  '2019-01-01'),
  ('3273010303750003', 'Agus Wijaya',           3, 'PBI',     TRUE,  '2020-03-01'),
  ('3374010404800004', 'Dewi Rahayu',           3, 'PBI',     TRUE,  '2019-06-01'),
  ('3372010505700005', 'Hendra Gunawan',        3, 'PBI',     TRUE,  '2018-01-01'),
  ('3171010606880006', 'Fitri Handayani',       3, 'PBI',     TRUE,  '2020-01-01'),
  ('3273010707650007', 'Suwarno',               3, 'PBI',     TRUE,  '2018-06-01'),
  ('3374010808720008', 'Nurul Hidayah',         3, 'PBI',     TRUE,  '2019-01-01'),
  ('3372010909600009', 'Rustam Effendi',        2, 'Mandiri', TRUE,  '2015-01-01'),
  ('3171011010950010', 'Rina Marlina',          2, 'PPU',     TRUE,  '2022-08-01'),
  ('3175010101920011', 'Darmawan Putra',        1, 'PPU',     TRUE,  '2018-01-01'),
  ('3175010202850012', 'Maria Ulfa',            2, 'PPU',     TRUE,  '2017-01-01'),
  ('3578010101780013', 'Bambang Sutrisno',      3, 'PBI',     TRUE,  '2019-01-01'),
  ('3578010202830014', 'Wulandari',             3, 'PBI',     TRUE,  '2019-01-01'),
  ('6471010101900015', 'Rizky Maulana',         2, 'PPU',     TRUE,  '2021-01-01'),
  ('6471010202750016', 'Hj. Salmah',            3, 'PBI',     FALSE, '2018-01-01'),
  ('3273010101700017', 'Sarno',                 3, 'PBI',     TRUE,  '2020-01-01'),
  ('3374010101910018', 'Endang Sulistyowati',   3, 'PBI',     TRUE,  '2021-01-01'),
  ('3372010101550019', 'Mbah Simin',            3, 'PBI',     TRUE,  '2017-01-01'),
  ('3171010101800020', 'Joko Susanto',          2, 'Mandiri', TRUE,  '2019-01-01');

-- Kunjungan (15 baris)
INSERT IGNORE INTO kunjungan (peserta_id, faskes_id, tgl_kunjungan, diagnosa, biaya, ditanggung_bpjs) VALUES
  (1,  1, '2024-01-10', 'ISPA',                    150000,  TRUE),
  (1,  1, '2024-03-05', 'Hipertensi',               200000,  TRUE),
  (2,  1, '2024-02-15', 'Anemia',                   180000,  TRUE),
  (3,  2, '2024-01-20', 'Diabetes Melitus Tipe II',  500000,  TRUE),
  (4,  3, '2024-01-25', 'ISPA',                    150000,  TRUE),
  (5,  4, '2024-02-10', 'Penyakit Jantung Koroner', 2000000, TRUE),
  (6,  5, '2024-01-30', 'Maag',                     200000,  TRUE),
  (7,  6, '2024-02-20', 'Rematik',                  300000,  TRUE),
  (8,  3, '2024-03-01', 'Hipertensi',               200000,  TRUE),
  (9,  4, '2024-01-15', 'Diabetes Melitus Tipe II',  800000,  TRUE),
  (13, 7, '2024-02-05', 'Diare',                    100000,  TRUE),
  (14, 7, '2024-02-08', 'ISPA',                    150000,  TRUE),
  (16, 8, '2024-03-10', 'Hipertensi',               200000,  FALSE),
  (19, 4, '2024-03-15', 'Stroke',                  3500000, TRUE),
  (20, 6, '2024-04-01', 'Maag',                     200000,  TRUE);

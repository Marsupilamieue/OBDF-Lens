-- ============================================================
-- OBDF Lens - Database Setup Script
-- Database: dukcapil
-- Sumber: Dinas Kependudukan dan Catatan Sipil (Dukcapil)

-- SCHEMA

CREATE TABLE IF NOT EXISTS penduduk (
  no_ktp              VARCHAR(16) PRIMARY KEY,
  no_kk_ref           VARCHAR(16) NOT NULL,
  nama_lengkap        VARCHAR(100) NOT NULL,
  tempat_lahir        VARCHAR(50),
  tgl_lahir           DATE NOT NULL,
  jenis_kelamin       VARCHAR(1) CHECK (jenis_kelamin IN ('L', 'P')),
  agama               VARCHAR(20),
  status_perkawinan   VARCHAR(20) DEFAULT 'belum_kawin'
                        CHECK (status_perkawinan IN ('belum_kawin', 'menikah', 'cerai_hidup', 'cerai_mati')),
  pendidikan_terakhir VARCHAR(50),
  pekerjaan_dukcapil  VARCHAR(100),
  created_at          TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kartu_keluarga (
  no_kk        VARCHAR(16) PRIMARY KEY,
  alamat_jalan VARCHAR(200),
  rt           VARCHAR(5),
  rw           VARCHAR(5),
  kelurahan    VARCHAR(50),
  kecamatan    VARCHAR(50),
  kota         VARCHAR(50),
  provinsi     VARCHAR(50),
  kode_pos     VARCHAR(5),
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS akta_kelahiran (
  akta_id      SERIAL PRIMARY KEY,
  no_ktp       VARCHAR(16) REFERENCES penduduk(no_ktp),
  nomor_akta   VARCHAR(30) UNIQUE,
  tempat_lahir VARCHAR(50),
  tgl_lahir    DATE,
  nama_ayah    VARCHAR(100),
  nama_ibu     VARCHAR(100)
);

-- ============================================================
-- DATA
-- ============================================================

-- Kartu Keluarga (8 KK — sinkron dengan bansos_db)
INSERT INTO kartu_keluarga (no_kk, alamat_jalan, rt, rw, kelurahan, kecamatan, kota, provinsi, kode_pos) VALUES
  ('3273011234560001', 'Jl. Dago No. 12',           '001', '003', 'Dago',          'Coblong',           'Bandung',         'Jawa Barat',        '40135'),
  ('3273011234560002', 'Jl. Cimahi Baru No. 5',     '002', '001', 'Citeureup',     'Cimahi Utara',      'Cimahi',          'Jawa Barat',        '40512'),
  ('3374011234560001', 'Jl. Banyumanik Raya No. 8', '003', '002', 'Padangsari',   'Banyumanik',        'Semarang',        'Jawa Tengah',       '50267'),
  ('3372011234560001', 'Jl. Laweyan No. 21',        '001', '004', 'Pajang',        'Laweyan',           'Solo',            'Jawa Tengah',       '57146'),
  ('3171011234560001', 'Jl. Mampang No. 7',         '005', '002', 'Tegal Parang',  'Mampang Prapatan',  'Jakarta Selatan', 'DKI Jakarta',       '12790'),
  ('3175011234560001', 'Jl. Kebon Jeruk No. 3',     '001', '001', 'Kebon Jeruk',   'Kebon Jeruk',       'Jakarta Barat',   'DKI Jakarta',       '11530'),
  ('3578011234560001', 'Jl. Rungkut No. 15',        '002', '005', 'Rungkut Kidul', 'Rungkut',           'Surabaya',        'Jawa Timur',        '60293'),
  ('6471011234560001', 'Jl. Ahmad Yani No. 88',     '001', '003', 'Karang Rejo',   'Balikpapan Tengah', 'Balikpapan',      'Kalimantan Timur',  '76112')
ON CONFLICT DO NOTHING;

-- Penduduk (20 baris — no_ktp = nik di bansos_db)
INSERT INTO penduduk (no_ktp, no_kk_ref, nama_lengkap, tempat_lahir, tgl_lahir, jenis_kelamin, agama, status_perkawinan, pendidikan_terakhir, pekerjaan_dukcapil) VALUES
  ('3273010101850001', '3273011234560001', 'Budi Santoso',          'Bandung',    '1985-01-01', 'L', 'Islam',    'menikah',      'SMA',           'Buruh Harian'),
  ('3273010202900002', '3273011234560001', 'Siti Aminah',           'Bandung',    '1990-02-02', 'P', 'Islam',    'menikah',      'SMA',           'Ibu Rumah Tangga'),
  ('3273010303750003', '3273011234560002', 'Agus Wijaya',           'Cimahi',     '1975-03-03', 'L', 'Islam',    'menikah',      'SD',            'Petani'),
  ('3374010404800004', '3374011234560001', 'Dewi Rahayu',           'Semarang',   '1980-04-04', 'P', 'Islam',    'menikah',      'SMP',           'Pedagang'),
  ('3372010505700005', '3372011234560001', 'Hendra Gunawan',        'Solo',       '1970-05-05', 'L', 'Islam',    'menikah',      'SMP',           'Nelayan'),
  ('3171010606880006', '3171011234560001', 'Fitri Handayani',       'Jakarta',    '1988-06-06', 'P', 'Islam',    'belum_kawin',  'D3',            'Karyawan Swasta'),
  ('3273010707650007', '3273011234560001', 'Suwarno',               'Yogyakarta', '1965-07-07', 'L', 'Islam',    'cerai_mati',   'SD',            'Tidak Bekerja'),
  ('3374010808720008', '3374011234560001', 'Nurul Hidayah',         'Semarang',   '1972-08-08', 'P', 'Islam',    'menikah',      'SD',            'Buruh Tani'),
  ('3372010909600009', '3372011234560001', 'Rustam Effendi',        'Solo',       '1960-09-09', 'L', 'Islam',    'menikah',      'SMA',           'Pensiunan PNS'),
  ('3171011010950010', '3171011234560001', 'Rina Marlina',          'Jakarta',    '1995-10-10', 'P', 'Islam',    'belum_kawin',  'S1',            'Mahasiswi'),
  ('3175010101920011', '3175011234560001', 'Darmawan Putra',        'Jakarta',    '1992-01-01', 'L', 'Kristen',  'menikah',      'S1',            'Karyawan Swasta'),
  ('3175010202850012', '3175011234560001', 'Maria Ulfa',            'Bandung',    '1985-02-02', 'P', 'Katolik',  'menikah',      'S1',            'Guru'),
  ('3578010101780013', '3578011234560001', 'Bambang Sutrisno',      'Surabaya',   '1978-01-01', 'L', 'Islam',    'menikah',      'SMA',           'Pedagang Kaki Lima'),
  ('3578010202830014', '3578011234560001', 'Wulandari',             'Surabaya',   '1983-02-02', 'P', 'Islam',    'menikah',      'SMP',           'Ibu Rumah Tangga'),
  ('6471010101900015', '6471011234560001', 'Rizky Maulana',         'Balikpapan', '1990-01-01', 'L', 'Islam',    'belum_kawin',  'SMK',           'Teknisi'),
  ('6471010202750016', '6471011234560001', 'Hj. Salmah',            'Banjarmasin','1975-02-02', 'P', 'Islam',    'menikah',      'SD',            'Petani'),
  ('3273010101700017', '3273011234560001', 'Sarno',                 'Klaten',     '1970-01-01', 'L', 'Islam',    'menikah',      'SD',            'Kuli Bangunan'),
  ('3374010101910018', '3374011234560001', 'Endang Sulistyowati',   'Semarang',   '1991-01-01', 'P', 'Islam',    'menikah',      'SMA',           'Pedagang'),
  ('3372010101550019', '3372011234560001', 'Mbah Simin',            'Wonogiri',   '1955-01-01', 'L', 'Islam',    'cerai_mati',   'Tidak Sekolah', 'Tidak Bekerja'),
  ('3171010101800020', '3171011234560001', 'Joko Susanto',          'Jakarta',    '1980-01-01', 'L', 'Islam',    'menikah',      'SMA',           'Ojek Online')
ON CONFLICT DO NOTHING;

-- Akta Kelahiran (5 baris contoh)
INSERT INTO akta_kelahiran (no_ktp, nomor_akta, tempat_lahir, tgl_lahir, nama_ayah, nama_ibu) VALUES
  ('3273010101850001', 'AK-JB-1985-0001', 'Bandung',   '1985-01-01', 'Santoso',         'Sri Lestari'),
  ('3273010202900002', 'AK-JB-1990-0002', 'Bandung',   '1990-02-02', 'Aminudin',        'Rohmah'),
  ('3374010404800004', 'AK-JT-1980-0004', 'Semarang',  '1980-04-04', 'Raharjo',         'Sumiati'),
  ('3372010505700005', 'AK-JT-1970-0005', 'Solo',      '1970-05-05', 'Gunawan Hadi',    'Suminah'),
  ('3171010606880006', 'AK-JK-1988-0006', 'Jakarta',   '1988-06-06', 'Handayani Jaya',  'Maryati')
ON CONFLICT DO NOTHING;

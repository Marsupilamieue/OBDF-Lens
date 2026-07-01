import { DbAdapter, DbConnectionConfig } from "./DbAdapter";
import * as fs from "fs";

export class SqliteAdapter implements DbAdapter {
  private config: DbConnectionConfig;

  constructor(config: DbConnectionConfig) {
    this.config = config;
  }

  private async getDb() {
    let initSqlJs;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      initSqlJs = require("sql.js");
    } catch {
      throw new Error(
        "[OBDF Lens] Driver 'sql.js' tidak ditemukan. Jalankan: npm install sql.js",
      );
    }

    const filename = this.config.filename;
    if (!filename) {
      throw new Error(
        "[OBDF Lens] Konfigurasi SQLite memerlukan field 'filename' " +
          "(path ke file .db atau .sqlite).",
      );
    }
    
    if (!fs.existsSync(filename)) {
      throw new Error(`[OBDF Lens] Database SQLite tidak ditemukan di: ${filename}`);
    }

    const filebuffer = fs.readFileSync(filename);
    const SQL = await initSqlJs();
    return new SQL.Database(filebuffer);
  }

  async getTables(): Promise<string[]> {
    const db = await this.getDb();
    try {
      const res = db.exec(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      );
      
      if (res.length === 0) return [];
      
      // res[0].values berisi array dari baris: [ ["table1"], ["table2"] ]
      return res[0].values.map((row: any) => row[0] as string);
    } finally {
      db.close();
    }
  }

  async getColumns(tableName: string): Promise<string[]> {
    const db = await this.getDb();
    try {
      const res = db.exec(`PRAGMA table_info(${JSON.stringify(tableName)})`);
      
      if (res.length === 0) return [];
      
      const nameIndex = res[0].columns.indexOf("name");
      if (nameIndex === -1) return [];
      
      return res[0].values.map((row: any) => row[nameIndex] as string);
    } finally {
      db.close();
    }
  }

  async close(): Promise<void> {
  }
}

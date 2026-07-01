import { DbAdapter, DbConnectionConfig } from "./DbAdapter";

export class MySqlAdapter implements DbAdapter {
  private config: DbConnectionConfig;

  constructor(config: DbConnectionConfig) {
    this.config = config;
  }

  private async withConnection<T>(
    fn: (conn: import("mysql2/promise").Connection) => Promise<T>,
  ): Promise<T> {
    let mysql: typeof import("mysql2/promise");
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      mysql = require("mysql2/promise");
    } catch {
      throw new Error(
        "[OBDF Lens] Driver 'mysql2' tidak ditemukan. Jalankan: npm install mysql2",
      );
    }

    const conn = await mysql.createConnection({
      host: this.config.host ?? "localhost",
      port: this.config.port ?? 3306,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
    });

    try {
      return await fn(conn);
    } finally {
      await conn.end();
    }
  }

  async getTables(): Promise<string[]> {
    return this.withConnection(async (conn) => {
      const database = this.config.database ?? "";
      const [rows] = await conn.execute<import("mysql2/promise").RowDataPacket[]>(
        `SELECT TABLE_NAME
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ?
           AND TABLE_TYPE = 'BASE TABLE'
         ORDER BY TABLE_NAME`,
        [database],
      );
      return rows.map((r) => r["TABLE_NAME"] as string);
    });
  }

  async getColumns(tableName: string): Promise<string[]> {
    return this.withConnection(async (conn) => {
      const database = this.config.database ?? "";
      const [rows] = await conn.execute<import("mysql2/promise").RowDataPacket[]>(
        `SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ?
           AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION`,
        [database, tableName],
      );
      return rows.map((r) => r["COLUMN_NAME"] as string);
    });
  }

  async close(): Promise<void> {}
}

import { DbAdapter, DbConnectionConfig } from "./DbAdapter";

export class PostgresAdapter implements DbAdapter {
  private config: DbConnectionConfig;

  constructor(config: DbConnectionConfig) {
    this.config = config;
  }

  private async withClient<T>(
    fn: (client: import("pg").Client) => Promise<T>,
  ): Promise<T> {
    let pg: typeof import("pg");
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      pg = require("pg");
    } catch {
      throw new Error(
        "[OBDF Lens] Driver 'pg' tidak ditemukan. Jalankan: npm install pg",
      );
    }

    const client = new pg.Client({
      host: this.config.host ?? "localhost",
      port: this.config.port ?? 5432,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
    });

    await client.connect();
    try {
      return await fn(client);
    } finally {
      await client.end();
    }
  }

  async getTables(): Promise<string[]> {
    return this.withClient(async (client) => {
      const result = await client.query<{ table_name: string }>(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_type = 'BASE TABLE'
         ORDER BY table_name`,
      );
      return result.rows.map((r) => r.table_name);
    });
  }

  async getColumns(tableName: string): Promise<string[]> {
    return this.withClient(async (client) => {
      const result = await client.query<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = $1
         ORDER BY ordinal_position`,
        [tableName],
      );
      return result.rows.map((r) => r.column_name);
    });
  }

  async close(): Promise<void> {}
}

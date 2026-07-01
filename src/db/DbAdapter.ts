export type DbDialect = "postgresql" | "mysql" | "sqlite";

export interface DbConnectionConfig {
  dialect?: DbDialect;

  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;

  filename?: string;
}

export interface DbAdapter {
  getTables(): Promise<string[]>;

  getColumns(tableName: string): Promise<string[]>;

  close(): Promise<void>;
}

export interface DbMetaProvider {
  getTables(
    sourceName: string,
    connConfig: DbConnectionConfig,
  ): Promise<string[]>;

  getColumns(
    sourceName: string,
    tableName: string,
    connConfig: DbConnectionConfig,
  ): Promise<string[]>;
}

import { DbMetaProvider, DbConnectionConfig } from "./DbAdapter";
import { createAdapter } from "./AdapterFactory";

export class SchemaMetaProvider implements DbMetaProvider {
  async getTables(
    _sourceName: string,
    connConfig: DbConnectionConfig,
  ): Promise<string[]> {
    const adapter = createAdapter(connConfig);
    try {
      return await adapter.getTables();
    } finally {
      await adapter.close();
    }
  }

  async getColumns(
    _sourceName: string,
    tableName: string,
    connConfig: DbConnectionConfig,
  ): Promise<string[]> {
    const adapter = createAdapter(connConfig);
    try {
      return await adapter.getColumns(tableName);
    } finally {
      await adapter.close();
    }
  }
}

export const defaultSchemaProvider = new SchemaMetaProvider();

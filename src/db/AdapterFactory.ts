import { DbAdapter, DbConnectionConfig } from "./DbAdapter";
import { PostgresAdapter } from "./PostgresAdapter";
import { MySqlAdapter } from "./MySqlAdapter";
import { SqliteAdapter } from "./SqliteAdapter";

export function createAdapter(config: DbConnectionConfig): DbAdapter {
  const dialect = config.dialect ?? "postgresql";

  switch (dialect) {
    case "postgresql":
      return new PostgresAdapter(config);

    case "mysql":
      return new MySqlAdapter(config);

    case "sqlite":
      return new SqliteAdapter(config);

    default: {
      // TypeScript exhaustiveness check
      const _never: never = dialect;
      throw new Error(
        `[OBDF Lens] Dialect database tidak dikenali: '${_never}'. ` +
          `Pilihan yang valid: postgresql, mysql, sqlite.`,
      );
    }
  }
}

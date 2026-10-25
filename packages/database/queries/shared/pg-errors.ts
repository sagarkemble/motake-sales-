const UNIQUE_VIOLATION = "23505";

interface PostgresErrorShape {
  code?: string;
  constraint?: string;
  cause?: unknown;
}

// Drizzle wraps driver errors; walk the cause chain to the Postgres error.
function findPostgresError(error: unknown): PostgresErrorShape | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
    const candidate = current as PostgresErrorShape;
    if (typeof candidate.code === "string") return candidate;
    current = candidate.cause;
  }
  return undefined;
}

// Name of the unique constraint the error violated, or undefined for any other error.
export function violatedUniqueConstraint(error: unknown): string | undefined {
  const postgresError = findPostgresError(error);
  return postgresError?.code === UNIQUE_VIOLATION ? postgresError.constraint : undefined;
}

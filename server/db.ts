import pg from "pg";

const { Pool } = pg;

// Test runs must stay isolated from any Replit or developer database that may
// be present in the shell environment. Production still fails closed without
// a durable database URL below.
const isTestRuntime = process.env.NODE_ENV === "test";
export const databaseUrl = isTestRuntime ? undefined : process.env.DATABASE_URL;

if (process.env.NODE_ENV === "production" && !databaseUrl) {
  throw new Error("DATABASE_URL is required in production. Relay will not start with ephemeral storage.");
}

export const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      max: Number(process.env.PG_POOL_MAX || 8),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    })
  : undefined;

export async function databaseHealth() {
  if (!pool) return { mode: "memory", connected: true, durable: false };
  const result = await pool.query<{ now: string }>("SELECT now()::text AS now");
  return { mode: "postgres", connected: true, durable: true, serverTime: result.rows[0].now };
}

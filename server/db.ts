import pg from "pg";

const { Pool } = pg;

export const databaseUrl = process.env.DATABASE_URL;

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

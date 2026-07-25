import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required to run Relay migrations.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
try {
  const sql = await readFile(path.resolve(process.cwd(), "migrations/0001_relay_core.sql"), "utf8");
  await pool.query(sql);
  console.log("Relay database migration 0001_relay_core applied.");
} finally {
  await pool.end();
}

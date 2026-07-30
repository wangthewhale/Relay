import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required to run Relay migrations.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();
try {
  await client.query("SELECT pg_advisory_lock(hashtext('relay_schema_migrations'))");
  await client.query(`CREATE TABLE IF NOT EXISTS relay_schema_migrations (
    name text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const migrationDirectory = path.resolve(process.cwd(), "migrations");
  const files = (await readdir(migrationDirectory))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();
  for (const file of files) {
    const sql = await readFile(path.join(migrationDirectory, file), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const previous = await client.query("SELECT checksum FROM relay_schema_migrations WHERE name=$1", [file]);
    if (previous.rowCount) {
      if (previous.rows[0].checksum !== checksum) throw new Error(`Relay migration ${file} changed after it was applied. Create a new migration instead.`);
      console.log(`Relay database migration ${file} already applied; skipped.`);
      continue;
    }
    await client.query(sql);
    await client.query("INSERT INTO relay_schema_migrations (name, checksum) VALUES ($1,$2)", [file, checksum]);
    console.log(`Relay database migration ${file} applied.`);
  }
} finally {
  await client.query("SELECT pg_advisory_unlock(hashtext('relay_schema_migrations'))").catch(() => undefined);
  client.release();
  await pool.end();
}

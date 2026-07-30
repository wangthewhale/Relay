import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required to run Relay migrations.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
try {
  const migrationDirectory = path.resolve(process.cwd(), "migrations");
  const files = (await readdir(migrationDirectory))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();
  for (const file of files) {
    const sql = await readFile(path.join(migrationDirectory, file), "utf8");
    await pool.query(sql);
    console.log(`Relay database migration ${file} applied.`);
  }
} finally {
  await pool.end();
}

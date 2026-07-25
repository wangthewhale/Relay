import { store } from "../server/store";
import { pool } from "../server/db";

try {
  const missionId = await store.seedDemo();
  console.log(`Relay demo mission ready: ${missionId}`);
} finally {
  await pool?.end();
}

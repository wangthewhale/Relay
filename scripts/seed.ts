import { store } from "../server/store";
import { pool } from "../server/db";

try {
  const missionId = await store.seedDemo();
  const completedMissionId = await store.seedCompletedDemo();
  console.log(`Relay demo mission ready: ${missionId}`);
  console.log(`Relay completed launch proof ready: ${completedMissionId}`);
} finally {
  await pool?.end();
}

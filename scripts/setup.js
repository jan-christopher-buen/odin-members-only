import { readFile } from "node:fs/promises";
import { pool } from "../src/db/pool.js";
export async function setup() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      await readFile(new URL("../src/db/schema.sql", import.meta.url), "utf8"),
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    await setup();
    console.log("Schema ready.");
  } catch (error) {
    console.error("Setup failed:", error.code || "unknown");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

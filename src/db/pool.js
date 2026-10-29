import pg from "pg";
export const pool = new pg.Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {},
);
pool.on("error", (error) =>
  console.error("Database pool error:", error.code || "unknown"),
);

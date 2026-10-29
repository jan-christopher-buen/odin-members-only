import { createApp } from "./app.js";
import { pool } from "./db/pool.js";
const server = createApp().listen(process.env.PORT || 3000, "0.0.0.0", () =>
  console.log("Clubhouse server ready."),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () =>
    server.close(async () => {
      await pool.end();
      process.exit(0);
    }),
  );

// Applies the SQL files in ./drizzle. Run before the API starts: `npm run migrate`.
// Only the api container migrates, so the worker never races it.
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { join } from "node:path";

import { db, pool } from "./db";

async function main() {
  await migrate(db, { migrationsFolder: join(__dirname, "..", "drizzle") });
  await pool.end();
  console.log("migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

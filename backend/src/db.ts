// The only file that knows how we connect to Postgres.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { DATABASE_URL, SQL_ECHO } from "./config";
import * as schema from "./schema";

// The pool owns the DB connections. It connects lazily, so importing this needs no database.
export const pool = new Pool({ connectionString: DATABASE_URL });
export const db = drizzle(pool, { schema, logger: SQL_ECHO });

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { env } from "@/lib/env";

const globalForDb = globalThis as unknown as { __towerPool?: Pool };

export const pool =
  globalForDb.__towerPool ??
  new Pool({ connectionString: env().DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.__towerPool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export { schema };

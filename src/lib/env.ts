import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  MASTER_KEY: z.string().min(32, "MASTER_KEY must be 32 random bytes, base64"),
  BETTER_AUTH_SECRET: z.string().min(16),
  SETUP_TOKEN: z.string().optional().default(""),
  DEV_LOGIN: z.string().optional().default("0"),
  PR_POLL_HOT_SECONDS: z.coerce.number().int().positive().default(60),
  PR_POLL_WARM_SECONDS: z.coerce.number().int().positive().default(300),
  PR_POLL_COLD_SECONDS: z.coerce.number().int().positive().default(1800),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProd = () => env().NODE_ENV === "production";
export const devLoginEnabled = () => !isProd() && env().DEV_LOGIN === "1";

import { z } from "zod";

const envSchema = z.object({
  BEA_SECRET_KEY: z.string().min(10, "BEA_SECRET_KEY is required!"),
  BEA_RECEIVER_EMAIL: z.email("BEA_RECEIVER_EMAIL is required!"),
  BEA_RESEND_API_KEY: z.string().min(1, "BEA_RESEND_API_KEY is required!"),
  BEA_SY_SERENDIPITY_RECEIVER_EMAIL: z.email(
    "BEA_SY_SERENDIPITY_RECEIVER_EMAIL is required!",
  ),
  BEA_SY_SERENDIPITY_FROM_EMAIL: z.string().optional(),
  PORT: z.coerce.number().default(3010),

  BEA_LLM_BASE_URL: z.string().optional(),
  BEA_LLM_API_KEY: z.string().optional(),
  BEA_LLM_MODEL: z.string().optional(),
  // Jev decision model (shadow mode). Unset key -> Jev is disabled everywhere.
  BEA_JEV_API_KEY: z.string().optional(),
  BEA_JEV_BASE_URL: z.string().default("https://api.beatapi.io"),
  BEA_JEV_MODEL: z.string().default("jev-1.13-free"),
  BEA_ADMIN_PASSWORD: z.string().optional(),
  // Full-access key for the admin UI's list/get calls; the send path keeps
  // the sending-only BEA_RESEND_API_KEY.
  BEA_RESEND_ADMIN_API_KEY: z.string().optional(),

  // Directory for the SQLite database file. Defaults to ./data so local dev
  // doesn't need any setup; ops sets it to a mounted volume path in prod.
  BEA_DATA_DIR: z.string().default("./data"),
  // Bearer key for /api/*. Unset -> every /api route 404s.
  BEA_API_KEY: z.string().min(16).optional(),
});

function parseEnv() {
  // Compose interpolates an unset `${VAR}` to "", which must read as unset —
  // otherwise optional vars with a min length crash-loop the container.
  const definedEnv = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== ""),
  );
  const result = envSchema.safeParse(definedEnv);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }

  return result.data;
}

export const env = parseEnv();

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
  BEA_ADMIN_PASSWORD: z.string().optional(),
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }

  return result.data;
}

export const env = parseEnv();

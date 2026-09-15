// Preloaded for every `bun test` run (see bunfig.toml). Provides dummy env
// values so importing src/env.ts doesn't throw before tests get a chance to run.
process.env.BEA_SECRET_KEY ??= "test-secret-key";
process.env.BEA_RECEIVER_EMAIL ??= "receiver@example.com";
process.env.BEA_RESEND_API_KEY ??= "test-resend-api-key";
process.env.BEA_SY_SERENDIPITY_RECEIVER_EMAIL ??= "sy-receiver@example.com";

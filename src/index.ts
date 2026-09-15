import { app } from "./app";
import { env } from "./env";
import { startSync } from "./sync/resend-sync";
import { startEnrichmentWorker } from "./enrich/worker";

app.listen(env.PORT);
startSync();
startEnrichmentWorker();

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port} with NODE_ENV=${process.env.NODE_ENV} 🦊`,
);

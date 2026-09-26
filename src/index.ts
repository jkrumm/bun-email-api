import { app } from "./app";
import { env } from "./env";
import { startSync } from "./sync";
import { startEnrichmentWorker } from "./enrich/worker";
import { startJevWorker } from "./jev/worker";

app.listen(env.PORT);
startSync();
startEnrichmentWorker();
startJevWorker();

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port} with NODE_ENV=${process.env.NODE_ENV} 🦊`,
);

import { app } from "./app";
import { env } from "./env";

app.listen(env.PORT);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port} with NODE_ENV=${process.env.NODE_ENV} 🦊`,
);

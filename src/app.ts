import { Elysia } from "elysia";
import { fppRoutes } from "./routes/fpp";
import { sySerendipityRoutes } from "./routes/sy-serendipity";

export const app = new Elysia()
  .get("/", () => "Hello Elysia")
  .get("/health", () => ({ ok: true }))
  .use(fppRoutes)
  .use(sySerendipityRoutes);

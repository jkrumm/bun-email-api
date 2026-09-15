import { Elysia } from "elysia";
import { fppRoutes } from "./routes/fpp";
import { sySerendipityRoutes } from "./routes/sy-serendipity";
import { adminRoutes } from "./admin/plugin";

export const app = new Elysia()
  .get("/", () => "Hello Elysia")
  .get("/health", () => ({ ok: true }))
  .use(fppRoutes)
  .use(sySerendipityRoutes)
  .use(adminRoutes);

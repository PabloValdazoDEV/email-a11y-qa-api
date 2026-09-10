import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { draftConfig } from "./config/draft.js";
import { env } from "./config/env.js";
import { corsMiddleware } from "./config/cors.js";
import { csrfProtection } from "./middleware/csrf.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { globalLimiter } from "./middleware/rateLimits.js";
import { requireJson } from "./middleware/requireJson.js";
import { authRouter } from "./routes/auth.routes.js";
import { campaignsRouter } from "./routes/campaigns.routes.js";
import { clientsRouter } from "./routes/clients.routes.js";
import { organizationsRouter } from "./routes/organizations.routes.js";
import { usersRouter } from "./routes/users.routes.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  if (env.isProduction) app.set("trust proxy", 1);

  app.use(
    helmet({
      strictTransportSecurity: env.isProduction
        ? { maxAge: 31_536_000, includeSubDomains: true }
        : false,
    }),
  );
  app.use(corsMiddleware);
  app.use(globalLimiter);
  app.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(cookieParser());
  app.use(csrfProtection);
  app.use(requireJson);
  app.use(
    "/api/v1/campaigns/:campaignId/draft",
    express.json({ limit: draftConfig.jsonBodyMaxBytes, strict: true }),
  );
  app.use(express.json({ limit: "64kb", strict: true }));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/auth", authRouter);
  app.use("/users", usersRouter);
  app.use("/api/v1/organizations", organizationsRouter);
  app.use("/api/v1/clients", clientsRouter);
  app.use("/api/v1/campaigns", campaignsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export const app = createApp();

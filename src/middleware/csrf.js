import { env } from "../config/env.js";
import { security } from "../config/security.js";
import { AppError } from "../utils/AppError.js";

const stateChangingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function csrfProtection(req, _res, next) {
  if (!stateChangingMethods.has(req.method)) {
    next();
    return;
  }

  const authenticatedByCookie = Boolean(
    req.cookies[security.accessCookieName] || req.cookies[security.refreshCookieName],
  );
  if (!authenticatedByCookie) {
    next();
    return;
  }

  if (req.get("Sec-Fetch-Site") === "cross-site") {
    next(new AppError(403, "Solicitud cross-site rechazada"));
    return;
  }

  const origin = req.get("Origin")?.replace(/\/$/, "");
  if (!origin || !env.allowedOrigins.includes(origin)) {
    next(new AppError(403, "Origen no permitido"));
    return;
  }

  next();
}

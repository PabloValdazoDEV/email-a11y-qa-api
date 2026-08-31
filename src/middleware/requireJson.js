import { AppError } from "../utils/AppError.js";

const jsonMethods = new Set(["POST", "PUT", "PATCH"]);

export function requireJson(req, _res, next) {
  if (!jsonMethods.has(req.method)) {
    next();
    return;
  }

  const contentLength = req.get("content-length");
  const hasBody = Boolean(
    (contentLength && contentLength !== "0") || req.get("transfer-encoding"),
  );
  if (hasBody && !req.is("application/json")) {
    next(new AppError(415, "Content-Type debe ser application/json"));
    return;
  }
  next();
}

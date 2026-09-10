import { AppError } from "../utils/AppError.js";

const jsonMethods = new Set(["POST", "PUT", "PATCH"]);
const draftImportPath = /^\/api\/v1\/campaigns\/[^/]+\/draft\/import\/?$/;

function isDraftImport(req) {
  return req.method === "POST" && draftImportPath.test(req.path);
}

export function requireJson(req, _res, next) {
  if (!jsonMethods.has(req.method)) {
    next();
    return;
  }

  const contentLength = req.get("content-length");
  const hasBody = Boolean(
    (contentLength && contentLength !== "0") || req.get("transfer-encoding"),
  );
  const isJson = req.is("application/json");
  const isAllowedMultipart = isDraftImport(req) && req.is("multipart/form-data");
  if (hasBody && !isJson && !isAllowedMultipart) {
    next(new AppError(415, "Content-Type no permitido"));
    return;
  }
  next();
}

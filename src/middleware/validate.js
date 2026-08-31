import { AppError } from "../utils/AppError.js";

export function validate(schema, source = "body") {
  return function validationMiddleware(req, _res, next) {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      const error = parsed.error.issues[0];
      next(new AppError(400, error?.message || "Datos no válidos"));
      return;
    }
    if (source === "query") {
      req.validatedQuery = parsed.data;
    } else {
      req[source] = parsed.data;
    }
    next();
  };
}

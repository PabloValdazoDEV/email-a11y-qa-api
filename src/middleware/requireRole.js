import { AppError } from "../utils/AppError.js";

export function requireRole(...allowedRoles) {
  return function roleMiddleware(req, _res, next) {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      next(new AppError(403, "No tienes permiso para realizar esta acción"));
      return;
    }
    next();
  };
}

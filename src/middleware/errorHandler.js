import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

export function notFoundHandler(_req, _res, next) {
  next(new AppError(404, "Ruta no encontrada"));
}

export function errorHandler(error, _req, res, _next) {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      message: error.message,
      ...(error.code ? { code: error.code } : {}),
    });
    return;
  }

  if (error?.type === "entity.too.large") {
    res.status(413).json({ message: "El cuerpo de la solicitud es demasiado grande" });
    return;
  }

  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    res.status(400).json({ message: "JSON no válido" });
    return;
  }

  if (error?.code === "P2002") {
    res.status(409).json({ message: "El recurso ya existe" });
    return;
  }

  if (env.NODE_ENV !== "test") {
    console.error("Internal request error", error);
  }
  res.status(500).json({
    message: env.isProduction ? "Error interno del servidor" : "No se pudo completar la solicitud",
  });
}

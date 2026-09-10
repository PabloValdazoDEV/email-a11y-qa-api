import path from "node:path";
import multer from "multer";
import { draftConfig } from "../config/draft.js";
import { AppError } from "../utils/AppError.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: draftConfig.htmlMaxBytes,
    files: 1,
    fields: 0,
    parts: 2,
  },
  fileFilter: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!draftConfig.allowedExtensions.includes(extension)) {
      callback(new AppError(400, "Solo se permiten archivos .html o .htm"));
      return;
    }

    const mimeType = file.mimetype.toLowerCase();
    const isKnownHtml = draftConfig.allowedMimeTypes.includes(mimeType);
    const isGeneric = draftConfig.genericMimeTypes.includes(mimeType);
    if (!isKnownHtml && !isGeneric) {
      callback(new AppError(400, "El tipo MIME del archivo no es HTML"));
      return;
    }

    callback(null, true);
  },
});

const singleHtmlFile = upload.single("file");

export function uploadDraftHtml(req, res, next) {
  singleHtmlFile(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        next(new AppError(413, "El archivo HTML supera el límite de 1 MiB"));
        return;
      }
      next(new AppError(400, "La subida debe contener un único archivo HTML"));
      return;
    }
    if (error) {
      next(error instanceof AppError
        ? error
        : new AppError(400, "No se pudo leer el archivo HTML"));
      return;
    }
    if (!req.file) {
      next(new AppError(400, "Debes seleccionar un archivo HTML"));
      return;
    }
    next();
  });
}

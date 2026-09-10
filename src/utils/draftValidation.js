import { isUtf8 } from "node:buffer";
import { z } from "zod";
import { draftConfig } from "../config/draft.js";
import { AppError } from "./AppError.js";

const uuidSchema = z.string().uuid("El identificador no es válido");
const htmlMarkerPattern = /(?:<!doctype\s+html\b|<(?:html|head|body|table|div|p|a|img|span|section|main)\b[^>]*>)/i;

export const htmlContentSchema = z.string().superRefine((html, context) => {
  if (html.trim().length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "El HTML es obligatorio",
    });
    return;
  }

  if (Buffer.byteLength(html, "utf8") > draftConfig.htmlMaxBytes) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "El HTML supera el límite de 1 MiB",
    });
  }

  if (!htmlMarkerPattern.test(html)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "El contenido no parece HTML válido",
    });
  }
});

export const draftParamsSchema = z
  .object({
    campaignId: uuidSchema,
  })
  .strict();

export const replaceDraftSchema = z
  .object({
    html: htmlContentSchema,
  })
  .strict();

export const updateDraftSchema = z
  .object({
    htmlCurrent: htmlContentSchema,
  })
  .strict();

export function readUploadedHtml(buffer) {
  if (!buffer || buffer.length === 0) {
    throw new AppError(400, "El archivo HTML está vacío");
  }
  if (buffer.length > draftConfig.htmlMaxBytes) {
    throw new AppError(413, "El archivo HTML supera el límite de 1 MiB");
  }
  if (!isUtf8(buffer)) {
    throw new AppError(400, "El archivo HTML debe utilizar codificación UTF-8");
  }

  const html = buffer.toString("utf8");
  const parsed = htmlContentSchema.safeParse(html);
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message || "HTML no válido");
  }
  return parsed.data;
}

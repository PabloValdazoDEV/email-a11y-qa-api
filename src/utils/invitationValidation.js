import { z } from "zod";
import { normalizeEmail } from "./accountValidation.js";

const uuidSchema = z.string().uuid("El identificador no es válido");
const optionalNameSchema = z
  .string()
  .trim()
  .min(1, "Este campo es obligatorio")
  .max(80)
  .optional();

export const organizationInvitationParamsSchema = z
  .object({
    organizationId: uuidSchema,
  })
  .strict();

export const createOrganizationInvitationSchema = z
  .object({
    name: optionalNameSchema,
    lastName: optionalNameSchema,
    email: z
      .string()
      .trim()
      .min(1, "El email es obligatorio")
      .max(254, "El email es demasiado largo")
      .email("Introduce un email válido")
      .transform(normalizeEmail),
    role: z.enum(["ADMIN", "EDITOR", "VIEWER"]),
  })
  .strict()
  .refine((data) => Boolean(data.name) === Boolean(data.lastName), {
    message: "Indica nombre y apellidos juntos",
    path: ["lastName"],
  });

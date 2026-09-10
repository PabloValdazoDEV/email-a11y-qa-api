import { z } from "zod";

const organizationNameSchema = z
  .string()
  .trim()
  .min(1, "El nombre de la organización es obligatorio")
  .max(120, "El nombre de la organización es demasiado largo");

export const createOrganizationSchema = z
  .object({
    name: organizationNameSchema,
  })
  .strict();

export const organizationParamsSchema = z
  .object({
    id: z.string().uuid("El identificador de la organización no es válido"),
  })
  .strict();

import { z } from "zod";

const uuidSchema = z.string().uuid("El identificador no es válido");
const clientNameSchema = z
  .string()
  .trim()
  .min(1, "El nombre del cliente es obligatorio")
  .max(120, "El nombre del cliente es demasiado largo");

export const organizationClientsParamsSchema = z
  .object({
    organizationId: uuidSchema,
  })
  .strict();

export const clientParamsSchema = z
  .object({
    clientId: uuidSchema,
  })
  .strict();

export const createClientSchema = z
  .object({
    name: clientNameSchema,
  })
  .strict();

export const updateClientSchema = z
  .object({
    name: clientNameSchema,
  })
  .strict();

import { z } from "zod";

const uuidSchema = z.string().uuid("El identificador no es válido");
const campaignNameSchema = z
  .string()
  .trim()
  .min(1, "El nombre de la campaña es obligatorio")
  .max(120, "El nombre de la campaña es demasiado largo");

export const clientCampaignsParamsSchema = z
  .object({
    clientId: uuidSchema,
  })
  .strict();

export const campaignParamsSchema = z
  .object({
    campaignId: uuidSchema,
  })
  .strict();

export const createCampaignSchema = z
  .object({
    name: campaignNameSchema,
  })
  .strict();

export const updateCampaignSchema = z
  .object({
    name: campaignNameSchema,
  })
  .strict();

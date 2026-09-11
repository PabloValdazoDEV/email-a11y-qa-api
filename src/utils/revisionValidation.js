import { z } from "zod";

const uuidSchema = z.string().uuid("El identificador no es válido");

export const campaignRevisionsParamsSchema = z
  .object({
    campaignId: uuidSchema,
  })
  .strict();

export const revisionParamsSchema = z
  .object({
    revisionId: uuidSchema,
  })
  .strict();

export const createRevisionSchema = z.object({}).strict();

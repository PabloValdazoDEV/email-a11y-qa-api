import { z } from "zod";

const uuidSchema = z.string().uuid("El identificador no es válido");

export const organizationMembersParamsSchema = z
  .object({
    organizationId: uuidSchema,
  })
  .strict();

export const organizationMemberParamsSchema = z
  .object({
    organizationId: uuidSchema,
    membershipId: uuidSchema,
  })
  .strict();

export const updateMemberRoleSchema = z
  .object({
    role: z.enum(["ADMIN", "EDITOR", "VIEWER"]),
  })
  .strict();

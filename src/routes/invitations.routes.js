import { Router } from "express";
import { createInvitation } from "../controllers/invitations.controller.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  createOrganizationInvitationSchema,
  organizationInvitationParamsSchema,
} from "../utils/invitationValidation.js";

export const invitationsRouter = Router({ mergeParams: true });

invitationsRouter.post(
  "/",
  validate(organizationInvitationParamsSchema, "params"),
  validate(createOrganizationInvitationSchema),
  asyncHandler(createInvitation),
);

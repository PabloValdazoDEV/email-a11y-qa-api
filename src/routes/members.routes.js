import { Router } from "express";
import {
  deleteMember,
  getMembers,
  patchMember,
} from "../controllers/members.controller.js";
import { validate } from "../middleware/validate.js";
import {
  organizationMemberParamsSchema,
  organizationMembersParamsSchema,
  updateMemberRoleSchema,
} from "../utils/memberValidation.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const membersRouter = Router({ mergeParams: true });

membersRouter.get(
  "/",
  validate(organizationMembersParamsSchema, "params"),
  asyncHandler(getMembers),
);
membersRouter.patch(
  "/:membershipId",
  validate(organizationMemberParamsSchema, "params"),
  validate(updateMemberRoleSchema),
  asyncHandler(patchMember),
);
membersRouter.delete(
  "/:membershipId",
  validate(organizationMemberParamsSchema, "params"),
  asyncHandler(deleteMember),
);

import { Router } from "express";
import {
  createOrganization,
  getOrganization,
  getOrganizations,
} from "../controllers/organizations.controller.js";
import { authMiddleware } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  createOrganizationSchema,
  organizationParamsSchema,
} from "../utils/organizationValidation.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const organizationsRouter = Router();

organizationsRouter.use(authMiddleware);
organizationsRouter.post(
  "/",
  validate(createOrganizationSchema),
  asyncHandler(createOrganization),
);
organizationsRouter.get("/", asyncHandler(getOrganizations));
organizationsRouter.get(
  "/:id",
  validate(organizationParamsSchema, "params"),
  asyncHandler(getOrganization),
);

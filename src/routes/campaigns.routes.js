import { Router } from "express";
import {
  createCampaign,
  deleteCampaign,
  getCampaign,
  getCampaigns,
  patchCampaign,
} from "../controllers/campaigns.controller.js";
import { authMiddleware } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  campaignParamsSchema,
  clientCampaignsParamsSchema,
  createCampaignSchema,
  updateCampaignSchema,
} from "../utils/campaignValidation.js";

export const clientCampaignsRouter = Router({ mergeParams: true });

clientCampaignsRouter.get(
  "/",
  validate(clientCampaignsParamsSchema, "params"),
  asyncHandler(getCampaigns),
);
clientCampaignsRouter.post(
  "/",
  validate(clientCampaignsParamsSchema, "params"),
  validate(createCampaignSchema),
  asyncHandler(createCampaign),
);

export const campaignsRouter = Router();

campaignsRouter.use(authMiddleware);
campaignsRouter.get(
  "/:campaignId",
  validate(campaignParamsSchema, "params"),
  asyncHandler(getCampaign),
);
campaignsRouter.patch(
  "/:campaignId",
  validate(campaignParamsSchema, "params"),
  validate(updateCampaignSchema),
  asyncHandler(patchCampaign),
);
campaignsRouter.delete(
  "/:campaignId",
  validate(campaignParamsSchema, "params"),
  asyncHandler(deleteCampaign),
);

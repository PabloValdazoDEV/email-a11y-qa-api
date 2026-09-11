import { Router } from "express";
import {
  getRevision,
  getRevisions,
  postRevision,
} from "../controllers/revisions.controller.js";
import { authMiddleware } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  campaignRevisionsParamsSchema,
  createRevisionSchema,
  revisionParamsSchema,
} from "../utils/revisionValidation.js";

export const campaignRevisionsRouter = Router({ mergeParams: true });

campaignRevisionsRouter.get(
  "/",
  validate(campaignRevisionsParamsSchema, "params"),
  asyncHandler(getRevisions),
);
campaignRevisionsRouter.post(
  "/",
  validate(campaignRevisionsParamsSchema, "params"),
  validate(createRevisionSchema),
  asyncHandler(postRevision),
);

export const revisionsRouter = Router();

revisionsRouter.use(authMiddleware);
revisionsRouter.get(
  "/:revisionId",
  validate(revisionParamsSchema, "params"),
  asyncHandler(getRevision),
);

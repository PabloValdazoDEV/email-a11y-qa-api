import { Router } from "express";
import {
  getDraft,
  importDraft,
  patchDraft,
  putDraft,
} from "../controllers/drafts.controller.js";
import { uploadDraftHtml } from "../middleware/draftUpload.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  draftParamsSchema,
  replaceDraftSchema,
  updateDraftSchema,
} from "../utils/draftValidation.js";

export const draftsRouter = Router({ mergeParams: true });

draftsRouter.get(
  "/",
  validate(draftParamsSchema, "params"),
  asyncHandler(getDraft),
);
draftsRouter.put(
  "/",
  validate(draftParamsSchema, "params"),
  validate(replaceDraftSchema),
  asyncHandler(putDraft),
);
draftsRouter.patch(
  "/",
  validate(draftParamsSchema, "params"),
  validate(updateDraftSchema),
  asyncHandler(patchDraft),
);
draftsRouter.post(
  "/import",
  validate(draftParamsSchema, "params"),
  uploadDraftHtml,
  asyncHandler(importDraft),
);

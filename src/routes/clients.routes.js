import { Router } from "express";
import {
  createClient,
  deleteClient,
  getClient,
  getClients,
  patchClient,
} from "../controllers/clients.controller.js";
import { authMiddleware } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  clientParamsSchema,
  createClientSchema,
  organizationClientsParamsSchema,
  updateClientSchema,
} from "../utils/clientValidation.js";

export const organizationClientsRouter = Router({ mergeParams: true });

organizationClientsRouter.get(
  "/",
  validate(organizationClientsParamsSchema, "params"),
  asyncHandler(getClients),
);
organizationClientsRouter.post(
  "/",
  validate(organizationClientsParamsSchema, "params"),
  validate(createClientSchema),
  asyncHandler(createClient),
);

export const clientsRouter = Router();

clientsRouter.use(authMiddleware);
clientsRouter.get("/:clientId", validate(clientParamsSchema, "params"), asyncHandler(getClient));
clientsRouter.patch(
  "/:clientId",
  validate(clientParamsSchema, "params"),
  validate(updateClientSchema),
  asyncHandler(patchClient),
);
clientsRouter.delete(
  "/:clientId",
  validate(clientParamsSchema, "params"),
  asyncHandler(deleteClient),
);

import { Router } from "express";
import { createUser, getUsers, patchUser } from "../controllers/users.controller.js";
import { authMiddleware } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { validate } from "../middleware/validate.js";
import {
  createUserSchema,
  updateUserSchema,
  usersQuerySchema,
} from "../utils/accountValidation.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const usersRouter = Router();

usersRouter.use(authMiddleware, requireRole("ADMIN", "SUPERADMIN"));
usersRouter.post("/", validate(createUserSchema), asyncHandler(createUser));
usersRouter.get("/", validate(usersQuerySchema, "query"), asyncHandler(getUsers));
usersRouter.patch("/:id", validate(updateUserSchema), asyncHandler(patchUser));

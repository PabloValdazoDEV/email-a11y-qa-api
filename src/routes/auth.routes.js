import { Router } from "express";
import {
  changePasswordController,
  forgotPassword,
  login,
  logout,
  me,
  refresh,
  resendVerificationController,
  resetPasswordController,
  updateProfileController,
  verifyEmailController,
} from "../controllers/auth.controller.js";
import {
  authMiddleware,
  authMiddlewareAllowExpired,
} from "../middleware/auth.js";
import {
  forgotPasswordLimiter,
  loginLimiter,
  refreshLimiter,
  resendVerificationLimiter,
  resetPasswordLimiter,
  verifyEmailLimiter,
} from "../middleware/rateLimits.js";
import { validate } from "../middleware/validate.js";
import {
  changePasswordSchema,
  emailRequestSchema,
  loginSchema,
  resetPasswordSchema,
  tokenSchema,
  updateProfileSchema,
} from "../utils/accountValidation.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const authRouter = Router();

authRouter.post("/login", loginLimiter, validate(loginSchema), asyncHandler(login));
authRouter.post("/refresh", refreshLimiter, asyncHandler(refresh));
authRouter.post("/logout", asyncHandler(logout));
authRouter.post(
  "/forgot-password",
  forgotPasswordLimiter,
  validate(emailRequestSchema),
  asyncHandler(forgotPassword),
);
authRouter.post(
  "/reset-password",
  resetPasswordLimiter,
  validate(resetPasswordSchema),
  asyncHandler(resetPasswordController),
);
authRouter.post(
  "/verify-email",
  verifyEmailLimiter,
  validate(tokenSchema),
  asyncHandler(verifyEmailController),
);
authRouter.post(
  "/resend-verification",
  resendVerificationLimiter,
  validate(emailRequestSchema),
  asyncHandler(resendVerificationController),
);
authRouter.get("/me", authMiddlewareAllowExpired, me);
authRouter.put(
  "/me",
  authMiddleware,
  validate(updateProfileSchema),
  asyncHandler(updateProfileController),
);
authRouter.put(
  "/me/password",
  authMiddlewareAllowExpired,
  validate(changePasswordSchema),
  asyncHandler(changePasswordController),
);

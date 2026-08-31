import { rateLimit } from "express-rate-limit";
import { security } from "../config/security.js";

function createLimiter(config) {
  return rateLimit({
    ...config,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Demasiadas solicitudes. Inténtalo de nuevo más tarde." },
  });
}

export const globalLimiter = createLimiter({
  ...security.rateLimits.global,
  skip: (req) => req.method === "OPTIONS",
});
export const loginLimiter = createLimiter(security.rateLimits.login);
export const forgotPasswordLimiter = createLimiter(security.rateLimits.forgotPassword);
export const resetPasswordLimiter = createLimiter(security.rateLimits.resetPassword);
export const resendVerificationLimiter = createLimiter(security.rateLimits.resendVerification);
export const verifyEmailLimiter = createLimiter(security.rateLimits.verifyEmail);
export const refreshLimiter = createLimiter(security.rateLimits.refresh);

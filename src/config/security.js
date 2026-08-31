import { env } from "./env.js";

export const security = Object.freeze({
  accessCookieName: env.isProduction ? "__Host-auth_session" : "auth_session",
  refreshCookieName: env.isProduction ? "__Host-auth_refresh" : "auth_refresh",
  accessTokenTtlSeconds: env.JWT_TTL_SECONDS,
  rememberTtlSeconds: env.REMEMBER_TTL_SECONDS,
  maxRememberedSessions: env.MAX_REMEMBERED_SESSIONS,
  jwtIssuer: env.JWT_ISSUER,
  jwtAudience: env.JWT_AUDIENCE,
  passwordHistoryCount: 3,
  passwordMaxAgeDays: env.PASSWORD_MAX_AGE_DAYS,
  passwordResetTtlSeconds: env.PASSWORD_RESET_TTL_SECONDS,
  emailVerificationTtlSeconds: env.EMAIL_VERIFICATION_TTL_SECONDS,
  rateLimits: {
    global: { windowMs: 15 * 60 * 1000, limit: 300 },
    login: { windowMs: 15 * 60 * 1000, limit: 8, skipSuccessfulRequests: true },
    forgotPassword: { windowMs: 60 * 60 * 1000, limit: 5 },
    resetPassword: { windowMs: 15 * 60 * 1000, limit: 10 },
    resendVerification: { windowMs: 60 * 60 * 1000, limit: 5 },
    verifyEmail: { windowMs: 15 * 60 * 1000, limit: 10 },
    refresh: { windowMs: 15 * 60 * 1000, limit: 60 },
  },
});

const baseCookieOptions = Object.freeze({
  httpOnly: true,
  secure: env.isProduction,
  sameSite: "strict",
  path: "/",
});

export function accessCookieOptions({ persistent = false } = {}) {
  return persistent
    ? { ...baseCookieOptions, maxAge: security.accessTokenTtlSeconds * 1000 }
    : { ...baseCookieOptions };
}

export function refreshCookieOptions() {
  return { ...baseCookieOptions, maxAge: security.rememberTtlSeconds * 1000 };
}

export function clearCookieOptions() {
  return { ...baseCookieOptions };
}

import "dotenv/config";
import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  BIND_HOST: z.string().min(1).default("127.0.0.1"),
  DATABASE_PROVIDER: z.enum(["mysql", "postgresql"]).default("mysql"),
  DATABASE_URL: z.string().min(1),
  FRONTEND_URL: z.string().url(),
  CORS_ALLOWED_ORIGINS: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  JWT_ISSUER: z.string().min(1).default("auth-template-api"),
  JWT_AUDIENCE: z.string().min(1).default("auth-template-web"),
  JWT_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),
  REMEMBER_TTL_SECONDS: z.coerce.number().int().min(3600).default(2592000),
  MAX_REMEMBERED_SESSIONS: z.coerce.number().int().min(1).max(20).default(5),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  PASSWORD_MAX_AGE_DAYS: z.coerce.number().int().min(1).max(365).default(90),
  PASSWORD_RESET_TTL_SECONDS: z.coerce.number().int().min(300).max(86400).default(1800),
  EMAIL_VERIFICATION_TTL_SECONDS: z.coerce.number().int().min(300).default(86400),
  APP_NAME: z.string().min(1).max(100).default("Auth Template"),
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: booleanFromString.default("false"),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  MAIL_FROM: z.string().default(""),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment configuration: ${details}`);
}

const obviousSecrets = new Set([
  "secret",
  "password",
  "changeme",
  "development",
  "replace-with-at-least-32-random-bytes",
]);
const secretBytes = Buffer.byteLength(parsed.data.JWT_SECRET, "utf8");
const unsafeSecret = obviousSecrets.has(parsed.data.JWT_SECRET.toLowerCase());

if (parsed.data.NODE_ENV === "production" && (secretBytes < 32 || unsafeSecret)) {
  throw new Error("JWT_SECRET must be a non-obvious value of at least 32 bytes in production");
}

if (parsed.data.NODE_ENV !== "production" && (secretBytes < 32 || unsafeSecret)) {
  console.warn("Security warning: use a non-obvious JWT_SECRET of at least 32 bytes");
}

const allowedOrigins = parsed.data.CORS_ALLOWED_ORIGINS.split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);
const frontendUrl = parsed.data.FRONTEND_URL.replace(/\/$/, "");

if (!allowedOrigins.includes(frontendUrl)) {
  throw new Error("FRONTEND_URL must be included in CORS_ALLOWED_ORIGINS");
}

const databaseUrlMatchesProvider =
  (parsed.data.DATABASE_PROVIDER === "mysql" && parsed.data.DATABASE_URL.startsWith("mysql://")) ||
  (parsed.data.DATABASE_PROVIDER === "postgresql" &&
    /^(postgresql|postgres):\/\//.test(parsed.data.DATABASE_URL));

if (!databaseUrlMatchesProvider) {
  throw new Error("DATABASE_PROVIDER does not match the protocol used in DATABASE_URL");
}

if (
  parsed.data.NODE_ENV === "production" &&
  (!frontendUrl.startsWith("https://") || allowedOrigins.some((origin) => !origin.startsWith("https://")))
) {
  throw new Error("FRONTEND_URL and every allowed CORS origin must use HTTPS in production");
}

export const env = Object.freeze({
  ...parsed.data,
  allowedOrigins,
  frontendUrl,
  isProduction: parsed.data.NODE_ENV === "production",
});

import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { security } from "../config/security.js";

export function createOpaqueToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createAccessToken(userId) {
  return jwt.sign({}, env.JWT_SECRET, {
    algorithm: "HS256",
    subject: userId,
    jwtid: crypto.randomUUID(),
    issuer: security.jwtIssuer,
    audience: security.jwtAudience,
    expiresIn: security.accessTokenTtlSeconds,
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET, {
    algorithms: ["HS256"],
    issuer: security.jwtIssuer,
    audience: security.jwtAudience,
  });
}

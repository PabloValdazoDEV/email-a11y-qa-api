import cors from "cors";
import { env } from "./env.js";

export const corsMiddleware = cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || env.allowedOrigins.includes(origin.replace(/\/$/, ""))) {
      callback(null, true);
      return;
    }

    callback(null, false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Accept"],
  maxAge: 600,
});

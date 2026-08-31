import nodemailer from "nodemailer";
import { env } from "./env.js";

export const mailEnabled = Boolean(env.SMTP_HOST && env.MAIL_FROM);

export const mailTransport = mailEnabled
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      requireTLS: !env.SMTP_SECURE,
      auth: env.SMTP_USER
        ? {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
          }
        : undefined,
      tls: {
        minVersion: "TLSv1.2",
        rejectUnauthorized: true,
      },
      disableFileAccess: true,
      disableUrlAccess: true,
    })
  : null;

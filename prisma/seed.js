import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import {
  isStrongPassword,
  isValidEmail,
  normalizeEmail,
} from "../src/utils/accountValidation.js";

const prisma = new PrismaClient();
const seedAccounts = [
  { prefix: "SEED_SUPERADMIN", role: "SUPERADMIN" },
  { prefix: "SEED_ADMIN", role: "ADMIN" },
  { prefix: "SEED_USER", role: "USER" },
];

function readSeedAccount({ prefix, role }) {
  const keys = ["EMAIL", "PASSWORD", "NAME", "LAST_NAME"];
  const values = Object.fromEntries(keys.map((key) => [key, process.env[`${prefix}_${key}`] || ""]));
  const configuredCount = Object.values(values).filter(Boolean).length;

  if (configuredCount === 0) return null;
  if (configuredCount !== keys.length) {
    throw new Error(`Set all ${prefix}_* variables or leave the entire block empty`);
  }

  const email = normalizeEmail(values.EMAIL);
  if (!isValidEmail(email)) throw new Error(`${prefix}_EMAIL is not a valid email`);
  const usesExampleCredentials =
    email.endsWith("@example.com") || values.PASSWORD.startsWith("Replace-");
  if (usesExampleCredentials && process.env.NODE_ENV === "production") {
    throw new Error(`Replace the example credentials in ${prefix}_* before production seeds`);
  }
  if (usesExampleCredentials) {
    console.warn(`${prefix} uses development-only example credentials`);
  }
  if (!isStrongPassword(values.PASSWORD)) {
    throw new Error(`${prefix}_PASSWORD does not meet the password policy`);
  }

  const name = values.NAME.trim();
  const lastName = values.LAST_NAME.trim();
  if (!name || name.length > 80 || !lastName || lastName.length > 80) {
    throw new Error(`${prefix}_NAME and ${prefix}_LAST_NAME must contain 1 to 80 characters`);
  }

  return { email, password: values.PASSWORD, name, lastName, role };
}

async function upsertSeedAccount(account, rounds) {
  const password = await bcrypt.hash(account.password, rounds);
  await prisma.user.upsert({
    where: { email: account.email },
    update: { role: account.role, isActive: true },
    create: {
      email: account.email,
      password,
      name: account.name,
      lastName: account.lastName,
      role: account.role,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
  });
  console.warn(`Initial ${account.role} is ready`);
}

try {
  const enabledValue = process.env.SEED_USERS_ENABLED || "false";
  if (!["true", "false"].includes(enabledValue)) {
    throw new Error("SEED_USERS_ENABLED must be true or false");
  }

  if (enabledValue === "false") {
    console.warn("Account seeds skipped: SEED_USERS_ENABLED is false");
  } else {
    const accounts = seedAccounts.map(readSeedAccount).filter(Boolean);
    if (accounts.length === 0) {
      console.warn(
        "Account seeds skipped: no SEED_SUPERADMIN_*, SEED_ADMIN_* or SEED_USER_* block is configured",
      );
    } else {
      const emails = accounts.map(({ email }) => email);
      if (new Set(emails).size !== emails.length) {
        throw new Error("Every seed account must use a different email");
      }

      const rounds = Number(process.env.BCRYPT_ROUNDS || 12);
      for (const account of accounts) {
        await upsertSeedAccount(account, rounds);
      }
    }
  }
} finally {
  await prisma.$disconnect();
}

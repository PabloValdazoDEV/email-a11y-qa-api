import bcrypt from "bcrypt";
import { security } from "../config/security.js";
import { AppError } from "../utils/AppError.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function passwordExpiresAt(passwordChangedAt) {
  const changedAt = new Date(passwordChangedAt);
  if (Number.isNaN(changedAt.getTime())) return null;
  return new Date(changedAt.getTime() + security.passwordMaxAgeDays * DAY_MS);
}

export function isPasswordChangeRequired(passwordChangedAt, now = new Date()) {
  const expiresAt = passwordExpiresAt(passwordChangedAt);
  return !expiresAt || expiresAt <= now;
}

export async function assertPasswordNotRecentlyUsed(
  prisma,
  { userId, currentPasswordHash, candidatePassword },
) {
  const history = await prisma.passwordHistory.findMany({
    where: { userId },
    select: { passwordHash: true },
    orderBy: { createdAt: "desc" },
    take: security.passwordHistoryCount - 1,
  });
  const recentHashes = [...new Set([
    currentPasswordHash,
    ...history.map(({ passwordHash }) => passwordHash),
  ])].slice(0, security.passwordHistoryCount);

  for (const passwordHash of recentHashes) {
    if (await bcrypt.compare(candidatePassword, passwordHash)) {
      throw new AppError(
        400,
        "No puedes reutilizar ninguna de tus tres últimas contraseñas",
      );
    }
  }
}

export async function storeNewPassword(
  tx,
  { userId, passwordHash, previousPasswordHash = null, userData = {} },
) {
  const passwordChangedAt = new Date();
  const user = await tx.user.update({
    where: { id: userId },
    data: { ...userData, password: passwordHash, passwordChangedAt },
  });
  if (previousPasswordHash) {
    await tx.passwordHistory.create({
      data: { userId, passwordHash: previousPasswordHash, createdAt: passwordChangedAt },
    });
  }

  const staleHistory = await tx.passwordHistory.findMany({
    where: { userId },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    skip: security.passwordHistoryCount - 1,
  });
  if (staleHistory.length > 0) {
    await tx.passwordHistory.deleteMany({
      where: { id: { in: staleHistory.map(({ id }) => id) } },
    });
  }
  return user;
}

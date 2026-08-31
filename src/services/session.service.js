import { getPrisma } from "../prisma.js";
import { security } from "../config/security.js";
import { AppError } from "../utils/AppError.js";
import { createAccessToken, createOpaqueToken, hashToken } from "./token.service.js";

function expiresAtFromNow(seconds) {
  return new Date(Date.now() + seconds * 1000);
}

export async function createRememberedSession(userId) {
  const prisma = getPrisma();
  const refreshToken = createOpaqueToken();
  const tokenHash = hashToken(refreshToken);
  const expiresAt = expiresAtFromNow(security.rememberTtlSeconds);

  await prisma.$transaction(async (tx) => {
    await tx.session.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    await tx.session.create({ data: { userId, tokenHash, expiresAt } });

    const sessions = await tx.session.findMany({
      where: { userId },
      orderBy: { lastUsedAt: "desc" },
      select: { id: true },
    });
    const obsoleteIds = sessions.slice(security.maxRememberedSessions).map(({ id }) => id);
    if (obsoleteIds.length > 0) {
      await tx.session.deleteMany({ where: { id: { in: obsoleteIds } } });
    }
  });

  return { refreshToken, expiresAt };
}

export async function rotateRememberedSession(refreshToken) {
  const prisma = getPrisma();
  const oldHash = hashToken(refreshToken);
  const session = await prisma.session.findUnique({
    where: { tokenHash: oldHash },
    select: { id: true, userId: true, expiresAt: true },
  });

  if (!session || session.expiresAt <= new Date()) {
    if (session) {
      await prisma.session.deleteMany({ where: { id: session.id } });
    }
    throw new AppError(401, "La sesión no es válida o ha caducado");
  }

  const newRefreshToken = createOpaqueToken();
  const newHash = hashToken(newRefreshToken);
  const newExpiresAt = expiresAtFromNow(security.rememberTtlSeconds);

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.session.updateMany({
      where: {
        id: session.id,
        tokenHash: oldHash,
        expiresAt: { gt: new Date() },
      },
      data: {
        tokenHash: newHash,
        expiresAt: newExpiresAt,
        lastUsedAt: new Date(),
      },
    });

    if (claimed.count !== 1) {
      throw new AppError(401, "La sesión no es válida o ya ha sido utilizada");
    }
  });

  return {
    userId: session.userId,
    accessToken: createAccessToken(session.userId),
    refreshToken: newRefreshToken,
  };
}

export async function revokeRefreshToken(refreshToken) {
  if (!refreshToken) return;
  await getPrisma().session.deleteMany({ where: { tokenHash: hashToken(refreshToken) } });
}

export async function revokeAllUserSessions(userId) {
  await getPrisma().session.deleteMany({ where: { userId } });
}

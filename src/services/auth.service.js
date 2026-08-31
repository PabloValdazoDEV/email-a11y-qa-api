import bcrypt from "bcrypt";
import { env } from "../config/env.js";
import { security } from "../config/security.js";
import { getPrisma } from "../prisma.js";
import { AppError } from "../utils/AppError.js";
import { publicUser, publicUserSelect } from "../utils/publicUser.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "./mail.service.js";
import {
  createAccessToken,
  createOpaqueToken,
  hashToken,
} from "./token.service.js";
import {
  createRememberedSession,
  revokeAllUserSessions,
  revokeRefreshToken,
  rotateRememberedSession,
} from "./session.service.js";
import {
  assertPasswordNotRecentlyUsed,
  storeNewPassword,
} from "./passwordPolicy.service.js";

const DUMMY_PASSWORD_HASH = await bcrypt.hash(
  "Dummy-password-for-constant-time-check-1!",
  env.BCRYPT_ROUNDS,
);

function expiration(seconds) {
  return new Date(Date.now() + seconds * 1000);
}

async function deliverSafely(delivery) {
  try {
    await delivery;
  } catch (error) {
    console.error("Email delivery failed", { name: error?.name, code: error?.code });
  }
}

export async function loginUser({ email, password, rememberMe }) {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { email } });
  const passwordMatches = await bcrypt.compare(password, user?.password ?? DUMMY_PASSWORD_HASH);

  if (!user || !passwordMatches) {
    throw new AppError(401, "Credenciales inválidas");
  }
  if (!user.isActive) {
    throw new AppError(403, "La cuenta está desactivada");
  }
  if (!user.emailVerifiedAt) {
    throw new AppError(403, "Debes activar tu cuenta desde el enlace de acceso");
  }

  const result = {
    user: publicUser(user),
    accessToken: createAccessToken(user.id),
    refreshToken: null,
    rememberMe,
  };

  if (rememberMe) {
    const session = await createRememberedSession(user.id);
    result.refreshToken = session.refreshToken;
  }

  return result;
}

export async function refreshUserSession(refreshToken) {
  if (!refreshToken) {
    throw new AppError(401, "No hay una sesión recordada");
  }

  const rotated = await rotateRememberedSession(refreshToken);
  const user = await getPrisma().user.findUnique({
    where: { id: rotated.userId },
    select: publicUserSelect,
  });

  if (!user || !user.isActive || !user.emailVerifiedAt) {
    await revokeAllUserSessions(rotated.userId);
    throw new AppError(401, "La cuenta no está disponible");
  }

  return { ...rotated, user: publicUser(user) };
}

export async function logoutUser(refreshToken) {
  await revokeRefreshToken(refreshToken);
}

export async function requestPasswordReset(email) {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, isActive: true },
  });

  if (user?.isActive) {
    const token = createOpaqueToken();
    await prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: expiration(security.passwordResetTtlSeconds),
        },
      });
    });
    await deliverSafely(sendPasswordResetEmail({ to: user.email, token }));
  }
}

export async function resetPassword({ token, password }) {
  const prisma = getPrisma();
  const tokenHash = hashToken(token);
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) {
    throw new AppError(400, "El enlace no es válido o ha caducado");
  }

  await assertPasswordNotRecentlyUsed(prisma, {
    userId: resetToken.userId,
    currentPasswordHash: resetToken.user.password,
    candidatePassword: password,
  });

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.updateMany({
      where: {
        id: resetToken.id,
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new AppError(400, "El enlace no es válido o ya ha sido utilizado");
    }

    await storeNewPassword(tx, {
      userId: resetToken.userId,
      passwordHash,
      previousPasswordHash: resetToken.user.emailVerifiedAt
        ? resetToken.user.password
        : null,
      userData: {
        emailVerifiedAt: resetToken.user.emailVerifiedAt ?? new Date(),
      },
    });
    await tx.session.deleteMany({ where: { userId: resetToken.userId } });
    await tx.passwordResetToken.deleteMany({
      where: { userId: resetToken.userId, id: { not: resetToken.id } },
    });
  });
}

export async function verifyEmail(token) {
  const prisma = getPrisma();
  const tokenHash = hashToken(token);
  const verificationToken = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
  });

  if (!verificationToken || verificationToken.expiresAt <= new Date()) {
    throw new AppError(400, "El enlace no es válido o ha caducado");
  }

  const user = await prisma.$transaction(async (tx) => {
    const claimed = await tx.emailVerificationToken.deleteMany({
      where: {
        id: verificationToken.id,
        tokenHash,
        expiresAt: { gt: new Date() },
      },
    });
    if (claimed.count !== 1) {
      throw new AppError(400, "El enlace no es válido o ya ha sido utilizado");
    }
    const updated = await tx.user.update({
      where: { id: verificationToken.userId },
      data: { emailVerifiedAt: new Date() },
      select: publicUserSelect,
    });
    await tx.emailVerificationToken.deleteMany({ where: { userId: updated.id } });
    return updated;
  });

  return publicUser(user);
}

export async function resendVerification(email) {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, emailVerifiedAt: true, isActive: true },
  });
  if (!user || user.emailVerifiedAt || !user.isActive) return;

  const token = createOpaqueToken();
  await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.deleteMany({ where: { userId: user.id } });
    await tx.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: expiration(security.emailVerificationTtlSeconds),
      },
    });
  });
  await deliverSafely(sendVerificationEmail({ to: user.email, token }));
}

export async function changePassword(userId, data) {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await bcrypt.compare(data.currentPassword, user.password))) {
    throw new AppError(400, "La contraseña actual no es correcta");
  }
  await assertPasswordNotRecentlyUsed(prisma, {
    userId,
    currentPasswordHash: user.password,
    candidatePassword: data.newPassword,
  });

  const passwordHash = await bcrypt.hash(data.newPassword, env.BCRYPT_ROUNDS);
  await prisma.$transaction(async (tx) => {
    await storeNewPassword(tx, {
      userId,
      passwordHash,
      previousPasswordHash: user.password,
    });
    await tx.session.deleteMany({ where: { userId } });
  });
}

export async function updateProfile(userId, data) {
  const prisma = getPrisma();
  const current = await prisma.user.findUnique({ where: { id: userId } });
  if (!current) throw new AppError(404, "Usuario no encontrado");

  const emailChanged = data.email !== current.email;
  if (emailChanged) {
    if (!data.currentPassword || !(await bcrypt.compare(data.currentPassword, current.password))) {
      throw new AppError(400, "Debes indicar tu contraseña actual para cambiar el email");
    }
    const existing = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
    if (existing && existing.id !== userId) {
      throw new AppError(409, "No se puede utilizar ese email");
    }
  }

  let verificationToken = null;
  if (emailChanged) verificationToken = createOpaqueToken();

  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        lastName: data.lastName,
        email: data.email,
        ...(emailChanged ? { emailVerifiedAt: null } : {}),
      },
      select: publicUserSelect,
    });

    if (emailChanged) {
      await tx.emailVerificationToken.deleteMany({ where: { userId } });
      await tx.emailVerificationToken.create({
        data: {
          userId,
          tokenHash: hashToken(verificationToken),
          expiresAt: expiration(security.emailVerificationTtlSeconds),
        },
      });
      await tx.session.deleteMany({ where: { userId } });
    }
    return updated;
  });

  if (emailChanged) {
    await deliverSafely(sendVerificationEmail({ to: user.email, token: verificationToken }));
  }
  return { user: publicUser(user), sessionRevoked: emailChanged };
}

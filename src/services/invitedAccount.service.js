import bcrypt from "bcrypt";
import { env } from "../config/env.js";
import { security } from "../config/security.js";
import { publicUserSelect } from "../utils/publicUser.js";
import { sendInvitationEmail } from "./mail.service.js";
import { createOpaqueToken, hashToken } from "./token.service.js";

export async function prepareInvitedAccount() {
  const invitationToken = createOpaqueToken();
  const unusablePasswordHash = await bcrypt.hash(createOpaqueToken(), env.BCRYPT_ROUNDS);

  return {
    invitationToken,
    unusablePasswordHash,
    tokenHash: hashToken(invitationToken),
    expiresAt: new Date(Date.now() + security.emailVerificationTtlSeconds * 1000),
  };
}

export async function createInvitedAccount(tx, data, prepared) {
  const user = await tx.user.create({
    data: {
      name: data.name,
      lastName: data.lastName,
      email: data.email,
      password: prepared.unusablePasswordHash,
      role: data.role,
      isActive: true,
      emailVerifiedAt: null,
    },
    select: publicUserSelect,
  });

  await tx.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: prepared.tokenHash,
      expiresAt: prepared.expiresAt,
    },
  });

  return user;
}

export async function deliverInvitationSafely(user, token) {
  try {
    return await sendInvitationEmail({ to: user.email, token });
  } catch (error) {
    console.error("Invitation email delivery failed", {
      name: error?.name,
      code: error?.code,
    });
    return false;
  }
}

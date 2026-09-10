import { getPrisma } from "../prisma.js";
import { AppError } from "../utils/AppError.js";
import { publicMember, publicMemberSelect } from "../utils/publicMember.js";
import {
  createInvitedAccount,
  deliverInvitationSafely,
  prepareInvitedAccount,
} from "./invitedAccount.service.js";

const allowedRoles = Object.freeze({
  OWNER: new Set(["ADMIN", "EDITOR", "VIEWER"]),
  ADMIN: new Set(["EDITOR", "VIEWER"]),
});

function assertCanInvite(actorRole, invitedRole) {
  if (!allowedRoles[actorRole]?.has(invitedRole)) {
    throw new AppError(403, "No tienes permiso para invitar con ese rol");
  }
}

async function getActorMembership(prisma, actorUserId, organizationId) {
  const actor = await prisma.membership.findFirst({
    where: { userId: actorUserId, organizationId },
    select: { id: true, role: true },
  });
  if (!actor) {
    throw new AppError(404, "Organización no encontrada");
  }
  return actor;
}

function requireNewUserProfile(data) {
  if (!data.name || !data.lastName) {
    throw new AppError(400, "Indica el nombre y los apellidos de la nueva persona", {
      code: "NEW_USER_DETAILS_REQUIRED",
    });
  }
}

export async function createOrganizationInvitation(actorUserId, organizationId, data) {
  const prisma = getPrisma();
  const preflightActor = await getActorMembership(prisma, actorUserId, organizationId);
  assertCanInvite(preflightActor.role, data.role);
  const prepared = await prepareInvitedAccount();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const actor = await getActorMembership(tx, actorUserId, organizationId);
      assertCanInvite(actor.role, data.role);

      const existingUser = await tx.user.findUnique({
        where: { email: data.email },
        select: {
          id: true,
          email: true,
          isActive: true,
          emailVerifiedAt: true,
          membership: { select: { id: true } },
        },
      });

      if (existingUser?.membership) {
        throw new AppError(409, "La persona ya pertenece a una organización", {
          code: "ALREADY_MEMBER",
        });
      }
      if (existingUser && !existingUser.isActive) {
        throw new AppError(409, "La cuenta no está disponible", {
          code: "ACCOUNT_UNAVAILABLE",
        });
      }

      let user = existingUser;
      let isNewUser = false;
      if (!user) {
        requireNewUserProfile(data);
        user = await createInvitedAccount(tx, {
          name: data.name,
          lastName: data.lastName,
          email: data.email,
          role: "USER",
        }, prepared);
        isNewUser = true;
      }

      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          organizationId,
          role: data.role,
        },
        select: publicMemberSelect,
      });

      return {
        isNewUser,
        member: publicMember(membership),
        email: user.email,
      };
    });

    if (!result.isNewUser) {
      return { ...result, invitationSent: null };
    }

    const invitationSent = await deliverInvitationSafely(
      { email: result.email },
      prepared.invitationToken,
    );
    return { ...result, invitationSent };
  } catch (error) {
    if (error?.code === "P2002") {
      throw new AppError(409, "La persona ya pertenece a una organización", {
        code: "ALREADY_MEMBER",
      });
    }
    throw error;
  }
}

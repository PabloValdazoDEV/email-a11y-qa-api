import { getPrisma } from "../prisma.js";
import { AppError } from "../utils/AppError.js";
import { publicMember, publicMemberSelect } from "../utils/publicMember.js";

async function getActorMembership(prisma, userId, organizationId) {
  const membership = await prisma.membership.findFirst({
    where: { userId, organizationId },
    select: { id: true, role: true },
  });

  if (!membership) {
    throw new AppError(404, "Organización no encontrada");
  }
  return membership;
}

async function getTargetMembership(prisma, membershipId, organizationId) {
  const membership = await prisma.membership.findFirst({
    where: { id: membershipId, organizationId },
    select: publicMemberSelect,
  });

  if (!membership) {
    throw new AppError(404, "Miembro no encontrado");
  }
  return membership;
}

function assertCanManage(actorRole, targetRole, nextRole = null) {
  if (targetRole === "OWNER") {
    throw new AppError(403, "El OWNER de la organización está protegido");
  }

  if (actorRole === "OWNER") return;

  const adminCanManageTarget =
    actorRole === "ADMIN" && ["EDITOR", "VIEWER"].includes(targetRole);
  const adminCanAssignRole =
    nextRole === null || ["EDITOR", "VIEWER"].includes(nextRole);
  if (adminCanManageTarget && adminCanAssignRole) return;

  throw new AppError(403, "No tienes permiso para gestionar este miembro");
}

export async function listOrganizationMembers(userId, organizationId) {
  const prisma = getPrisma();
  await getActorMembership(prisma, userId, organizationId);

  const memberships = await prisma.membership.findMany({
    where: { organizationId },
    select: publicMemberSelect,
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  return memberships.map(publicMember);
}

export async function updateOrganizationMemberRole(
  userId,
  organizationId,
  membershipId,
  role,
) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const actor = await getActorMembership(tx, userId, organizationId);
    const target = await getTargetMembership(tx, membershipId, organizationId);
    assertCanManage(actor.role, target.role, role);

    const updated = await tx.membership.update({
      where: { id: target.id },
      data: { role },
      select: publicMemberSelect,
    });
    return publicMember(updated);
  });
}

export async function removeOrganizationMember(userId, organizationId, membershipId) {
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    const actor = await getActorMembership(tx, userId, organizationId);
    const target = await getTargetMembership(tx, membershipId, organizationId);
    assertCanManage(actor.role, target.role);
    await tx.membership.delete({ where: { id: target.id } });
  });
}

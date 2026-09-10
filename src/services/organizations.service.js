import { getPrisma } from "../prisma.js";
import { AppError } from "../utils/AppError.js";

const organizationSelect = Object.freeze({
  id: true,
  name: true,
  createdAt: true,
  updatedAt: true,
});

function organizationWithMembership(organization, role) {
  return {
    ...organization,
    membership: { role },
  };
}

export async function createOrganizationForUser(userId, data) {
  const prisma = getPrisma();

  try {
    return await prisma.$transaction(async (tx) => {
      const currentMembership = await tx.membership.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (currentMembership) {
        throw new AppError(409, "Ya perteneces a una organización");
      }

      const organization = await tx.organization.create({
        data: { name: data.name },
        select: organizationSelect,
      });
      const membership = await tx.membership.create({
        data: {
          userId,
          organizationId: organization.id,
          role: "OWNER",
        },
        select: { role: true },
      });

      return organizationWithMembership(organization, membership.role);
    });
  } catch (error) {
    if (error?.code === "P2002") {
      throw new AppError(409, "Ya perteneces a una organización");
    }
    throw error;
  }
}

export async function listOrganizationsForUser(userId) {
  const memberships = await getPrisma().membership.findMany({
    where: { userId },
    select: {
      role: true,
      organization: { select: organizationSelect },
    },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map(({ organization, role }) =>
    organizationWithMembership(organization, role));
}

export async function getOrganizationForUser(userId, organizationId) {
  const membership = await getPrisma().membership.findFirst({
    where: { userId, organizationId },
    select: {
      role: true,
      organization: { select: organizationSelect },
    },
  });

  if (!membership) {
    throw new AppError(404, "Organización no encontrada");
  }

  return organizationWithMembership(membership.organization, membership.role);
}

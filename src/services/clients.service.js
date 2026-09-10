import { getPrisma } from "../prisma.js";
import { AppError } from "../utils/AppError.js";

const clientSelect = Object.freeze({
  id: true,
  organizationId: true,
  name: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
});

async function getMembership(prisma, userId, organizationId, notFoundMessage) {
  const membership = await prisma.membership.findFirst({
    where: { userId, organizationId },
    select: { id: true, role: true },
  });
  if (!membership) {
    throw new AppError(404, notFoundMessage);
  }
  return membership;
}

function assertCanManageClients(role) {
  if (!["OWNER", "ADMIN"].includes(role)) {
    throw new AppError(403, "No tienes permiso para gestionar clientes");
  }
}

async function getActiveClient(prisma, clientId) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, archivedAt: null },
    select: clientSelect,
  });
  if (!client) {
    throw new AppError(404, "Cliente no encontrado");
  }
  return client;
}

export async function listOrganizationClients(userId, organizationId) {
  const prisma = getPrisma();
  await getMembership(prisma, userId, organizationId, "Organización no encontrada");

  return prisma.client.findMany({
    where: { organizationId, archivedAt: null },
    select: clientSelect,
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
  });
}

export async function createOrganizationClient(userId, organizationId, data) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const membership = await getMembership(
      tx,
      userId,
      organizationId,
      "Organización no encontrada",
    );
    assertCanManageClients(membership.role);

    return tx.client.create({
      data: {
        organizationId,
        name: data.name,
      },
      select: clientSelect,
    });
  });
}

export async function getClientForUser(userId, clientId) {
  const prisma = getPrisma();
  const client = await getActiveClient(prisma, clientId);
  await getMembership(prisma, userId, client.organizationId, "Cliente no encontrado");
  return client;
}

export async function updateClientForUser(userId, clientId, data) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const client = await getActiveClient(tx, clientId);
    const membership = await getMembership(
      tx,
      userId,
      client.organizationId,
      "Cliente no encontrado",
    );
    assertCanManageClients(membership.role);

    return tx.client.update({
      where: { id: client.id },
      data: { name: data.name },
      select: clientSelect,
    });
  });
}

export async function archiveClientForUser(userId, clientId) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const client = await getActiveClient(tx, clientId);
    const membership = await getMembership(
      tx,
      userId,
      client.organizationId,
      "Cliente no encontrado",
    );
    assertCanManageClients(membership.role);

    return tx.client.update({
      where: { id: client.id },
      data: { archivedAt: new Date() },
      select: clientSelect,
    });
  });
}

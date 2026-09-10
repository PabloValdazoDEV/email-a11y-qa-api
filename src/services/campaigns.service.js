import { getPrisma } from "../prisma.js";
import { AppError } from "../utils/AppError.js";

const campaignSelect = Object.freeze({
  id: true,
  clientId: true,
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

function assertCanManageCampaigns(role) {
  if (!["OWNER", "ADMIN"].includes(role)) {
    throw new AppError(403, "No tienes permiso para gestionar campañas");
  }
}

async function getActiveClient(prisma, clientId) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, archivedAt: null },
    select: { id: true, organizationId: true },
  });
  if (!client) {
    throw new AppError(404, "Cliente no encontrado");
  }
  return client;
}

async function getActiveCampaignContext(prisma, campaignId) {
  const campaignWithClient = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      archivedAt: null,
      client: { is: { archivedAt: null } },
    },
    select: {
      ...campaignSelect,
      client: { select: { organizationId: true } },
    },
  });
  if (!campaignWithClient) {
    throw new AppError(404, "Campaña no encontrada");
  }

  const { client, ...campaign } = campaignWithClient;
  return { campaign, organizationId: client.organizationId };
}

export async function listClientCampaigns(userId, clientId) {
  const prisma = getPrisma();
  const client = await getActiveClient(prisma, clientId);
  await getMembership(prisma, userId, client.organizationId, "Cliente no encontrado");

  return prisma.campaign.findMany({
    where: { clientId: client.id, archivedAt: null },
    select: campaignSelect,
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
  });
}

export async function createClientCampaign(userId, clientId, data) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const client = await getActiveClient(tx, clientId);
    const membership = await getMembership(
      tx,
      userId,
      client.organizationId,
      "Cliente no encontrado",
    );
    assertCanManageCampaigns(membership.role);

    return tx.campaign.create({
      data: {
        clientId: client.id,
        name: data.name,
      },
      select: campaignSelect,
    });
  });
}

export async function getCampaignForUser(userId, campaignId) {
  const prisma = getPrisma();
  const context = await getActiveCampaignContext(prisma, campaignId);
  await getMembership(prisma, userId, context.organizationId, "Campaña no encontrada");
  return context.campaign;
}

export async function updateCampaignForUser(userId, campaignId, data) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const context = await getActiveCampaignContext(tx, campaignId);
    const membership = await getMembership(
      tx,
      userId,
      context.organizationId,
      "Campaña no encontrada",
    );
    assertCanManageCampaigns(membership.role);

    return tx.campaign.update({
      where: { id: context.campaign.id },
      data: { name: data.name },
      select: campaignSelect,
    });
  });
}

export async function archiveCampaignForUser(userId, campaignId) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const context = await getActiveCampaignContext(tx, campaignId);
    const membership = await getMembership(
      tx,
      userId,
      context.organizationId,
      "Campaña no encontrada",
    );
    assertCanManageCampaigns(membership.role);

    return tx.campaign.update({
      where: { id: context.campaign.id },
      data: { archivedAt: new Date() },
      select: campaignSelect,
    });
  });
}

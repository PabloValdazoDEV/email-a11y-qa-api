import { getPrisma } from "../prisma.js";
import { AppError } from "../utils/AppError.js";

const draftSelect = Object.freeze({
  id: true,
  campaignId: true,
  htmlOriginal: true,
  htmlCurrent: true,
  createdAt: true,
  updatedAt: true,
});

async function getActiveCampaignContext(prisma, campaignId) {
  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      archivedAt: null,
      client: { is: { archivedAt: null } },
    },
    select: {
      id: true,
      client: { select: { organizationId: true } },
    },
  });
  if (!campaign) {
    throw new AppError(404, "Campaña no encontrada");
  }
  return { campaignId: campaign.id, organizationId: campaign.client.organizationId };
}

async function getMembership(prisma, userId, organizationId) {
  const membership = await prisma.membership.findFirst({
    where: { userId, organizationId },
    select: { id: true, role: true },
  });
  if (!membership) {
    throw new AppError(404, "Campaña no encontrada");
  }
  return membership;
}

function assertCanEditDraft(role) {
  if (!["OWNER", "ADMIN", "EDITOR"].includes(role)) {
    throw new AppError(403, "No tienes permiso para modificar el borrador");
  }
}

export async function getCampaignDraft(userId, campaignId) {
  const prisma = getPrisma();
  const context = await getActiveCampaignContext(prisma, campaignId);
  await getMembership(prisma, userId, context.organizationId);

  const draft = await prisma.draft.findUnique({
    where: { campaignId: context.campaignId },
    select: draftSelect,
  });
  if (!draft) {
    throw new AppError(404, "Borrador no encontrado");
  }
  return draft;
}

export async function replaceCampaignDraft(userId, campaignId, html) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const context = await getActiveCampaignContext(tx, campaignId);
    const membership = await getMembership(tx, userId, context.organizationId);
    assertCanEditDraft(membership.role);

    const existingDraft = await tx.draft.findUnique({
      where: { campaignId: context.campaignId },
      select: { id: true },
    });
    const draft = await tx.draft.upsert({
      where: { campaignId: context.campaignId },
      create: {
        campaignId: context.campaignId,
        htmlOriginal: html,
        htmlCurrent: html,
      },
      update: {
        htmlOriginal: html,
        htmlCurrent: html,
      },
      select: draftSelect,
    });
    return { draft, created: !existingDraft };
  });
}

export async function updateCampaignDraft(userId, campaignId, htmlCurrent) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const context = await getActiveCampaignContext(tx, campaignId);
    const membership = await getMembership(tx, userId, context.organizationId);
    assertCanEditDraft(membership.role);

    const existingDraft = await tx.draft.findUnique({
      where: { campaignId: context.campaignId },
      select: { id: true },
    });
    if (!existingDraft) {
      throw new AppError(404, "Borrador no encontrado");
    }

    return tx.draft.update({
      where: { campaignId: context.campaignId },
      data: { htmlCurrent },
      select: draftSelect,
    });
  });
}

import { createHash } from "node:crypto";
import { getPrisma } from "../prisma.js";
import { AppError } from "../utils/AppError.js";

const createdBySelect = Object.freeze({
  id: true,
  name: true,
  lastName: true,
});

const revisionSummarySelect = Object.freeze({
  id: true,
  version: true,
  createdAt: true,
  createdBy: { select: createdBySelect },
});

const revisionDetailSelect = Object.freeze({
  id: true,
  campaignId: true,
  version: true,
  htmlOriginal: true,
  htmlCorrected: true,
  contentHash: true,
  createdByUserId: true,
  createdAt: true,
  createdBy: { select: createdBySelect },
});

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

function assertCanCreateRevision(role) {
  if (!["OWNER", "ADMIN", "EDITOR"].includes(role)) {
    throw new AppError(403, "No tienes permiso para guardar revisiones");
  }
}

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

async function getReadableCampaignContext(prisma, campaignId) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
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

function hashCorrectedHtml(htmlCorrected) {
  return createHash("sha256").update(htmlCorrected, "utf8").digest("hex");
}

export async function createCampaignRevision(userId, campaignId) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const lockedCampaign = await tx.$queryRaw`
      SELECT "id"
      FROM "Campaign"
      WHERE "id" = ${campaignId}::uuid
      FOR UPDATE
    `;
    if (lockedCampaign.length === 0) {
      throw new AppError(404, "Campaña no encontrada");
    }

    const context = await getActiveCampaignContext(tx, campaignId);
    const membership = await getMembership(tx, userId, context.organizationId);
    assertCanCreateRevision(membership.role);

    const draft = await tx.draft.findUnique({
      where: { campaignId: context.campaignId },
      select: { htmlOriginal: true, htmlCurrent: true },
    });
    if (!draft) {
      throw new AppError(404, "Borrador no encontrado");
    }

    const latestRevision = await tx.revision.findFirst({
      where: { campaignId: context.campaignId },
      select: { version: true },
      orderBy: { version: "desc" },
    });
    const version = (latestRevision?.version ?? 0) + 1;

    return tx.revision.create({
      data: {
        campaignId: context.campaignId,
        version,
        htmlOriginal: draft.htmlOriginal,
        htmlCorrected: draft.htmlCurrent,
        contentHash: hashCorrectedHtml(draft.htmlCurrent),
        createdByUserId: userId,
      },
      select: revisionDetailSelect,
    });
  });
}

export async function listCampaignRevisions(userId, campaignId) {
  const prisma = getPrisma();
  const context = await getReadableCampaignContext(prisma, campaignId);
  await getMembership(prisma, userId, context.organizationId);

  return prisma.revision.findMany({
    where: { campaignId: context.campaignId },
    select: revisionSummarySelect,
    orderBy: { version: "desc" },
  });
}

export async function getRevisionForUser(userId, revisionId) {
  const prisma = getPrisma();
  const revisionWithContext = await prisma.revision.findUnique({
    where: { id: revisionId },
    select: {
      ...revisionDetailSelect,
      campaign: {
        select: {
          client: { select: { organizationId: true } },
        },
      },
    },
  });
  if (!revisionWithContext) {
    throw new AppError(404, "Revisión no encontrada");
  }

  await getMembership(
    prisma,
    userId,
    revisionWithContext.campaign.client.organizationId,
  );
  const revision = { ...revisionWithContext };
  delete revision.campaign;
  return revision;
}

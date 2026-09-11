import { createHash, randomUUID } from "node:crypto";
import { jest } from "@jest/globals";
import request from "supertest";
import { app } from "../src/app.js";
import { security } from "../src/config/security.js";
import { setPrismaClientForTests } from "../src/prisma.js";
import { createAccessToken } from "../src/services/token.service.js";

const origin = "http://localhost:5173";
const organizationId = "11111111-1111-4111-8111-111111111111";
const otherOrganizationId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const membershipId = "44444444-4444-4444-8444-444444444444";
const clientId = "55555555-5555-4555-8555-555555555555";
const campaignId = "77777777-7777-4777-8777-777777777777";
const otherCampaignId = "88888888-8888-4888-8888-888888888888";
const revisionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const initialHtml = "<!doctype html>\n<html><body><p>Original</p></body></html>";
const editedHtml = "<!doctype html>\n<html><body><p>Editado</p></body></html>";

function authUser(role = "USER") {
  return {
    id: userId,
    name: "Pablo",
    lastName: "Valdazo",
    email: "pablo@example.com",
    role,
    isActive: true,
    emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    passwordChangedAt: new Date(),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function campaign(id = campaignId, overrides = {}) {
  return {
    id,
    clientId,
    name: "Newsletter septiembre",
    archivedAt: null,
    createdAt: new Date("2026-09-10T00:00:00.000Z"),
    updatedAt: new Date("2026-09-10T00:00:00.000Z"),
    ...overrides,
  };
}

function draft(id = campaignId, overrides = {}) {
  return {
    id: randomUUID(),
    campaignId: id,
    htmlOriginal: initialHtml,
    htmlCurrent: initialHtml,
    createdAt: new Date("2026-09-11T00:00:00.000Z"),
    updatedAt: new Date("2026-09-11T00:00:00.000Z"),
    ...overrides,
  };
}

function createPrismaMock() {
  const prisma = {
    actorRole: "OWNER",
    globalRole: "USER",
    clientArchivedAt: null,
    clientOrganizationId: organizationId,
    campaignRecords: new Map([
      [campaignId, campaign()],
      [otherCampaignId, campaign(otherCampaignId, { name: "Otra campaña" })],
    ]),
    draftRecords: new Map([
      [campaignId, draft()],
      [otherCampaignId, draft(otherCampaignId)],
    ]),
    revisionRecords: [],
    user: {
      findUnique: jest.fn(),
    },
    membership: {
      findFirst: jest.fn(),
    },
    campaign: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    draft: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    revision: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  prisma.user.findUnique.mockImplementation(async () => authUser(prisma.globalRole));

  prisma.membership.findFirst.mockImplementation(async ({ where }) =>
    where.userId === userId && where.organizationId === organizationId
      ? { id: membershipId, role: prisma.actorRole }
      : null);

  prisma.campaign.findFirst.mockImplementation(async ({ where }) => {
    const record = prisma.campaignRecords.get(where.id);
    if (!record) return null;
    if (where.archivedAt === null && record.archivedAt !== null) return null;
    if (where.client?.is?.archivedAt === null && prisma.clientArchivedAt !== null) return null;
    return {
      ...record,
      client: { organizationId: prisma.clientOrganizationId },
    };
  });

  prisma.campaign.findUnique.mockImplementation(async ({ where }) => {
    const record = prisma.campaignRecords.get(where.id);
    return record
      ? { ...record, client: { organizationId: prisma.clientOrganizationId } }
      : null;
  });

  prisma.draft.findUnique.mockImplementation(async ({ where }) =>
    prisma.draftRecords.get(where.campaignId) ?? null);

  prisma.draft.update.mockImplementation(async ({ where, data }) => {
    const currentDraft = prisma.draftRecords.get(where.campaignId);
    const updatedDraft = { ...currentDraft, ...data, updatedAt: new Date() };
    prisma.draftRecords.set(where.campaignId, updatedDraft);
    return updatedDraft;
  });

  prisma.revision.findFirst.mockImplementation(async ({ where }) =>
    prisma.revisionRecords
      .filter((record) => record.campaignId === where.campaignId)
      .sort((first, second) => second.version - first.version)[0] ?? null);

  prisma.revision.findMany.mockImplementation(async ({ where }) =>
    prisma.revisionRecords
      .filter((record) => record.campaignId === where.campaignId)
      .sort((first, second) => second.version - first.version)
      .map(({ id, version, createdAt, createdBy }) => ({
        id,
        version,
        createdAt,
        createdBy,
      })));

  prisma.revision.findUnique.mockImplementation(async ({ where }) => {
    const record = prisma.revisionRecords.find((item) => item.id === where.id);
    return record
      ? {
          ...record,
          campaign: { client: { organizationId: prisma.clientOrganizationId } },
        }
      : null;
  });

  prisma.revision.create.mockImplementation(async ({ data }) => {
    if (prisma.revisionRecords.some((record) =>
      record.campaignId === data.campaignId && record.version === data.version)) {
      const error = new Error("Duplicate campaign revision version");
      error.code = "P2002";
      throw error;
    }
    const record = {
      id: prisma.revisionRecords.length === 0 ? revisionId : randomUUID(),
      ...data,
      createdAt: new Date(),
      createdBy: {
        id: userId,
        name: "Pablo",
        lastName: "Valdazo",
      },
    };
    prisma.revisionRecords.push(record);
    return record;
  });

  prisma.$queryRaw.mockImplementation(async (_query, requestedCampaignId) =>
    prisma.campaignRecords.has(requestedCampaignId) ? [{ id: requestedCampaignId }] : []);

  prisma.$transaction = jest.fn(async (callback) => callback(prisma));
  return prisma;
}

function authCookie() {
  return `${security.accessCookieName}=${createAccessToken(userId)}`;
}

function campaignRevisionsRequest(method, requestedCampaignId = campaignId) {
  return request(app)
    [method](`/api/v1/campaigns/${requestedCampaignId}/revisions`)
    .set("Origin", origin)
    .set("Cookie", authCookie());
}

function revisionRequest(method, requestedRevisionId = revisionId) {
  return request(app)
    [method](`/api/v1/revisions/${requestedRevisionId}`)
    .set("Origin", origin)
    .set("Cookie", authCookie());
}

function draftRequest(method) {
  return request(app)
    [method](`/api/v1/campaigns/${campaignId}/draft`)
    .set("Origin", origin)
    .set("Cookie", authCookie());
}

async function createRevision() {
  return campaignRevisionsRequest("post").send({});
}

let prisma;

beforeEach(() => {
  prisma = createPrismaMock();
  setPrismaClientForTests(prisma);
});

describe("revision creation", () => {
  test.each(["OWNER", "ADMIN", "EDITOR"])("a %s can create a revision", async (role) => {
    prisma.actorRole = role;

    const response = await createRevision();

    expect(response.status).toBe(201);
    expect(response.body.revision.version).toBe(1);
  });

  test("a VIEWER cannot create a revision", async () => {
    prisma.actorRole = "VIEWER";

    const response = await createRevision();

    expect(response.status).toBe(403);
    expect(prisma.revision.create).not.toHaveBeenCalled();
  });

  test("a global administrator cannot bypass a VIEWER organization role", async () => {
    prisma.globalRole = "SUPERADMIN";
    prisma.actorRole = "VIEWER";

    const response = await createRevision();

    expect(response.status).toBe(403);
    expect(prisma.revision.create).not.toHaveBeenCalled();
  });

  test("an unauthenticated user cannot create a revision", async () => {
    const response = await request(app)
      .post(`/api/v1/campaigns/${campaignId}/revisions`)
      .set("Origin", origin)
      .send({});

    expect(response.status).toBe(401);
    expect(prisma.revision.create).not.toHaveBeenCalled();
  });

  test("a campaign without a Draft cannot create a revision", async () => {
    prisma.draftRecords.delete(campaignId);

    const response = await createRevision();

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Borrador no encontrado");
    expect(prisma.revision.create).not.toHaveBeenCalled();
  });

  test("copies both Draft HTML fields, the author, the version and the corrected HTML hash", async () => {
    const response = await createRevision();
    const expectedHash = createHash("sha256").update(initialHtml, "utf8").digest("hex");

    expect(response.status).toBe(201);
    expect(response.body.revision).toEqual(expect.objectContaining({
      campaignId,
      version: 1,
      htmlOriginal: initialHtml,
      htmlCorrected: initialHtml,
      contentHash: expectedHash,
      createdByUserId: userId,
      createdBy: { id: userId, name: "Pablo", lastName: "Valdazo" },
    }));
  });

  test("does not accept HTML or ownership fields from the frontend", async () => {
    const response = await campaignRevisionsRequest("post").send({
      htmlCorrected: editedHtml,
      createdByUserId: userId,
    });

    expect(response.status).toBe(400);
    expect(prisma.revision.create).not.toHaveBeenCalled();
  });

  test("allows identical snapshots for traceability", async () => {
    const first = await createRevision();
    const second = await createRevision();

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.revision.version).toBe(2);
    expect(second.body.revision.contentHash).toBe(first.body.revision.contentHash);
  });
});

describe("revision immutability", () => {
  test("editing the Draft does not change Revision 1 and Revision 2 captures the new state", async () => {
    const first = await createRevision();

    const draftResponse = await draftRequest("patch").send({ htmlCurrent: editedHtml });
    const second = await createRevision();
    const firstStoredRevision = prisma.revisionRecords.find((record) => record.version === 1);

    expect(draftResponse.status).toBe(200);
    expect(second.status).toBe(201);
    expect(first.body.revision.htmlCorrected).toBe(initialHtml);
    expect(firstStoredRevision.htmlCorrected).toBe(initialHtml);
    expect(second.body.revision.htmlOriginal).toBe(initialHtml);
    expect(second.body.revision.htmlCorrected).toBe(editedHtml);
  });

  test.each(["patch", "delete"])("does not expose a %s endpoint for a Revision", async (method) => {
    await createRevision();

    const response = await revisionRequest(method).send({ htmlCorrected: editedHtml });

    expect(response.status).toBe(404);
    expect(prisma.revision.update).not.toHaveBeenCalled();
    expect(prisma.revision.delete).not.toHaveBeenCalled();
  });
});

describe("revision versioning", () => {
  test("starts at version 1 and increments within the same Campaign", async () => {
    const first = await createRevision();
    const second = await createRevision();

    expect(first.body.revision.version).toBe(1);
    expect(second.body.revision.version).toBe(2);
  });

  test("versions are independent for each Campaign", async () => {
    const firstCampaignRevision = await createRevision();
    const otherCampaignRevision = await campaignRevisionsRequest("post", otherCampaignId).send({});

    expect(firstCampaignRevision.body.revision.version).toBe(1);
    expect(otherCampaignRevision.body.revision.version).toBe(1);
  });

  test("locks the Campaign row before reading the latest version", async () => {
    await createRevision();

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.$queryRaw.mock.invocationCallOrder[0])
      .toBeLessThan(prisma.revision.findFirst.mock.invocationCallOrder[0]);
  });

  test("the persistence layer rejects a duplicate Campaign version", async () => {
    await createRevision();

    await expect(prisma.revision.create({
      data: {
        campaignId,
        version: 1,
        htmlOriginal: initialHtml,
        htmlCorrected: initialHtml,
        contentHash: "a".repeat(64),
        createdByUserId: userId,
      },
    })).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("revision listing", () => {
  test.each(["OWNER", "ADMIN", "EDITOR", "VIEWER"])(
    "a %s can list revisions newest first",
    async (role) => {
      await createRevision();
      await createRevision();
      prisma.actorRole = role;

      const response = await campaignRevisionsRequest("get");

      expect(response.status).toBe(200);
      expect(response.body.revisions.map((item) => item.version)).toEqual([2, 1]);
    },
  );

  test("only lists revisions from the requested Campaign", async () => {
    await createRevision();
    await campaignRevisionsRequest("post", otherCampaignId).send({});

    const response = await campaignRevisionsRequest("get");

    expect(response.status).toBe(200);
    expect(response.body.revisions).toHaveLength(1);
    expect(response.body.revisions[0].id).toBe(revisionId);
  });

  test("the lightweight list does not return HTML or hashes", async () => {
    await createRevision();

    const response = await campaignRevisionsRequest("get");

    expect(response.status).toBe(200);
    expect(response.body.revisions[0]).toEqual(expect.objectContaining({
      id: revisionId,
      version: 1,
      createdBy: { id: userId, name: "Pablo", lastName: "Valdazo" },
    }));
    expect(response.body.revisions[0]).not.toHaveProperty("htmlOriginal");
    expect(response.body.revisions[0]).not.toHaveProperty("htmlCorrected");
    expect(response.body.revisions[0]).not.toHaveProperty("contentHash");
  });

  test("a user from another Organization cannot list revisions", async () => {
    await createRevision();
    prisma.clientOrganizationId = otherOrganizationId;

    const response = await campaignRevisionsRequest("get");

    expect(response.status).toBe(404);
    expect(prisma.revision.findMany).not.toHaveBeenCalled();
  });
});

describe("revision detail", () => {
  test.each(["OWNER", "ADMIN", "EDITOR", "VIEWER"])(
    "a %s can read a complete immutable Revision",
    async (role) => {
      await createRevision();
      prisma.actorRole = role;

      const response = await revisionRequest("get");

      expect(response.status).toBe(200);
      expect(response.body.revision.htmlOriginal).toBe(initialHtml);
      expect(response.body.revision.htmlCorrected).toBe(initialHtml);
      expect(response.body.revision).not.toHaveProperty("campaign");
    },
  );

  test("a user from another Organization cannot read a Revision", async () => {
    await createRevision();
    prisma.clientOrganizationId = otherOrganizationId;

    const response = await revisionRequest("get");

    expect(response.status).toBe(404);
  });

  test("returns a controlled 404 for a missing Revision", async () => {
    const response = await revisionRequest("get");

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Revisión no encontrada");
  });
});

describe("archived parent resources", () => {
  test.each(["campaign", "client"])(
    "does not create a Revision when its %s is archived",
    async (resource) => {
      if (resource === "campaign") {
        prisma.campaignRecords.set(campaignId, campaign(campaignId, { archivedAt: new Date() }));
      } else {
        prisma.clientArchivedAt = new Date();
      }

      const response = await createRevision();

      expect(response.status).toBe(404);
      expect(prisma.revision.create).not.toHaveBeenCalled();
    },
  );

  test.each(["campaign", "client"])(
    "keeps existing Revisions readable when the %s is archived",
    async (resource) => {
      await createRevision();
      if (resource === "campaign") {
        prisma.campaignRecords.set(campaignId, campaign(campaignId, { archivedAt: new Date() }));
      } else {
        prisma.clientArchivedAt = new Date();
      }

      const listResponse = await campaignRevisionsRequest("get");
      const detailResponse = await revisionRequest("get");

      expect(listResponse.status).toBe(200);
      expect(listResponse.body.revisions).toHaveLength(1);
      expect(detailResponse.status).toBe(200);
      expect(detailResponse.body.revision.id).toBe(revisionId);
    },
  );
});

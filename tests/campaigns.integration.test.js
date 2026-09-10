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
const otherClientId = "66666666-6666-4666-8666-666666666666";
const campaignId = "77777777-7777-4777-8777-777777777777";
const otherCampaignId = "88888888-8888-4888-8888-888888888888";

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

function client(overrides = {}) {
  return {
    id: clientId,
    organizationId,
    name: "Cliente Ejemplo",
    archivedAt: null,
    createdAt: new Date("2026-09-10T00:00:00.000Z"),
    updatedAt: new Date("2026-09-10T00:00:00.000Z"),
    ...overrides,
  };
}

function campaign(overrides = {}) {
  return {
    id: campaignId,
    clientId,
    name: "Newsletter septiembre",
    archivedAt: null,
    createdAt: new Date("2026-09-10T00:00:00.000Z"),
    updatedAt: new Date("2026-09-10T00:00:00.000Z"),
    ...overrides,
  };
}

function createPrismaMock() {
  const prisma = {
    actorRole: "OWNER",
    globalRole: "USER",
    clientRecord: client(),
    campaignRecord: campaign(),
    user: {
      findUnique: jest.fn(),
    },
    membership: {
      findFirst: jest.fn(),
    },
    client: {
      findFirst: jest.fn(),
    },
    campaign: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  prisma.user.findUnique.mockImplementation(async () => authUser(prisma.globalRole));

  prisma.membership.findFirst.mockImplementation(async ({ where }) =>
    where.userId === userId && where.organizationId === organizationId
      ? { id: membershipId, role: prisma.actorRole }
      : null);

  prisma.client.findFirst.mockImplementation(async ({ where }) => {
    if (where.id !== prisma.clientRecord.id) return null;
    if (where.archivedAt === null && prisma.clientRecord.archivedAt !== null) return null;
    return prisma.clientRecord;
  });

  prisma.campaign.findMany.mockImplementation(async ({ where }) => [
    prisma.campaignRecord,
    campaign({ id: otherCampaignId, clientId: otherClientId, name: "Otra campaña" }),
  ].filter((record) =>
    record.clientId === where.clientId
      && (where.archivedAt !== null || record.archivedAt === null)));

  prisma.campaign.findFirst.mockImplementation(async ({ where }) => {
    if (where.id !== prisma.campaignRecord.id) return null;
    if (where.archivedAt === null && prisma.campaignRecord.archivedAt !== null) return null;
    if (where.client?.is?.archivedAt === null && prisma.clientRecord.archivedAt !== null) return null;
    return {
      ...prisma.campaignRecord,
      client: { organizationId: prisma.clientRecord.organizationId },
    };
  });

  prisma.campaign.create.mockImplementation(async ({ data }) => campaign({
    clientId: data.clientId,
    name: data.name,
  }));

  prisma.campaign.update.mockImplementation(async ({ data }) => {
    prisma.campaignRecord = { ...prisma.campaignRecord, ...data, updatedAt: new Date() };
    return prisma.campaignRecord;
  });

  prisma.$transaction = jest.fn(async (callback) => callback(prisma));
  return prisma;
}

function authCookie() {
  return `${security.accessCookieName}=${createAccessToken(userId)}`;
}

function nestedRequest(method, requestedClientId = clientId) {
  return request(app)
    [method](`/api/v1/clients/${requestedClientId}/campaigns`)
    .set("Origin", origin)
    .set("Cookie", authCookie());
}

function directRequest(method, requestedCampaignId = campaignId) {
  return request(app)
    [method](`/api/v1/campaigns/${requestedCampaignId}`)
    .set("Origin", origin)
    .set("Cookie", authCookie());
}

let prisma;

beforeEach(() => {
  prisma = createPrismaMock();
  setPrismaClientForTests(prisma);
});

describe("campaign creation", () => {
  test.each(["OWNER", "ADMIN"])("a %s can create a campaign", async (role) => {
    prisma.actorRole = role;

    const response = await nestedRequest("post").send({ name: "  Campaña nueva  " });

    expect(response.status).toBe(201);
    expect(response.body.campaign.name).toBe("Campaña nueva");
  });

  test.each(["EDITOR", "VIEWER"])("a %s cannot create a campaign", async (role) => {
    prisma.actorRole = role;

    const response = await nestedRequest("post").send({ name: "Campaña nueva" });

    expect(response.status).toBe(403);
    expect(prisma.campaign.create).not.toHaveBeenCalled();
  });

  test("a global administrator cannot bypass a read-only organization role", async () => {
    prisma.globalRole = "SUPERADMIN";
    prisma.actorRole = "VIEWER";

    const response = await nestedRequest("post").send({ name: "Campaña nueva" });

    expect(response.status).toBe(403);
    expect(prisma.campaign.create).not.toHaveBeenCalled();
  });

  test("an unauthenticated user cannot create a campaign", async () => {
    const response = await request(app)
      .post(`/api/v1/clients/${clientId}/campaigns`)
      .set("Origin", origin)
      .send({ name: "Campaña nueva" });

    expect(response.status).toBe(401);
    expect(prisma.campaign.create).not.toHaveBeenCalled();
  });

  test("associates the campaign with the client from the URL", async () => {
    await nestedRequest("post").send({ name: "Campaña nueva" });

    expect(prisma.campaign.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { clientId, name: "Campaña nueva" },
    }));
  });

  test.each(["clientId", "organizationId"])("does not accept %s from the body", async (field) => {
    const response = await nestedRequest("post").send({
      name: "Campaña nueva",
      [field]: otherClientId,
    });

    expect(response.status).toBe(400);
    expect(prisma.campaign.create).not.toHaveBeenCalled();
  });

  test("cannot create a campaign for a client from another organization", async () => {
    prisma.clientRecord = client({ organizationId: otherOrganizationId });

    const response = await nestedRequest("post").send({ name: "Campaña nueva" });

    expect(response.status).toBe(404);
    expect(prisma.campaign.create).not.toHaveBeenCalled();
  });

  test("cannot create a campaign for an archived client", async () => {
    prisma.clientRecord = client({ archivedAt: new Date() });

    const response = await nestedRequest("post").send({ name: "Campaña nueva" });

    expect(response.status).toBe(404);
    expect(prisma.campaign.create).not.toHaveBeenCalled();
  });
});

describe("campaign listing", () => {
  test.each(["OWNER", "ADMIN", "EDITOR", "VIEWER"])(
    "a %s can list campaigns from their client",
    async (role) => {
      prisma.actorRole = role;

      const response = await nestedRequest("get");

      expect(response.status).toBe(200);
      expect(response.body.campaigns).toHaveLength(1);
    },
  );

  test("cannot list campaigns from a client in another organization", async () => {
    prisma.clientRecord = client({ organizationId: otherOrganizationId });

    const response = await nestedRequest("get");

    expect(response.status).toBe(404);
    expect(prisma.campaign.findMany).not.toHaveBeenCalled();
  });

  test("filters by client and excludes archived campaigns", async () => {
    await nestedRequest("get");

    expect(prisma.campaign.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { clientId, archivedAt: null },
    }));
  });

  test("does not return an archived campaign", async () => {
    prisma.campaignRecord = campaign({ archivedAt: new Date() });

    const response = await nestedRequest("get");

    expect(response.status).toBe(200);
    expect(response.body.campaigns).toEqual([]);
  });

  test("does not list campaigns from an archived client", async () => {
    prisma.clientRecord = client({ archivedAt: new Date() });

    const response = await nestedRequest("get");

    expect(response.status).toBe(404);
    expect(prisma.campaign.findMany).not.toHaveBeenCalled();
  });
});

describe("campaign detail", () => {
  test.each(["OWNER", "ADMIN", "EDITOR", "VIEWER"])(
    "a %s can read a campaign from their organization",
    async (role) => {
      prisma.actorRole = role;

      const response = await directRequest("get");

      expect(response.status).toBe(200);
      expect(response.body.campaign.id).toBe(campaignId);
    },
  );

  test("cannot read a campaign from another organization", async () => {
    prisma.clientRecord = client({ organizationId: otherOrganizationId });

    const response = await directRequest("get");

    expect(response.status).toBe(404);
  });

  test("does not expose an archived campaign", async () => {
    prisma.campaignRecord = campaign({ archivedAt: new Date() });

    const response = await directRequest("get");

    expect(response.status).toBe(404);
  });

  test("does not expose a campaign whose client is archived", async () => {
    prisma.clientRecord = client({ archivedAt: new Date() });

    const response = await directRequest("get");

    expect(response.status).toBe(404);
  });
});

describe("campaign editing", () => {
  test.each(["OWNER", "ADMIN"])("a %s can edit a campaign", async (role) => {
    prisma.actorRole = role;

    const response = await directRequest("patch").send({ name: "  Nombre nuevo  " });

    expect(response.status).toBe(200);
    expect(response.body.campaign.name).toBe("Nombre nuevo");
  });

  test.each(["EDITOR", "VIEWER"])("a %s cannot edit a campaign", async (role) => {
    prisma.actorRole = role;

    const response = await directRequest("patch").send({ name: "Nombre nuevo" });

    expect(response.status).toBe(403);
    expect(prisma.campaign.update).not.toHaveBeenCalled();
  });

  test("cannot edit a campaign from another organization", async () => {
    prisma.clientRecord = client({ organizationId: otherOrganizationId });

    const response = await directRequest("patch").send({ name: "Nombre nuevo" });

    expect(response.status).toBe(404);
    expect(prisma.campaign.update).not.toHaveBeenCalled();
  });

  test.each(["clientId", "organizationId"])("does not allow %s to be modified", async (field) => {
    const response = await directRequest("patch").send({
      name: "Nombre nuevo",
      [field]: otherClientId,
    });

    expect(response.status).toBe(400);
    expect(prisma.campaign.update).not.toHaveBeenCalled();
  });
});

describe("campaign archiving", () => {
  test.each(["OWNER", "ADMIN"])("a %s can archive a campaign", async (role) => {
    prisma.actorRole = role;

    const response = await directRequest("delete");

    expect(response.status).toBe(200);
    expect(response.body.campaign.archivedAt).toBeTruthy();
  });

  test.each(["EDITOR", "VIEWER"])("a %s cannot archive a campaign", async (role) => {
    prisma.actorRole = role;

    const response = await directRequest("delete");

    expect(response.status).toBe(403);
    expect(prisma.campaign.update).not.toHaveBeenCalled();
  });

  test("cannot archive a campaign from another organization", async () => {
    prisma.clientRecord = client({ organizationId: otherOrganizationId });

    const response = await directRequest("delete");

    expect(response.status).toBe(404);
    expect(prisma.campaign.update).not.toHaveBeenCalled();
  });

  test("archiving updates archivedAt and never physically deletes the campaign", async () => {
    await directRequest("delete");

    expect(prisma.campaign.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: campaignId },
      data: { archivedAt: expect.any(Date) },
    }));
    expect(prisma.campaign.delete).not.toHaveBeenCalled();
  });
});

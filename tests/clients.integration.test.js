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

function authUser() {
  return {
    id: userId,
    name: "Pablo",
    lastName: "Valdazo",
    email: "pablo@example.com",
    role: "USER",
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

function createPrismaMock() {
  const prisma = {
    actorRole: "OWNER",
    clientRecord: client(),
    user: {
      findUnique: jest.fn().mockResolvedValue(authUser()),
    },
    membership: {
      findFirst: jest.fn(),
    },
    client: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  prisma.membership.findFirst.mockImplementation(async ({ where }) =>
    where.userId === userId && where.organizationId === organizationId
      ? { id: membershipId, role: prisma.actorRole }
      : null);

  prisma.client.findMany.mockImplementation(async ({ where }) =>
    where.organizationId === organizationId && where.archivedAt === null
      ? [prisma.clientRecord].filter((record) => record.archivedAt === null)
      : []);

  prisma.client.findFirst.mockImplementation(async ({ where }) => {
    if (where.id !== prisma.clientRecord.id) return null;
    if (where.archivedAt === null && prisma.clientRecord.archivedAt !== null) return null;
    return prisma.clientRecord;
  });

  prisma.client.create.mockImplementation(async ({ data }) => client({
    organizationId: data.organizationId,
    name: data.name,
  }));

  prisma.client.update.mockImplementation(async ({ data }) => {
    prisma.clientRecord = { ...prisma.clientRecord, ...data, updatedAt: new Date() };
    return prisma.clientRecord;
  });

  prisma.$transaction = jest.fn(async (callback) => callback(prisma));
  return prisma;
}

function authCookie() {
  return `${security.accessCookieName}=${createAccessToken(userId)}`;
}

function nestedRequest(method, requestedOrganizationId = organizationId) {
  return request(app)
    [method](`/api/v1/organizations/${requestedOrganizationId}/clients`)
    .set("Origin", origin)
    .set("Cookie", authCookie());
}

function directRequest(method, requestedClientId = clientId) {
  return request(app)
    [method](`/api/v1/clients/${requestedClientId}`)
    .set("Origin", origin)
    .set("Cookie", authCookie());
}

let prisma;

beforeEach(() => {
  prisma = createPrismaMock();
  setPrismaClientForTests(prisma);
});

describe("client creation", () => {
  test.each(["OWNER", "ADMIN"])("a %s can create a client", async (role) => {
    prisma.actorRole = role;

    const response = await nestedRequest("post").send({ name: "  Nuevo cliente  " });

    expect(response.status).toBe(201);
    expect(response.body.client.name).toBe("Nuevo cliente");
  });

  test.each(["EDITOR", "VIEWER"])("a %s cannot create a client", async (role) => {
    prisma.actorRole = role;

    const response = await nestedRequest("post").send({ name: "Nuevo cliente" });

    expect(response.status).toBe(403);
    expect(prisma.client.create).not.toHaveBeenCalled();
  });

  test("an unauthenticated user cannot create a client", async () => {
    const response = await request(app)
      .post(`/api/v1/organizations/${organizationId}/clients`)
      .set("Origin", origin)
      .send({ name: "Nuevo cliente" });

    expect(response.status).toBe(401);
    expect(prisma.client.create).not.toHaveBeenCalled();
  });

  test("associates the client with the organization from the URL", async () => {
    await nestedRequest("post").send({ name: "Nuevo cliente" });

    expect(prisma.client.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { organizationId, name: "Nuevo cliente" },
    }));
  });

  test("does not accept organizationId from the body", async () => {
    const response = await nestedRequest("post").send({
      name: "Nuevo cliente",
      organizationId: otherOrganizationId,
    });

    expect(response.status).toBe(400);
    expect(prisma.client.create).not.toHaveBeenCalled();
  });
});

describe("client listing", () => {
  test.each(["OWNER", "ADMIN", "EDITOR", "VIEWER"])("a %s can list their clients", async (role) => {
    prisma.actorRole = role;

    const response = await nestedRequest("get");

    expect(response.status).toBe(200);
    expect(response.body.clients).toHaveLength(1);
  });

  test("cannot list clients from another organization", async () => {
    const response = await nestedRequest("get", otherOrganizationId);

    expect(response.status).toBe(404);
    expect(prisma.client.findMany).not.toHaveBeenCalled();
  });

  test("filters by organization and excludes archived clients", async () => {
    await nestedRequest("get");

    expect(prisma.client.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId, archivedAt: null },
    }));
  });

  test("does not return an archived client", async () => {
    prisma.clientRecord = client({ archivedAt: new Date() });

    const response = await nestedRequest("get");

    expect(response.status).toBe(200);
    expect(response.body.clients).toEqual([]);
  });
});

describe("client detail", () => {
  test.each(["OWNER", "ADMIN", "EDITOR", "VIEWER"])("a %s can read their client", async (role) => {
    prisma.actorRole = role;

    const response = await directRequest("get");

    expect(response.status).toBe(200);
    expect(response.body.client.id).toBe(clientId);
  });

  test("cannot read a client belonging to another organization", async () => {
    prisma.clientRecord = client({ organizationId: otherOrganizationId });

    const response = await directRequest("get");

    expect(response.status).toBe(404);
  });

  test("does not expose an archived client through the normal detail endpoint", async () => {
    prisma.clientRecord = client({ archivedAt: new Date() });

    const response = await directRequest("get");

    expect(response.status).toBe(404);
  });
});

describe("client editing", () => {
  test.each(["OWNER", "ADMIN"])("a %s can edit a client", async (role) => {
    prisma.actorRole = role;

    const response = await directRequest("patch").send({ name: "  Nombre nuevo  " });

    expect(response.status).toBe(200);
    expect(response.body.client.name).toBe("Nombre nuevo");
  });

  test.each(["EDITOR", "VIEWER"])("a %s cannot edit a client", async (role) => {
    prisma.actorRole = role;

    const response = await directRequest("patch").send({ name: "Nombre nuevo" });

    expect(response.status).toBe(403);
    expect(prisma.client.update).not.toHaveBeenCalled();
  });

  test("cannot edit a client belonging to another organization", async () => {
    prisma.clientRecord = client({ organizationId: otherOrganizationId });

    const response = await directRequest("patch").send({ name: "Nombre nuevo" });

    expect(response.status).toBe(404);
    expect(prisma.client.update).not.toHaveBeenCalled();
  });

  test("does not allow organizationId to be modified", async () => {
    const response = await directRequest("patch").send({
      name: "Nombre nuevo",
      organizationId: otherOrganizationId,
    });

    expect(response.status).toBe(400);
    expect(prisma.client.update).not.toHaveBeenCalled();
  });
});

describe("client archiving", () => {
  test.each(["OWNER", "ADMIN"])("a %s can archive a client", async (role) => {
    prisma.actorRole = role;

    const response = await directRequest("delete");

    expect(response.status).toBe(200);
    expect(response.body.client.archivedAt).toBeTruthy();
  });

  test.each(["EDITOR", "VIEWER"])("a %s cannot archive a client", async (role) => {
    prisma.actorRole = role;

    const response = await directRequest("delete");

    expect(response.status).toBe(403);
    expect(prisma.client.update).not.toHaveBeenCalled();
  });

  test("cannot archive a client belonging to another organization", async () => {
    prisma.clientRecord = client({ organizationId: otherOrganizationId });

    const response = await directRequest("delete");

    expect(response.status).toBe(404);
    expect(prisma.client.update).not.toHaveBeenCalled();
  });

  test("archiving updates archivedAt and never physically deletes the client", async () => {
    await directRequest("delete");

    expect(prisma.client.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: clientId },
      data: { archivedAt: expect.any(Date) },
    }));
    expect(prisma.client.delete).not.toHaveBeenCalled();
  });
});

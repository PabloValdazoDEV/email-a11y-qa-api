import { jest } from "@jest/globals";
import request from "supertest";
import { app } from "../src/app.js";
import { security } from "../src/config/security.js";
import { setPrismaClientForTests } from "../src/prisma.js";
import { createAccessToken } from "../src/services/token.service.js";

const origin = "http://localhost:5173";
const userId = "11111111-1111-4111-8111-111111111111";
const organizationId = "22222222-2222-4222-8222-222222222222";
const otherOrganizationId = "33333333-3333-4333-8333-333333333333";

function baseUser(overrides = {}) {
  return {
    id: userId,
    name: "Ana",
    lastName: "García",
    email: "ana@example.com",
    role: "USER",
    isActive: true,
    emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    passwordChangedAt: new Date(),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function organization(overrides = {}) {
  return {
    id: organizationId,
    name: "Agencia Ana",
    createdAt: new Date("2026-09-10T00:00:00.000Z"),
    updatedAt: new Date("2026-09-10T00:00:00.000Z"),
    ...overrides,
  };
}

function createPrismaMock() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    organization: {
      create: jest.fn(),
    },
    membership: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  prisma.$transaction = jest.fn(async (callback) => callback(prisma));
  return prisma;
}

function authCookie(id = userId) {
  return `${security.accessCookieName}=${createAccessToken(id)}`;
}

let prisma;

beforeEach(() => {
  prisma = createPrismaMock();
  prisma.user.findUnique.mockResolvedValue(baseUser());
  prisma.membership.findUnique.mockResolvedValue(null);
  prisma.organization.create.mockResolvedValue(organization());
  prisma.membership.create.mockResolvedValue({ role: "OWNER" });
  prisma.membership.findMany.mockResolvedValue([]);
  setPrismaClientForTests(prisma);
});

describe("organization creation", () => {
  test("rejects an unauthenticated request", async () => {
    const response = await request(app)
      .post("/api/v1/organizations")
      .set("Origin", origin)
      .send({ name: "Agencia Ana" });

    expect(response.status).toBe(401);
    expect(prisma.organization.create).not.toHaveBeenCalled();
  });

  test("creates the organization and OWNER membership in one transaction", async () => {
    const response = await request(app)
      .post("/api/v1/organizations")
      .set("Origin", origin)
      .set("Cookie", authCookie())
      .send({ name: "  Agencia Ana  " });

    expect(response.status).toBe(201);
    expect(response.body.organization.name).toBe("Agencia Ana");
    expect(response.body.organization.membership.role).toBe("OWNER");
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.organization.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { name: "Agencia Ana" },
    }));
    expect(prisma.membership.create).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        userId,
        organizationId,
        role: "OWNER",
      },
    }));
  });

  test("rejects a second organization for the same user", async () => {
    prisma.membership.findUnique.mockResolvedValue({ id: "membership-1" });

    const response = await request(app)
      .post("/api/v1/organizations")
      .set("Origin", origin)
      .set("Cookie", authCookie())
      .send({ name: "Otra organización" });

    expect(response.status).toBe(409);
    expect(prisma.organization.create).not.toHaveBeenCalled();
  });

  test("rejects an invalid organization name", async () => {
    const response = await request(app)
      .post("/api/v1/organizations")
      .set("Origin", origin)
      .set("Cookie", authCookie())
      .send({ name: "   " });

    expect(response.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test.each(["USER", "ADMIN", "SUPERADMIN"])(
    "keeps the global %s role independent from organization ownership",
    async (role) => {
      prisma.user.findUnique.mockResolvedValue(baseUser({ role }));

      const response = await request(app)
        .post("/api/v1/organizations")
        .set("Origin", origin)
        .set("Cookie", authCookie())
        .send({ name: `Organización ${role}` });

      expect(response.status).toBe(201);
      expect(response.body.organization.membership.role).toBe("OWNER");
      expect(prisma.membership.create.mock.calls[0][0].data.role).toBe("OWNER");
    },
  );
});

describe("organization access", () => {
  test("rejects an unauthenticated list request", async () => {
    const response = await request(app).get("/api/v1/organizations");

    expect(response.status).toBe(401);
    expect(prisma.membership.findMany).not.toHaveBeenCalled();
  });

  test("lists only organizations assigned to the authenticated user", async () => {
    prisma.membership.findMany.mockResolvedValue([
      { role: "OWNER", organization: organization() },
    ]);

    const response = await request(app)
      .get("/api/v1/organizations")
      .set("Cookie", authCookie());

    expect(response.status).toBe(200);
    expect(response.body.organizations).toHaveLength(1);
    expect(response.body.organizations[0].id).toBe(organizationId);
    expect(prisma.membership.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId },
    }));
  });

  test("returns an organization assigned to the authenticated user", async () => {
    prisma.membership.findFirst.mockResolvedValue({
      role: "OWNER",
      organization: organization(),
    });

    const response = await request(app)
      .get(`/api/v1/organizations/${organizationId}`)
      .set("Cookie", authCookie());

    expect(response.status).toBe(200);
    expect(response.body.organization.id).toBe(organizationId);
    expect(prisma.membership.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId, organizationId },
    }));
  });

  test("does not expose another user's organization", async () => {
    prisma.membership.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .get(`/api/v1/organizations/${otherOrganizationId}`)
      .set("Cookie", authCookie());

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Organización no encontrada");
    expect(prisma.membership.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId, organizationId: otherOrganizationId },
    }));
  });
});

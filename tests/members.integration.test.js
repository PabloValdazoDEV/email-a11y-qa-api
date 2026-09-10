import { jest } from "@jest/globals";
import request from "supertest";
import { app } from "../src/app.js";
import { security } from "../src/config/security.js";
import { setPrismaClientForTests } from "../src/prisma.js";
import { createAccessToken } from "../src/services/token.service.js";

const origin = "http://localhost:5173";
const organizationId = "11111111-1111-4111-8111-111111111111";
const otherOrganizationId = "22222222-2222-4222-8222-222222222222";
const actorUserId = "33333333-3333-4333-8333-333333333333";
const targetUserId = "44444444-4444-4444-8444-444444444444";
const actorMembershipId = "55555555-5555-4555-8555-555555555555";
const targetMembershipId = "66666666-6666-4666-8666-666666666666";
const ownerMembershipId = "77777777-7777-4777-8777-777777777777";
const foreignMembershipId = "88888888-8888-4888-8888-888888888888";

function baseUser(overrides = {}) {
  return {
    id: actorUserId,
    name: "Pablo",
    lastName: "Valdazo",
    email: "pablo@example.com",
    role: "USER",
    isActive: true,
    emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    passwordChangedAt: new Date(),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function membership({
  id = targetMembershipId,
  userId = targetUserId,
  organization = organizationId,
  role = "EDITOR",
} = {}) {
  return {
    id,
    userId,
    organizationId: organization,
    role,
    createdAt: new Date("2026-09-10T00:00:00.000Z"),
    updatedAt: new Date("2026-09-10T00:00:00.000Z"),
    user: {
      id: userId,
      name: userId === actorUserId ? "Pablo" : "María",
      lastName: userId === actorUserId ? "Valdazo" : "López",
      email: userId === actorUserId ? "pablo@example.com" : "maria@example.com",
      role: "SUPERADMIN",
      password: "never-return-this",
    },
  };
}

function authCookie() {
  return `${security.accessCookieName}=${createAccessToken(actorUserId)}`;
}

function createPrismaMock() {
  const prisma = {
    actorRole: "OWNER",
    targetRole: "EDITOR",
    user: {
      findUnique: jest.fn().mockResolvedValue(baseUser()),
      update: jest.fn(),
      delete: jest.fn(),
    },
    membership: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
    },
  };

  prisma.membership.findFirst.mockImplementation(async ({ where }) => {
    if (where.userId) {
      return where.userId === actorUserId && where.organizationId === organizationId
        ? { id: actorMembershipId, role: prisma.actorRole }
        : null;
    }

    const records = [
      membership({
        id: actorMembershipId,
        userId: actorUserId,
        role: prisma.actorRole,
      }),
      membership({ role: prisma.targetRole }),
      membership({ id: ownerMembershipId, role: "OWNER" }),
      membership({
        id: foreignMembershipId,
        organization: otherOrganizationId,
        role: "EDITOR",
      }),
    ];
    return records.find((record) =>
      record.id === where.id && record.organizationId === where.organizationId) ?? null;
  });

  prisma.membership.findMany.mockImplementation(async ({ where }) =>
    where.organizationId === organizationId
      ? [
          membership({
            id: actorMembershipId,
            userId: actorUserId,
            role: prisma.actorRole,
          }),
          membership({ role: prisma.targetRole }),
        ]
      : []);

  prisma.membership.update.mockImplementation(async ({ where, data }) => {
    const record = where.id === actorMembershipId
      ? membership({
          id: actorMembershipId,
          userId: actorUserId,
          role: prisma.actorRole,
        })
      : membership({ role: prisma.targetRole });
    return { ...record, role: data.role };
  });

  prisma.$transaction = jest.fn(async (callback) => callback(prisma));
  return prisma;
}

let prisma;

beforeEach(() => {
  prisma = createPrismaMock();
  setPrismaClientForTests(prisma);
});

async function listMembers(id = organizationId) {
  return request(app)
    .get(`/api/v1/organizations/${id}/members`)
    .set("Cookie", authCookie());
}

async function patchMember(role, id = targetMembershipId, organization = organizationId) {
  return request(app)
    .patch(`/api/v1/organizations/${organization}/members/${id}`)
    .set("Origin", origin)
    .set("Cookie", authCookie())
    .send({ role });
}

async function deleteMember(id = targetMembershipId, organization = organizationId) {
  return request(app)
    .delete(`/api/v1/organizations/${organization}/members/${id}`)
    .set("Origin", origin)
    .set("Cookie", authCookie());
}

describe("organization member listing", () => {
  test("an authenticated member can list their organization members", async () => {
    const response = await listMembers();

    expect(response.status).toBe(200);
    expect(response.body.members).toHaveLength(2);
  });

  test("rejects an unauthenticated request", async () => {
    const response = await request(app)
      .get(`/api/v1/organizations/${organizationId}/members`);

    expect(response.status).toBe(401);
    expect(prisma.membership.findMany).not.toHaveBeenCalled();
  });

  test("does not list another organization's members", async () => {
    const response = await listMembers(otherOrganizationId);

    expect(response.status).toBe(404);
    expect(prisma.membership.findMany).not.toHaveBeenCalled();
  });

  test("filters the member query by the requested organization", async () => {
    await listMembers();

    expect(prisma.membership.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId },
    }));
  });

  test("returns only the public member fields", async () => {
    const response = await listMembers();

    const member = response.body.members[0];
    expect(member).toEqual(expect.objectContaining({
      membershipId: actorMembershipId,
      role: "OWNER",
      createdAt: expect.any(String),
      user: expect.objectContaining({
        id: actorUserId,
        name: "Pablo",
        lastName: "Valdazo",
        email: "pablo@example.com",
      }),
    }));
    expect(member.user).not.toHaveProperty("password");
    expect(member.user).not.toHaveProperty("role");
    expect(member).not.toHaveProperty("updatedAt");
  });

  test.each(["EDITOR", "VIEWER"])("a %s can list members", async (role) => {
    prisma.actorRole = role;

    const response = await listMembers();

    expect(response.status).toBe(200);
  });
});

describe("OWNER permissions", () => {
  test.each([
    ["ADMIN", "EDITOR"],
    ["EDITOR", "VIEWER"],
    ["VIEWER", "ADMIN"],
  ])("can change %s to %s", async (currentRole, nextRole) => {
    prisma.actorRole = "OWNER";
    prisma.targetRole = currentRole;

    const response = await patchMember(nextRole);

    expect(response.status).toBe(200);
    expect(response.body.member.role).toBe(nextRole);
  });

  test.each(["ADMIN", "EDITOR", "VIEWER"])("can remove a %s", async (role) => {
    prisma.actorRole = "OWNER";
    prisma.targetRole = role;

    const response = await deleteMember();

    expect(response.status).toBe(200);
    expect(prisma.membership.delete).toHaveBeenCalledWith({
      where: { id: targetMembershipId },
    });
  });

  test("cannot change an OWNER", async () => {
    prisma.actorRole = "OWNER";

    const response = await patchMember("ADMIN", actorMembershipId);

    expect(response.status).toBe(403);
    expect(prisma.membership.update).not.toHaveBeenCalled();
  });

  test("cannot remove an OWNER", async () => {
    prisma.actorRole = "OWNER";

    const response = await deleteMember(actorMembershipId);

    expect(response.status).toBe(403);
    expect(prisma.membership.delete).not.toHaveBeenCalled();
  });

  test("cannot assign OWNER through the role endpoint", async () => {
    const response = await patchMember("OWNER");

    expect(response.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("organization ADMIN permissions", () => {
  beforeEach(() => {
    prisma.actorRole = "ADMIN";
  });

  test.each([
    ["EDITOR", "VIEWER"],
    ["VIEWER", "EDITOR"],
  ])("can change %s to %s", async (currentRole, nextRole) => {
    prisma.targetRole = currentRole;

    const response = await patchMember(nextRole);

    expect(response.status).toBe(200);
  });

  test.each(["EDITOR", "VIEWER"])("can remove a %s", async (role) => {
    prisma.targetRole = role;

    const response = await deleteMember();

    expect(response.status).toBe(200);
  });

  test("cannot promote a member to ADMIN", async () => {
    prisma.targetRole = "EDITOR";

    const response = await patchMember("ADMIN");

    expect(response.status).toBe(403);
  });

  test.each([
    ["change", "PATCH"],
    ["remove", "DELETE"],
  ])("cannot %s an OWNER", async (_label, method) => {
    const response = method === "PATCH"
      ? await patchMember("EDITOR", ownerMembershipId)
      : await deleteMember(ownerMembershipId);

    expect(response.status).toBe(403);
  });

  test.each([
    ["change", "PATCH"],
    ["remove", "DELETE"],
  ])("cannot %s another ADMIN", async (_label, method) => {
    prisma.targetRole = "ADMIN";
    const response = method === "PATCH"
      ? await patchMember("EDITOR")
      : await deleteMember();

    expect(response.status).toBe(403);
  });
});

describe.each(["EDITOR", "VIEWER"])("%s permissions", (role) => {
  beforeEach(() => {
    prisma.actorRole = role;
    prisma.targetRole = "VIEWER";
  });

  test("cannot change roles", async () => {
    const response = await patchMember("EDITOR");

    expect(response.status).toBe(403);
    expect(prisma.membership.update).not.toHaveBeenCalled();
  });

  test("cannot remove members", async () => {
    const response = await deleteMember();

    expect(response.status).toBe(403);
    expect(prisma.membership.delete).not.toHaveBeenCalled();
  });
});

describe("tenant isolation and integrity", () => {
  test("cannot change a membership belonging to another organization", async () => {
    const response = await patchMember("VIEWER", foreignMembershipId);

    expect(response.status).toBe(404);
    expect(prisma.membership.update).not.toHaveBeenCalled();
  });

  test("cannot remove a membership belonging to another organization", async () => {
    const response = await deleteMember(foreignMembershipId);

    expect(response.status).toBe(404);
    expect(prisma.membership.delete).not.toHaveBeenCalled();
  });

  test("removing a membership never deletes the platform user", async () => {
    prisma.targetRole = "VIEWER";

    const response = await deleteMember();

    expect(response.status).toBe(200);
    expect(prisma.user.delete).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test.each(["USER", "ADMIN", "SUPERADMIN"])(
    "does not use or alter the global %s role",
    async (globalRole) => {
      prisma.user.findUnique.mockResolvedValue(baseUser({ role: globalRole }));
      prisma.actorRole = "EDITOR";

      const response = await listMembers();

      expect(response.status).toBe(200);
      expect(response.body.members[0].user).not.toHaveProperty("role");
      expect(prisma.user.update).not.toHaveBeenCalled();
    },
  );
});

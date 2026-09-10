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
const invitedUserId = "44444444-4444-4444-8444-444444444444";
const actorMembershipId = "55555555-5555-4555-8555-555555555555";
const invitedMembershipId = "66666666-6666-4666-8666-666666666666";

function authUser(overrides = {}) {
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

function existingUser(overrides = {}) {
  return {
    id: invitedUserId,
    email: "ana@example.com",
    isActive: true,
    emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    membership: null,
    ...overrides,
  };
}

function createPrismaMock() {
  const users = new Map();
  const prisma = {
    actorRole: "OWNER",
    existingUser: null,
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    membership: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    passwordResetToken: {
      create: jest.fn().mockResolvedValue({}),
    },
  };

  prisma.user.findUnique.mockImplementation(async ({ where }) => {
    if (where.id === actorUserId) return authUser();
    if (where.email) return prisma.existingUser;
    return null;
  });

  prisma.user.create.mockImplementation(async ({ data }) => {
    const user = {
      id: invitedUserId,
      ...data,
      passwordChangedAt: new Date(),
      createdAt: new Date("2026-09-10T00:00:00.000Z"),
      updatedAt: new Date("2026-09-10T00:00:00.000Z"),
    };
    users.set(user.id, user);
    return user;
  });

  prisma.membership.findFirst.mockImplementation(async ({ where }) =>
    where.userId === actorUserId && where.organizationId === organizationId
      ? { id: actorMembershipId, role: prisma.actorRole }
      : null);

  prisma.membership.create.mockImplementation(async ({ data }) => {
    const storedUser = users.get(data.userId);
    const user = storedUser ?? {
      id: prisma.existingUser.id,
      name: "Ana",
      lastName: "García",
      email: prisma.existingUser.email,
      isActive: prisma.existingUser.isActive,
      emailVerifiedAt: prisma.existingUser.emailVerifiedAt,
    };
    return {
      id: invitedMembershipId,
      role: data.role,
      createdAt: new Date("2026-09-10T00:00:00.000Z"),
      user,
    };
  });

  prisma.$transaction = jest.fn(async (callback) => callback(prisma));
  return prisma;
}

function authCookie() {
  return `${security.accessCookieName}=${createAccessToken(actorUserId)}`;
}

function invitationRequest(body, requestedOrganizationId = organizationId) {
  return request(app)
    .post(`/api/v1/organizations/${requestedOrganizationId}/invitations`)
    .set("Origin", origin)
    .set("Cookie", authCookie())
    .send(body);
}

function payload(role = "EDITOR", overrides = {}) {
  return {
    name: "Ana",
    lastName: "García",
    email: " ANA@EXAMPLE.COM ",
    role,
    ...overrides,
  };
}

let prisma;

beforeEach(() => {
  prisma = createPrismaMock();
  setPrismaClientForTests(prisma);
});

describe("organization invitation permissions", () => {
  test.each(["ADMIN", "EDITOR", "VIEWER"])("an OWNER can invite a %s", async (role) => {
    const response = await invitationRequest(payload(role));

    expect(response.status).toBe(201);
    expect(response.body.member.role).toBe(role);
  });

  test("an OWNER cannot invite another OWNER", async () => {
    const response = await invitationRequest(payload("OWNER"));

    expect(response.status).toBe(400);
    expect(prisma.membership.create).not.toHaveBeenCalled();
  });

  test.each(["EDITOR", "VIEWER"])("an organization ADMIN can invite a %s", async (role) => {
    prisma.actorRole = "ADMIN";

    const response = await invitationRequest(payload(role));

    expect(response.status).toBe(201);
  });

  test.each(["ADMIN", "OWNER"])("an organization ADMIN cannot invite a %s", async (role) => {
    prisma.actorRole = "ADMIN";

    const response = await invitationRequest(payload(role));

    expect([400, 403]).toContain(response.status);
    expect(prisma.membership.create).not.toHaveBeenCalled();
  });

  test.each(["EDITOR", "VIEWER"])("a %s cannot invite", async (actorRole) => {
    prisma.actorRole = actorRole;

    const response = await invitationRequest(payload("VIEWER"));

    expect(response.status).toBe(403);
    expect(prisma.membership.create).not.toHaveBeenCalled();
  });

  test("an unauthenticated user cannot invite", async () => {
    const response = await request(app)
      .post(`/api/v1/organizations/${organizationId}/invitations`)
      .set("Origin", origin)
      .send(payload());

    expect(response.status).toBe(401);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test("a member of organization A cannot invite into organization B", async () => {
    const response = await invitationRequest(payload(), otherOrganizationId);

    expect(response.status).toBe(404);
    expect(prisma.membership.create).not.toHaveBeenCalled();
  });
});

describe("new-user organization invitation", () => {
  test("creates a secure USER account, token and pending membership atomically", async () => {
    const response = await invitationRequest(payload("ADMIN"));

    expect(response.status).toBe(201);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    expect(prisma.user.create.mock.calls[0][0].data).toEqual(expect.objectContaining({
      name: "Ana",
      lastName: "García",
      email: "ana@example.com",
      role: "USER",
      isActive: true,
      emailVerifiedAt: null,
      password: expect.stringMatching(/^\$2/),
    }));
    expect(prisma.membership.create).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        userId: invitedUserId,
        organizationId,
        role: "ADMIN",
      },
    }));
    expect(response.body.member.status).toBe("INVITATION_PENDING");
  });

  test("stores only the invitation token hash", async () => {
    await invitationRequest(payload());

    const tokenData = prisma.passwordResetToken.create.mock.calls[0][0].data;
    expect(tokenData.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenData).not.toHaveProperty("token");
    expect(tokenData.expiresAt).toBeInstanceOf(Date);
  });

  test("never derives the global role from the organization role", async () => {
    await invitationRequest(payload("ADMIN"));

    expect(prisma.user.create.mock.calls[0][0].data.role).toBe("USER");
  });

  test("requires profile details only when a new account must be created", async () => {
    const response = await invitationRequest({
      email: "new@example.com",
      role: "EDITOR",
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("NEW_USER_DETAILS_REQUIRED");
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.membership.create).not.toHaveBeenCalled();
  });

  test("does not expose passwords, hashes or verification timestamps", async () => {
    const response = await invitationRequest(payload());

    expect(response.body.member.user).toEqual({
      id: invitedUserId,
      name: "Ana",
      lastName: "García",
      email: "ana@example.com",
    });
    expect(response.body.member).not.toHaveProperty("emailVerifiedAt");
    expect(JSON.stringify(response.body)).not.toMatch(/password|tokenHash/i);
  });
});

describe("existing-user organization membership", () => {
  beforeEach(() => {
    prisma.existingUser = existingUser();
  });

  test("adds an existing user without duplicating or modifying the account", async () => {
    const before = { ...prisma.existingUser };
    const response = await invitationRequest({ email: "ANA@EXAMPLE.COM", role: "VIEWER" });

    expect(response.status).toBe(201);
    expect(response.body.message).toMatch(/añadido/i);
    expect(response.body.member.status).toBe("ACTIVE");
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(prisma.existingUser).toEqual(before);
    expect(prisma.membership.create.mock.calls[0][0].data).toEqual({
      userId: invitedUserId,
      organizationId,
      role: "VIEWER",
    });
  });

  test("keeps an existing unverified account pending without generating another token", async () => {
    prisma.existingUser = existingUser({ emailVerifiedAt: null });

    const response = await invitationRequest({ email: "ana@example.com", role: "EDITOR" });

    expect(response.status).toBe(201);
    expect(response.body.member.status).toBe("INVITATION_PENDING");
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
  });

  test("returns ALREADY_MEMBER without creating a duplicate membership", async () => {
    prisma.existingUser = existingUser({ membership: { id: "existing-membership" } });

    const response = await invitationRequest({ email: "ana@example.com", role: "EDITOR" });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("ALREADY_MEMBER");
    expect(prisma.membership.create).not.toHaveBeenCalled();
  });

  test("rejects an inactive existing account", async () => {
    prisma.existingUser = existingUser({ isActive: false });

    const response = await invitationRequest({ email: "ana@example.com", role: "EDITOR" });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("ACCOUNT_UNAVAILABLE");
    expect(prisma.membership.create).not.toHaveBeenCalled();
  });
});

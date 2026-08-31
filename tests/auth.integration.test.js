import bcrypt from "bcrypt";
import { jest } from "@jest/globals";
import request from "supertest";
import { app } from "../src/app.js";
import { security } from "../src/config/security.js";
import { setPrismaClientForTests } from "../src/prisma.js";
import { createAccessToken, hashToken } from "../src/services/token.service.js";

const origin = "http://localhost:5173";
const validPassword = "Valid-password-1!";
const newPassword = "Different-password-2!";
const olderPassword = "Older-password-3!";
let passwordHash;
let olderPasswordHash;

function baseUser(overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Ana",
    lastName: "García",
    email: "ana@example.com",
    password: passwordHash,
    role: "USER",
    isActive: true,
    emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    passwordChangedAt: new Date(),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function publicFields(user) {
  const safe = { ...user };
  delete safe.password;
  return safe;
}

function createPrismaMock() {
  const prisma = {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    session: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    passwordResetToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    emailVerificationToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    passwordHistory: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  prisma.$transaction = jest.fn(async (input) =>
    Array.isArray(input) ? Promise.all(input) : input(prisma),
  );
  return prisma;
}

function authCookie(userId = baseUser().id) {
  return `${security.accessCookieName}=${createAccessToken(userId)}`;
}

function refreshCookie(token) {
  return `${security.refreshCookieName}=${token}`;
}

beforeAll(async () => {
  passwordHash = await bcrypt.hash(validPassword, 4);
  olderPasswordHash = await bcrypt.hash(olderPassword, 4);
});

let prisma;
beforeEach(() => {
  prisma = createPrismaMock();
  setPrismaClientForTests(prisma);
});

describe("private user provisioning", () => {
  const payload = {
    name: "Ana",
    lastName: "García",
    email: " ANA@EXAMPLE.COM ",
    role: "USER",
  };

  test("the public registration route does not exist", async () => {
    const response = await request(app).post("/auth/register").send({});
    expect(response.status).toBe(404);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  test("rejects account creation without an authenticated administrator", async () => {
    const response = await request(app).post("/users").set("Origin", origin).send(payload);
    expect(response.status).toBe(401);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  test("an ADMIN can create a USER without choosing their password", async () => {
    const admin = baseUser({ role: "ADMIN" });
    const invited = baseUser({
      id: "44444444-4444-4444-8444-444444444444",
      email: "ana@example.com",
      emailVerifiedAt: null,
    });
    prisma.user.findUnique.mockResolvedValue(publicFields(admin));
    prisma.user.create.mockImplementation(async ({ data }) => publicFields({ ...invited, ...data }));
    prisma.passwordResetToken.create.mockResolvedValue({});

    const response = await request(app)
      .post("/users")
      .set("Origin", origin)
      .set("Cookie", authCookie())
      .send(payload);

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe("ana@example.com");
    expect(response.body.user).not.toHaveProperty("password");
    expect(prisma.user.create.mock.calls[0][0].data.role).toBe("USER");
    expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
  });

  test("an ADMIN cannot create a SUPERADMIN", async () => {
    prisma.user.findUnique.mockResolvedValue(publicFields(baseUser({ role: "ADMIN" })));
    const response = await request(app)
      .post("/users")
      .set("Origin", origin)
      .set("Cookie", authCookie())
      .send({ ...payload, role: "SUPERADMIN" });
    expect(response.status).toBe(403);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  test("a SUPERADMIN can create another SUPERADMIN", async () => {
    const superAdmin = baseUser({ role: "SUPERADMIN" });
    prisma.user.findUnique.mockResolvedValue(publicFields(superAdmin));
    prisma.user.create.mockImplementation(async ({ data }) =>
      publicFields(baseUser({
        ...data,
        id: "55555555-5555-4555-8555-555555555555",
        emailVerifiedAt: null,
      })),
    );
    prisma.passwordResetToken.create.mockResolvedValue({});

    const response = await request(app)
      .post("/users")
      .set("Origin", origin)
      .set("Cookie", authCookie())
      .send({ ...payload, role: "SUPERADMIN" });

    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe("SUPERADMIN");
  });
});

describe("login", () => {
  test("sets an HttpOnly access cookie for valid credentials", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser());
    const response = await request(app).post("/auth/login").send({
      email: "ana@example.com",
      password: validPassword,
      rememberMe: false,
    });
    expect(response.status).toBe(200);
    expect(response.headers["set-cookie"].join(";")).toContain("HttpOnly");
    expect(response.body.user).not.toHaveProperty("password");
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  test("uses the same public error for an unknown email", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const response = await request(app).post("/auth/login").send({
      email: "unknown@example.com",
      password: validPassword,
      rememberMe: false,
    });
    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Credenciales inválidas");
  });

  test("uses the same public error for a wrong password", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser());
    const response = await request(app).post("/auth/login").send({
      email: "ana@example.com",
      password: "Wrong-password-9!",
      rememberMe: false,
    });
    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Credenciales inválidas");
  });

  test("rejects a disabled user after valid credentials", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser({ isActive: false }));
    const response = await request(app).post("/auth/login").send({
      email: "ana@example.com",
      password: validPassword,
      rememberMe: false,
    });
    expect(response.status).toBe(403);
  });

  test("requires email verification only after valid credentials", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser({ emailVerifiedAt: null }));
    const response = await request(app).post("/auth/login").send({
      email: "ana@example.com",
      password: validPassword,
      rememberMe: false,
    });
    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/activar/i);
  });

  test("marks a valid login as requiring a password change after 90 days", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser({
      passwordChangedAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000),
    }));

    const response = await request(app).post("/auth/login").send({
      email: "ana@example.com",
      password: validPassword,
      rememberMe: false,
    });

    expect(response.status).toBe(200);
    expect(response.body.user.passwordChangeRequired).toBe(true);
    expect(response.body.message).toMatch(/cambiar/i);
  });

  test("rate limits repeated failed attempts", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const responses = [];
    for (let attempt = 0; attempt < 9; attempt += 1) {
      responses.push(
        await request(app).post("/auth/login").send({
          email: "rate-limit@example.com",
          password: validPassword,
          rememberMe: false,
        }),
      );
    }
    expect(responses.some((response) => response.status === 429)).toBe(true);
  });
});

describe("sessions", () => {
  test("GET /me rejects a request without auth", async () => {
    const response = await request(app).get("/auth/me");
    expect(response.status).toBe(401);
  });

  test("GET /me returns the current public user", async () => {
    prisma.user.findUnique.mockResolvedValue(publicFields(baseUser()));
    const response = await request(app).get("/auth/me").set("Cookie", authCookie());
    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe("ana@example.com");
    expect(response.body.user).not.toHaveProperty("password");
  });

  test("refresh rotates the opaque token", async () => {
    const oldToken = "a".repeat(64);
    prisma.session.findUnique.mockResolvedValue({
      id: "session-1",
      userId: baseUser().id,
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.session.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findUnique.mockResolvedValue(publicFields(baseUser()));

    const response = await request(app)
      .post("/auth/refresh")
      .set("Origin", origin)
      .set("Cookie", refreshCookie(oldToken))
      .send({});

    expect(response.status).toBe(200);
    const cookies = response.headers["set-cookie"].join(";");
    expect(cookies).toContain(security.refreshCookieName);
    expect(cookies).not.toContain(`${security.refreshCookieName}=${oldToken}`);
    expect(prisma.session.updateMany.mock.calls[0][0].data.tokenHash).not.toBe(hashToken(oldToken));
  });

  test("the previous refresh token stops working after rotation", async () => {
    const oldToken = "b".repeat(64);
    let activeHash = hashToken(oldToken);
    prisma.session.findUnique.mockImplementation(async ({ where }) =>
      where.tokenHash === activeHash
        ? { id: "session-2", userId: baseUser().id, expiresAt: new Date(Date.now() + 60_000) }
        : null,
    );
    prisma.session.updateMany.mockImplementation(async ({ where, data }) => {
      if (where.tokenHash !== activeHash) return { count: 0 };
      activeHash = data.tokenHash;
      return { count: 1 };
    });
    prisma.user.findUnique.mockResolvedValue(publicFields(baseUser()));

    const first = await request(app)
      .post("/auth/refresh")
      .set("Origin", origin)
      .set("Cookie", refreshCookie(oldToken))
      .send({});
    const reused = await request(app)
      .post("/auth/refresh")
      .set("Origin", origin)
      .set("Cookie", refreshCookie(oldToken))
      .send({});

    expect(first.status).toBe(200);
    expect(reused.status).toBe(401);
  });

  test("logout revokes the remembered session and clears cookies", async () => {
    const token = "c".repeat(64);
    const response = await request(app)
      .post("/auth/logout")
      .set("Origin", origin)
      .set("Cookie", refreshCookie(token))
      .send({});
    expect(response.status).toBe(200);
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { tokenHash: hashToken(token) },
    });
    expect(response.headers["set-cookie"].join(";")).toMatch(/Max-Age=0|Expires=/);
  });
});

describe("password recovery", () => {
  test("existing and unknown users receive the same forgot-password response", async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ id: baseUser().id, email: baseUser().email, isActive: true })
      .mockResolvedValueOnce(null);
    prisma.passwordResetToken.create.mockResolvedValue({});

    const existing = await request(app)
      .post("/auth/forgot-password")
      .send({ email: "ana@example.com" });
    const unknown = await request(app)
      .post("/auth/forgot-password")
      .send({ email: "unknown@example.com" });

    expect(existing.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(existing.body).toEqual(unknown.body);
  });

  test("resets a password and revokes remembered sessions", async () => {
    const token = "d".repeat(64);
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: "reset-1",
      userId: baseUser().id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      user: baseUser({ emailVerifiedAt: null }),
    });
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.update.mockResolvedValue({});

    const response = await request(app).post("/auth/reset-password").send({
      token,
      password: newPassword,
      passwordConfirm: newPassword,
    });

    expect(response.status).toBe(200);
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: baseUser().id } });
    expect(prisma.user.update.mock.calls[0][0].data.emailVerifiedAt).toBeInstanceOf(Date);
    expect(prisma.user.update.mock.calls[0][0].data.passwordChangedAt).toBeInstanceOf(Date);
    expect(prisma.passwordHistory.create).not.toHaveBeenCalled();
  });

  test("rejects an expired reset token", async () => {
    const token = "e".repeat(64);
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: "reset-2",
      userId: baseUser().id,
      expiresAt: new Date(Date.now() - 1_000),
      usedAt: null,
      user: baseUser(),
    });
    const response = await request(app).post("/auth/reset-password").send({
      token,
      password: newPassword,
      passwordConfirm: newPassword,
    });
    expect(response.status).toBe(400);
  });

  test("a reset token cannot be reused", async () => {
    const token = "f".repeat(64);
    let usedAt = null;
    prisma.passwordResetToken.findUnique.mockImplementation(async () => ({
      id: "reset-3",
      userId: baseUser().id,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt,
      user: baseUser(),
    }));
    prisma.passwordResetToken.updateMany.mockImplementation(async () => {
      if (usedAt) return { count: 0 };
      usedAt = new Date();
      return { count: 1 };
    });
    prisma.user.update.mockResolvedValue({});

    const body = { token, password: newPassword, passwordConfirm: newPassword };
    const first = await request(app).post("/auth/reset-password").send(body);
    const reused = await request(app).post("/auth/reset-password").send(body);
    expect(first.status).toBe(200);
    expect(reused.status).toBe(400);
  });
});

describe("password lifetime and history", () => {
  const expiredAt = () => new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);

  test("blocks normal protected operations when the password has expired", async () => {
    prisma.user.findUnique.mockResolvedValue(publicFields(baseUser({
      role: "ADMIN",
      passwordChangedAt: expiredAt(),
    })));

    const response = await request(app).get("/users").set("Cookie", authCookie());

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("PASSWORD_CHANGE_REQUIRED");
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  test("allows an expired user to change the password", async () => {
    const expiredUser = baseUser({ passwordChangedAt: expiredAt() });
    prisma.user.findUnique
      .mockResolvedValueOnce(publicFields(expiredUser))
      .mockResolvedValueOnce(expiredUser);
    prisma.user.update.mockResolvedValue({});

    const response = await request(app)
      .put("/auth/me/password")
      .set("Origin", origin)
      .set("Cookie", authCookie())
      .send({
        currentPassword: validPassword,
        newPassword,
        newPasswordConfirm: newPassword,
      });

    expect(response.status).toBe(200);
    expect(prisma.passwordHistory.create).toHaveBeenCalledTimes(1);
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: expiredUser.id } });
  });

  test("rejects any of the three most recently used passwords", async () => {
    const user = baseUser();
    prisma.user.findUnique
      .mockResolvedValueOnce(publicFields(user))
      .mockResolvedValueOnce(user);
    prisma.passwordHistory.findMany.mockResolvedValue([
      { passwordHash: olderPasswordHash },
    ]);

    const response = await request(app)
      .put("/auth/me/password")
      .set("Origin", origin)
      .set("Cookie", authCookie())
      .send({
        currentPassword: validPassword,
        newPassword: olderPassword,
        newPasswordConfirm: olderPassword,
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/tres últimas/i);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("roles", () => {
  test("a USER cannot list users", async () => {
    prisma.user.findUnique.mockResolvedValue(publicFields(baseUser()));
    const response = await request(app).get("/users").set("Cookie", authCookie());
    expect(response.status).toBe(403);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  test("an ADMIN can list paginated users", async () => {
    const admin = baseUser({ role: "ADMIN" });
    prisma.user.findUnique.mockResolvedValue(publicFields(admin));
    prisma.user.findMany.mockResolvedValue([publicFields(admin)]);
    prisma.user.count.mockResolvedValue(1);

    const response = await request(app).get("/users?page=1&limit=20").set("Cookie", authCookie());
    expect(response.status).toBe(200);
    expect(response.body.users).toHaveLength(1);
    expect(response.body.pagination.total).toBe(1);
  });

  test("a SUPERADMIN can list users", async () => {
    const superAdmin = baseUser({ role: "SUPERADMIN" });
    prisma.user.findUnique.mockResolvedValue(publicFields(superAdmin));
    prisma.user.findMany.mockResolvedValue([publicFields(superAdmin)]);
    prisma.user.count.mockResolvedValue(1);

    const response = await request(app).get("/users").set("Cookie", authCookie());
    expect(response.status).toBe(200);
    expect(response.body.users[0].role).toBe("SUPERADMIN");
  });

  test("an ADMIN cannot assign SUPERADMIN", async () => {
    const admin = baseUser({ role: "ADMIN" });
    const target = baseUser({
      id: "22222222-2222-4222-8222-222222222222",
      email: "target@example.com",
    });
    prisma.user.findUnique
      .mockResolvedValueOnce(publicFields(admin))
      .mockResolvedValueOnce(target);

    const response = await request(app)
      .patch(`/users/${target.id}`)
      .set("Origin", origin)
      .set("Cookie", authCookie())
      .send({ role: "SUPERADMIN" });

    expect(response.status).toBe(403);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test("a SUPERADMIN can assign SUPERADMIN", async () => {
    const superAdmin = baseUser({ role: "SUPERADMIN" });
    const target = baseUser({
      id: "33333333-3333-4333-8333-333333333333",
      email: "target-super@example.com",
    });
    prisma.user.findUnique
      .mockResolvedValueOnce(publicFields(superAdmin))
      .mockResolvedValueOnce(target);
    prisma.user.update.mockResolvedValue(publicFields({ ...target, role: "SUPERADMIN" }));

    const response = await request(app)
      .patch(`/users/${target.id}`)
      .set("Origin", origin)
      .set("Cookie", authCookie())
      .send({ role: "SUPERADMIN" });

    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe("SUPERADMIN");
  });
});

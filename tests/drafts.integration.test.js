import { jest } from "@jest/globals";
import request from "supertest";
import { app } from "../src/app.js";
import { draftConfig } from "../src/config/draft.js";
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
const draftId = "99999999-9999-4999-8999-999999999999";
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

function draft(overrides = {}) {
  return {
    id: draftId,
    campaignId,
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
    clientRecord: client(),
    campaignRecord: campaign(),
    draftRecord: null,
    user: {
      findUnique: jest.fn(),
    },
    membership: {
      findFirst: jest.fn(),
    },
    campaign: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    draft: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  prisma.user.findUnique.mockImplementation(async () => authUser(prisma.globalRole));

  prisma.membership.findFirst.mockImplementation(async ({ where }) =>
    where.userId === userId && where.organizationId === organizationId
      ? { id: membershipId, role: prisma.actorRole }
      : null);

  prisma.campaign.findFirst.mockImplementation(async ({ where }) => {
    if (where.id !== prisma.campaignRecord.id) return null;
    if (where.archivedAt === null && prisma.campaignRecord.archivedAt !== null) return null;
    if (where.client?.is?.archivedAt === null && prisma.clientRecord.archivedAt !== null) return null;
    return {
      ...prisma.campaignRecord,
      client: { organizationId: prisma.clientRecord.organizationId },
    };
  });

  prisma.campaign.update.mockImplementation(async ({ data }) => {
    prisma.campaignRecord = { ...prisma.campaignRecord, ...data, updatedAt: new Date() };
    return prisma.campaignRecord;
  });

  prisma.draft.findUnique.mockImplementation(async ({ where }) =>
    prisma.draftRecord?.campaignId === where.campaignId ? prisma.draftRecord : null);

  prisma.draft.upsert.mockImplementation(async ({ create, update }) => {
    if (prisma.draftRecord) {
      prisma.draftRecord = { ...prisma.draftRecord, ...update, updatedAt: new Date() };
    } else {
      prisma.draftRecord = draft({
        campaignId: create.campaignId,
        htmlOriginal: create.htmlOriginal,
        htmlCurrent: create.htmlCurrent,
      });
    }
    return prisma.draftRecord;
  });

  prisma.draft.update.mockImplementation(async ({ data }) => {
    prisma.draftRecord = { ...prisma.draftRecord, ...data, updatedAt: new Date() };
    return prisma.draftRecord;
  });

  prisma.$transaction = jest.fn(async (callback) => callback(prisma));
  return prisma;
}

function authCookie() {
  return `${security.accessCookieName}=${createAccessToken(userId)}`;
}

function draftRequest(method, suffix = "") {
  return request(app)
    [method](`/api/v1/campaigns/${campaignId}/draft${suffix}`)
    .set("Origin", origin)
    .set("Cookie", authCookie());
}

function attachHtml({ filename = "email.html", contentType = "text/html", content = initialHtml } = {}) {
  return draftRequest("post", "/import").attach("file", Buffer.from(content), {
    filename,
    contentType,
  });
}

let prisma;

beforeEach(() => {
  prisma = createPrismaMock();
  setPrismaClientForTests(prisma);
});

describe("draft creation and replacement", () => {
  test.each(["OWNER", "ADMIN", "EDITOR"])("a %s can create a draft", async (role) => {
    prisma.actorRole = role;

    const response = await draftRequest("put").send({ html: initialHtml });

    expect(response.status).toBe(201);
    expect(response.body.draft.htmlOriginal).toBe(initialHtml);
    expect(response.body.draft.htmlCurrent).toBe(initialHtml);
  });

  test("a VIEWER cannot create a draft", async () => {
    prisma.actorRole = "VIEWER";

    const response = await draftRequest("put").send({ html: initialHtml });

    expect(response.status).toBe(403);
    expect(prisma.draft.upsert).not.toHaveBeenCalled();
  });

  test("a global administrator cannot bypass a VIEWER organization role", async () => {
    prisma.globalRole = "SUPERADMIN";
    prisma.actorRole = "VIEWER";

    const response = await draftRequest("put").send({ html: initialHtml });

    expect(response.status).toBe(403);
    expect(prisma.draft.upsert).not.toHaveBeenCalled();
  });

  test("an unauthenticated user cannot create a draft", async () => {
    const response = await request(app)
      .put(`/api/v1/campaigns/${campaignId}/draft`)
      .set("Origin", origin)
      .send({ html: initialHtml });

    expect(response.status).toBe(401);
    expect(prisma.draft.upsert).not.toHaveBeenCalled();
  });

  test("associates the draft with the campaign from the URL", async () => {
    await draftRequest("put").send({ html: initialHtml });

    expect(prisma.draft.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { campaignId },
      create: expect.objectContaining({ campaignId }),
    }));
  });

  test("replaces the same draft instead of creating a second one", async () => {
    const firstResponse = await draftRequest("put").send({ html: initialHtml });
    const secondResponse = await draftRequest("put").send({ html: editedHtml });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.draft.id).toBe(firstResponse.body.draft.id);
    expect(secondResponse.body.draft.htmlOriginal).toBe(editedHtml);
    expect(secondResponse.body.draft.htmlCurrent).toBe(editedHtml);
  });

  test("cannot create a draft in a campaign from another organization", async () => {
    prisma.clientRecord = client({ organizationId: otherOrganizationId });

    const response = await draftRequest("put").send({ html: initialHtml });

    expect(response.status).toBe(404);
    expect(prisma.draft.upsert).not.toHaveBeenCalled();
  });

  test("cannot create a draft in an archived campaign", async () => {
    prisma.campaignRecord = campaign({ archivedAt: new Date() });

    const response = await draftRequest("put").send({ html: initialHtml });

    expect(response.status).toBe(404);
    expect(prisma.draft.upsert).not.toHaveBeenCalled();
  });

  test("cannot create a draft when the client is archived", async () => {
    prisma.clientRecord = client({ archivedAt: new Date() });

    const response = await draftRequest("put").send({ html: initialHtml });

    expect(response.status).toBe(404);
    expect(prisma.draft.upsert).not.toHaveBeenCalled();
  });
});

describe("draft reading", () => {
  test.each(["OWNER", "ADMIN", "EDITOR", "VIEWER"])("a %s can read their draft", async (role) => {
    prisma.actorRole = role;
    prisma.draftRecord = draft();

    const response = await draftRequest("get");

    expect(response.status).toBe(200);
    expect(response.body.draft.htmlCurrent).toBe(initialHtml);
  });

  test("returns a controlled 404 when no draft exists", async () => {
    const response = await draftRequest("get");

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("Borrador no encontrado");
  });

  test("cannot read a draft from another organization", async () => {
    prisma.clientRecord = client({ organizationId: otherOrganizationId });
    prisma.draftRecord = draft();

    const response = await draftRequest("get");

    expect(response.status).toBe(404);
    expect(prisma.draft.findUnique).not.toHaveBeenCalled();
  });

  test.each(["campaign", "client"])("does not expose a draft when its %s is archived", async (resource) => {
    prisma.draftRecord = draft();
    if (resource === "campaign") prisma.campaignRecord = campaign({ archivedAt: new Date() });
    if (resource === "client") prisma.clientRecord = client({ archivedAt: new Date() });

    const response = await draftRequest("get");

    expect(response.status).toBe(404);
    expect(prisma.draft.findUnique).not.toHaveBeenCalled();
  });
});

describe("draft HTML validation", () => {
  test("rejects empty HTML", async () => {
    const response = await draftRequest("put").send({ html: "   \n" });

    expect(response.status).toBe(400);
    expect(prisma.draft.upsert).not.toHaveBeenCalled();
  });

  test("rejects HTML above the centralized byte limit", async () => {
    const oversizedHtml = `<html><body>${"a".repeat(draftConfig.htmlMaxBytes)}</body></html>`;

    const response = await draftRequest("put").send({ html: oversizedHtml });

    expect(response.status).toBe(400);
    expect(prisma.draft.upsert).not.toHaveBeenCalled();
  });

  test("rejects content that does not look like HTML", async () => {
    const response = await draftRequest("put").send({ html: "Esto es solamente texto" });

    expect(response.status).toBe(400);
    expect(prisma.draft.upsert).not.toHaveBeenCalled();
  });

  test.each(["campaignId", "draftId"])("rejects the unknown field %s", async (field) => {
    const response = await draftRequest("put").send({ html: initialHtml, [field]: campaignId });

    expect(response.status).toBe(400);
    expect(prisma.draft.upsert).not.toHaveBeenCalled();
  });
});

describe("draft editing", () => {
  test.each(["OWNER", "ADMIN", "EDITOR"])("a %s can edit htmlCurrent", async (role) => {
    prisma.actorRole = role;
    prisma.draftRecord = draft();

    const response = await draftRequest("patch").send({ htmlCurrent: editedHtml });

    expect(response.status).toBe(200);
    expect(response.body.draft.htmlCurrent).toBe(editedHtml);
    expect(response.body.draft.htmlOriginal).toBe(initialHtml);
  });

  test("a VIEWER cannot edit htmlCurrent", async () => {
    prisma.actorRole = "VIEWER";
    prisma.draftRecord = draft();

    const response = await draftRequest("patch").send({ htmlCurrent: editedHtml });

    expect(response.status).toBe(403);
    expect(prisma.draft.update).not.toHaveBeenCalled();
  });

  test("cannot edit a draft from another organization", async () => {
    prisma.clientRecord = client({ organizationId: otherOrganizationId });
    prisma.draftRecord = draft();

    const response = await draftRequest("patch").send({ htmlCurrent: editedHtml });

    expect(response.status).toBe(404);
    expect(prisma.draft.update).not.toHaveBeenCalled();
  });

  test("returns 404 when attempting to edit a missing draft", async () => {
    const response = await draftRequest("patch").send({ htmlCurrent: editedHtml });

    expect(response.status).toBe(404);
    expect(prisma.draft.update).not.toHaveBeenCalled();
  });

  test.each(["campaign", "client"])("cannot edit when the %s is archived", async (resource) => {
    prisma.draftRecord = draft();
    if (resource === "campaign") prisma.campaignRecord = campaign({ archivedAt: new Date() });
    if (resource === "client") prisma.clientRecord = client({ archivedAt: new Date() });

    const response = await draftRequest("patch").send({ htmlCurrent: editedHtml });

    expect(response.status).toBe(404);
    expect(prisma.draft.update).not.toHaveBeenCalled();
  });

  test("does not allow campaignId to be modified", async () => {
    prisma.draftRecord = draft();

    const response = await draftRequest("patch").send({
      htmlCurrent: editedHtml,
      campaignId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    expect(response.status).toBe(400);
    expect(prisma.draft.update).not.toHaveBeenCalled();
  });
});

describe("HTML file import", () => {
  test.each(["email.html", "email.htm"])("imports a valid %s file", async (filename) => {
    const response = await attachHtml({ filename });

    expect(response.status).toBe(201);
    expect(response.body.draft.htmlOriginal).toBe(initialHtml);
    expect(response.body.draft.htmlCurrent).toBe(initialHtml);
  });

  test("accepts an inconclusive text/plain MIME when extension and content are valid", async () => {
    const response = await attachHtml({ contentType: "text/plain" });

    expect(response.status).toBe(201);
    expect(response.body.draft.htmlCurrent).toBe(initialHtml);
  });

  test("replaces both HTML fields when importing over an existing draft", async () => {
    prisma.draftRecord = draft();

    const response = await attachHtml({ content: editedHtml });

    expect(response.status).toBe(200);
    expect(response.body.draft.htmlOriginal).toBe(editedHtml);
    expect(response.body.draft.htmlCurrent).toBe(editedHtml);
  });

  test("rejects an unsupported extension", async () => {
    const response = await attachHtml({ filename: "email.txt" });

    expect(response.status).toBe(400);
    expect(prisma.draft.upsert).not.toHaveBeenCalled();
  });

  test("rejects a reliable non-HTML MIME type", async () => {
    const response = await attachHtml({ filename: "email.html", contentType: "image/png" });

    expect(response.status).toBe(400);
    expect(prisma.draft.upsert).not.toHaveBeenCalled();
  });

  test("rejects an empty file", async () => {
    const response = await attachHtml({ content: "" });

    expect(response.status).toBe(400);
    expect(prisma.draft.upsert).not.toHaveBeenCalled();
  });

  test("rejects a file above the byte limit", async () => {
    const content = Buffer.alloc(draftConfig.htmlMaxBytes + 1, "a");
    content.write("<html>");

    const response = await draftRequest("post", "/import").attach("file", content, {
      filename: "email.html",
      contentType: "text/html",
    });

    expect(response.status).toBe(413);
    expect(prisma.draft.upsert).not.toHaveBeenCalled();
  });

  test("rejects a file that is not valid UTF-8", async () => {
    const response = await draftRequest("post", "/import").attach(
      "file",
      Buffer.from([0xc3, 0x28]),
      { filename: "email.html", contentType: "text/html" },
    );

    expect(response.status).toBe(400);
    expect(prisma.draft.upsert).not.toHaveBeenCalled();
  });

  test("rejects an import without a file", async () => {
    const response = await draftRequest("post", "/import")
      .set("Content-Type", "multipart/form-data; boundary=missing-file");

    expect(response.status).toBe(400);
    expect(prisma.draft.upsert).not.toHaveBeenCalled();
  });

  test("a VIEWER cannot import HTML", async () => {
    prisma.actorRole = "VIEWER";

    const response = await attachHtml();

    expect(response.status).toBe(403);
    expect(prisma.draft.upsert).not.toHaveBeenCalled();
  });

  test("cannot import HTML into a campaign from another organization", async () => {
    prisma.clientRecord = client({ organizationId: otherOrganizationId });

    const response = await attachHtml();

    expect(response.status).toBe(404);
    expect(prisma.draft.upsert).not.toHaveBeenCalled();
  });
});

describe("draft preservation", () => {
  test("archiving a campaign does not delete its draft", async () => {
    prisma.draftRecord = draft();

    const response = await request(app)
      .delete(`/api/v1/campaigns/${campaignId}`)
      .set("Origin", origin)
      .set("Cookie", authCookie());

    expect(response.status).toBe(200);
    expect(prisma.campaignRecord.archivedAt).toBeTruthy();
    expect(prisma.draftRecord).not.toBeNull();
    expect(prisma.draft.delete).not.toHaveBeenCalled();
  });
});

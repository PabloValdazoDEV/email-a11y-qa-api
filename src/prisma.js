import { PrismaClient } from "@prisma/client";

let prismaClient = new PrismaClient();

export function getPrisma() {
  return prismaClient;
}

export function setPrismaClientForTests(client) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Prisma client replacement is only allowed in tests");
  }
  prismaClient = client;
}

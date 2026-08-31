import { app } from "./app.js";
import { env } from "./config/env.js";
import { getPrisma } from "./prisma.js";

const prisma = getPrisma();

await prisma.$connect();

const server = app.listen(env.PORT, env.BIND_HOST, () => {
  console.warn(`${env.APP_NAME} API listening on http://${env.BIND_HOST}:${env.PORT}`);
});

async function shutdown(signal) {
  console.warn(`${signal} received; closing server`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

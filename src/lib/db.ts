import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "@/lib/env";

function sqlitePath(url: string): string {
  return url.startsWith("file:") ? url.slice("file:".length) : url;
}

function createClient() {
  const adapter = new PrismaBetterSqlite3({ url: sqlitePath(env.databaseUrl) });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as { __prisma?: ReturnType<typeof createClient> };

/** Jedna instancja klienta na proces (także przy hot reload w trybie dev). */
export const db = globalForPrisma.__prisma ?? createClient();
globalForPrisma.__prisma = db;

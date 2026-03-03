/**
 * Prisma client singleton — prevents multiple instances during Next.js hot reload.
 * Uses the @prisma/adapter-pg driver adapter required by Prisma v7.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function parseDatabaseHost(connectionString: string): string | undefined {
  try {
    return new URL(connectionString).hostname;
  } catch {
    return undefined;
  }
}

function logDatabaseTarget(hostname: string | undefined) {
  if (process.env.NODE_ENV === "production") return;

  if (!hostname) {
    console.warn("[prisma] Could not parse database hostname from DATABASE_URL");
    return;
  }

  const isSupabaseHost = hostname.endsWith(".supabase.co");
  console.info(
    `[prisma] Using ${isSupabaseHost ? "Supabase" : "non-Supabase"} database host: ${hostname}`,
  );

  if (!isSupabaseHost) {
    console.warn(
      "[prisma] DATABASE_URL is not pointing to a Supabase host. Check local env configuration.",
    );
  }
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  logDatabaseTarget(parseDatabaseHost(connectionString));

  // Strip sslmode from the URL so the pg driver doesn't upgrade it to verify-full,
  // then configure SSL explicitly with rejectUnauthorized: false for Supabase certs.
  const url = new URL(connectionString);
  url.searchParams.delete("sslmode");
  const cleanConnectionString = url.toString();

  const adapter = new PrismaPg({
    connectionString: cleanConnectionString,
    ssl: { rejectUnauthorized: false },
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

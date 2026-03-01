import { prisma } from "@/lib/prisma";

/**
 * Resolves effective property IDs for filtering when portfolioId and/or propertyId are supplied.
 * - If portfolioId: return property IDs in that portfolio (scoped to userId).
 * - If propertyId: return [propertyId] (narrower filter).
 * - If both: return [propertyId] only if propertyId is in the portfolio, else [].
 * - If neither: return null (no property filter).
 */
export async function resolvePropertyIdsForFilter(
  userId: string,
  portfolioId: string | null,
  propertyId: string | null
): Promise<string[] | null> {
  if (propertyId && !portfolioId) {
    return [propertyId];
  }
  if (!portfolioId) {
    return null;
  }

  // Verify portfolio belongs to user
  const portfolio = await prisma.portfolio.findFirst({
    where: { id: portfolioId, userId },
    include: { properties: { select: { propertyId: true } } },
  });
  if (!portfolio) return null;

  const ids = portfolio.properties.map((p) => p.propertyId);
  if (ids.length === 0) return [];

  if (propertyId) {
    return ids.includes(propertyId) ? [propertyId] : [];
  }
  return ids;
}

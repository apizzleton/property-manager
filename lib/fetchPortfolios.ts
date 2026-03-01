/**
 * Safely fetch portfolios from the API.
 * Handles empty responses and non-JSON (e.g. error pages) to avoid runtime crashes.
 */
export async function fetchPortfolios(): Promise<{
  id: string;
  name: string;
  description: string | null;
  propertyIds: string[];
  propertyCount: number;
}[]> {
  const r = await fetch("/api/portfolios");
  const text = await r.text();
  if (!text) return [];
  try {
    const data = JSON.parse(text);
    return Array.isArray(data)
      ? data.map((p: { id: string; name: string; description?: string | null; propertyIds?: string[]; propertyCount?: number }) => {
          const ids = p.propertyIds ?? [];
          return {
            id: p.id,
            name: p.name,
            description: p.description ?? null,
            propertyIds: ids,
            propertyCount: p.propertyCount ?? ids.length,
          };
        })
      : [];
  } catch {
    return [];
  }
}

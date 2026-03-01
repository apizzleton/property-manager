/**
 * Safely fetch user-managed asset categories.
 */
export async function fetchAssetCategories(): Promise<{ id: string; name: string }[]> {
  const res = await fetch("/api/asset-categories");
  if (!res.ok) return [];
  const text = await res.text();
  if (!text) return [];
  try {
    const data = JSON.parse(text);
    return Array.isArray(data)
      ? data
          .map((category: { id?: string; name?: string }) => ({
            id: category.id ?? "",
            name: category.name?.trim() ?? "",
          }))
          .filter((category) => category.id && category.name)
      : [];
  } catch {
    return [];
  }
}

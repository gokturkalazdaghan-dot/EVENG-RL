/** Keyless endpoints from public-apis/public-apis. Fail silent. */

export type MuseumScene = { id: string; name: string; image: string; prompt: string };

const T = 4500;

async function grab(url: string): Promise<Response | null> {
  try {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), T);
    const res = await fetch(url, { signal: ctrl.signal });
    window.clearTimeout(t);
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

export async function fetchMuseumScenes(limit = 6): Promise<MuseumScene[]> {
  const res = await grab(
    "https://api.artic.edu/api/v1/artworks/search?q=portrait%20woman%20garden&fields=id,title,image_id&limit=12",
  );
  if (!res) return picsumScenes(limit);
  try {
    const json = (await res.json()) as { data?: { id: number; title: string; image_id: string | null }[] };
    const out: MuseumScene[] = [];
    for (const row of json.data || []) {
      if (!row.image_id) continue;
      out.push({
        id: `aic-${row.id}`,
        name: (row.title || "Müze").slice(0, 28),
        image: `https://www.artic.edu/iiif/2/${row.image_id}/full/843,/0/default.jpg`,
        prompt: `${row.title}, museum gallery light, painterly portrait backdrop`,
      });
      if (out.length >= limit) break;
    }
    return out.length ? out : picsumScenes(limit);
  } catch {
    return picsumScenes(limit);
  }
}

function picsumScenes(limit: number): MuseumScene[] {
  const ids = [1015, 1016, 1018, 1025, 1036, 1043, 106, 129];
  return ids.slice(0, limit).map((id, i) => ({
    id: `picsum-${id}`,
    name: ["Sis", "Deniz", "Dağ", "Çiçek", "Sokak", "Altın", "Göl", "Tül"][i] || "Fon",
    image: `https://picsum.photos/id/${id}/800/1200`,
    prompt: "cinematic natural light portrait backdrop",
  }));
}

export async function fetchCanonBooks(kind: "coffee" | "palm" | "dream"): Promise<string[]> {
  const q = kind === "coffee" ? "coffee+divination" : kind === "palm" ? "palmistry" : "dream+interpretation";
  const res = await grab(`https://gutendex.com/books?search=${q}`);
  if (!res) return [];
  try {
    const json = (await res.json()) as { results?: { title?: string; authors?: { name?: string }[] }[] };
    return (json.results || [])
      .slice(0, 6)
      .map((b) => {
        const who = b.authors?.[0]?.name ? ` · ${b.authors[0].name}` : "";
        return `${(b.title || "Book").slice(0, 42)}${who}`;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function fetchLightHint(): Promise<string> {
  const res = await grab(
    "https://api.open-meteo.com/v1/forecast?latitude=37.91&longitude=40.23&current=weather_code,cloud_cover,is_day",
  );
  if (!res) return "";
  try {
    const json = (await res.json()) as { current?: { weather_code?: number; cloud_cover?: number; is_day?: number } };
    const c = json.current || {};
    if (c.is_day === 0) return "night window light, soft practical lamps";
    if ((c.cloud_cover || 0) > 70) return "overcast north light, even softbox sky";
    if ((c.weather_code || 0) >= 51) return "rain-wet reflections, cool rim light";
    return "clear golden-hour sun on cheek";
  } catch {
    return "";
  }
}

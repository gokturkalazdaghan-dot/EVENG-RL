import { createServerFn } from "@tanstack/react-start";

async function grab(url: string, ms = 5000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") || "";
    if (type.includes("json")) return await res.json();
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function asRecord(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

export type PublicSpark = {
  glow: string;
  tarot: string;
  meaning: string;
  coffee: string;
};

export const fetchSpark = createServerFn({ method: "POST" }).handler(async (): Promise<PublicSpark> => {
  const { gate } = await import("./shield.server");
  const g = gate("spark", 20, 60_000);
  if (!g.ok) return { glow: "", tarot: "", meaning: "", coffee: "" };
  const [advice, affirm, tarot, coffee] = await Promise.all([
    grab("https://api.adviceslip.com/advice"),
    grab("https://www.affirmations.dev/"),
    grab("https://tarotapi.dev/api/v1/cards/random?n=1"),
    grab("https://coffee.alexflipnote.dev/random.json"),
  ]);
  const slip = asRecord(asRecord(advice).slip);
  const cards = Array.isArray(asRecord(tarot).cards) ? (asRecord(tarot).cards as Record<string, unknown>[]) : [];
  const card = cards[0] || {};
  return {
    glow: String(asRecord(affirm).affirmation || slip.advice || "Nefes al. Fal oturuyor."),
    tarot: String(card.name || ""),
    meaning: String(card.meaning_up || "").slice(0, 220),
    coffee: String(asRecord(coffee).file || ""),
  };
});

export const fetchWeather = createServerFn({ method: "POST" })
  .validator((d: { lat?: number; lon?: number }) => d || {})
  .handler(async ({ data }) => {
    const { gate } = await import("./shield.server");
    const g = gate("weather", 20, 60_000);
    if (!g.ok) return { ok: true as const, line: "" };
    const lat = Number.isFinite(data.lat) ? data.lat : 37.91;
    const lon = Number.isFinite(data.lon) ? data.lon : 40.23;
    const raw = await grab(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`,
    );
    const cur = asRecord(asRecord(raw).current);
    const code = Number(cur.weather_code);
    const sky =
      code === 0 ? "açık gökyüzü" : code < 3 ? "az bulut" : code < 50 ? "yumuşak örtü" : code < 70 ? "yağmur ışığı" : "serin hava";
    const temp = cur.temperature_2m;
    return {
      ok: true as const,
      line: temp != null ? `${sky} · ${Math.round(Number(temp))}°` : sky,
    };
  });

export const fetchScenes = createServerFn({ method: "POST" }).handler(async () => {
  const { gate } = await import("./shield.server");
  const g = gate("scenes", 10, 60_000);
  if (!g.ok) return [];
  const [picsum, art] = await Promise.all([
    grab("https://picsum.photos/v2/list?page=4&limit=8"),
    grab("https://api.artic.edu/api/v1/artworks/search?q=portrait%20woman&fields=id,title,image_id&limit=6"),
  ]);
  const scenes: { id: string; name: string; image: string }[] = [];
  if (Array.isArray(picsum)) {
    for (const row of picsum as Record<string, unknown>[]) {
      const id = String(row.id || "");
      if (!id) continue;
      scenes.push({
        id: `picsum-${id}`,
        name: String(row.author || "Manzara"),
        image: `https://picsum.photos/id/${id}/720/960`,
      });
    }
  }
  const data = asRecord(art).data;
  if (Array.isArray(data)) {
    for (const row of data as Record<string, unknown>[]) {
      const imageId = String(row.image_id || "");
      if (!imageId) continue;
      scenes.push({
        id: `artic-${row.id}`,
        name: String(row.title || "Portre"),
        image: `https://www.artic.edu/iiif/2/${imageId}/full/720,/0/default.jpg`,
      });
    }
  }
  return scenes.slice(0, 12);
});

import { createServerFn } from "@tanstack/react-start";
import { agentCanon, ORACLE_AGENTS } from "./oracle-canon";
import { fetchTimed } from "./timed";
import { temperamentFromDate } from "./natal";

export type OracleKind = "coffee" | "palm" | "dream";

export type OracleLetter = {
  title: string;
  omen: string;
  seen: string;
  love: string;
  path: string;
  body: string;
  near: string;
  counsel: string;
  canon: string;
  /**
   * Kullanılan kitaplar.
   *
   * KULLANICIYA GÖSTERİLMEZ — ürün kararı. Alan duruyor çünkü okumanın
   * gerçekten hangi külliyata dayandığını kayıtta tutmak, ileride bir
   * yorumun nereden geldiğini sormak gerektiğinde tek kanıt. Ekranda
   * basılmaz (bkz. oracle-screen.tsx).
   */
  sources: string;
  agent: string;
  /**
   * Kişinin huyu — okumanın kişiye oturan kısmı.
   *
   * Kaynağı kullanıcıya SÖYLENMEZ (bkz. natal.ts). Boşsa doğum tarihi
   * girilmemiş demektir ve ekranda o bölüm hiç çıkmaz.
   */
  character?: string;
};

function clean(raw: unknown, max = 900) {
  return String(raw ?? "")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function langName(code: string) {
  const map: Record<string, string> = {
    tr: "Turkish",
    en: "English",
    es: "Spanish",
    de: "German",
    fr: "French",
    pt: "Portuguese",
    ar: "Arabic",
    id: "Indonesian",
    ja: "Japanese",
  };
  return map[code] || "English";
}

function asText(raw: unknown) {
  if (Array.isArray(raw)) return raw.map((x) => String(x)).filter(Boolean).join(" · ");
  return clean(raw, 900);
}

function parseLetter(raw: unknown, agent: string): OracleLetter | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const omen = asText(o.omen);
  const title = asText(o.title);
  if (!omen && !title) return null;
  return {
    title: title || omen.slice(0, 48),
    omen,
    seen: asText(o.seen),
    love: asText(o.love),
    path: asText(o.path),
    body: asText(o.body),
    near: asText(o.near),
    counsel: asText(o.counsel),
    canon: asText(o.canon),
    sources: asText(o.sources),
    agent: asText(o.agent) || agent,
    character: asText(o.character) || undefined,
  };
}

export const readOracle = createServerFn({ method: "POST" })
  .validator((input: { kind: OracleKind; locale?: string; image?: string; images?: string[]; dream?: string; birthDate?: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true; letter: OracleLetter } | { ok: false; error: string }> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false, error: "Reading is closed right now." };
    const { gate } = await import("./shield.server");
    const g = gate("oracle", 5, 10 * 60_000);
    if (!g.ok) return { ok: false, error: g.error };
    const kind: OracleKind = data.kind === "palm" || data.kind === "dream" ? data.kind : "coffee";
    const locale = clean(data.locale, 8) || "en";
    const dream = clean(data.dream, 900);
    const plates = (Array.isArray(data.images) ? data.images : [data.image])
      .filter((src): src is string => typeof src === "string" && src.startsWith("data:image"))
      .slice(0, 3);
    if (kind === "dream" && dream.length < 12) return { ok: false, error: "Write the dream in a few sentences." };
    if (kind === "coffee" && plates.length < 3) return { ok: false, error: "Three angles of the cup are required." };
    if (kind === "palm" && plates.length < 1) return { ok: false, error: "A clear palm photo is required." };

    const agent = ORACLE_AGENTS[kind];

    /**
     * Kişinin huyu — kaynağı MODELE de söylenmez biçimde veriliyor.
     *
     * Modele yalnızca huy tarifi gidiyor; hangi sistemden geldiği değil.
     * Böylece model de çıktısında o alanın adını anamaz. Tarih yoksa
     * bölüm hiç eklenmiyor ve okuma sadece külliyattan gelir.
     */
    const temper = temperamentFromDate(clean(data.birthDate, 10));
    const temperBlock = temper
      ? [
          "Bu kişinin huyu (KAYNAĞINI ASLA YAZMA, sistem adı anma):",
          `- ${temper.core}`,
          `- ${temper.heart}`,
          `- ${temper.choice}`,
          `- ${temper.strain}`,
          "Bu huyu okumanın KÜÇÜK bir payına karıştır (yaklaşık üçte bir).",
          "Ağırlık kadim külliyatta ve fotoğrafta/rüyada görülen işarette olsun.",
          "`character` alanına bu huyu sade, ikinci tekil şahısla yaz.",
        ].join("\n")
      : "";

    const schema = [
      "Return JSON only with keys: title, omen, seen, love, path, near, character, sources, agent.",
      `agent must be ${agent.name}.`,
      "VERY SHORT AND PLAIN. Each field one or two short sentences, everyday words.",
      "No essay, no scholarly citations, no jargon, no parenthetical technical notes.",
      "The reader is not a scholar; write the way a fortune teller speaks across a table.",
      "Speak as a kahin to ONE woman sitting with you. Second person. Warm, specific, never generic horoscope.",
      "omen: ONE hook sentence — the most interesting, stop-scrolling claim.",
      "seen: one or two short sentences naming the image/mark.",
      "love, path, near: each 1–2 short sentences. Lead with what the reader cares about (love, news, a choice).",
      "Do NOT mention book titles inside omen/seen/love/path/near.",
      "sources: array of 3–5 book names you actually used. Recorded, NEVER shown to the reader — so never repeat them anywhere else.",
      "character: 1–2 short sentences on who this person is. Omit the field if no temperament was given.",
      "Never name any star sign, zodiac, horoscope or astrological term anywhere in the output.",
      "No body, counsel, or canon fields.",
      temperBlock,
      "No death date, no lottery, no medical diagnosis.",
      `Write every string value in ${langName(locale)}. Keep source book titles in their known names.`,
    ].join(" ");

    const extra =
      kind === "dream"
        ? `Dream summary:\n${dream}`
        : kind === "coffee"
          ? "Three photographs of the SAME cup interior, in order: 1 above/well, 2 handle-wall/house, 3 far wall/world. Name which plate each mark sits on."
          : "One photograph of the inner palm. Read only visible lines and mounts.";

    const text = [agentCanon(kind, dream), schema, extra].join("\n\n");
    const content: unknown[] = [{ type: "text", text }];
    for (const src of plates) content.push({ type: "image_url", image_url: { url: src } });

    let res: Response;
    try {
      res = await fetchTimed(
        "https://api.x.ai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "grok-4.5",
            temperature: 0.32,
            max_tokens: 1700,
            response_format: { type: "json_object" },
            messages: [{ role: "user", content }],
          }),
        },
        55_000,
      );
    } catch {
      return { ok: false, error: "The books would not settle. A clearer plate." };
    }
    if (!res.ok) return { ok: false, error: "The books would not settle. A clearer plate." };
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = body.choices?.[0]?.message?.content;
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    const letter = parseLetter(parsed, agent.name);
    if (!letter) return { ok: false, error: "The books would not settle. A clearer plate." };
    return { ok: true, letter };
  });

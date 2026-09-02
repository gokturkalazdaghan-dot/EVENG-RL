import { createServerFn } from "@tanstack/react-start";
import { fetchTimed } from "./timed";

const IMAGE_MODEL = "grok-imagine-image-2.0";
const VIDEO_MODEL = "grok-imagine-video-1.5";
const HEYGEN = "https://api.heygen.com";
const BFL = "https://api.bfl.ai/v1";

async function blocked(route: string, max: number, windowMs: number) {
  const { gate } = await import("./shield.server");
  const g = gate(route, max, windowMs);
  return g.ok ? null : g.error;
}

function cleanPrompt(raw: unknown, max = 480) {
  return String(raw ?? "")
    .replace(/<\/?[^>]+>/g, "")
    .split("")
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c === 9 || c === 10 || c === 13 || (c >= 32 && c !== 127);
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function heygenKey() {
  return process.env.HEYGEN_API_KEY || "";
}

function bflKey() {
  return process.env.BFL_API_KEY || process.env.BFL_KEY || "";
}

function geminiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
}

function falKey() {
  return process.env.FAL_KEY || process.env.FAL_API_KEY || "";
}

function openaiKey() {
  return process.env.OPENAI_API_KEY || "";
}

function xaiKey() {
  return process.env.XAI_API_KEY || "";
}

type Shot =
  | { ok: true; image: string; engine: string }
  | { ok: false; error: string };

type Clip =
  | { ok: true; video: string; engine: string }
  | { ok: false; error: string };

function fluxSize(ratio = "3:4") {
  if (ratio === "9:16") return { width: 768, height: 1376 };
  if (ratio === "1:1") return { width: 1024, height: 1024 };
  if (ratio === "16:9") return { width: 1376, height: 768 };
  return { width: 768, height: 1024 };
}

function fluxRef(image?: string) {
  if (!image) return "";
  const mark = "base64,";
  const at = image.indexOf(mark);
  if (at >= 0) return image.slice(at + mark.length);
  if (/^https?:\/\//i.test(image)) return image;
  return "";
}

function mimeOf(image?: string) {
  const m = String(image || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
  return m?.[1] || "image/jpeg";
}

async function toDataUrl(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Medya alınamadı");
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type") || "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function unwrap(body: unknown) {
  if (!body || typeof body !== "object") return {} as Record<string, unknown>;
  const rec = body as Record<string, unknown>;
  if (rec.data && typeof rec.data === "object") return rec.data as Record<string, unknown>;
  return rec;
}

async function heygenJson(path: string, init?: RequestInit) {
  const key = heygenKey();
  if (!key) return { ok: false as const, error: "HeyGen kapalı." };
  const res = await fetch(`${HEYGEN}${path}`, {
    ...init,
    headers: {
      "X-Api-Key": key,
      Accept: "application/json",
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers || {}),
    },
  });
  const text = await res.text().catch(() => "");
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg =
      (json && typeof json === "object" && ((json as { error?: { message?: string }; message?: string }).error?.message || (json as { message?: string }).message)) ||
      text.slice(0, 180) ||
      `HeyGen ${res.status}`;
    return { ok: false as const, error: String(msg) };
  }
  return { ok: true as const, data: unwrap(json) };
}

async function uploadFace(image: string) {
  const match = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return { ok: false as const, error: "Yüz görseli okunamadı." };
  const mime = match[1] === "image/png" ? "image/png" : "image/jpeg";
  const buf = Buffer.from(match[2], "base64");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)], { type: mime }), mime === "image/png" ? "face.png" : "face.jpg");
  const res = await heygenJson("/v3/assets", { method: "POST", body: form });
  if (!res.ok) return res;
  const id = String(res.data.asset_id || res.data.id || "");
  if (!id) return { ok: false as const, error: "Görsel yüklenemedi." };
  return { ok: true as const, assetId: id };
}

async function xaiImage(prompt: string, ratio = "3:4", reference?: string) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { ok: false as const, error: "Üretim şu an kapalı." };
  const payload: Record<string, unknown> = {
    model: IMAGE_MODEL,
    prompt,
    n: 1,
    aspect_ratio: ratio,
    response_format: "b64_json",
  };
  if (reference?.startsWith("data:image") || reference?.startsWith("http")) {
    payload.image = { url: reference };
  }
  const res = await fetchTimed(
    "https://api.x.ai/v1/images/generations",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    },
    50_000,
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false as const, error: text.slice(0, 180) || `Görsel hatası ${res.status}` };
  }
  const body = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
  const item = body.data?.[0];
  let image = "";
  if (item?.b64_json) image = `data:image/png;base64,${item.b64_json}`;
  else if (item?.url) image = await toDataUrl(item.url);
  if (!image) return { ok: false as const, error: "Görsel dönmedi." };
  return { ok: true as const, image, engine: "imagine" as const };
}

function pullGeminiImage(json: unknown): string {
  const rec = json as Record<string, unknown>;
  const cand = Array.isArray(rec.candidates) ? rec.candidates[0] : null;
  const content = cand && typeof cand === "object" ? (cand as { content?: { parts?: unknown[] } }).content : null;
  const parts = content?.parts || [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const p = part as Record<string, unknown>;
    const inline = (p.inlineData || p.inline_data) as Record<string, unknown> | undefined;
    const data = inline && typeof inline.data === "string" ? inline.data : "";
    if (!data) continue;
    const mime = String(inline?.mimeType || inline?.mime_type || "image/png");
    return `data:${mime};base64,${data}`;
  }
  return "";
}

async function bananaImage(prompt: string, ratio = "3:4", reference?: string): Promise<Shot> {
  const key = geminiKey();
  if (!key) return { ok: false, error: "Nano Banana kapalı." };
  const parts: Record<string, unknown>[] = [];
  const ref = fluxRef(reference);
  if (ref) parts.push({ inline_data: { mime_type: mimeOf(reference), data: ref } });
  parts.push({ text: prompt });
  const models = ["gemini-3.1-flash-image", "gemini-2.5-flash-image"];
  let last = "Nano Banana yanıt vermedi.";
  for (const model of models) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: { aspectRatio: ratio === "9:16" ? "9:16" : ratio === "1:1" ? "1:1" : ratio === "16:9" ? "16:9" : "3:4" },
        },
      }),
    });
    if (!res.ok) {
      last = (await res.text().catch(() => "")).slice(0, 160) || `Nano Banana ${res.status}`;
      continue;
    }
    const image = pullGeminiImage(await res.json());
    if (image) return { ok: true, image, engine: "nano-banana" };
    last = "Nano Banana görsel dönmedi.";
  }
  return { ok: false, error: last };
}

async function falQueue(model: string, input: Record<string, unknown>) {
  const key = falKey();
  if (!key) return { ok: false as const, error: "fal kapalı." };
  const start = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!start.ok) {
    const text = await start.text().catch(() => "");
    return { ok: false as const, error: text.slice(0, 160) || `fal ${start.status}` };
  }
  const meta = (await start.json()) as { request_id?: string; status_url?: string; response_url?: string };
  const statusUrl = meta.status_url || (meta.request_id ? `https://queue.fal.run/${model}/requests/${meta.request_id}/status` : "");
  const resultUrl = meta.response_url || (meta.request_id ? `https://queue.fal.run/${model}/requests/${meta.request_id}` : "");
  if (!statusUrl || !resultUrl) return { ok: false as const, error: "fal işi alınamadı." };
  for (let i = 0; i < 40; i++) {
    await wait(1500);
    const st = await fetch(statusUrl, { headers: { Authorization: `Key ${key}` } });
    if (!st.ok) continue;
    const body = (await st.json()) as { status?: string };
    const status = String(body.status || "").toUpperCase();
    if (status === "COMPLETED") {
      const done = await fetch(resultUrl, { headers: { Authorization: `Key ${key}` } });
      if (!done.ok) return { ok: false as const, error: `fal result ${done.status}` };
      return { ok: true as const, data: (await done.json()) as Record<string, unknown> };
    }
    if (status === "FAILED" || status === "CANCELLED") return { ok: false as const, error: "fal reddetti." };
  }
  return { ok: false as const, error: "fal zaman aşımı." };
}

function firstUrl(data: Record<string, unknown>): string {
  const images = data.images;
  if (Array.isArray(images) && images[0] && typeof images[0] === "object") {
    const url = (images[0] as { url?: string }).url;
    if (url) return url;
  }
  const image = data.image;
  if (image && typeof image === "object" && typeof (image as { url?: string }).url === "string") {
    return (image as { url: string }).url;
  }
  const video = data.video;
  if (video && typeof video === "object" && typeof (video as { url?: string }).url === "string") {
    return (video as { url: string }).url;
  }
  if (typeof data.video_url === "string") return data.video_url;
  return "";
}

async function falStill(model: string, engine: string, prompt: string, ratio: string, reference?: string): Promise<Shot> {
  if (!falKey()) return { ok: false, error: "fal kapalı." };
  const input: Record<string, unknown> = {
    prompt,
    aspect_ratio: ratio,
    num_images: 1,
    output_format: "jpeg",
  };
  if (reference?.startsWith("http") || reference?.startsWith("data:image")) {
    input.image_url = reference;
    input.image_urls = [reference];
  }
  const run = await falQueue(model, input);
  if (!run.ok) return run;
  const url = firstUrl(run.data);
  if (!url) return { ok: false, error: `${engine} görsel dönmedi.` };
  return { ok: true, image: await toDataUrl(url), engine };
}

async function gptImage(prompt: string, ratio = "3:4", reference?: string): Promise<Shot> {
  const key = openaiKey();
  if (!key) return { ok: false, error: "GPT Image kapalı." };
  const size = ratio === "1:1" ? "1024x1024" : ratio === "16:9" ? "1536x1024" : "1024x1536";
  const path = reference ? "/v1/images/edits" : "/v1/images/generations";
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  let body: BodyInit;
  if (reference?.startsWith("data:image")) {
    const buf = Buffer.from(fluxRef(reference), "base64");
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", prompt);
    form.append("size", size);
    form.append("image", new Blob([new Uint8Array(buf)], { type: mimeOf(reference) }), "face.jpg");
    body = form;
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({ model: "gpt-image-1", prompt, size, n: 1 });
  }
  const res = await fetch(`https://api.openai.com${path}`, { method: "POST", headers, body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: text.slice(0, 160) || `GPT Image ${res.status}` };
  }
  const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
  const item = json.data?.[0];
  if (item?.b64_json) return { ok: true, image: `data:image/png;base64,${item.b64_json}`, engine: "gpt-image" };
  if (item?.url) return { ok: true, image: await toDataUrl(item.url), engine: "gpt-image" };
  return { ok: false, error: "GPT Image görsel dönmedi." };
}

async function makeImage(prompt: string, ratio = "3:4", reference?: string): Promise<Shot> {
  const chain: Array<() => Promise<Shot>> = [];
  if (bflKey()) chain.push(() => fluxImage(prompt, ratio, reference));
  if (geminiKey()) chain.push(() => bananaImage(prompt, ratio, reference));
  if (falKey()) {
    chain.push(() => falStill("fal-ai/nano-banana", "nano-banana", prompt, ratio, reference));
    chain.push(() => falStill("fal-ai/flux-2-pro", "flux-2-pro", prompt, ratio, reference));
    chain.push(() => falStill("fal-ai/bytedance/seedream/v4", "seedream", prompt, ratio, reference));
  }
  if (openaiKey()) chain.push(() => gptImage(prompt, ratio, reference));
  if (xaiKey()) chain.push(() => xaiImage(prompt, ratio, reference));
  let last = "Hiçbir görsel motoru açık değil.";
  for (const run of chain) {
    try {
      const shot = await run();
      if (shot.ok) return shot;
      last = shot.error;
    } catch (err) {
      last = String((err as Error)?.message || err).slice(0, 160);
    }
  }
  return { ok: false, error: last };
}

async function falClip(prompt: string, image?: string, seconds = 10): Promise<Clip> {
  if (!falKey()) return { ok: false, error: "Kling kapalı." };
  const duration = seconds >= 10 ? "10" : "5";
  const model = image
    ? "fal-ai/kling-video/v2.5-turbo/pro/image-to-video"
    : "fal-ai/kling-video/v2.5-turbo/pro/text-to-video";
  const input: Record<string, unknown> = { prompt, duration };
  if (image) input.image_url = image;
  const kling = await falQueue(model, input);
  if (kling.ok) {
    const url = firstUrl(kling.data);
    if (url) return { ok: true, video: url, engine: "kling" };
  }
  const hailuo = await falQueue("fal-ai/minimax-video", { prompt, ...(image ? { image_url: image } : {}) });
  if (hailuo.ok) {
    const url = firstUrl(hailuo.data);
    if (url) return { ok: true, video: url, engine: "hailuo" };
  }
  return { ok: false, error: kling.ok === false ? kling.error : "Kling video dönmedi." };
}

async function fluxImage(prompt: string, ratio = "3:4", reference?: string) {
  const key = bflKey();
  if (!key) return { ok: false as const, error: "Flux kapalı." };
  const { width, height } = fluxSize(ratio);
  const payload: Record<string, unknown> = {
    prompt,
    width,
    height,
    output_format: "jpeg",
    safety_tolerance: 2,
    prompt_upsampling: true,
  };
  const ref = fluxRef(reference);
  if (ref) payload.input_image = ref;
  const start = await fetch(`${BFL}/flux-2-pro`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      "x-key": key,
    },
    body: JSON.stringify(payload),
  });
  if (!start.ok) {
    const text = await start.text().catch(() => "");
    return { ok: false as const, error: text.slice(0, 180) || `Flux ${start.status}` };
  }
  const meta = (await start.json()) as { id?: string; polling_url?: string };
  const pollUrl = meta.polling_url || (meta.id ? `${BFL}/get_result?id=${encodeURIComponent(meta.id)}` : "");
  if (!pollUrl) return { ok: false as const, error: "Flux işi alınamadı." };
  for (let i = 0; i < 36; i++) {
    await wait(1500);
    const poll = await fetch(pollUrl, {
      headers: { accept: "application/json", "x-key": key },
    });
    if (!poll.ok) continue;
    const body = (await poll.json()) as {
      status?: string;
      result?: { sample?: string };
      error?: string;
    };
    const status = String(body.status || "");
    if (status === "Ready" && body.result?.sample) {
      const image = await toDataUrl(body.result.sample);
      return { ok: true as const, image, engine: "flux-2-pro" as const };
    }
    if (status === "Error" || status === "Failed" || status === "Request Moderated") {
      return { ok: false as const, error: body.error || "Flux reddetti." };
    }
  }
  return { ok: false as const, error: "Flux zaman aşımı." };
}

export const generateStill = createServerFn({ method: "POST" })
  .validator((input: { prompt: string; ratio?: string; image?: string }) => input)
  .handler(async ({ data }) => {
    const denied = await blocked("img", 8, 60_000);
    if (denied) return { ok: false as const, error: denied };
    const prompt = cleanPrompt(data.prompt);
    if (prompt.length < 4) return { ok: false as const, error: "Prompt çok kısa." };
    return makeImage(prompt, data.ratio || "3:4", data.image);
  });

export const generateFaceScene = createServerFn({ method: "POST" })
  .validator((input: { image: string; scene: string; name?: string }) => input)
  .handler(async ({ data }) => {
    const denied = await blocked("scene", 10, 10 * 60_000);
    if (denied) return { ok: false as const, error: denied };
    const scene = cleanPrompt(data.scene, 280);
    const prompt = [
      "Professional fashion photography, shot on Hasselblad X2D, 85mm f/1.8.",
      "The SAME woman as the reference photo: keep identity, face, age, eyes, skin, hair, and body.",
      `Place her in this location: ${scene || "cream photography studio"}.`,
      "Replace only the background. Seamless contact shadows, matching light on her face.",
      "Photoreal skin, no plastic, no extra fingers, no warped face, no text.",
    ].join(" ");
    return makeImage(prompt, "3:4", data.image);
  });

export const generateBackdrop = createServerFn({ method: "POST" })
  .validator((input: { image: string; scene: string; name?: string; variant?: string }) => input)
  .handler(async ({ data }) => {
    const denied = await blocked("bg", 8, 10 * 60_000);
    if (denied) return { ok: false as const, error: denied };
    const scene = cleanPrompt(data.scene, 280);
    const twist = cleanPrompt(data.variant, 80);
    const portrait = [
      "Ultra-real beauty campaign still. Keep the EXACT person from the reference: face, identity, age, hair, clothes.",
      `New background only: ${scene}.`,
      twist ? `Variation: ${twist}.` : "Fresh professional plate, not a stock photo.",
      "Match the key light to the new scene. Clean edge between subject and background.",
      "85mm, f/1.8, photoreal, no distortion, no watermark.",
    ].join(" ");
    const withFace = await makeImage(portrait, "3:4", data.image);
    if (withFace.ok) return withFace;
    const plate = await makeImage(
      [
        "Cinematic empty location, no people, no faces, no text.",
        `${scene}.`,
        "Ultra detailed environment photography, 8k, professional color, shallow depth behind a portrait plane.",
      ].join(" "),
      "3:4",
    );
    if (!plate.ok) return withFace;
    return { ok: true as const, image: plate.image, plate: true as const };
  });

export const clinicTreat = createServerFn({ method: "POST" })
  .validator((input: { image: string; prompt: string }) => input)
  .handler(async ({ data }) => {
    const denied = await blocked("clinic", 8, 10 * 60_000);
    if (denied) return { ok: false as const, error: denied };
    const ask = cleanPrompt(data.prompt, 360);
    if (ask.length < 4) return { ok: false as const, error: "Tedavi çok kısa." };
    const prompt = [
      "Photoreal medical-aesthetic portrait. Keep the EXACT person from the reference: identity, age, eyes, face shape, skin tone.",
      ask,
      "Natural clinical result, visible pores, no wax skin, no warped face, no extra features, 85mm beauty dish.",
    ].join(" ");
    return makeImage(prompt, "3:4", data.image);
  });

export const startTalking = createServerFn({ method: "POST" })
  .validator((input: { prompt: string; image?: string; seconds?: number }) => input)
  .handler(async ({ data }) => {
    if (!heygenKey()) return { ok: false as const, error: "Video ajanı kapalı." };
    const denied = await blocked("vid", 4, 10 * 60_000);
    if (denied) return { ok: false as const, error: denied };
    const prompt = cleanPrompt(data.prompt, 900);
    if (prompt.length < 4) return { ok: false as const, error: "Sahne veya metin yaz." };
    const seconds = data.seconds === 60 ? 60 : data.seconds === 30 ? 30 : 15;
    const script = prompt.length > 12 ? prompt : `${prompt}. Keep this clip about ${seconds} seconds.`;
    const files: { type: string; asset_id: string }[] = [];
    if (data.image?.startsWith("data:image")) {
      const up = await uploadFace(data.image);
      if (!up.ok) return up;
      files.push({ type: "asset_id", asset_id: up.assetId });
    }
    const agent = await heygenJson("/v3/video-agents", {
      method: "POST",
      body: JSON.stringify({
        prompt: `Create a ${seconds}-second vertical 9:16 beauty portrait video. Natural speech: ${script}. Soft studio light, keep the person's identity.`,
        ...(files.length ? { files } : {}),
      }),
    });
    if (!agent.ok) return agent;
    const sessionId = String(agent.data.session_id || agent.data.id || "");
    const videoId = agent.data.video_id ? String(agent.data.video_id) : "";
    if (videoId) return { ok: true as const, job: "video" as const, id: videoId };
    if (!sessionId) return { ok: false as const, error: "Ajan oturumu yok." };
    return { ok: true as const, job: "session" as const, id: sessionId };
  });

export const pollTalking = createServerFn({ method: "POST" })
  .validator((input: { job: "video" | "session"; id: string }) => input)
  .handler(async ({ data }) => {
    const denied = await blocked("poll", 40, 60_000);
    if (denied) return { ok: false as const, error: denied };
    if (!heygenKey()) return { ok: false as const, error: "Video ajanı kapalı." };
    const id = cleanPrompt(data.id, 80);
    if (!id) return { ok: false as const, error: "İş yok." };

    let videoId = data.job === "video" ? id : "";
    if (data.job === "session") {
      const sess = await heygenJson(`/v3/video-agents/${id}`);
      if (!sess.ok) return sess;
      const status = String(sess.data.status || "");
      videoId = String(sess.data.video_id || "");
      if (!videoId) return { ok: true as const, status: status || "generating" };
    }

    const vid = await heygenJson(`/v3/videos/${videoId}`);
    if (!vid.ok) return vid;
    const status = String(vid.data.status || "processing");
    if (status === "failed" || status === "error") {
      return { ok: false as const, error: String(vid.data.failure_message || "Video üretilemedi.") };
    }
    const url = String(vid.data.video_url || vid.data.url || "");
    if ((status === "completed" || status === "done") && url) {
      return { ok: true as const, status: "completed", video: url, videoId };
    }
    return { ok: true as const, status: status || "processing", videoId };
  });

export const generateClip = createServerFn({ method: "POST" })
  .validator((input: { prompt: string; image?: string; duration?: number }) => input)
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "Üretim şu an kapalı." };
    const denied = await blocked("xai-vid", 2, 15 * 60_000);
    if (denied) return { ok: false as const, error: denied };
    const prompt = cleanPrompt(data.prompt);
    if (prompt.length < 4) return { ok: false as const, error: "Prompt çok kısa." };
    const duration = data.duration === 15 ? 15 : data.duration === 10 ? 10 : 10;
    const payload: Record<string, unknown> = {
      model: VIDEO_MODEL,
      prompt,
      duration,
    };
    if (data.image?.startsWith("data:image") || data.image?.startsWith("http")) {
      payload.image = { url: data.image, type: "image_url" };
    }
    const start = await fetch("https://api.x.ai/v1/videos/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!start.ok) {
      const text = await start.text().catch(() => "");
      return { ok: false as const, error: text.slice(0, 160) || `Video hatası ${start.status}` };
    }
    const started = (await start.json()) as {
      request_id?: string;
      video?: { url?: string };
      status?: string;
    };
    if (started.video?.url) return { ok: true as const, video: started.video.url, engine: "imagine-video" };
    const id = started.request_id;
    if (!id) return { ok: false as const, error: "Video isteği alınamadı." };
    for (let i = 0; i < 40; i++) {
      await wait(2500);
      const poll = await fetch(`https://api.x.ai/v1/videos/${id}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!poll.ok) continue;
      const body = (await poll.json()) as {
        status?: string;
        video?: { url?: string };
        error?: string;
      };
      if (body.status === "done" && body.video?.url) {
        return { ok: true as const, video: body.video.url, engine: "imagine-video" };
      }
      if (body.status === "failed" || body.status === "expired") {
        return { ok: false as const, error: body.error || "Video üretilemedi." };
      }
    }
    return { ok: false as const, error: "Video zaman aşımı. Tekrar dene." };
  });

export const generateKling = createServerFn({ method: "POST" })
  .validator((input: { prompt: string; image?: string; seconds?: number }) => input)
  .handler(async ({ data }) => {
    if (!falKey()) return { ok: false as const, error: "Kling kapalı." };
    const denied = await blocked("kling", 3, 15 * 60_000);
    if (denied) return { ok: false as const, error: denied };
    const prompt = cleanPrompt(data.prompt);
    if (prompt.length < 4) return { ok: false as const, error: "Prompt çok kısa." };
    const seconds = data.seconds && data.seconds >= 10 ? 10 : 5;
    return falClip(prompt, data.image, seconds);
  });

export const engineStatus = createServerFn({ method: "POST" }).handler(async () => {
  const denied = await blocked("status", 30, 60_000);
  if (denied) return { ok: false as const, image: [], video: [] };
  const image = [
    { id: "flux-2-pro", label: "Flux 2 Pro", on: Boolean(bflKey()) },
    { id: "nano-banana", label: "Nano Banana", on: Boolean(geminiKey() || falKey()) },
    { id: "seedream", label: "Seedream", on: Boolean(falKey()) },
    { id: "gpt-image", label: "GPT Image", on: Boolean(openaiKey()) },
    { id: "imagine", label: "Grok Imagine", on: Boolean(xaiKey()) },
  ];
  const video = [
    { id: "heygen", label: "HeyGen", on: Boolean(heygenKey()) },
    { id: "kling", label: "Kling", on: Boolean(falKey()) },
    { id: "imagine-video", label: "Imagine Video", on: Boolean(xaiKey()) },
  ];
  return { ok: true as const, image, video };
});

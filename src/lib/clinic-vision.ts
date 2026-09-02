import { detectCalib, loadImage, lockCalib, makeCanvas } from "./fx";

type Tilt = { beta: number; gamma: number; ready: boolean };
let TILT: Tilt = { beta: 0, gamma: 0, ready: false };
let sensorOn = false;
let landmarker: any = null;
let meshFailed = false;
let meshLoading: Promise<any> | null = null;

export function clinicTilt() {
  return TILT;
}

export function startClinicSensors() {
  void getLandmarker();
  if (sensorOn || typeof window === "undefined") return;
  sensorOn = true;
  const on = (e: DeviceOrientationEvent) => {
    TILT = { beta: e.beta || 0, gamma: e.gamma || 0, ready: true };
  };
  const bind = () => window.addEventListener("deviceorientation", on, true);
  const DOE = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
    requestPermission?: () => Promise<string>;
  };
  if (typeof DOE?.requestPermission === "function") {
    DOE.requestPermission()
      .then((s) => {
        if (s === "granted") bind();
      })
      .catch(() => {});
    return;
  }
  bind();
}

function meanPt(pts: { x: number; y: number }[]) {
  if (!pts.length) return null;
  const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  return { x, y };
}

function avgLm(lms: Array<{ x: number; y: number }>, ids: number[]) {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const i of ids) {
    const p = lms[i];
    if (!p) continue;
    x += p.x;
    y += p.y;
    n++;
  }
  if (!n) return null;
  return { x: x / n, y: y / n };
}

function meshAssets() {
  const origin = typeof location !== "undefined" ? location.origin : "";
  return {
    wasm: `${origin}/mediapipe/wasm`,
    model: `${origin}/mediapipe/face_landmarker.task`,
  };
}

async function getLandmarker() {
  if (landmarker) return landmarker;
  if (meshFailed) return null;
  if (meshLoading) return meshLoading;
  meshLoading = (async () => {
    try {
      const { wasm, model } = meshAssets();
      const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
      const files = await FilesetResolver.forVisionTasks(wasm);
      landmarker = await FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: model },
        runningMode: "IMAGE",
        numFaces: 1,
      });
      return landmarker;
    } catch {
      meshFailed = true;
      meshLoading = null;
      return null;
    }
  })();
  return meshLoading;
}

async function meshLandmarks(canvas: HTMLCanvasElement) {
  const det = await Promise.race([
    getLandmarker(),
    new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 8000)),
  ]);
  if (!det) return null;
  try {
    const res = det.detect(canvas);
    const lms = res?.faceLandmarks?.[0];
    if (!lms || lms.length < 400) return null;
    const leftEye = avgLm(lms, [33, 133, 159, 145, 160, 144]);
    const rightEye = avgLm(lms, [263, 362, 386, 374, 387, 373]);
    const mouth = avgLm(lms, [13, 14, 61, 291, 78, 308]);
    const nose = avgLm(lms, [1, 4, 5, 6, 197]);
    const chin = avgLm(lms, [152, 377, 148]);
    const brow = avgLm(lms, [10, 151, 9, 107, 336]);
    const leftEar = avgLm(lms, [234, 127, 93]);
    const rightEar = avgLm(lms, [454, 356, 323]);
    const leftCheek = avgLm(lms, [234, 132, 58]);
    const rightCheek = avgLm(lms, [454, 361, 288]);
    if (!leftEye || !rightEye || !chin || !brow) return null;
    const fx = (leftEye.x + rightEye.x) / 2;
    const fy = (brow.y + chin.y) / 2;
    const leftX = (leftCheek || leftEar || leftEye).x;
    const rightX = (rightCheek || rightEar || rightEye).x;
    const frx = Math.max(0.1, Math.abs(rightX - leftX) / 2);
    const fry = Math.max(0.12, Math.abs(chin.y - brow.y) / 2);
    const lipL = lms[61];
    const lipR = lms[291];
    const lipU = lms[13];
    const lipD = lms[14];
    const eyeLW = Math.hypot((lms[33]?.x ?? 0) - (lms[133]?.x ?? 0), (lms[33]?.y ?? 0) - (lms[133]?.y ?? 0));
    const eyeRW = Math.hypot((lms[263]?.x ?? 0) - (lms[362]?.x ?? 0), (lms[263]?.y ?? 0) - (lms[362]?.y ?? 0));
    return {
      fx,
      fy,
      frx,
      fry,
      lx: leftEye.x,
      ly: leftEye.y,
      rx: rightEye.x,
      ry: rightEye.y,
      mx: mouth?.x ?? fx,
      my: mouth?.y ?? fy + fry * 0.35,
      mw: lipL && lipR ? Math.max(0.028, Math.abs(lipR.x - lipL.x) / 2) : Math.max(0.03, frx * 0.32),
      mh: lipU && lipD ? Math.max(0.012, Math.abs(lipD.y - lipU.y) * 0.85) : Math.max(0.014, fry * 0.12),
      erx: Math.max(0.018, Math.min(0.055, (eyeLW + eyeRW) / 4 || frx * 0.22)),
      ery: Math.max(0.01, Math.min(0.032, fry * 0.11)),
      nx: nose?.x ?? fx,
      ny: nose?.y ?? (leftEye.y + (mouth?.y ?? fy)) / 2,
      lex: leftEar?.x ?? fx - frx * 1.15,
      rex: rightEar?.x ?? fx + frx * 1.15,
      eay: leftEar?.y ?? fy,
      hx: fx,
      hcy: Math.max(0.04, brow.y - fry * 0.55),
      hrx: frx * 1.15,
      hry: fry * 0.55,
    };
  } catch {
    return null;
  }
}

async function nativeLandmarks(canvas: HTMLCanvasElement) {
  const Ctor = (
    window as Window & {
      FaceDetector?: new (o: { fastMode: boolean; maxDetectedFaces: number }) => {
        detect: (c: CanvasImageSource) => Promise<
          Array<{
            boundingBox: DOMRectReadOnly;
            landmarks?: Array<{ type: string; locations: { x: number; y: number }[] }>;
          }>
        >;
      };
    }
  ).FaceDetector;
  if (!Ctor) return null;
  try {
    const det = new Ctor({ fastMode: true, maxDetectedFaces: 1 });
    const hits = await Promise.race([
      det.detect(canvas),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 450)),
    ]);
    if (!hits || !hits[0]) return null;
    const f = hits[0];
    const w = canvas.width;
    const h = canvas.height;
    const box = f.boundingBox;
    const fx = (box.x + box.width / 2) / w;
    const fy = (box.y + box.height / 2) / h;
    const frx = box.width / 2 / w;
    const fry = box.height / 2 / h;
    let lx = fx - frx * 0.38;
    let ly = fy - fry * 0.18;
    let rx = fx + frx * 0.38;
    let ry = fy - fry * 0.18;
    let mx = fx;
    let my = fy + fry * 0.38;
    const eyes: { x: number; y: number }[] = [];
    for (const lm of f.landmarks || []) {
      const p = meanPt(lm.locations || []);
      if (!p) continue;
      const nx = p.x / w;
      const ny = p.y / h;
      const kind = String(lm.type || "").toLowerCase();
      if (kind.includes("mouth")) {
        mx = nx;
        my = ny;
      } else if (kind.includes("eye")) {
        eyes.push({ x: nx, y: ny });
      }
    }
    eyes.sort((a, b) => a.x - b.x);
    if (eyes[0]) {
      lx = eyes[0].x;
      ly = eyes[0].y;
    }
    if (eyes[1]) {
      rx = eyes[1].x;
      ry = eyes[1].y;
    }
    return { fx, fy, frx, fry, lx, ly, rx, ry, mx, my };
  } catch {
    return null;
  }
}

export async function scanClinicFace(src: string) {
  const canvas = makeCanvas(await loadImage(src), 800);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas yok");
  const gamma = TILT.ready ? TILT.gamma : 0;
  const skin = detectCalib(ctx);
  const [mesh, native] = await Promise.all([meshLandmarks(canvas), nativeLandmarks(canvas)]);
  const phone = skin.phone;
  const onPhone = (x: number, y: number) =>
    Boolean(
      phone &&
        ((x - phone.x) / Math.max(0.04, phone.rx)) ** 2 + ((y - phone.y) / Math.max(0.04, phone.ry)) ** 2 <= 1,
    );
  const meshOk = Boolean(mesh && !onPhone(mesh.lx, mesh.ly) && !onPhone(mesh.rx, mesh.ry));
  const nativeOk = Boolean(
    native && !onPhone(native.lx, native.ly) && !onPhone(native.rx, native.ry) && native.fy < 0.55,
  );
  const hit = meshOk ? mesh : nativeOk ? native : null;
  const base = hit
    ? {
        ...skin,
        fx: hit.fx,
        fy: hit.fy,
        frx: Math.max(0.1, hit.frx),
        fry: Math.max(0.12, hit.fry),
        lx: hit.lx,
        ly: hit.ly,
        rx: hit.rx,
        ry: hit.ry,
        mw: onPhone(hit.mx, hit.my) ? skin.mw : ((hit as { mw?: number }).mw ?? skin.mw),
        mh: onPhone(hit.mx, hit.my) ? skin.mh : ((hit as { mh?: number }).mh ?? skin.mh),
        erx: (hit as { erx?: number }).erx ?? skin.erx,
        ery: (hit as { ery?: number }).ery ?? skin.ery,
        nx: meshOk && mesh ? mesh.nx : hit.fx,
        ny: meshOk && mesh ? mesh.ny : (hit.ly + hit.my) / 2,
        lex: meshOk && mesh ? mesh.lex : Math.max(0.03, hit.fx - hit.frx * 1.2),
        rex: meshOk && mesh ? mesh.rex : Math.min(0.97, hit.fx + hit.frx * 1.2),
        eay: meshOk && mesh ? mesh.eay : hit.fy,
        hx: mesh?.hx ?? skin.hx,
        hcy: mesh?.hcy ?? skin.hcy,
        hrx: mesh?.hrx ?? skin.hrx,
        hry: mesh?.hry ?? skin.hry,
      }
    : skin;
  const ipd = Math.max(0.04, Math.abs(base.rx - base.lx));
  const tilt = Math.atan2(base.ry - base.ly, base.rx - base.lx);
  const faceBot = base.fy + base.fry;
  const body = Boolean(base.body) || faceBot < 0.62;
  const calib = {
    ...base,
    body,
    erx: Math.max(0.018, Math.min(0.07, ipd * 0.32)),
    ery: Math.max(0.01, Math.min(0.04, ipd * 0.18)),
    mw: Math.max(0.028, Math.min(0.12, ipd * 0.72)),
    mh: Math.max(0.012, Math.min(0.05, ipd * 0.28)),
    lex: Math.max(0.03, base.lex ?? base.fx - base.frx * 1.2),
    rex: Math.min(0.97, base.rex ?? base.fx + base.frx * 1.2),
    eay: base.eay ?? base.fy + base.fry * 0.04,
    earx: Math.max(0.02, Math.min(0.06, base.frx * 0.24)),
    eary: Math.max(0.045, Math.min(0.12, base.fry * 0.44)),
    nx: base.nx ?? base.fx,
    ny: base.ny ?? (base.ly + base.my) / 2,
    nrx: Math.max(0.02, Math.min(0.07, ipd * 0.28)),
    nry: Math.max(0.04, Math.min(0.12, base.fry * 0.3)),
    wy: body ? Math.max(faceBot + 0.08, base.wy || 0.62) : 0.62,
    hy: body ? Math.max(faceBot + 0.18, base.hy || 0.76) : 0.76,
    ipd,
    tilt,
    gyro: gamma,
    locked: true,
    native: Boolean(hit),
    mesh: Boolean(meshOk),
  };
  lockCalib(calib);
  const report = analyzeSkin(ctx, calib);
  report.symmetry = analyzeSymmetry(calib);
  return { calib, report };
}

export type SkinSpot = { x: number; y: number; kind: "leke" | "yag" | "halka" };
export type SkinFinding = {
  id: string;
  name: string;
  hint: string;
  score: number;
  tools: string[];
  free: boolean;
};
export type SymmetryNote = { id: string; name: string; side: string; delta: number };
export type SymmetryReport = {
  score: number;
  bias: "sol" | "sağ" | "dengeli";
  notes: SymmetryNote[];
};
export type SkinReport = {
  score: number;
  tone: string;
  findings: SkinFinding[];
  spots: SkinSpot[];
  symmetry?: SymmetryReport;
};

function analyzeSymmetry(c: {
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  mx: number;
  my: number;
  fx: number;
  nx?: number;
  lex?: number;
  rex?: number;
  ipd?: number;
}): SymmetryReport {
  const ipd = Math.max(0.04, c.ipd || Math.abs(c.rx - c.lx));
  const mid = (c.lx + c.rx) / 2;
  const notes: SymmetryNote[] = [];
  let penalty = 0;
  const push = (id: string, name: string, side: string, delta: number, weight: number) => {
    if (delta < 0.035) return;
    notes.push({ id, name, side, delta: Math.round(delta * 100) });
    penalty += delta * weight;
  };
  const eyeTilt = Math.abs(c.ly - c.ry) / ipd;
  push("eyes", "Göz hizası", c.ly < c.ry ? "sol yüksek" : "sağ yüksek", eyeTilt, 70);
  const noseOff = Math.abs((c.nx ?? c.fx) - mid) / ipd;
  push("nose", "Burun ekseni", (c.nx ?? c.fx) < mid ? "sola kayık" : "sağa kayık", noseOff, 55);
  const mouthOff = Math.abs(c.mx - mid) / ipd;
  push("mouth", "Dudak orta", c.mx < mid ? "sola kayık" : "sağa kayık", mouthOff, 50);
  const leftW = Math.abs(mid - (c.lex ?? c.lx));
  const rightW = Math.abs((c.rex ?? c.rx) - mid);
  const cheek = Math.abs(leftW - rightW) / ipd;
  push("cheek", "Yanak genişliği", leftW > rightW ? "sol dolgun" : "sağ dolgun", cheek, 40);
  const score = Math.max(52, Math.min(99, Math.round(100 - penalty)));
  const lean = (c.mx - mid) + ((c.nx ?? c.fx) - mid);
  const bias: SymmetryReport["bias"] = Math.abs(lean) < ipd * 0.04 ? "dengeli" : lean < 0 ? "sol" : "sağ";
  notes.sort((a, b) => b.delta - a.delta);
  return { score, bias, notes: notes.slice(0, 4) };
}

function inFace(nx: number, ny: number, c: { fx: number; fy: number; frx: number; fry: number }) {
  const dx = (nx - c.fx) / Math.max(0.08, c.frx);
  const dy = (ny - c.fy) / Math.max(0.08, c.fry);
  return dx * dx + dy * dy <= 1.15;
}

function analyzeSkin(ctx: CanvasRenderingContext2D, c: ReturnType<typeof detectCalib>): SkinReport {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const step = 3;
  let n = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let redN = 0;
  let oilN = 0;
  let tex = 0;
  const spots: SkinSpot[] = [];
  const redHits: { x: number; y: number; v: number }[] = [];
  let underL = 0;
  let underN = 0;
  let cheekL = 0;
  let cheekN = 0;
  for (let y = 2; y < h - 2; y += step)
    for (let x = 2; x < w - 2; x += step) {
      const nx = x / w;
      const ny = y / h;
      if (!inFace(nx, ny, c)) continue;
      const i = (y * w + x) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      if (r < 70 || r < g - 4) continue;
      n++;
      rSum += r;
      gSum += g;
      bSum += b;
      const l = r * 0.299 + g * 0.587 + b * 0.114;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const rg = r - g;
      if (rg > 28 && r > 110) redN++;
      const tzone = Math.abs(nx - c.fx) < c.frx * 0.28 && ny < c.fy + c.fry * 0.15;
      if (tzone && l > 208 && sat < 28) oilN++;
      const j = (y * w + x + step) * 4;
      tex += Math.abs(l - (d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114));
      const eyeL = Math.hypot(nx - c.lx, ny - (c.ly + c.ery * 1.8));
      const eyeR = Math.hypot(nx - c.rx, ny - (c.ry + c.ery * 1.8));
      if (Math.min(eyeL, eyeR) < 0.045) {
        underL += l;
        underN++;
      } else if (ny > c.fy && ny < c.my && Math.abs(nx - c.fx) > c.frx * 0.28) {
        cheekL += l;
        cheekN++;
      }
      if (rg > 36 && r > 120 && l < 190 && ny < c.my + 0.04) {
        redHits.push({ x: nx, y: ny, v: rg });
      }
    }
  redHits.sort((a, b) => b.v - a.v);
  for (const hit of redHits) {
    if (spots.length >= 8) break;
    if (spots.some((s) => Math.hypot(s.x - hit.x, s.y - hit.y) < 0.05)) continue;
    spots.push({ x: hit.x, y: hit.y, kind: "leke" });
  }
  const redRate = n ? redN / n : 0;
  const oilRate = n ? oilN / n : 0;
  const texAvg = n ? tex / n : 0;
  const under = underN ? underL / underN : 140;
  const cheek = cheekN ? cheekL / cheekN : 150;
  const circleGap = Math.max(0, cheek - under);
  if (circleGap > 16) {
    spots.push({ x: c.lx, y: Math.min(0.92, c.ly + 0.045), kind: "halka" });
    spots.push({ x: c.rx, y: Math.min(0.92, c.ry + 0.045), kind: "halka" });
  }
  if (oilRate > 0.04) spots.push({ x: c.fx, y: Math.max(0.08, c.fy - c.fry * 0.55), kind: "yag" });
  const ar = n ? rSum / n : 160;
  const ab = n ? bSum / n : 140;
  const tone = ar - ab > 18 ? "ılık" : ab - ar > 8 ? "soğuk" : "nötr";
  const findings: SkinFinding[] = [];
  const push = (id: string, name: string, hint: string, score: number, tools: string[], free = true) => {
    if (score < 22) return;
    findings.push({ id, name, hint, score: Math.min(98, Math.round(score)), tools, free });
  };
  push("leke", "Leke", `${spots.filter((s) => s.kind === "leke").length || "az"} nokta`, 20 + redRate * 220 + spots.filter((s) => s.kind === "leke").length * 8, ["blemish", "skin"]);
  push("kizarma", "Kızarıklık", "yanak / burun", 18 + redRate * 260, ["even", "skin"]);
  push("halka", "Gözaltı", "gölge farkı", 10 + circleGap * 2.4, ["darkcircle"]);
  push("puruz", "Pürüz", "doku", 12 + texAvg * 3.2, ["skin", "even"]);
  push("yag", "Parlama", "T bölgesi", 10 + oilRate * 480, ["matte"]);
  const dull = n ? 160 - (rSum * 0.3 + gSum * 0.5 + bSum * 0.2) / n : 0;
  push("soluk", "Soluk ten", "ışıltı düşük", 8 + Math.max(0, dull) * 0.9, ["glow"]);
  findings.sort((a, b) => b.score - a.score);
  const penalty = findings.reduce((s, f) => s + f.score, 0) / 8;
  const score = Math.max(42, Math.min(96, Math.round(92 - penalty)));
  return { score, tone, findings: findings.slice(0, 5), spots };
}

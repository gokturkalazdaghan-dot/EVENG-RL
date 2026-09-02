// @ts-nocheck
import { clamp } from "./utils";
import { TEMPLATES, TOOL_LABEL } from "./catalog";

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (
      /^https?:\/\//i.test(src) &&
      typeof location !== "undefined" &&
      !src.startsWith(location.origin)
    )
      img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Görsel yüklenemedi"));
    img.src = src;
  });
}
export function makeCanvas(img, max = 800) {
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas yok");
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}
export function toJpeg(canvas, quality = 0.86) {
  return canvas.toDataURL("image/jpeg", quality);
}
export function toPng(canvas) {
  return canvas.toDataURL("image/png");
}
function boxBlur(src, radius) {
  const r = Math.max(1, radius);
  const { width: w, height: h } = src;
  const tmp = new Uint8ClampedArray(src.data);
  const out = new Uint8ClampedArray(src.data.length);
  const pass = (from, to, horiz) => {
    const limitA = horiz ? h : w;
    const limitB = horiz ? w : h;
    for (let a = 0; a < limitA; a++) {
      let rSum = 0,
        gSum = 0,
        bSum = 0,
        count = 0;
      for (let k = 0; k <= r && k < limitB; k++) {
        const idx = horiz ? (a * w + k) * 4 : (k * w + a) * 4;
        rSum += from[idx];
        gSum += from[idx + 1];
        bSum += from[idx + 2];
        count++;
      }
      for (let b = 0; b < limitB; b++) {
        const idx = horiz ? (a * w + b) * 4 : (b * w + a) * 4;
        to[idx] = rSum / count;
        to[idx + 1] = gSum / count;
        to[idx + 2] = bSum / count;
        to[idx + 3] = from[idx + 3];
        const leave = b - r;
        if (leave >= 0) {
          const li = horiz ? (a * w + leave) * 4 : (leave * w + a) * 4;
          rSum -= from[li];
          gSum -= from[li + 1];
          bSum -= from[li + 2];
          count--;
        }
        const enter = b + r + 1;
        if (enter < limitB) {
          const ei = horiz ? (a * w + enter) * 4 : (enter * w + a) * 4;
          rSum += from[ei];
          gSum += from[ei + 1];
          bSum += from[ei + 2];
          count++;
        }
      }
    }
  };
  pass(src.data, tmp, true);
  pass(tmp, out, false);
  return new ImageData(out, w, h);
}
function mixBlur(ctx, amount, radius) {
  const { width: w, height: h } = ctx.canvas;
  const src = ctx.getImageData(0, 0, w, h);
  const blur = boxBlur(src, radius);
  const d = src.data;
  const b = blur.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = d[i] * (1 - amount) + b[i] * amount;
    d[i + 1] = d[i + 1] * (1 - amount) + b[i + 1] * amount;
    d[i + 2] = d[i + 2] * (1 - amount) + b[i + 2] * amount;
  }
  ctx.putImageData(src, 0, 0);
}
function unsharp(ctx, amount, radius) {
  const { width: w, height: h } = ctx.canvas;
  const src = ctx.getImageData(0, 0, w, h);
  const blur = boxBlur(src, radius);
  const d = src.data;
  const b = blur.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp(d[i] + (d[i] - b[i]) * amount);
    d[i + 1] = clamp(d[i + 1] + (d[i + 1] - b[i + 1]) * amount);
    d[i + 2] = clamp(d[i + 2] + (d[i + 2] - b[i + 2]) * amount);
  }
  ctx.putImageData(src, 0, 0);
}
function withIntensity(ctx, intensity, fn) {
  const t = clamp(intensity / 100, 0, 1);
  if (t <= 0) return;
  const { width, height } = ctx.canvas;
  const before = t >= 1 ? null : ctx.getImageData(0, 0, width, height);
  fn();
  if (!before || t >= 1) return;
  const after = ctx.getImageData(0, 0, width, height);
  const a = after.data;
  const b = before.data;
  for (let i = 0; i < a.length; i += 4) {
    a[i] = b[i] + (a[i] - b[i]) * t;
    a[i + 1] = b[i + 1] + (a[i + 1] - b[i + 1]) * t;
    a[i + 2] = b[i + 2] + (a[i + 2] - b[i + 2]) * t;
  }
  ctx.putImageData(after, 0, 0);
}
const DEFAULT_CALIB = {
  fx: 0.5,
  fy: 0.42,
  frx: 0.28,
  fry: 0.32,
  lx: 0.38,
  ly: 0.36,
  rx: 0.62,
  ry: 0.36,
  erx: 0.045,
  ery: 0.022,
  mx: 0.5,
  my: 0.5,
  mw: 0.07,
  mh: 0.028,
  hx: 0.5,
  hcy: 0.18,
  hrx: 0.22,
  hry: 0.16,
  lex: 0.28,
  rex: 0.72,
  eay: 0.4,
  earx: 0.04,
  eary: 0.08,
  nx: 0.5,
  ny: 0.42,
  nrx: 0.035,
  nry: 0.06,
  wy: 0.62,
  hy: 0.76,
  bw: 0.22,
  body: false,
};
let CALIB = { ...DEFAULT_CALIB };
let CALIB_LOCK = null;
function F() {
  return CALIB || DEFAULT_CALIB;
}
export function lockCalib(c) {
  if (!c) return CALIB;
  CALIB = { ...DEFAULT_CALIB, ...c };
  CALIB_LOCK = CALIB;
  return CALIB;
}
export function clearCalibLock() {
  CALIB_LOCK = null;
  CALIB = { ...DEFAULT_CALIB };
}
function isSkinPx(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx < 40 || mx - mn < 8) return false;
  if (r < 48 || g < 22 || b < 12) return false;
  if (r + 12 < g && r + 12 < b) return false;
  return r + 6 >= g && r - g < 140;
}
function pxLum(d, i) {
  return d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
}
function skinNear(d, w, h, x, y, rad) {
  let s = 0;
  let n = 0;
  for (let dy = -rad; dy <= rad; dy += 2)
    for (let dx = -rad; dx <= rad; dx += 2) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      n++;
      const i = (yy * w + xx) * 4;
      if (isSkinPx(d[i], d[i + 1], d[i + 2])) s++;
    }
  return n ? s / n : 0;
}
function findPhone(d, w, h, step) {
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  let n = 0;
  const x0 = Math.round(w * 0.16);
  const x1 = Math.round(w * 0.84);
  const y0 = Math.round(h * 0.12);
  const y1 = Math.round(h * 0.82);
  for (let y = y0; y < y1; y += step)
    for (let x = x0; x < x1; x += step) {
      const i = (y * w + x) * 4;
      if (isSkinPx(d[i], d[i + 1], d[i + 2])) continue;
      if (pxLum(d, i) > 58) continue;
      n++;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  const rw = maxX - minX;
  const rh = maxY - minY;
  const ar = rh > 0 ? rw / rh : 1;
  if (n < 24 || rw < w * 0.16 || rh < h * 0.14 || ar < 0.3 || ar > 0.88) return null;
  if ((rw * rh) / (w * h) < 0.05 || (rw * rh) / (w * h) > 0.5) return null;
  return { minX, minY, maxX, maxY };
}
function inPhone(ph, x, y) {
  if (!ph) return false;
  return x >= ph.minX && x <= ph.maxX && y >= ph.minY && y <= ph.maxY;
}
export function detectCalib(ctx) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const step = Math.max(2, Math.round(Math.min(w, h) / 120));
  const phone = findPhone(d, w, h, step);
  const row = new Array(h).fill(0);
  let n = 0;
  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < h; y += step)
    for (let x = 0; x < w; x += step) {
      if (inPhone(phone, x, y)) continue;
      const i = (y * w + x) * 4;
      if (!isSkinPx(d[i], d[i + 1], d[i + 2])) continue;
      n++;
      row[y] += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  if (n < 40 || maxX - minX < w * 0.08 || maxY - minY < h * 0.08) return { ...DEFAULT_CALIB };
  let hair = 0;
  for (let y = minY; y < h; y += step) {
    if (row[y] >= 3) {
      hair = y;
      break;
    }
  }
  let chin = Math.min(h - 1, hair + Math.round(h * 0.42));
  if (phone) chin = Math.min(chin, phone.minY + Math.round(step * 2));
  for (let y = hair + Math.round(h * 0.12); y < Math.min(h, hair + Math.round(h * 0.5)); y += step) {
    if (phone && y >= phone.minY) {
      chin = Math.min(chin, y);
      break;
    }
    const prev = row[Math.max(hair, y - Math.round(h * 0.08))] || 1;
    if (y > hair + h * 0.16 && row[y] < prev * 0.32) {
      chin = y;
      break;
    }
  }
  if (chin - hair < h * 0.12) chin = Math.min(h - 1, hair + Math.round(h * 0.28));
  let fn = 0;
  let fsx = 0;
  let fsy = 0;
  let fminX = w;
  let fmaxX = 0;
  let fminY = h;
  let fmaxY = 0;
  for (let y = hair; y < chin; y += step)
    for (let x = minX; x < maxX; x += step) {
      if (inPhone(phone, x, y)) continue;
      const i = (y * w + x) * 4;
      if (!isSkinPx(d[i], d[i + 1], d[i + 2])) continue;
      fn++;
      fsx += x;
      fsy += y;
      if (x < fminX) fminX = x;
      if (y < fminY) fminY = y;
      if (x > fmaxX) fmaxX = x;
      if (y > fmaxY) fmaxY = y;
    }
  if (fn < 16) return { ...DEFAULT_CALIB };
  const fx0 = fsx / fn / w;
  const fy0 = fsy / fn / h;
  let fx = fx0;
  let fy = fy0;
  let frx = Math.min(0.32, Math.max(0.1, ((fmaxX - fminX) / w) * 0.62));
  let fry = Math.min(0.34, Math.max(0.12, ((fmaxY - fminY) / h) * 0.62));
  const eyeY0 = Math.round((fy - fry * 0.55) * h);
  const eyeY1 = Math.round((fy - fry * 0.02) * h);
  const left0 = Math.round((fx - frx * 0.85) * w);
  const left1 = Math.round((fx - frx * 0.08) * w);
  const right0 = Math.round((fx + frx * 0.08) * w);
  const right1 = Math.round((fx + frx * 0.85) * w);
  let lBest = 1e9;
  let rBest = 1e9;
  let lx = fx - frx * 0.38;
  let ly = fy - fry * 0.22;
  let rx = fx + frx * 0.38;
  let ry = fy - fry * 0.22;
  for (let y = Math.max(0, eyeY0); y < Math.min(h, Math.max(eyeY0 + 2, eyeY1)); y += step) {
    for (let x = Math.max(0, left0); x < Math.min(w, left1); x += step) {
      if (inPhone(phone, x, y)) continue;
      if (skinNear(d, w, h, x, y, 6) < 0.28) continue;
      const lum = pxLum(d, (y * w + x) * 4);
      if (lum < lBest) {
        lBest = lum;
        lx = x / w;
        ly = y / h;
      }
    }
    for (let x = Math.max(0, right0); x < Math.min(w, right1); x += step) {
      if (inPhone(phone, x, y)) continue;
      if (skinNear(d, w, h, x, y, 6) < 0.28) continue;
      const lum = pxLum(d, (y * w + x) * 4);
      if (lum < rBest) {
        rBest = lum;
        rx = x / w;
        ry = y / h;
      }
    }
  }
  if (rx - lx < frx * 0.28 || rx - lx > frx * 1.8 || Math.abs(ly - ry) > 0.06 || ly > fy + 0.02) {
    lx = fx - frx * 0.36;
    rx = fx + frx * 0.36;
    ly = ry = Math.max(0.08, fy - fry * 0.22);
  }
  if (rx > lx + 0.05) {
    fx = (lx + rx) / 2;
    frx = Math.max(frx, Math.min(0.32, (rx - lx) * 0.92));
    fy = Math.min(0.72, Math.max(fy, (ly + ry) / 2 + fry * 0.32));
  }
  const erx = Math.max(0.018, Math.min(0.07, (rx - lx) * 0.26));
  const ery = Math.max(0.01, Math.min(0.035, fry * 0.14));
  const mouthY0 = Math.round((Math.max(ly, ry) + fry * 0.18) * h);
  const mouthY1 = Math.round(Math.min(chin, (fy + fry * 0.72) * h));
  let mn = 0;
  let msx = 0;
  let msy = 0;
  for (let y = Math.max(0, mouthY0); y < Math.min(h, mouthY1); y += step)
    for (let x = Math.round((fx - frx * 0.38) * w); x < Math.round((fx + frx * 0.38) * w); x += step) {
      if (x < 0 || x >= w || inPhone(phone, x, y)) continue;
      const i = (y * w + x) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const lip = isSkinPx(r, g, b) && r > g + 8 && r > b + 6;
      if (!lip) continue;
      mn++;
      msx += x;
      msy += y;
    }
  const mx = mn > 5 ? msx / mn / w : fx;
  const my = mn > 5 ? msy / mn / h : Math.min((chin - 8) / h, fy + fry * 0.42);
  const mw = Math.max(0.03, Math.min(0.11, frx * 0.42));
  const mh = Math.max(0.012, Math.min(0.04, fry * 0.15));
  const faceBot = fmaxY / h;
  const body = maxY / h - faceBot > 0.18;
  let wy = Math.min(0.84, Math.max(faceBot + 0.1, phone ? phone.maxY / h + 0.04 : faceBot + 0.14));
  let hy = Math.min(0.94, wy + 0.12);
  let bw = Math.max(0.14, frx * 1.15);
  if (body) {
    let slim = 1e9;
    let wide = 0;
    for (let y = Math.round(wy * h); y < Math.min(h, Math.round(0.9 * h)); y += step) {
      let left = w;
      let right = 0;
      for (let x = 0; x < w; x += step) {
        if (inPhone(phone, x, y)) continue;
        const i = (y * w + x) * 4;
        if (!isSkinPx(d[i], d[i + 1], d[i + 2])) continue;
        if (x < left) left = x;
        if (x > right) right = x;
      }
      const ww = right - left;
      if (ww < 8) continue;
      if (y / h < wy + 0.1 && ww < slim) {
        slim = ww;
        wy = y / h;
        bw = ww / w / 2;
      }
      if (y / h > wy + 0.06 && ww > wide) {
        wide = ww;
        hy = y / h;
        bw = Math.max(bw, ww / w / 2);
      }
    }
  }
  wy = Math.max(faceBot + 0.08, wy);
  hy = Math.max(wy + 0.07, hy);
  let hn = 0;
  let hsx = 0;
  let hsy = 0;
  let hminX = w;
  let hmaxX = 0;
  let hminY = h;
  let hmaxY = 0;
  const hairY0 = Math.max(0, hair - Math.round(h * 0.12));
  const hairY1 = Math.round((fy - fry * 0.05) * h);
  for (let y = hairY0; y < Math.min(h, hairY1); y += step)
    for (let x = Math.round((fx - frx * 1.5) * w); x < Math.round((fx + frx * 1.5) * w); x += step) {
      if (x < 0 || x >= w || inPhone(phone, x, y)) continue;
      const i = (y * w + x) * 4;
      if (isSkinPx(d[i], d[i + 1], d[i + 2])) continue;
      if (pxLum(d, i) > 118) continue;
      hn++;
      hsx += x;
      hsy += y;
      if (x < hminX) hminX = x;
      if (y < hminY) hminY = y;
      if (x > hmaxX) hmaxX = x;
      if (y > hmaxY) hmaxY = y;
    }
  const hx = hn > 20 ? hsx / hn / w : fx;
  const hcy = hn > 20 ? hsy / hn / h : Math.max(0.06, fy - fry * 0.9);
  const hrx = hn > 20 ? Math.min(0.32, Math.max(0.1, ((hmaxX - hminX) / w) * 0.52)) : frx * 1.1;
  const hry = hn > 20 ? Math.min(0.24, Math.max(0.07, ((hmaxY - hminY) / h) * 0.52)) : fry * 0.65;
  const eay = fy;
  const earx = Math.max(0.02, Math.min(0.05, frx * 0.22));
  const eary = Math.max(0.04, Math.min(0.1, fry * 0.4));
  let lex = Math.max(0.04, fx - frx * 1.15);
  let rex = Math.min(0.96, fx + frx * 1.15);
  if (inPhone(phone, lex * w, eay * h)) lex = Math.max(0.04, (phone.minX - 8) / w);
  if (inPhone(phone, rex * w, eay * h)) rex = Math.min(0.96, (phone.maxX + 8) / w);
  const nx = fx;
  const ny = (ly + my) / 2;
  const nrx = Math.max(0.02, Math.min(0.06, (rx - lx) * 0.22));
  const nry = Math.max(0.035, Math.min(0.1, fry * 0.28));
  return {
    fx,
    fy,
    frx,
    fry,
    lx,
    ly,
    rx,
    ry,
    erx,
    ery,
    mx,
    my,
    mw,
    mh,
    hx,
    hcy,
    hrx,
    hry,
    lex,
    rex,
    eay,
    earx,
    eary,
    nx,
    ny,
    nrx,
    nry,
    wy,
    hy,
    bw,
    body,
    phone: phone
      ? { x: (phone.minX + phone.maxX) / 2 / w, y: (phone.minY + phone.maxY) / 2 / h, rx: (phone.maxX - phone.minX) / 2 / w, ry: (phone.maxY - phone.minY) / 2 / h }
      : null,
  };
}
export function bindCalib(ctx) {
  if (CALIB_LOCK) {
    CALIB = CALIB_LOCK;
    return CALIB;
  }
  try {
    CALIB = detectCalib(ctx);
  } catch {
    CALIB = { ...DEFAULT_CALIB };
  }
  return CALIB;
}
export async function readCalib(src) {
  const canvas = makeCanvas(await loadImage(src), 1100);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { ...DEFAULT_CALIB };
  return bindCalib(ctx);
}
export function snapClinic(nx, ny, c, desk, tool) {
  if (tool === "erase") return { nx, ny, tool };
  if (desk === "dudak") return { nx: c.mx, ny: c.my, tool: tool === "teeth" ? "teeth" : "plump" };
  if (desk === "sac") return { nx: c.hx || c.fx, ny: c.hcy || Math.max(0.1, c.fy - c.fry), tool: "hair" };
  if (desk === "beden") {
    const hips = Math.abs(ny - (c.hy || 0.76));
    const waist = Math.abs(ny - (c.wy || 0.62));
    return hips <= waist
      ? { nx: c.fx, ny: c.hy, tool: "hips" }
      : { nx: c.fx, ny: c.wy, tool: "waist" };
  }
  const le = Math.hypot(nx - c.lx, ny - c.ly);
  const re = Math.hypot(nx - c.rx, ny - c.ry);
  if (desk === "yuz") {
    const mouth = Math.hypot(nx - c.mx, ny - c.my);
    if (mouth < Math.min(le, re)) return { nx: c.mx, ny: c.my, tool: tool === "teeth" ? "teeth" : "smile" };
    return le <= re ? { nx: c.lx, ny: c.ly, tool: "darkcircle" } : { nx: c.rx, ny: c.ry, tool: "darkcircle" };
  }
  const face = ((nx - c.fx) / (c.frx || 0.18)) ** 2 + ((ny - c.fy) / (c.fry || 0.2)) ** 2;
  if (face > 1.2) return { nx: c.fx, ny: c.fy, tool: tool || "blemish" };
  return { nx, ny, tool: tool || "blemish" };
}
export function clinicZones(c, desk) {
  const z = [];
  if (!c) return z;
  const phone = c.phone;
  const hitPhone = (x, y) =>
    phone && ((x - phone.x) / Math.max(0.04, phone.rx)) ** 2 + ((y - phone.y) / Math.max(0.04, phone.ry)) ** 2 <= 1;
  const add = (id, x, y, rx, ry, label) => {
    if (x == null || y == null || rx < 0.01 || ry < 0.01) return;
    if (hitPhone(x, y)) return;
    z.push({ id, x, y, rx, ry, label });
  };
  if (desk === "cilt") add("face", c.fx, c.fy, c.frx, c.fry, "Yüz");
  if (desk === "yuz") {
    add("face", c.fx, c.fy, c.frx, c.fry, "Yüz");
    add("leye", c.lx, c.ly, c.erx, c.ery, "Göz");
    add("reye", c.rx, c.ry, c.erx, c.ery, "Göz");
    add("mouth", c.mx, c.my, c.mw * 1.15, c.mh * 1.3, "Dudak");
  }
  if (desk === "dudak") add("mouth", c.mx, c.my, c.mw * 1.3, c.mh * 1.5, "Dudak");
  if (desk === "sac") add("hair", c.hx || c.fx, c.hcy || Math.max(0.1, c.fy - c.fry), c.hrx || c.frx * 1.2, c.hry || c.fry * 0.7, "Saç");
  if (desk === "beden") {
    const bot = c.fy + c.fry;
    const wy = Math.max(bot + 0.1, c.wy || 0.62);
    const hy = Math.max(wy + 0.08, c.hy || 0.76);
    add("waist", c.fx, wy, c.bw || 0.18, 0.045, "Bel");
    add("hips", c.fx, hy, (c.bw || 0.18) * 1.1, 0.055, "Kalça");
  }
  return z;
}
function parseHex(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ];
}
function gradePixels(ctx, g) {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const cos = Math.cos((g.hue * Math.PI) / 180);
  const sin = Math.sin((g.hue * Math.PI) / 180);
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / 255;
    let gch = d[i + 1] / 255;
    let b = d[i + 2] / 255;
    r = r * g.contrast + 0.5 * (1 - g.contrast) + g.brightness / 255;
    gch = gch * g.contrast + 0.5 * (1 - g.contrast) + g.brightness / 255;
    b = b * g.contrast + 0.5 * (1 - g.contrast) + g.brightness / 255;
    const l = r * 0.299 + gch * 0.587 + b * 0.114;
    r = l + (r - l) * g.saturate;
    gch = l + (gch - l) * g.saturate;
    b = l + (b - l) * g.saturate;
    const rx = r;
    r = r * cos - gch * sin;
    gch = rx * sin + gch * cos;
    r += g.warmth / 255;
    b -= g.warmth / 255;
    r += g.lift / 255;
    gch += g.lift / 255;
    b += g.lift / 255;
    if (g.gamma !== 1) {
      const inv = 1 / Math.max(0.05, g.gamma);
      r = r < 0 ? 0 : r ** inv;
      gch = gch < 0 ? 0 : gch ** inv;
      b = b < 0 ? 0 : b ** inv;
    }
    d[i] = clamp(r * 255);
    d[i + 1] = clamp(gch * 255);
    d[i + 2] = clamp(b * 255);
  }
  ctx.putImageData(img, 0, 0);
}
function vignette(ctx, strength, biasY = 0) {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const cx = w / 2;
  const cy = h / 2 + biasY * h;
  const max = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / max;
      const m = 1 - Math.max(0, dist - 0.35) * strength;
      d[i] *= m;
      d[i + 1] *= m;
      d[i + 2] *= m;
    }
  ctx.putImageData(img, 0, 0);
}
function pinch(ctx, amount) {
  const src = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const { width: w, height: h } = src;
  const out = ctx.createImageData(w, h);
  const s = src.data;
  const d = out.data;
  const cx = w * F().fx;
  const cy = h * F().fy;
  const capped = Math.min(0.14, amount);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / w;
      const dy = (y - cy) / h;
      const fall = Math.exp(-(dx * dx * 6 + dy * dy * 4));
      const sx = Math.round(x - dx * capped * 18 * fall);
      const sy = Math.round(y - dy * capped * 6 * fall);
      const i = (y * w + x) * 4;
      if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
        const j = (sy * w + sx) * 4;
        d[i] = s[j];
        d[i + 1] = s[j + 1];
        d[i + 2] = s[j + 2];
        d[i + 3] = s[j + 3];
      } else d[i + 3] = 255;
    }
  ctx.putImageData(out, 0, 0);
}
function sampleWarp(ctx, mapFn) {
  const src = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const { width: w, height: h } = src;
  const out = ctx.createImageData(w, h);
  const s = src.data;
  const d = out.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [sx0, sy0] = mapFn(x, y, w, h);
      const sx = Math.max(0, Math.min(w - 1.001, sx0));
      const sy = Math.max(0, Math.min(h - 1.001, sy0));
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(w - 1, x0 + 1);
      const y1 = Math.min(h - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const i = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        const a = s[(y0 * w + x0) * 4 + c];
        const b = s[(y0 * w + x1) * 4 + c];
        const p = s[(y1 * w + x0) * 4 + c];
        const q = s[(y1 * w + x1) * 4 + c];
        d[i + c] = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + p * (1 - fx) * fy + q * fx * fy;
      }
    }
  ctx.putImageData(out, 0, 0);
}
function hipsWarp(ctx, amount = 0.12) {
  const c = F();
  const faceBot = c.fy + c.fry;
  const hy = Math.max(faceBot + 0.14, c.hy || 0.76);
  if (hy > 0.97) return;
  const signed = Number(amount);
  const k = Math.min(0.16, Math.max(0.04, Math.abs(signed)));
  const dir = signed < 0 ? -1 : 1;
  const bandH = 0.08;
  const half = Math.max(0.1, c.bw || 0.2);
  sampleWarp(ctx, (x, y, w, h) => {
    const t = y / h;
    if (t < faceBot + 0.06) return [x, y];
    if (Math.abs(t - hy) > bandH * 1.6) return [x, y];
    const band = Math.exp(-(((t - hy) / bandH) ** 2));
    const cx = w * c.fx;
    const dx = x - cx;
    if (Math.abs(dx) > w * half * 1.35) return [x, y];
    return [cx + dx * (1 + dir * k * band), y];
  });
}
function waistWarp(ctx, amount = 0.1) {
  const c = F();
  const faceBot = c.fy + c.fry;
  const wy = Math.max(faceBot + 0.08, Math.min((c.hy || 0.76) - 0.05, c.wy || 0.62));
  if (wy > 0.95) return;
  const signed = Number(amount);
  const k = Math.min(0.14, Math.max(0.04, Math.abs(signed)));
  const dir = signed < 0 ? -1 : 1;
  const bandH = 0.055;
  const half = Math.max(0.08, (c.bw || 0.18) * 0.85);
  sampleWarp(ctx, (x, y, w, h) => {
    const t = y / h;
    if (t < faceBot + 0.04) return [x, y];
    if (Math.abs(t - wy) > bandH * 1.7) return [x, y];
    const band = Math.exp(-(((t - wy) / bandH) ** 2));
    const cx = w * c.fx;
    const dx = x - cx;
    if (Math.abs(dx) > w * half * 1.4) return [x, y];
    return [cx + dx * (1 + dir * k * band), y];
  });
}
function eyeScaleWarp(ctx, scale) {
  const k = Math.max(-0.34, Math.min(0.38, scale));
  const c = F();
  const centers = [
    [c.lx, c.ly],
    [c.rx, c.ry],
  ];
  sampleWarp(ctx, (x, y, w, h) => {
    let sx = x;
    let sy = y;
    const erx = w * Math.max(0.022, Math.min(0.07, c.erx || c.frx * 0.22));
    const ery = h * Math.max(0.012, Math.min(0.038, c.ery || c.fry * 0.12));
    for (const [cxn, cyn] of centers) {
      const cx = w * cxn;
      const cy = h * cyn;
      const dx = (x - cx) / erx;
      const dy = (y - cy) / ery;
      const r2 = dx * dx + dy * dy;
      if (r2 >= 1) continue;
      const fall = (1 - r2) ** 2;
      sx += (x - cx) * -k * fall;
      sy += (y - cy) * -k * fall;
    }
    return [sx, sy];
  });
}
function almondWarp(ctx) {
  const c = F();
  sampleWarp(ctx, (x, y, w, h) => {
    let sx = x;
    let sy = y;
    const erx = w * Math.max(0.022, c.erx || c.frx * 0.32);
    const ery = h * Math.max(0.01, c.ery || c.fry * 0.12);
    const eyes = [
      [c.lx, c.ly, -1],
      [c.rx, c.ry, 1],
    ];
    for (const [cxn, cyn, side] of eyes) {
      const cx = w * cxn;
      const cy = h * cyn;
      const dx = (x - cx) / erx;
      const dy = (y - cy) / ery;
      const r2 = dx * dx + dy * dy;
      if (r2 >= 1) continue;
      const fall = (1 - r2) ** 2;
      sx += side * erx * 0.18 * fall;
      sy -= Math.abs(dx) * ery * 0.35 * fall;
    }
    return [sx, sy];
  });
}
function eyeSpaceWarp(ctx, dir) {
  const c = F();
  sampleWarp(ctx, (x, y, w, h) => {
    const shift = (dir < 0 ? -1 : 1) * Math.max(3, Math.min(10, (c.erx || 0.04) * 140));
    const erx = w * Math.max(0.022, c.erx || c.frx * 0.32);
    const ery = h * Math.max(0.01, c.ery || c.fry * 0.14);
    const m =
      ellipseW(x, y, w * c.lx, h * c.ly, erx, ery) -
      ellipseW(x, y, w * c.rx, h * c.ry, erx, ery);
    if (m === 0) return [x, y];
    return [x - Math.sign(m) * shift * Math.min(1, Math.abs(m)), y];
  });
}
function earScaleWarp(ctx, scale) {
  const k = Math.max(-0.28, Math.min(0.28, scale));
  const c = F();
  const ears = [
    [c.lex || c.fx - c.frx * 1.18, c.eay || c.fy],
    [c.rex || c.fx + c.frx * 1.18, c.eay || c.fy],
  ];
  const earx = Math.max(0.02, c.earx || c.frx * 0.24);
  const eary = Math.max(0.045, c.eary || c.fry * 0.42);
  sampleWarp(ctx, (x, y, w, h) => {
    const face = ellipseW(x, y, w * c.fx, h * c.fy, w * c.frx * 0.92, h * c.fry);
    if (face > 0.12) return [x, y];
    let sx = x;
    let sy = y;
    for (const [cxn, cyn] of ears) {
      const cx = w * cxn;
      const cy = h * cyn;
      const dx = (x - cx) / (w * earx);
      const dy = (y - cy) / (h * eary);
      const r2 = dx * dx + dy * dy;
      if (r2 >= 1) continue;
      const fall = (1 - r2) ** 2;
      sx += (x - cx) * -k * fall;
      sy += (y - cy) * -k * fall;
    }
    return [sx, sy];
  });
}
function noseScaleWarp(ctx, scale) {
  const k = Math.max(-0.26, Math.min(0.26, scale));
  const c = F();
  const cxn = c.nx || c.fx;
  const cyn = c.ny || (c.ly + c.my) / 2;
  const nrx = Math.max(0.02, c.nrx || c.frx * 0.2);
  const nry = Math.max(0.035, c.nry || c.fry * 0.28);
  sampleWarp(ctx, (x, y, w, h) => {
    const eye =
      ellipseW(x, y, w * c.lx, h * c.ly, w * (c.erx || 0.04) * 1.3, h * (c.ery || 0.02) * 1.4) +
      ellipseW(x, y, w * c.rx, h * c.ry, w * (c.erx || 0.04) * 1.3, h * (c.ery || 0.02) * 1.4);
    if (eye > 0.12) return [x, y];
    const dx = (x - w * cxn) / (w * nrx);
    const dy = (y - h * cyn) / (h * nry);
    const r2 = dx * dx + dy * dy;
    if (r2 >= 1) return [x, y];
    const fall = (1 - r2) ** 2;
    return [x + (x - w * cxn) * -k * fall, y + (y - h * cyn) * -k * 0.55 * fall];
  });
}
function chinWarp(ctx, scale) {
  const k = Math.max(-0.18, Math.min(0.18, scale));
  const c = F();
  const cy = Math.min(0.94, c.fy + c.fry * 0.98);
  const rx = Math.max(0.06, c.frx * 0.48);
  const ry = Math.max(0.04, c.fry * 0.24);
  sampleWarp(ctx, (x, y, w, h) => {
    if (y / h < c.my) return [x, y];
    const dx = (x - w * c.fx) / (w * rx);
    const dy = (y - h * cy) / (h * ry);
    const r2 = dx * dx + dy * dy;
    if (r2 >= 1) return [x, y];
    const fall = (1 - r2) ** 2;
    return [x + (x - w * c.fx) * -k * 0.7 * fall, y + (y - h * cy) * -k * fall];
  });
}
function faceLiftWarp(ctx) {
  const c = F();
  sampleWarp(ctx, (x, y, w, h) => {
    const t = y / h;
    const chin0 = c.fy + c.fry * 0.25;
    const chin1 = c.fy + c.fry * 1.12;
    if (t < chin0 || t > chin1) return [x, y];
    const nx = x / w - c.fx;
    if (Math.abs(nx) > c.frx * 1.15) return [x, y];
    const band = (t - chin0) / Math.max(0.04, chin1 - chin0);
    const side = 1 - Math.abs(nx) / Math.max(0.04, c.frx);
    return [x, y - band * side * h * 0.055];
  });
  unsharp(ctx, 0.28, 1);
}
function browLiftWarp(ctx, amount = 0.08) {
  const k = Math.max(0.03, Math.min(0.14, Math.abs(Number(amount))));
  const c = F();
  sampleWarp(ctx, (x, y, w, h) => {
    const cy = h * Math.min(c.ly, c.ry) - h * (c.ery || 0.02) * 1.8;
    const rx = w * Math.max(0.16, c.frx * 0.95);
    const ry = h * Math.max(0.04, c.fry * 0.18);
    const dx = (x - w * c.fx) / rx;
    const dy = (y - cy) / ry;
    const r2 = dx * dx + dy * dy;
    if (r2 >= 1) return [x, y];
    return [x, y - (1 - r2) ** 2 * h * k];
  });
}
function cheekFillWarp(ctx, amount = 0.08) {
  const k = Math.max(0.03, Math.min(0.14, Math.abs(Number(amount))));
  const dir = Number(amount) < 0 ? -1 : 1;
  const c = F();
  const cy = (c.ly + c.my) / 2;
  sampleWarp(ctx, (x, y, w, h) => {
    let sx = x;
    for (const side of [-1, 1]) {
      const cx = w * (c.fx + side * c.frx * 0.55);
      const dx = (x - cx) / (w * Math.max(0.06, c.frx * 0.38));
      const dy = (y - h * cy) / (h * Math.max(0.05, c.fry * 0.28));
      const r2 = dx * dx + dy * dy;
      if (r2 >= 1) continue;
      const fall = (1 - r2) ** 2;
      sx += (x - w * c.fx) * dir * k * fall * 0.35;
    }
    return [sx, y];
  });
}
function buccalWarp(ctx, amount = 0.08) {
  cheekFillWarp(ctx, -Math.abs(Number(amount) || 0.08));
}
function lipLiftWarp(ctx, amount = 0.08) {
  const k = Math.max(0.03, Math.min(0.14, Math.abs(Number(amount))));
  const c = F();
  sampleWarp(ctx, (x, y, w, h) => {
    const mx = w * c.mx;
    const my = h * c.my;
    const rx = w * Math.max(0.05, c.mw * 1.4);
    const ry = h * Math.max(0.03, c.mh * 2.2);
    const dx = (x - mx) / rx;
    const dy = (y - my) / ry;
    const r2 = dx * dx + dy * dy;
    if (r2 >= 1 || y > my + ry * 0.2) return [x, y];
    return [x, y - (1 - r2) ** 2 * h * k * 0.55];
  });
}
function neckLiftWarp(ctx, amount = 0.07) {
  const k = Math.max(0.03, Math.min(0.12, Math.abs(Number(amount))));
  const c = F();
  const top = c.fy + c.fry * 0.95;
  sampleWarp(ctx, (x, y, w, h) => {
    const t = y / h;
    if (t < top) return [x, y];
    const nx = Math.abs(x / w - c.fx) / Math.max(0.08, c.frx * 0.7);
    if (nx > 1.2) return [x, y];
    const band = Math.min(1, (t - top) / 0.18);
    return [w * c.fx + (x - w * c.fx) * (1 - k * band * (1 - nx)), y - band * (1 - nx) * h * k * 0.35];
  });
}
function foldFill(ctx, spots, amount = 0.08) {
  const k = Math.max(0.04, Math.min(0.16, Math.abs(Number(amount))));
  const { width: w, height: h } = ctx.canvas;
  sampleWarp(ctx, (x, y, w0, h0) => {
    let sx = x;
    let sy = y;
    for (const s of spots) {
      const dx = (x - w0 * s.x) / (w0 * s.rx);
      const dy = (y - h0 * s.y) / (h0 * s.ry);
      const r2 = dx * dx + dy * dy;
      if (r2 >= 1) continue;
      const fall = (1 - r2) ** 2;
      sx += (w0 * s.ox || 0) * k * fall;
      sy += (h0 * s.oy || 0) * k * fall;
    }
    return [sx, sy];
  });
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (const s of spots) m += ellipseW(x, y, w * s.x, h * s.y, w * s.rx, h * s.ry);
      if (m <= 0) continue;
      const i = (y * w + x) * 4;
      const t = Math.min(1, m) * k * 1.6;
      d[i] = clamp(d[i] + 22 * t);
      d[i + 1] = clamp(d[i + 1] + 16 * t);
      d[i + 2] = clamp(d[i + 2] + 12 * t);
    }
  ctx.putImageData(img, 0, 0);
}
function nasolabialFill(ctx, amount = 0.08) {
  const c = F();
  foldFill(
    ctx,
    [
      { x: (c.lx + c.mx) / 2, y: (c.ly + c.my) / 2 + 0.02, rx: 0.045, ry: 0.07, ox: 0.015, oy: -0.01 },
      { x: (c.rx + c.mx) / 2, y: (c.ry + c.my) / 2 + 0.02, rx: 0.045, ry: 0.07, ox: -0.015, oy: -0.01 },
    ],
    amount,
  );
}
function marionetteFill(ctx, amount = 0.08) {
  const c = F();
  foldFill(
    ctx,
    [
      { x: c.mx - (c.mw || 0.05), y: c.my + (c.mh || 0.02) * 1.6, rx: 0.03, ry: 0.05, ox: 0.01, oy: -0.012 },
      { x: c.mx + (c.mw || 0.05), y: c.my + (c.mh || 0.02) * 1.6, rx: 0.03, ry: 0.05, ox: -0.01, oy: -0.012 },
    ],
    amount,
  );
}
function templeFill(ctx, amount = 0.08) {
  const c = F();
  foldFill(
    ctx,
    [
      { x: c.lx - (c.erx || 0.04) * 1.6, y: c.ly - (c.ery || 0.02) * 2.2, rx: 0.05, ry: 0.045, ox: 0.012, oy: 0.008 },
      { x: c.rx + (c.erx || 0.04) * 1.6, y: c.ry - (c.ery || 0.02) * 2.2, rx: 0.05, ry: 0.045, ox: -0.012, oy: 0.008 },
    ],
    amount,
  );
}
function jawLine(ctx) {
  unsharp(ctx, 0.45, 1);
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const c = F();
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const jaw0 = c.fy + c.fry * 0.2;
    if (t < jaw0) continue;
    const side = Math.min(1, (t - jaw0) / Math.max(0.08, c.fry));
    for (let x = 0; x < w; x++) {
      const nx = Math.abs(x / w - c.fx) / Math.max(0.08, c.frx);
      if (nx > 1.25) continue;
      const i = (y * w + x) * 4;
      const edge = Math.max(0, nx - 0.45);
      const dark = 1 - side * edge * 0.22;
      d[i] = clamp(d[i] * dark);
      d[i + 1] = clamp(d[i + 1] * dark);
      d[i + 2] = clamp(d[i + 2] * dark * 0.98);
    }
  }
  ctx.putImageData(img, 0, 0);
}
function skin(ctx) {
  const { width: w, height: h } = ctx.canvas;
  const src = ctx.getImageData(0, 0, w, h);
  const low = boxBlur(src, 6);
  const mid = boxBlur(src, 2);
  const d = src.data;
  const L = low.data;
  const M = mid.data;
  const c = F();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const face = ellipseW(x, y, w * c.fx, h * c.fy, w * c.frx * 1.2, h * c.fry * 1.25);
      if (face <= 0) continue;
      const i = (y * w + x) * 4;
      if (!isSkinPx(d[i], d[i + 1], d[i + 2])) continue;
      const eye =
        ellipseW(x, y, w * c.lx, h * c.ly, w * (c.erx || 0.04) * 1.6, h * (c.ery || 0.02) * 1.7) +
        ellipseW(x, y, w * c.rx, h * c.ry, w * (c.erx || 0.04) * 1.6, h * (c.ery || 0.02) * 1.7);
      const mouth = ellipseW(x, y, w * c.mx, h * c.my, w * (c.mw || 0.07) * 1.3, h * (c.mh || 0.03) * 1.4);
      if (eye > 0.2 || mouth > 0.2) continue;
      const hi =
        Math.abs(d[i] - M[i]) + Math.abs(d[i + 1] - M[i + 1]) + Math.abs(d[i + 2] - M[i + 2]);
      const amt = face * 0.84 * (1 - Math.min(1, hi / 56));
      d[i] = d[i] * (1 - amt) + L[i] * amt;
      d[i + 1] = d[i + 1] * (1 - amt) + L[i + 1] * amt;
      d[i + 2] = d[i + 2] * (1 - amt) + L[i + 2] * amt;
    }
  ctx.putImageData(src, 0, 0);
}
function evenTone(ctx) {
  const { width: w, height: h } = ctx.canvas;
  const src = ctx.getImageData(0, 0, w, h);
  const blur = boxBlur(src, 4);
  const d = src.data;
  const b = blur.data;
  const c = F();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const m = ellipseW(x, y, w * c.fx, h * c.fy, w * c.frx * 1.15, h * c.fry * 1.2);
      if (m <= 0) continue;
      if (!isSkinPx(d[i], d[i + 1], d[i + 2])) continue;
      const k = m * 0.42;
      d[i] = d[i] * (1 - k) + b[i] * k;
      d[i + 1] = d[i + 1] * (1 - k) + b[i + 1] * k;
      d[i + 2] = d[i + 2] * (1 - k) + b[i + 2] * k;
    }
  ctx.putImageData(src, 0, 0);
}
function hdEnhance(ctx) {
  mixBlur(ctx, 0.18, 1);
  unsharp(ctx, 1.25, 1);
  unsharp(ctx, 0.4, 2);
  gradePixels(ctx, {
    contrast: 1.12,
    brightness: 5,
    saturate: 1.1,
    hue: -2,
    warmth: 6,
    lift: 4,
    gamma: 0.97,
  });
}
function unblur(ctx) {
  unsharp(ctx, 1.6, 2);
  unsharp(ctx, 0.7, 1);
  gradePixels(ctx, {
    contrast: 1.08,
    brightness: 2,
    saturate: 1.04,
    hue: 0,
    warmth: 0,
    lift: 0,
    gamma: 1,
  });
}
function colorize(ctx) {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const gch = d[i + 1];
    const b = d[i + 2];
    const l = r * 0.299 + gch * 0.587 + b * 0.114;
    const sat = Math.max(r, gch, b) - Math.min(r, gch, b);
    const t = 1 - Math.min(1, sat / 48);
    d[i] = clamp(l + 28 * t + (r - l) * (1 + 0.35 * t));
    d[i + 1] = clamp(l + 8 * t + (gch - l) * (1 + 0.2 * t));
    d[i + 2] = clamp(l - 12 * t + (b - l) * (1 + 0.45 * t));
  }
  ctx.putImageData(img, 0, 0);
  unsharp(ctx, 0.35, 1);
}
function eyeColor(ctx, color = "#2f6b4a") {
  const [cr, cg, cb] = parseHex(color);
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const m =
        ellipseW(x, y, w * 0.35, h * 0.38, w * 0.07, h * 0.032) +
        ellipseW(x, y, w * 0.65, h * 0.38, w * 0.07, h * 0.032);
      if (m <= 0) continue;
      const i = (y * w + x) * 4;
      const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      if (l > 200 || l < 28) continue;
      const k = Math.min(1, m) * 0.55;
      d[i] = clamp(d[i] * (1 - k) + cr * k);
      d[i + 1] = clamp(d[i + 1] * (1 - k) + cg * k);
      d[i + 2] = clamp(d[i + 2] * (1 - k) + cb * k);
    }
  ctx.putImageData(img, 0, 0);
}
function cutoutSubject(ctx) {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const m = ellipseW(x, y, w * 0.5, h * 0.48, w * 0.38, h * 0.52);
      d[(y * w + x) * 4 + 3] = Math.round(Math.min(1, m * 1.25) * 255);
    }
  ctx.putImageData(img, 0, 0);
}
function applyFrame(ctx, style = "crystal") {
  const { width: w, height: h } = ctx.canvas;
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const tctx = tmp.getContext("2d");
  if (!tctx) return;
  tctx.drawImage(ctx.canvas, 0, 0);
  if (style === "polaroid") {
    const insetX = w * 0.07;
    const insetTop = h * 0.07;
    const insetBot = h * 0.16;
    ctx.fillStyle = "#f3efe6";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(
      tmp,
      insetX,
      insetTop,
      w - insetX * 2,
      h - insetTop - insetBot,
    );
    return;
  }
  ctx.drawImage(tmp, 0, 0);
  const color =
    style === "ember"
      ? "#ff7a3c"
      : style === "orbit"
        ? "#4da3ff"
        : style === "thin"
          ? "#e8f4f0"
          : "#1ee6a0";
  const t = style === "thin" ? 6 : 14;
  ctx.strokeStyle = color;
  ctx.lineWidth = t;
  ctx.strokeRect(t / 2, t / 2, w - t, h - t);
  if (style !== "thin") {
    ctx.strokeStyle = "rgba(232,244,240,0.28)";
    ctx.lineWidth = 2;
    ctx.strokeRect(t + 6, t + 6, w - (t + 6) * 2, h - (t + 6) * 2);
  }
}
function restore(ctx) {
  mixBlur(ctx, 0.22, 1);
  unsharp(ctx, 0.7, 1);
  gradePixels(ctx, {
    contrast: 1.08,
    brightness: 4,
    saturate: 1.06,
    hue: -2,
    warmth: 8,
    lift: 6,
    gamma: 0.96,
  });
}
function animateLight(ctx) {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    const dodge = l > 140 ? (l - 140) / 255 : 0;
    d[i] = clamp(d[i] + dodge * 42 + 6);
    d[i + 1] = clamp(d[i + 1] + dodge * 28);
    d[i + 2] = clamp(d[i + 2] + dodge * 10 - 4);
  }
  ctx.putImageData(img, 0, 0);
  unsharp(ctx, 0.35, 1);
}
function ellipseW(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return Math.max(0, 1 - (dx * dx + dy * dy));
}
function eyes(ctx) {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const c = F();
  const erx = w * Math.max(0.02, c.erx || c.frx * 0.3);
  const ery = h * Math.max(0.01, c.ery || c.fry * 0.14);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const m =
        ellipseW(x, y, w * c.lx, h * c.ly, erx, ery) +
        ellipseW(x, y, w * c.rx, h * c.ry, erx, ery);
      if (m <= 0) continue;
      const i = (y * w + x) * 4;
      const k = Math.min(1, m) * 0.28;
      d[i] = clamp(d[i] + 28 * k);
      d[i + 1] = clamp(d[i + 1] + 26 * k);
      d[i + 2] = clamp(d[i + 2] + 22 * k);
    }
  ctx.putImageData(img, 0, 0);
}
function teeth(ctx, amount = 70) {
  const step = amount >= 85 ? 3 : amount >= 50 ? 2 : 1;
  const str = step === 1 ? 0.42 : step === 2 ? 0.72 : 1.05;
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const c = F();
  const rx = w * Math.max(0.03, c.mw * (1 + (step - 1) * 0.08));
  const ry = h * Math.max(0.014, c.mh * (1.15 + (step - 1) * 0.08));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const m = ellipseW(x, y, w * c.mx, h * c.my, rx, ry);
      if (m <= 0) continue;
      const i = (y * w + x) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const l = r * 0.299 + g * 0.587 + b * 0.114;
      const yellow = r > 58 && g > 44 && r + g > b * 1.75 && l > 42;
      const pale = l > 72 && Math.abs(r - g) < 56;
      if (!yellow && !pale) continue;
      const k = m * (yellow ? 0.78 : 0.5) * str;
      const yb = Math.max(0, (r + g) / 2 - b);
      const white = step === 3 ? 252 : step === 2 ? 246 : 238;
      d[i] = clamp(r * (1 - k) + white * k - yb * (0.12 + 0.1 * step) * k);
      d[i + 1] = clamp(g * (1 - k) + white * k - yb * (0.06 + 0.04 * step) * k);
      d[i + 2] = clamp(b * (1 - k) + 255 * k + yb * (0.32 + 0.12 * step) * k);
    }
  ctx.putImageData(img, 0, 0);
}
function gumHealth(ctx, amount = 80) {
  const a = Math.max(0.35, Math.min(1, Number(amount) / 100));
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const c = F();
  const mx = w * c.mx;
  const my = h * c.my;
  const rx = w * Math.max(0.034, c.mw * 1.18);
  const ry = h * Math.max(0.016, c.mh * 1.55);
  const tr = rx * 0.72;
  const ty = ry * 0.55;
  const gr = 201;
  const gg = 98;
  const gb = 112;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const band =
        ellipseW(x, y, mx, my - ry * 0.42, rx, ry * 0.7) +
        ellipseW(x, y, mx, my + ry * 0.38, rx, ry * 0.62);
      if (band <= 0) continue;
      const tooth = ellipseW(x, y, mx, my, tr, ty);
      if (tooth > 0.35) continue;
      const i = (y * w + x) * 4;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const l = r * 0.299 + g * 0.587 + b * 0.114;
      if (l > 168) continue;
      const gum = r > g + 6 && r > b + 4 && l > 38 && l < 168;
      if (!gum) continue;
      const k = Math.min(1, band) * (0.38 + 0.42 * a);
      d[i] = clamp(r * (1 - k) + gr * k);
      d[i + 1] = clamp(g * (1 - k) + gg * k);
      d[i + 2] = clamp(b * (1 - k) + gb * k);
    }
  ctx.putImageData(img, 0, 0);
}
function lipstick(ctx, color = "#a82a3a") {
  const [cr, cg, cb] = parseHex(color);
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const c = F();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const m = ellipseW(x, y, w * c.mx, h * c.my, w * c.mw, h * (c.mh + 0.008));
      if (m <= 0) continue;
      const i = (y * w + x) * 4;
      const k = m * 0.62;
      d[i] = clamp(d[i] * (1 - k) + cr * k);
      d[i + 1] = clamp(d[i + 1] * (1 - k) + cg * k);
      d[i + 2] = clamp(d[i + 2] * (1 - k) + cb * k);
    }
  ctx.putImageData(img, 0, 0);
}
function blush(ctx) {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const c = F();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const m =
        ellipseW(x, y, w * (c.lx - c.frx * 0.15), h * (c.fy + c.fry * 0.22), w * c.frx * 0.42, h * c.fry * 0.28) +
        ellipseW(x, y, w * (c.rx + c.frx * 0.15), h * (c.fy + c.fry * 0.22), w * c.frx * 0.42, h * c.fry * 0.28);
      if (m <= 0) continue;
      const i = (y * w + x) * 4;
      const k = Math.min(1, m) * 0.42;
      d[i] = clamp(d[i] * (1 - k) + 210 * k);
      d[i + 1] = clamp(d[i + 1] * (1 - k) + 110 * k);
      d[i + 2] = clamp(d[i + 2] * (1 - k) + 120 * k);
    }
  ctx.putImageData(img, 0, 0);
}
function contour(ctx) {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const nx = Math.abs(x / w - 0.5) * 2;
      const k =
        ellipseW(x, y, w * 0.5, h * 0.45, w * 0.32, h * 0.42) * nx * nx * 0.18;
      if (k <= 0) continue;
      const i = (y * w + x) * 4;
      d[i] *= 1 - k;
      d[i + 1] *= 1 - k;
      d[i + 2] *= 1 - k;
    }
  ctx.putImageData(img, 0, 0);
}
function hairGlaze(ctx, color = "#284058") {
  const [cr, cg, cb] = parseHex(color);
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const c = F();
  const hx = w * c.fx;
  const hy = h * Math.max(0.06, c.fy - c.fry * 0.95);
  const hrx = w * Math.max(0.16, c.frx * 1.55);
  const hry = h * Math.max(0.16, c.fry * 1.05);
  const faceBot = (c.fy + c.fry * 0.05) * h;
  for (let y = 0; y < h; y++) {
    if (y > faceBot) continue;
    for (let x = 0; x < w; x++) {
      const m = ellipseW(x, y, hx, hy, hrx, hry);
      if (m <= 0.04) continue;
      const i = (y * w + x) * 4;
      if (isSkinPx(d[i], d[i + 1], d[i + 2])) continue;
      const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      if (lum > 210) continue;
      const k = Math.min(1, m) * (lum < 40 ? 0.55 : 0.88);
      d[i] = clamp(d[i] * (1 - k) + cr * k);
      d[i + 1] = clamp(d[i + 1] * (1 - k) + cg * k);
      d[i + 2] = clamp(d[i + 2] * (1 - k) + cb * k);
    }
  }
  ctx.putImageData(img, 0, 0);
}
function autoHeal(ctx) {
  const { width: w, height: h } = ctx.canvas;
  const src = ctx.getImageData(0, 0, w, h);
  const blur = boxBlur(src, 6);
  const d = src.data;
  const b = blur.data;
  const c = F();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const face = ellipseW(x, y, w * c.fx, h * c.fy, w * c.frx * 1.15, h * c.fry * 1.2);
      if (face <= 0) continue;
      const eye =
        ellipseW(x, y, w * c.lx, h * c.ly, w * c.erx * 1.4, h * c.ery * 1.5) +
        ellipseW(x, y, w * c.rx, h * c.ry, w * c.erx * 1.4, h * c.ery * 1.5);
      const mouth = ellipseW(x, y, w * c.mx, h * c.my, w * c.mw * 1.3, h * c.mh * 1.4);
      if (eye > 0.15 || mouth > 0.15) continue;
      const i = (y * w + x) * 4;
      if (!isSkinPx(d[i], d[i + 1], d[i + 2])) continue;
      const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      const bl = b[i] * 0.299 + b[i + 1] * 0.587 + b[i + 2] * 0.114;
      const spot = Math.max(0, Math.abs(bl - lum));
      const k = Math.min(1, spot / 12) * 0.95 * face;
      if (k < 0.05) continue;
      d[i] = d[i] * (1 - k) + b[i] * k;
      d[i + 1] = d[i + 1] * (1 - k) + b[i + 1] * k;
      d[i + 2] = d[i + 2] * (1 - k) + b[i + 2] * k;
    }
  ctx.putImageData(src, 0, 0);
}
function autoDodge(ctx) {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const m =
        ellipseW(x, y, w * 0.38, h * 0.46, w * 0.11, h * 0.055) +
        ellipseW(x, y, w * 0.62, h * 0.46, w * 0.11, h * 0.055) +
        ellipseW(x, y, w * 0.5, h * 0.32, w * 0.2, h * 0.08);
      if (m <= 0) continue;
      const i = (y * w + x) * 4;
      const k = Math.min(1, m) * 0.32;
      d[i] = clamp(d[i] + 40 * k);
      d[i + 1] = clamp(d[i + 1] + 34 * k);
      d[i + 2] = clamp(d[i + 2] + 28 * k);
    }
  ctx.putImageData(img, 0, 0);
}
function relight(ctx, dir = "right") {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const nx = x / w;
      const ny = y / h;
      let k = 0;
      if (dir === "left") k = (0.55 - nx) * 12;
      else if (dir === "right") k = (nx - 0.35) * 10;
      else if (dir === "front")
        k = (1 - Math.abs(nx - 0.5) * 1.4) * 7 - ny * 2;
      else if (dir === "top")
        k = (0.42 - ny) * 14 + (1 - Math.abs(nx - 0.5)) * 3;
      else
        k = (Math.abs(nx - 0.5) * 2 - 0.35) * 11 - (1 - Math.abs(nx - 0.5)) * 3;
      const i = (y * w + x) * 4;
      d[i] = clamp(d[i] + k * 0.7);
      d[i + 1] = clamp(d[i + 1] + k * 0.55);
      d[i + 2] = clamp(d[i + 2] + k * 0.4);
    }
  ctx.putImageData(img, 0, 0);
}
function bgBlur(ctx) {
  const { width: w, height: h } = ctx.canvas;
  const src = ctx.getImageData(0, 0, w, h);
  const blur = boxBlur(src, 4);
  const d = src.data;
  const b = blur.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const m = ellipseW(x, y, w * 0.5, h * 0.46, w * 0.34, h * 0.46);
      const i = (y * w + x) * 4;
      const k = 1 - Math.min(1, m);
      d[i] = d[i] * (1 - k) + b[i] * k;
      d[i + 1] = d[i + 1] * (1 - k) + b[i + 1] * k;
      d[i + 2] = d[i + 2] * (1 - k) + b[i + 2] * k;
    }
  ctx.putImageData(src, 0, 0);
}
function glowSkin(ctx) {
  animateLight(ctx);
  mixBlur(ctx, 0.22, 1);
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const c = F();
  for (let i = 0; i < d.length; i += 4) {
    const x = (i / 4) % w;
    const y = Math.floor(i / 4 / w);
    const dx = (x / w - c.fx) / Math.max(0.08, c.frx);
    const dy = (y / h - c.fy) / Math.max(0.08, c.fry);
    if (dx * dx + dy * dy > 1.05) continue;
    d[i] = Math.min(255, d[i] + 42);
    d[i + 1] = Math.min(255, d[i + 1] + 30);
    d[i + 2] = Math.min(255, d[i + 2] + 26);
  }
  ctx.putImageData(img, 0, 0);
}
function autoBeauty(ctx) {
  restore(ctx);
  skin(ctx);
  evenTone(ctx);
  glowSkin(ctx);
  eyes(ctx);
  teeth(ctx);
  unsharp(ctx, 0.32, 1);
}
function smileLift(ctx) {
  const c = F();
  sampleWarp(ctx, (x, y, w, h) => {
    const mx = w * c.mx;
    const my = h * c.my;
    const rx = w * Math.max(0.04, c.mw * 1.35);
    const ry = h * Math.max(0.02, c.mh * 1.8);
    const dx = (x - mx) / rx;
    const dy = (y - my) / ry;
    const r2 = dx * dx + dy * dy;
    if (r2 >= 1) return [x, y];
    const fall = 1 - r2;
    const corner = Math.abs(dx);
    return [x + dx * rx * 0.06 * fall, y - ry * 0.42 * fall * corner];
  });
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const m = ellipseW(x, y, w * c.mx, h * c.my, w * (c.mw + 0.02), h * (c.mh + 0.012));
      if (m <= 0) continue;
      const i = (y * w + x) * 4;
      const k = m * 0.42;
      d[i] = clamp(d[i] + 32 * k);
      d[i + 1] = clamp(d[i + 1] + 22 * k);
      d[i + 2] = clamp(d[i + 2] + 14 * k);
    }
  ctx.putImageData(img, 0, 0);
  teeth(ctx);
}
function browFill(ctx) {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const m =
        ellipseW(x, y, w * 0.34, h * 0.33, w * 0.1, h * 0.022) +
        ellipseW(x, y, w * 0.66, h * 0.33, w * 0.1, h * 0.022);
      if (m <= 0) continue;
      const i = (y * w + x) * 4;
      const k = Math.min(1, m) * 0.32;
      d[i] *= 1 - k * 0.55;
      d[i + 1] *= 1 - k * 0.5;
      d[i + 2] *= 1 - k * 0.45;
    }
  ctx.putImageData(img, 0, 0);
}
function lashLine(ctx) {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const m =
        ellipseW(x, y, w * 0.35, h * 0.405, w * 0.09, h * 0.018) +
        ellipseW(x, y, w * 0.65, h * 0.405, w * 0.09, h * 0.018);
      if (m <= 0) continue;
      const i = (y * w + x) * 4;
      const k = Math.min(1, m) * 0.45;
      d[i] *= 1 - k;
      d[i + 1] *= 1 - k;
      d[i + 2] *= 1 - k;
    }
  ctx.putImageData(img, 0, 0);
}
function sparkleDots(ctx) {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let n = 0; n < 48; n++) {
    const x = Math.floor((((n * 73) % 97) / 97) * w * 0.7 + w * 0.15);
    const y = Math.floor((((n * 47) % 89) / 89) * h * 0.55 + h * 0.12);
    const i = (y * w + x) * 4;
    if (i < 0 || i >= d.length) continue;
    d[i] = 255;
    d[i + 1] = 250;
    d[i + 2] = 240;
    if (x + 1 < w) {
      const j = (y * w + x + 1) * 4;
      d[j] = clamp(d[j] + 80);
      d[j + 1] = clamp(d[j + 1] + 70);
    }
  }
  ctx.putImageData(img, 0, 0);
}
function vintageGrade(ctx) {
  gradePixels(ctx, {
    contrast: 0.98,
    brightness: 3,
    saturate: 0.9,
    hue: 4,
    warmth: 8,
    lift: 4,
    gamma: 0.97,
  });
  vignette(ctx, 0.22);
}
function frostGrade(ctx) {
  gradePixels(ctx, {
    contrast: 1.08,
    brightness: 14,
    saturate: 0.82,
    hue: -8,
    warmth: -16,
    lift: 10,
    gamma: 0.96,
  });
}
function jawShadow(ctx) {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    if (y / h < 0.52) continue;
    for (let x = 0; x < w; x++) {
      const m = ellipseW(x, y, w * 0.5, h * 0.72, w * 0.22, h * 0.14);
      if (m <= 0) continue;
      const i = (y * w + x) * 4;
      const k = m * 0.18;
      d[i] *= 1 - k;
      d[i + 1] *= 1 - k * 0.9;
      d[i + 2] *= 1 - k * 0.8;
    }
  }
  ctx.putImageData(img, 0, 0);
}
function matteSkin(ctx) {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const m = ellipseW(x, y, w * 0.5, h * 0.44, w * 0.3, h * 0.38);
      if (m <= 0) continue;
      const i = (y * w + x) * 4;
      const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      if (l < 150) continue;
      const k = m * ((l - 150) / 105) * 0.38;
      d[i] = clamp(d[i] - 22 * k);
      d[i + 1] = clamp(d[i + 1] - 18 * k);
      d[i + 2] = clamp(d[i + 2] - 14 * k);
    }
  ctx.putImageData(img, 0, 0);
}
function tanSkin(ctx) {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const m = ellipseW(x, y, w * 0.5, h * 0.46, w * 0.32, h * 0.42);
      if (m <= 0) continue;
      const i = (y * w + x) * 4;
      const k = m * 0.42;
      d[i] = clamp(d[i] * (1 - k) + 186 * k);
      d[i + 1] = clamp(d[i + 1] * (1 - k) + 128 * k);
      d[i + 2] = clamp(d[i + 2] * (1 - k) + 86 * k);
    }
  ctx.putImageData(img, 0, 0);
}
function freckleDots(ctx) {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let n = 0; n < 86; n++) {
    const side = n % 2 === 0 ? 0.28 : 0.72;
    const x = Math.floor(side * w + (((n * 37) % 21) - 10) * (w / 220));
    const y = Math.floor(h * 0.5 + (((n * 19) % 17) - 8) * (h / 180));
    if (x < 0 || x >= w || y < 0 || y >= h) continue;
    const i = (y * w + x) * 4;
    d[i] = clamp(d[i] * 0.72);
    d[i + 1] = clamp(d[i + 1] * 0.62);
    d[i + 2] = clamp(d[i + 2] * 0.52);
  }
  ctx.putImageData(img, 0, 0);
}
function darkCircleLift(ctx) {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const c = F();
  const rx = w * Math.max(0.03, (c.erx || 0.04) * 1.35);
  const ry = h * Math.max(0.016, (c.ery || 0.02) * 1.4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const m =
        ellipseW(x, y, w * c.lx, h * (c.ly + (c.ery || 0.02) * 1.6), rx, ry) +
        ellipseW(x, y, w * c.rx, h * (c.ry + (c.ery || 0.02) * 1.6), rx, ry);
      if (m <= 0) continue;
      const i = (y * w + x) * 4;
      const k = Math.min(1, m) * 0.62;
      d[i] = clamp(d[i] + 48 * k);
      d[i + 1] = clamp(d[i + 1] + 38 * k);
      d[i + 2] = clamp(d[i + 2] + 32 * k);
    }
  ctx.putImageData(img, 0, 0);
}
function plumpLips(ctx, amount = 70, shape = "natural") {
  const signed = Number(amount);
  const a = Math.max(0.12, Math.min(1, Math.abs(signed) / 100));
  const dir = signed < 0 ? -0.72 : 1;
  const c = F();
  const mx = c.mx || 0.5;
  const my = c.my || 0.52;
  const mw = Math.max(0.04, c.mw || 0.07);
  const mh = Math.max(0.018, c.mh || 0.028);
  let sx = 1;
  let sy = 1;
  let lift = 0;
  if (shape === "heart") {
    sy = 1.12;
    lift = 0.2;
  } else if (shape === "russian") {
    sx = 0.9;
    sy = 1.38;
    lift = 0.42;
  } else if (shape === "pillow") {
    sx = 1.22;
    sy = 1.08;
  } else if (shape === "cupid") {
    sx = 1.06;
    sy = 1.16;
    lift = 0.28;
  }
  sampleWarp(ctx, (x, y, w, h) => {
    const dx = (x - w * mx) / (w * mw * 2.15 * sx);
    const dy = (y - h * my) / (h * mh * 2.6 * sy);
    const r2 = dx * dx + dy * dy;
    if (r2 >= 1) return [x, y];
    const fall = 1 - r2;
    return [
      x - dx * w * mw * 0.85 * a * fall * dir,
      y - dy * h * mh * 1.05 * a * fall * dir - lift * h * mh * 1.4 * a * fall * Math.max(0, dir),
    ];
  });
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const m = ellipseW(x, y, w * mx, h * my, w * mw * 1.15 * sx, h * mh * 1.25 * sy);
      if (m <= 0) continue;
      const i = (y * w + x) * 4;
      const k = Math.min(1, m) * (0.22 + 0.5 * a);
      d[i] = clamp(d[i] + (14 + 28 * a) * k);
      d[i + 1] = clamp(d[i + 1] + (5 + 10 * a) * k);
      d[i + 2] = clamp(d[i + 2] + (4 + 8 * a) * k);
    }
  ctx.putImageData(img, 0, 0);
}
function eyeShadow(ctx, color = "#8a7060") {
  const [cr, cg, cb] = parseHex(color);
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const m =
        ellipseW(x, y, w * 0.35, h * 0.36, w * 0.11, h * 0.04) +
        ellipseW(x, y, w * 0.65, h * 0.36, w * 0.11, h * 0.04);
      if (m <= 0) continue;
      const i = (y * w + x) * 4;
      const k = Math.min(1, m) * 0.34;
      d[i] = clamp(d[i] * (1 - k) + cr * k);
      d[i + 1] = clamp(d[i + 1] * (1 - k) + cg * k);
      d[i + 2] = clamp(d[i + 2] * (1 - k) + cb * k);
    }
  ctx.putImageData(img, 0, 0);
}
function eyeLiner(ctx) {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const m =
        ellipseW(x, y, w * 0.36, h * 0.392, w * 0.1, h * 0.012) +
        ellipseW(x, y, w * 0.64, h * 0.392, w * 0.1, h * 0.012);
      if (m <= 0) continue;
      const i = (y * w + x) * 4;
      const k = Math.min(1, m) * 0.7;
      d[i] *= 1 - k;
      d[i + 1] *= 1 - k;
      d[i + 2] *= 1 - k;
    }
  ctx.putImageData(img, 0, 0);
}
function letterboxBars(ctx) {
  const { width: w, height: h } = ctx.canvas;
  const bar = Math.round(h * 0.055);
  ctx.fillStyle = "#1a1216";
  ctx.fillRect(0, 0, w, bar);
  ctx.fillRect(0, h - bar, w, bar);
}
function dehaze(ctx) {
  gradePixels(ctx, {
    contrast: 1.16,
    brightness: 4,
    saturate: 1.08,
    hue: 0,
    warmth: 2,
    lift: -6,
    gamma: 0.96,
  });
}
function clarity(ctx) {
  unsharp(ctx, 1.15, 1);
  unsharp(ctx, 0.35, 2);
}
async function compositeBackdrop(ctx, src) {
  const bg = await loadImage(src);
  const { width: w, height: h } = ctx.canvas;
  const subject = ctx.getImageData(0, 0, w, h);
  ctx.drawImage(bg, 0, 0, w, h);
  const back = ctx.getImageData(0, 0, w, h);
  const s = subject.data;
  const b = back.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const m = ellipseW(x, y, w * 0.5, h * 0.42, w * 0.42, h * 0.56);
      const i = (y * w + x) * 4;
      const k = Math.min(1, m * 1.4);
      b[i] = b[i] * (1 - k) + s[i] * k;
      b[i + 1] = b[i + 1] * (1 - k) + s[i + 1] * k;
      b[i + 2] = b[i + 2] * (1 - k) + s[i + 2] * k;
    }
  ctx.putImageData(back, 0, 0);
}
export function magicErase(ctx, nx, ny, radius = 42) {
  healSpot(ctx, nx, ny, radius);
}
export function magicDodge(ctx, nx, ny, radius = 36) {
  paintDab(ctx, "dodge", nx, ny, radius, 1, null);
}

export function healSpot(ctx, nx, ny, radius = 42) {
  const { width: w, height: h } = ctx.canvas;
  const cx = Math.round(nx * w);
  const cy = Math.round(ny * h);
  const r = Math.max(10, Math.round(radius * (w / 800)));
  const pad = Math.round(r * 0.85);
  const x0 = Math.max(0, cx - r - pad);
  const y0 = Math.max(0, cy - r - pad);
  const x1 = Math.min(w, cx + r + pad + 1);
  const y1 = Math.min(h, cy + r + pad + 1);
  const rw = x1 - x0;
  const rh = y1 - y0;
  if (rw < 4 || rh < 4) return;
  const img = ctx.getImageData(x0, y0, rw, rh);
  const d = img.data;
  const lcx = cx - x0;
  const lcy = cy - y0;
  let sr = 0,
    sg = 0,
    sb = 0,
    n = 0;
  for (let y = 0; y < rh; y++)
    for (let x = 0; x < rw; x++) {
      const dist = Math.hypot(x - lcx, y - lcy);
      if (dist > r * 0.7 && dist < r + pad) {
        const i = (y * rw + x) * 4;
        sr += d[i];
        sg += d[i + 1];
        sb += d[i + 2];
        n++;
      }
    }
  if (!n) return;
  sr /= n;
  sg /= n;
  sb /= n;
  for (let y = 0; y < rh; y++)
    for (let x = 0; x < rw; x++) {
      const dist = Math.hypot(x - lcx, y - lcy);
      if (dist > r + pad) continue;
      const fall = 1 - dist / (r + pad);
      const a = Math.min(1, fall * fall * 0.96);
      const i = (y * rw + x) * 4;
      d[i] = d[i] * (1 - a) + sr * a;
      d[i + 1] = d[i + 1] * (1 - a) + sg * a;
      d[i + 2] = d[i + 2] * (1 - a) + sb * a;
    }
  ctx.putImageData(img, x0, y0);
}

export function blankPortrait() {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const g = ctx.createLinearGradient(0, 0, 0, 1024);
  g.addColorStop(0, "#d5c6b0");
  g.addColorStop(0.55, "#c4b396");
  g.addColorStop(1, "#b39c82");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 768, 1024);
  ctx.fillStyle = "rgba(90, 48, 62, 0.14)";
  ctx.font = "600 26px Syne, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("EVENGIRL", 384, 508);
  ctx.font = "500 14px Figtree, sans-serif";
  ctx.fillText("Boş tuval", 384, 534);
  return canvas.toDataURL("image/jpeg", 0.92);
}

const BRUSH_SET = new Set([
  "erase",
  "blemish",
  "dodge",
  "lipstick",
  "blush",
  "contour",
  "glow",
  "skin",
  "darkcircle",
  "eyeshadow",
  "liner",
  "tan",
  "matte",
  "hair",
  "freckle",
  "plump",
  "brows",
  "lashes",
  "shadow",
  "teeth",
  "eyes",
]);

export function isBrushTool(id) {
  return BRUSH_SET.has(id);
}

function densifyPoints(points, minDist) {
  if (!points?.length) return [];
  if (points.length === 1) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(dist / Math.max(0.004, minDist)));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

function paintDab(ctx, tool, nx, ny, radius, intensity, color) {
  const { width: w, height: h } = ctx.canvas;
  const cx = Math.round(nx * w);
  const cy = Math.round(ny * h);
  const r = Math.max(5, Math.round(radius * (w / 1024)));
  const extra = tool === "erase" || tool === "blemish" || tool === "skin" || tool === "matte" ? 14 : 0;
  const x0 = Math.max(0, cx - r - extra);
  const y0 = Math.max(0, cy - r - extra);
  const x1 = Math.min(w, cx + r + extra + 1);
  const y1 = Math.min(h, cy + r + extra + 1);
  const rw = x1 - x0;
  const rh = y1 - y0;
  if (rw < 2 || rh < 2) return;
  const img = ctx.getImageData(x0, y0, rw, rh);
  const d = img.data;
  const lcx = cx - x0;
  const lcy = cy - y0;
  const t = clamp(intensity, 0.08, 1);
  let sr = 0,
    sg = 0,
    sb = 0,
    n = 0;
  if (tool === "erase" || tool === "blemish" || tool === "skin" || tool === "matte" || tool === "glow") {
    const inner = r * (tool === "blemish" ? 0.55 : 0.7);
    const outer = r + extra;
    for (let y = 0; y < rh; y++)
      for (let x = 0; x < rw; x++) {
        const dist = Math.hypot(x - lcx, y - lcy);
        if (dist > inner && dist < outer) {
          const i = (y * rw + x) * 4;
          sr += d[i];
          sg += d[i + 1];
          sb += d[i + 2];
          n++;
        }
      }
    if (n) {
      sr /= n;
      sg /= n;
      sb /= n;
    }
  }
  const hex = color ? parseHex(color) : null;
  const lip = hex || [168, 42, 58];
  const shadow = hex || [138, 112, 96];
  const hair = hex || [40, 64, 88];
  for (let y = 0; y < rh; y++)
    for (let x = 0; x < rw; x++) {
      const dist = Math.hypot(x - lcx, y - lcy);
      if (dist > r) continue;
      const fall = 1 - dist / r;
      const k = fall * fall * t;
      const i = (y * rw + x) * 4;
      const r0 = d[i];
      const g0 = d[i + 1];
      const b0 = d[i + 2];
      const lum = r0 * 0.299 + g0 * 0.587 + b0 * 0.114;
      if (tool === "erase" || tool === "blemish") {
        if (!n) continue;
        const a = k * (tool === "blemish" ? 0.92 : 0.78);
        d[i] = r0 * (1 - a) + sr * a;
        d[i + 1] = g0 * (1 - a) + sg * a;
        d[i + 2] = b0 * (1 - a) + sb * a;
      } else if (tool === "dodge") {
        const a = k * 0.42;
        d[i] = clamp(r0 + 48 * a);
        d[i + 1] = clamp(g0 + 42 * a);
        d[i + 2] = clamp(b0 + 34 * a);
      } else if (tool === "shadow" || tool === "contour") {
        const a = k * (tool === "contour" ? 0.28 : 0.34);
        d[i] = r0 * (1 - a);
        d[i + 1] = g0 * (1 - a);
        d[i + 2] = b0 * (1 - a * 0.92);
      } else if (tool === "lipstick" || tool === "plump") {
        const a = k * (tool === "plump" ? 0.28 : 0.46);
        d[i] = clamp(r0 * (1 - a) + lip[0] * a + (tool === "plump" ? 18 * k : 0));
        d[i + 1] = clamp(g0 * (1 - a) + lip[1] * a);
        d[i + 2] = clamp(b0 * (1 - a) + lip[2] * a);
      } else if (tool === "blush" || tool === "tan") {
        const cr = tool === "tan" ? 196 : 210;
        const cg = tool === "tan" ? 122 : 110;
        const cb = tool === "tan" ? 74 : 120;
        const a = k * (tool === "tan" ? 0.3 : 0.26);
        d[i] = clamp(r0 * (1 - a) + cr * a);
        d[i + 1] = clamp(g0 * (1 - a) + cg * a);
        d[i + 2] = clamp(b0 * (1 - a) + cb * a);
      } else if (tool === "eyeshadow") {
        const a = k * 0.4;
        d[i] = clamp(r0 * (1 - a) + shadow[0] * a);
        d[i + 1] = clamp(g0 * (1 - a) + shadow[1] * a);
        d[i + 2] = clamp(b0 * (1 - a) + shadow[2] * a);
      } else if (tool === "liner" || tool === "lashes" || tool === "brows") {
        const a = k * (tool === "liner" ? 0.62 : 0.48);
        d[i] = r0 * (1 - a);
        d[i + 1] = g0 * (1 - a);
        d[i + 2] = b0 * (1 - a);
      } else if (tool === "hair") {
        if (lum > 92 && k < 0.35) continue;
        const a = k * 0.42;
        d[i] = clamp(r0 * (1 - a) + hair[0] * a);
        d[i + 1] = clamp(g0 * (1 - a) + hair[1] * a);
        d[i + 2] = clamp(b0 * (1 - a) + hair[2] * a);
      } else if (tool === "skin") {
        if (!n) continue;
        const a = k * 0.55 * (1 - Math.min(1, Math.abs(lum - (sr * 0.299 + sg * 0.587 + sb * 0.114)) / 70));
        d[i] = r0 * (1 - a) + sr * a;
        d[i + 1] = g0 * (1 - a) + sg * a;
        d[i + 2] = b0 * (1 - a) + sb * a;
      } else if (tool === "matte") {
        const hi = Math.max(0, lum - 140) / 115;
        const a = k * 0.4 * hi;
        d[i] = r0 * (1 - a) + 168 * a;
        d[i + 1] = g0 * (1 - a) + 150 * a;
        d[i + 2] = b0 * (1 - a) + 140 * a;
      } else if (tool === "glow") {
        const a = k * 0.32;
        d[i] = clamp(r0 + 36 * a);
        d[i + 1] = clamp(g0 + 28 * a);
        d[i + 2] = clamp(b0 + 18 * a);
      } else if (tool === "darkcircle") {
        const a = k * 0.38;
        d[i] = clamp(r0 + 32 * a);
        d[i + 1] = clamp(g0 + 26 * a);
        d[i + 2] = clamp(b0 + 22 * a);
      } else if (tool === "eyes") {
        const a = k * 0.34;
        d[i] = clamp(r0 + 30 * a);
        d[i + 1] = clamp(g0 + 28 * a);
        d[i + 2] = clamp(b0 + 24 * a);
      } else if (tool === "teeth") {
        if (lum < 108) continue;
        const a = k * 0.4;
        const lift = (255 - lum) * 0.28 * a;
        d[i] = clamp(r0 + lift);
        d[i + 1] = clamp(g0 + lift);
        d[i + 2] = clamp(b0 + lift * 0.55);
      } else if (tool === "freckle") {
        const speck = ((x * 13 + y * 29 + cx * 7) % 11) / 11;
        if (speck > 0.22 || fall < 0.25) continue;
        const a = k * 0.45;
        d[i] = clamp(r0 * (1 - a) + 118 * a);
        d[i + 1] = clamp(g0 * (1 - a) + 72 * a);
        d[i + 2] = clamp(b0 * (1 - a) + 48 * a);
      }
    }
  ctx.putImageData(img, x0, y0);
}

export function paintStroke(ctx, tool, points, opts = {}) {
  bindCalib(ctx);
  const radius = opts.radius ?? 32;
  const intensity = (opts.intensity ?? 70) / 100;
  const color = opts.color;
  const samples = densifyPoints(points, (radius / 1024) * 0.38);
  for (const p of samples) paintDab(ctx, tool, p.x, p.y, radius, intensity, color);
}

export function applyGrade(ctx, grade) {
  gradePixels(ctx, grade);
}
export function applyAdjustments(ctx, a) {
  gradePixels(ctx, {
    contrast: 1 + a.contrast * 0.01,
    brightness: a.exposure * 0.8,
    saturate: 1 + a.saturate * 0.012,
    hue: 0,
    warmth: a.warmth * 0.7,
    lift: a.fade * 0.35 + a.shadows * 0.25,
    gamma: 1 - a.fade * 0.004 - a.highlights * 0.003,
  });
  if (a.highlights || a.shadows) {
    const { width: w, height: h } = ctx.canvas;
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const hi = a.highlights * 0.35;
    const sh = a.shadows * 0.35;
    for (let i = 0; i < d.length; i += 4) {
      const l = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
      const liftHi = l * l * hi;
      const liftSh = (1 - l) * (1 - l) * sh;
      d[i] = clamp(d[i] + liftHi - liftSh);
      d[i + 1] = clamp(d[i + 1] + liftHi - liftSh);
      d[i + 2] = clamp(d[i + 2] + liftHi - liftSh);
    }
    ctx.putImageData(img, 0, 0);
  }
  if (a.vignette) vignette(ctx, a.vignette / 80);
  if (a.grain) {
    const { width: w, height: h } = ctx.canvas;
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const amp = a.grain * 0.35;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * amp;
      d[i] = clamp(d[i] + n);
      d[i + 1] = clamp(d[i + 1] + n);
      d[i + 2] = clamp(d[i + 2] + n);
    }
    ctx.putImageData(img, 0, 0);
  }
}
export function cropCanvas(src, ratio) {
  if (ratio === "original") return src;
  const target = {
    "1:1": 1,
    "4:5": 4 / 5,
    "9:16": 9 / 16,
    "16:9": 16 / 9,
    "4:3": 4 / 3,
  }[ratio];
  const sw = src.width;
  const sh = src.height;
  const current = sw / sh;
  let cw = sw;
  let ch = sh;
  if (current > target) cw = sh * target;
  else ch = sw / target;
  const sx = (sw - cw) / 2;
  const sy = (sh - ch) / 2;
  const out = document.createElement("canvas");
  out.width = Math.round(cw);
  out.height = Math.round(ch);
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.drawImage(src, sx, sy, cw, ch, 0, 0, out.width, out.height);
  return out;
}
export function drawOverlays(ctx, overlays) {
  const { width: w, height: h } = ctx.canvas;
  for (const o of overlays)
    if (o.kind === "text") {
      ctx.save();
      ctx.fillStyle = o.color;
      ctx.font = `600 ${Math.round(o.size * w)}px Syne, sans-serif`;
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = 8;
      ctx.fillText(o.text, o.x * w, o.y * h);
      ctx.restore();
    } else {
      const x = o.x * w;
      const y = o.y * h;
      const s = o.scale * w * 0.12;
      ctx.save();
      ctx.translate(x, y);
      ctx.strokeStyle =
        o.sticker === "orbit"
          ? "#4da3ff"
          : o.sticker === "spark"
            ? "#ff7a3c"
            : "#1ee6a0";
      ctx.lineWidth = 3;
      if (o.sticker === "frame") ctx.strokeRect(-s, -s, s * 2, s * 2);
      else if (o.sticker === "orbit") {
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(0, 0, s, s * 0.35, Math.PI / 6, 0, Math.PI * 2);
        ctx.stroke();
      } else if (o.sticker === "spark") {
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.18, -s * 0.18);
        ctx.lineTo(s, 0);
        ctx.lineTo(s * 0.18, s * 0.18);
        ctx.lineTo(0, s);
        ctx.lineTo(-s * 0.18, s * 0.18);
        ctx.lineTo(-s, 0);
        ctx.lineTo(-s * 0.18, -s * 0.18);
        ctx.closePath();
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.7, s * 0.6);
        ctx.lineTo(-s * 0.7, s * 0.6);
        ctx.closePath();
        ctx.stroke();
      }
      ctx.restore();
    }
}
export function drawWatermark(ctx) {
  ctx.save();
  ctx.font = "600 16px Syne, sans-serif";
  ctx.fillStyle = "rgba(232,244,240,0.55)";
  ctx.textAlign = "right";
  ctx.fillText("EVENGIRL", ctx.canvas.width - 16, ctx.canvas.height - 16);
  ctx.restore();
}
export function applyTool(ctx, tool, opts = {}) {
  const intensity = opts.intensity ?? 70;
  const color = opts.color;
  const light = opts.light ?? "right";
  const tap =
    tool === "erase" ||
    tool === "blemish" ||
    tool === "dodge" ||
    tool === "backdrop" ||
    tool === "rotate" ||
    tool === "flip" ||
    tool === "cutout" ||
    tool === "frame" ||
    tool === "teeth" ||
    tool === "gums" ||
    tool === "smile" ||
    tool === "eyesbig" ||
    tool === "eyessmall" ||
    tool === "almond" ||
    tool === "eyein" ||
    tool === "eyeout" ||
    tool === "earbig" ||
    tool === "earsmall" ||
    tool === "nosebig" ||
    tool === "nosesmall" ||
    tool === "chin" ||
    tool === "hips" ||
    tool === "waist" ||
    tool === "lift" ||
    tool === "browlift" ||
    tool === "cheekfill" ||
    tool === "buccal" ||
    tool === "liplift" ||
    tool === "neck" ||
    tool === "nasolabial" ||
    tool === "marionette" ||
    tool === "temple" ||
    tool === "glow" ||
    tool === "skin" ||
    tool === "even" ||
    tool === "plump" ||
    tool === "darkcircle" ||
    tool === "hair" ||
    tool === "matte" ||
    tool === "tan";
  const run = () => {
    switch (tool) {
      case "restore":
        restore(ctx);
        break;
      case "auto":
        autoBeauty(ctx);
        break;
      case "skin":
        skin(ctx);
        break;
      case "even":
        evenTone(ctx);
        break;
      case "details":
        unsharp(ctx, 0.32, 1);
        break;
      case "jaw":
        jawLine(ctx);
        break;
      case "shape":
        pinch(ctx, 0.1);
        break;
      case "sharpen":
        unsharp(ctx, 1.05, 1);
        vignette(ctx, 0.45);
        break;
      case "denoise":
        mixBlur(ctx, 0.4, 2);
        unsharp(ctx, 0.25, 1);
        break;
      case "erase":
      case "blemish":
        autoHeal(ctx);
        break;
      case "dodge":
        autoDodge(ctx);
        break;
      case "backdrop":
      case "rotate":
      case "flip":
        break;
      case "animate":
        animateLight(ctx);
        break;
      case "eyes":
        eyes(ctx);
        break;
      case "teeth":
        teeth(ctx, intensity);
        break;
      case "gums":
        gumHealth(ctx, intensity);
        break;
      case "lipstick":
        lipstick(ctx, color ?? "#a82a3a");
        break;
      case "blush":
        blush(ctx);
        break;
      case "contour":
        contour(ctx);
        break;
      case "hair":
        hairGlaze(ctx, color ?? "#284058");
        break;
      case "relight":
        withIntensity(ctx, Math.min(intensity, 52), () => relight(ctx, light));
        break;
      case "bgblur":
        withIntensity(ctx, Math.min(intensity, 48), () => bgBlur(ctx));
        break;
      case "glow":
        glowSkin(ctx);
        break;
      case "hd":
        hdEnhance(ctx);
        break;
      case "unblur":
        unblur(ctx);
        break;
      case "colorize":
        colorize(ctx);
        break;
      case "eyecolor":
        eyeColor(ctx, color ?? "#2f6b4a");
        break;
      case "cutout":
        cutoutSubject(ctx);
        break;
      case "frame":
        applyFrame(ctx, opts.frame ?? "crystal");
        break;
      case "smile":
        smileLift(ctx);
        break;
      case "brows":
        browFill(ctx);
        break;
      case "lashes":
        lashLine(ctx);
        break;
      case "sparkle":
        sparkleDots(ctx);
        break;
      case "vintage":
        withIntensity(ctx, Math.min(intensity, 48), () => vintageGrade(ctx));
        break;
      case "frost":
        withIntensity(ctx, Math.min(intensity, 42), () => frostGrade(ctx));
        break;
      case "shadow":
        jawShadow(ctx);
        break;
      case "matte":
        matteSkin(ctx);
        break;
      case "tan":
        tanSkin(ctx);
        break;
      case "freckle":
        freckleDots(ctx);
        break;
      case "darkcircle":
        darkCircleLift(ctx);
        break;
      case "plump":
        plumpLips(ctx, intensity, opts.lipShape || "natural");
        break;
      case "hips":
        hipsWarp(ctx, ((intensity < 0 ? -1 : 1) * (0.05 + Math.min(0.12, Math.abs(intensity) / 800))));
        break;
      case "waist":
        waistWarp(ctx, ((intensity < 0 ? -1 : 1) * (0.04 + Math.min(0.11, Math.abs(intensity) / 850))));
        break;
      case "eyesbig":
        eyeScaleWarp(ctx, 0.3 + intensity / 400);
        eyes(ctx);
        break;
      case "eyessmall":
        eyeScaleWarp(ctx, -(0.24 + intensity / 500));
        break;
      case "almond":
        almondWarp(ctx);
        break;
      case "eyein":
        eyeSpaceWarp(ctx, -1);
        break;
      case "eyeout":
        eyeSpaceWarp(ctx, 1);
        break;
      case "earbig":
        earScaleWarp(ctx, 0.08 + intensity / 450);
        break;
      case "earsmall":
        earScaleWarp(ctx, -(0.08 + intensity / 480));
        break;
      case "nosebig":
        noseScaleWarp(ctx, 0.07 + intensity / 500);
        break;
      case "nosesmall":
        noseScaleWarp(ctx, -(0.07 + intensity / 520));
        break;
      case "chin":
        chinWarp(ctx, (intensity < 0 ? -1 : 1) * (0.05 + Math.abs(intensity) / 700));
        break;
      case "lift":
        faceLiftWarp(ctx);
        jawLine(ctx);
        break;
      case "browlift":
        browLiftWarp(ctx, 0.04 + Math.abs(intensity) / 900);
        break;
      case "cheekfill":
        cheekFillWarp(ctx, (intensity < 0 ? -1 : 1) * (0.04 + Math.abs(intensity) / 900));
        break;
      case "buccal":
        buccalWarp(ctx, 0.04 + Math.abs(intensity) / 900);
        break;
      case "liplift":
        lipLiftWarp(ctx, 0.04 + Math.abs(intensity) / 900);
        break;
      case "neck":
        neckLiftWarp(ctx, 0.04 + Math.abs(intensity) / 950);
        break;
      case "nasolabial":
        nasolabialFill(ctx, 0.05 + Math.abs(intensity) / 900);
        break;
      case "marionette":
        marionetteFill(ctx, 0.05 + Math.abs(intensity) / 900);
        break;
      case "temple":
        templeFill(ctx, 0.05 + Math.abs(intensity) / 900);
        break;
      case "eyeshadow":
        eyeShadow(ctx, color ?? "#8a7060");
        break;
      case "liner":
        eyeLiner(ctx);
        break;
      case "letterbox":
        letterboxBars(ctx);
        break;
      case "dehaze":
        dehaze(ctx);
        break;
      case "clarity":
        clarity(ctx);
    }
  };
  if (tap) run();
  else withIntensity(ctx, intensity, run);
}
export function rotateCanvas(src) {
  const out = document.createElement("canvas");
  out.width = src.height;
  out.height = src.width;
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.translate(out.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(src, 0, 0);
  return out;
}
export function flipHorizontal(src) {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  ctx.translate(out.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return out;
}
export async function processSource(src, kind, templateId, erase, opts = {}) {
  let canvas = makeCanvas(await loadImage(src), 800);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas yok");
  bindCalib(ctx);
  if (kind === "rotate") {
    canvas = rotateCanvas(canvas);
    return toJpeg(canvas, 0.88);
  }
  if (kind === "flip") {
    canvas = flipHorizontal(canvas);
    return toJpeg(canvas, 0.88);
  }
  if (kind === "cutout") {
    applyTool(ctx, "cutout", opts);
    return toPng(canvas);
  }
  if (kind === "template" || kind === "look") {
    const tpl = TEMPLATES.find((t) => t.id === templateId);
    if (tpl)
      withIntensity(ctx, opts.intensity ?? 100, () =>
        applyGrade(ctx, tpl.grade),
      );
  } else if (
    kind !== "original" &&
    kind !== "adjust" &&
    kind !== "design" &&
    kind !== "take"
  ) {
    if ((kind === "erase" || kind === "blemish") && erase) {
      healSpot(ctx, erase.x, erase.y, kind === "erase" ? 56 : 40);
    } else {
      applyTool(ctx, kind, opts);
      if (kind === "dodge" && erase) magicDodge(ctx, erase.x, erase.y, 36);
      if (kind === "backdrop" && opts.backdrop) await compositeBackdrop(ctx, opts.backdrop);
    }
  }
  return toJpeg(canvas, 0.88);
}
export async function processChain(src, steps, opts = {}) {
  const canvas = makeCanvas(await loadImage(src), 1100);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas yok");
  if (opts.calib) lockCalib(opts.calib);
  else bindCalib(ctx);
  for (const step of steps) applyTool(ctx, step, opts);
  if (opts.backdrop) await compositeBackdrop(ctx, opts.backdrop);
  return toJpeg(canvas, 0.88);
}
export async function processSpot(src, tool, nx, ny) {
  const canvas = makeCanvas(await loadImage(src), 1100);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas yok");
  bindCalib(ctx);
  if (tool === "teeth") teeth(ctx, 68);
  else if (tool === "gums") gumHealth(ctx, 80);
  else if (tool === "earbig") earScaleWarp(ctx, 0.14);
  else if (tool === "earsmall") earScaleWarp(ctx, -0.14);
  else if (tool === "nosebig") noseScaleWarp(ctx, 0.12);
  else if (tool === "nosesmall") noseScaleWarp(ctx, -0.12);
  else if (tool === "chin") chinWarp(ctx, 0.1);
  else if (tool === "smile") smileLift(ctx);
  else if (tool === "plump") plumpLips(ctx, 85, "natural");
  else if (tool === "darkcircle") darkCircleLift(ctx);
  else if (tool === "hips") hipsWarp(ctx, 0.1);
  else if (tool === "waist") waistWarp(ctx, 0.09);
  else if (tool === "hair") hairGlaze(ctx, "#284058");
  else {
    healSpot(ctx, nx, ny, tool === "erase" ? 62 : 48);
    if (tool === "glow") glowSkin(ctx);
  }
  return toJpeg(canvas, 0.9);
}
export async function processStroke(src, pts, radius = 72) {
  const canvas = makeCanvas(await loadImage(src), 1100);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas yok");
  bindCalib(ctx);
  const list = Array.isArray(pts) ? pts : [];
  if (!list.length) return toJpeg(canvas, 0.9);
  for (const p of list) healSpot(ctx, p.nx, p.ny, radius);
  skin(ctx);
  return toJpeg(canvas, 0.9);
}
export async function bakeDesign(params) {
  let canvas = makeCanvas(
    await loadImage(params.src),
    params.scale === 2 ? 2048 : 1440,
  );
  canvas = cropCanvas(canvas, params.ratio);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas yok");
  applyAdjustments(ctx, params.adjust);
  drawOverlays(ctx, params.overlays);
  if (params.watermark) drawWatermark(ctx);
  return params.format === "png" ? toPng(canvas) : toJpeg(canvas, 0.92);
}
export async function composeCollage(urls, layout = "grid4") {
  const imgs = await Promise.all(urls.slice(0, 4).map(loadImage));
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = layout === "wide" ? 720 : 1080;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas yok");
  ctx.fillStyle = "#050914";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let cells = [];
  const W = canvas.width;
  const H = canvas.height;
  const g = 8;
  if (layout === "split" || imgs.length === 2)
    cells = [
      {
        x: 0,
        y: 0,
        w: W / 2 - g / 2,
        h: H,
      },
      {
        x: W / 2 + g / 2,
        y: 0,
        w: W / 2 - g / 2,
        h: H,
      },
    ];
  else if (layout === "trio")
    cells = [
      {
        x: 0,
        y: 0,
        w: W * 0.62 - g / 2,
        h: H,
      },
      {
        x: W * 0.62 + g / 2,
        y: 0,
        w: W * 0.38 - g / 2,
        h: H / 2 - g / 2,
      },
      {
        x: W * 0.62 + g / 2,
        y: H / 2 + g / 2,
        w: W * 0.38 - g / 2,
        h: H / 2 - g / 2,
      },
    ];
  else if (layout === "wide") {
    const n = Math.min(3, imgs.length);
    const cw = W / n;
    cells = Array.from({ length: n }, (_, i) => ({
      x: i * cw + g / 2,
      y: 0,
      w: cw - g,
      h: H,
    }));
  } else
    cells = [
      {
        x: 0,
        y: 0,
        w: W / 2 - g / 2,
        h: H / 2 - g / 2,
      },
      {
        x: W / 2 + g / 2,
        y: 0,
        w: W / 2 - g / 2,
        h: H / 2 - g / 2,
      },
      {
        x: 0,
        y: H / 2 + g / 2,
        w: W / 2 - g / 2,
        h: H / 2 - g / 2,
      },
      {
        x: W / 2 + g / 2,
        y: H / 2 + g / 2,
        w: W / 2 - g / 2,
        h: H / 2 - g / 2,
      },
    ];
  imgs.slice(0, cells.length).forEach((im, i) => {
    const cell = cells[i];
    if (!cell) return;
    const scale = Math.max(cell.w / im.width, cell.h / im.height);
    const dw = im.width * scale;
    const dh = im.height * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cell.x, cell.y, cell.w, cell.h);
    ctx.clip();
    ctx.drawImage(
      im,
      cell.x + (cell.w - dw) / 2,
      cell.y + (cell.h - dh) / 2,
      dw,
      dh,
    );
    ctx.restore();
  });
  return toJpeg(canvas, 0.9);
}
export async function exportMotion(
  src,
  caption,
  seconds,
  style = "zoom",
  extras = [],
) {
  const urls =
    style === "reel" && extras.length >= 2 ? extras.slice(0, 4) : [src];
  const imgs = await Promise.all(urls.map(loadImage));
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 1280;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas yok");
  const stream = canvas.captureStream(30);
  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : "video/webm";
  const rec = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 25e5,
  });
  const chunks = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const done = new Promise((resolve, reject) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: mime }));
    rec.onerror = () => reject(new Error("Kayıt durdu"));
  });
  rec.start(100);
  const t0 = performance.now();
  const dur = seconds * 1e3;
  await new Promise((resolve) => {
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      const shot =
        imgs[Math.min(imgs.length - 1, Math.floor(t * imgs.length * 0.999))] ??
        imgs[0];
      const cover = Math.max(
        canvas.width / shot.width,
        canvas.height / shot.height,
      );
      let scale = cover * 1.08;
      let ox = 0;
      let oy = 0;
      if (style === "zoom") {
        scale = cover * (1.05 + t * 0.14);
        oy = -t * 36;
      } else if (style === "pull") {
        scale = cover * (1.2 - t * 0.12);
        oy = (t - 0.5) * 20;
      } else if (style === "pan") {
        scale = cover * 1.16;
        ox = (t - 0.5) * 80;
      } else if (style === "reel") {
        const local = (t * imgs.length) % 1;
        scale = cover * (1.06 + local * 0.1);
        oy = -local * 24;
        ox = Math.sin(local * Math.PI) * 16;
      } else if (style === "punch") {
        const p = t < 0.18 ? t / 0.18 : 1;
        scale = cover * (1.28 - p * 0.16);
        oy = (1 - p) * 40;
      } else if (style === "fade") {
        scale = cover * (1.06 + t * 0.06);
        oy = -t * 20;
        ctx.globalAlpha = 0.55 + t * 0.45;
      } else {
        scale = cover * (1.08 + Math.sin(t * Math.PI) * 0.04);
        oy = -t * 50;
        ox = Math.sin(t * Math.PI) * 18;
      }
      const dw = shot.width * scale;
      const dh = shot.height * scale;
      const dx = (canvas.width - dw) / 2 + ox;
      const dy = (canvas.height - dh) / 2 + oy;
      ctx.fillStyle = "#050914";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(shot, dx, dy, dw, dh);
      ctx.globalAlpha = 1;
      if (caption) {
        ctx.fillStyle = "rgba(5,9,20,0.45)";
        ctx.fillRect(0, canvas.height - 160, canvas.width, 160);
        ctx.fillStyle = "#e8f4f0";
        ctx.font = "600 36px Syne, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(caption, canvas.width / 2, canvas.height - 78);
      }
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
  rec.requestData();
  rec.stop();
  return done;
}
export function versionLabel(kind, templateId) {
  if (kind === "template" || kind === "look") {
    const tpl = TEMPLATES.find((t) => t.id === templateId);
    return tpl ? `Look · ${tpl.name}` : TOOL_LABEL.template;
  }
  return TOOL_LABEL[kind];
}
export function cssAdjust(a) {
  return `brightness(${1 + a.exposure / 120 + a.highlights / 220 - a.shadows / 280}) contrast(${1 + a.contrast / 140 - a.fade / 220}) saturate(${1 + a.saturate / 120}) hue-rotate(${a.warmth * 0.35}deg) sepia(${Math.max(0, a.warmth) / 220})`;
}

export async function processAgentPipeline(src, stages, grade, opts, onStage) {
  const img = await loadImage(src);
  const canvas = makeCanvas(img, 800);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas yok");
  const total = stages.length + (grade ? 1 : 0);
  let index = 0;
  for (const stage of stages) {
    for (const tool of stage.tools) applyTool(ctx, tool, opts);
    index += 1;
    const image = toJpeg(canvas, 0.88);
    await onStage(stage.hint, image, index, total);
  }
  if (grade) {
    const { width, height } = ctx.canvas;
    const before = ctx.getImageData(0, 0, width, height);
    applyGrade(ctx, grade);
    const after = ctx.getImageData(0, 0, width, height);
    const a = after.data;
    const b = before.data;
    const mix = 0.36;
    for (let i = 0; i < a.length; i += 4) {
      a[i] = b[i] + (a[i] - b[i]) * mix;
      a[i + 1] = b[i + 1] + (a[i + 1] - b[i + 1]) * mix;
      a[i + 2] = b[i + 2] + (a[i + 2] - b[i + 2]) * mix;
    }
    ctx.putImageData(after, 0, 0);
    index += 1;
    const image = toJpeg(canvas, 0.9);
    await onStage("Look mühürleniyor", image, index, total);
  }
  return toJpeg(canvas, 0.92);
}

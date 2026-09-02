type ClinicSpec = {
  tools?: string[];
  intensity?: number;
  color?: string;
  lipShape?: string;
  label?: string;
  key?: string;
  desk?: string;
};

type NativeBridge = {
  hasBanuba?: () => boolean;
  applyClinic?: (dataUrl: string, desk: string, tools: string, intensity: number, color: string) => string;
};

function native(): NativeBridge | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { EvenBridge?: NativeBridge }).EvenBridge || null;
}

export function hasBanuba() {
  try {
    if (native()?.hasBanuba?.()) return true;
  } catch {
    /* WebView yok */
  }
  return false;
}

export async function applyBanuba(src: string, spec: ClinicSpec): Promise<string | null> {
  const desk = spec.desk || guessDesk(spec);
  const tools = (spec.tools || []).join(",");
  const intensity = spec.intensity ?? 100;
  const color = spec.color || "";
  try {
    const out = native()?.applyClinic?.(src, desk, tools, intensity, color);
    if (out && out.startsWith("data:image")) return out;
  } catch {
    /* native yok */
  }
  return null;
}

function guessDesk(spec: ClinicSpec) {
  const k = `${spec.key || ""} ${spec.tools?.join(" ") || ""}`.toLowerCase();
  if (k.includes("hair") || k.includes("sac")) return "sac";
  if (k.includes("plump") || k.includes("lip") || k.includes("dudak")) return "dudak";
  if (k.includes("hip") || k.includes("waist") || k.includes("beden")) return "beden";
  if (k.includes("eye") || k.includes("teeth") || k.includes("chin") || k.includes("nose") || k.includes("yuz"))
    return "yuz";
  return "cilt";
}


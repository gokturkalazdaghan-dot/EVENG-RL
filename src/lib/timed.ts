export function withTimeout<T>(p: Promise<T>, ms: number, msg = "Zaman doldu. Tekrar dene."): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(msg)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export async function fetchTimed(url: string, init: RequestInit = {}, ms = 45_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("Zaman doldu.");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

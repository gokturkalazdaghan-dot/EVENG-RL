import { BearPair } from "@/components/mascots";
import { useEffect, useRef } from "react";

type Props = {
  onDone: () => void;
};

const SESSION_KEY = "even-splash-v1";

export function SplashScreen({ onDone }: Props) {
  const done = useRef(false);

  function finish() {
    if (done.current) return;
    done.current = true;
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
    onDone();
  }

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_KEY) === "1") {
        finish();
        return;
      }
    } catch {
      /* continue */
    }
    const reduce =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ms = reduce ? 120 : 520;
    const t = window.setTimeout(finish, ms);
    return () => window.clearTimeout(t);
  }, [onDone]);

  return (
    <div className="splash-root" data-splash>
      <span className="splash-orb splash-orb-a" aria-hidden />
      <span className="splash-orb splash-orb-b" aria-hidden />
      <span className="sparkle s1" aria-hidden />
      <span className="sparkle s2" aria-hidden />
      <span className="sparkle s3" aria-hidden />
      <span className="sparkle s4" aria-hidden />
      <BearPair size={92} />
      <p className="font-display neon-title mt-5 text-[2.15rem] font-semibold tracking-tight">EVENGIRL</p>
      <p className="mt-1 text-sm tracking-[0.18em] text-crystal uppercase">Glow studio</p>
      <span className="splash-track mt-8" aria-hidden>
        <span className="splash-fill" />
      </span>
      <p className="mt-5 text-xs text-subtle">Edit · looks · AI pack</p>
      <button
        type="button"
        className="absolute inset-0 z-10 cursor-pointer bg-transparent"
        aria-label="Continue"
        onClick={finish}
      />
    </div>
  );
}

import { useEffect } from "react";

export function CaptureGuard() {
  useEffect(() => {
    document.documentElement.classList.add("secure-app");
    const w = window as Window & { EvenBridge?: { setSecure?: (on: boolean) => void } };
    w.EvenBridge?.setSecure?.(true);

    const deny = (e: Event) => {
      e.preventDefault();
    };
    document.addEventListener("contextmenu", deny);
    document.addEventListener("dragstart", deny);
    document.addEventListener("copy", deny);
    document.addEventListener("cut", deny);

    const md = navigator.mediaDevices;
    const originalDisplay =
      md && typeof md.getDisplayMedia === "function" ? md.getDisplayMedia.bind(md) : null;
    if (originalDisplay) {
      md.getDisplayMedia = () => Promise.reject(new DOMException("NotAllowedError", "NotAllowedError"));
    }

    function onKey(e: KeyboardEvent) {
      const key = e.key;
      if (key === "PrintScreen" || (e.metaKey && e.shiftKey && (key === "3" || key === "4" || key === "5"))) {
        e.preventDefault();
      }
    }
    window.addEventListener("keyup", onKey);
    window.addEventListener("keydown", onKey);

    const lockVideos = () => {
      document.querySelectorAll("video").forEach((v) => {
        v.disablePictureInPicture = true;
        v.setAttribute("disablepictureinpicture", "");
        v.setAttribute("controlslist", "nodownload noremoteplayback");
      });
    };
    lockVideos();
    const mo = new MutationObserver(lockVideos);
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.documentElement.classList.remove("secure-app");
      document.removeEventListener("contextmenu", deny);
      document.removeEventListener("dragstart", deny);
      document.removeEventListener("copy", deny);
      document.removeEventListener("cut", deny);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("keydown", onKey);
      mo.disconnect();
      if (originalDisplay) md.getDisplayMedia = originalDisplay;
    };
  }, []);

  return null;
}

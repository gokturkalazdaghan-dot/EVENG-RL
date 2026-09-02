export type SoftNote = { title: string; body: string };

export function softNote(title: string, body: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SoftNote>("even:note", { detail: { title, body } }));
}

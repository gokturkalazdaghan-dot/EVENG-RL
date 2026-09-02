import { CrystalButton } from "@/components/crystal-button";
import { tryOpenPlayStore } from "@/lib/play-store";
import { useApp } from "@/lib/store";
import type { FeedbackKind } from "@/lib/types";
import { cn, FEEDBACK_MAIL, openFeedbackMail } from "@/lib/utils";
import { useEffect, useState } from "react";

const KINDS: { id: FeedbackKind; label: string }[] = [
  { id: "geri", label: "Geri bildirim" },
  { id: "istek", label: "İstek" },
  { id: "sikayet", label: "Şikayet" },
];

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ArmanaCredit() {
  return (
    <p className="armanalabs-neon" aria-label="Powered by ARMANALABS">
      <span className="armanalabs-glow" aria-hidden />
      <span className="armanalabs-tube" aria-hidden />
      <span className="armanalabs-copy">Powered by ARMANALABS</span>
    </p>
  );
}

export function FeedbackSheet({ open, onClose }: Props) {
  const sendFeedback = useApp((s) => s.sendFeedback);
  const flash = useApp((s) => s.flash);
  const feedbacks = useApp((s) => s.feedbacks);
  const [kind, setKind] = useState<FeedbackKind>("geri");
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) setSent(false);
  }, [open]);

  if (!open) return null;

  function submit() {
    const body = text.trim();
    if (!body) return;
    sendFeedback(kind, body);
    openFeedbackMail(kind, body);
    flash(`${FEEDBACK_MAIL} adresine yönlendirildi`);
    setText("");
    setSent(true);
  }

  function launchMail() {
    openFeedbackMail("geri");
    flash(`${FEEDBACK_MAIL} adresine yönlendirildi`);
  }

  return (
    <div
      className="absolute inset-0 z-[68] flex flex-col justify-end bg-bg-deep/80 p-4 pb-[max(1.1rem,env(safe-area-inset-bottom))]"
      data-feedback-sheet
    >
      <div className="panel-elevated max-h-[88%] overflow-y-auto rounded-[1.85rem] p-5">
        <p className="text-xs font-semibold tracking-[0.16em] text-muted">EVENGIRL</p>
        <h2 className="font-display mt-1 text-2xl font-semibold">Geri bildirim</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          İleti {FEEDBACK_MAIL} adresine e-posta olarak açılır. Kopyası bu cihazda da durur.
        </p>

        {sent ? (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-fg">E-posta uygulaması açıldı.</p>
            <CrystalButton size="lg" tone="azure" onClick={launchMail}>
              Tekrar e-posta aç
            </CrystalButton>
            <CrystalButton
              size="lg"
              tone="ghost"
              onClick={() => {
                tryOpenPlayStore("review");
              }}
            >
              Play Store’da değerlendir
            </CrystalButton>
            <CrystalButton
              tone="ghost"
              size="lg"
              onClick={() => {
                setSent(false);
                onClose();
              }}
            >
              Kapat
            </CrystalButton>
          </div>
        ) : (
          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div className="flex flex-wrap gap-2">
              {KINDS.map((item) => (
                <CrystalButton
                  key={item.id}
                  type="button"
                  size="sm"
                  pill
                  tone={kind === item.id ? "azure" : "ghost"}
                  onClick={() => setKind(item.id)}
                >
                  {item.label}
                </CrystalButton>
              ))}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              required
              placeholder="Ne ters gitti veya ne ekleyelim?"
              className="w-full resize-none rounded-2xl bg-inset px-3 py-2.5 text-sm text-fg outline-none ring-1 ring-line focus:ring-azure"
            />
            <CrystalButton type="submit" size="xl" tone="azure" data-feedback-send>
              E-posta ile gönder
            </CrystalButton>
            <CrystalButton tone="ghost" size="lg" onClick={onClose}>
              Vazgeç
            </CrystalButton>
          </form>
        )}

        {feedbacks.length ? (
          <p className={cn("mt-4 text-center text-xs text-subtle")}>
            Bu cihazda {feedbacks.length} ileti duruyor
          </p>
        ) : null}
      </div>
    </div>
  );
}

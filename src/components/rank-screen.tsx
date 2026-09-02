import { CrystalButton } from "@/components/crystal-button";
import { BOARD_RIVALS } from "@/lib/catalog";
import { emitEven } from "@/lib/play-store";
import { isPro, useApp } from "@/lib/store";
import { cn, formatPoints } from "@/lib/utils";
import { useMemo } from "react";

export function RankScreen() {
  const points = useApp((s) => s.points);
  const weekEnd = useApp((s) => s.weekEnd);
  const proUntil = useApp((s) => s.proUntil);
  const redeemPro = useApp((s) => s.redeemPro);
  const createProject = useApp((s) => s.createProject);

  const hoursLeft = Math.max(0, Math.round((weekEnd - Date.now()) / 3600_000));
  const board = useMemo(() => {
    const rows = [...BOARD_RIVALS.map((r) => ({ ...r, you: false })), { handle: "sen", points, you: true }];
    return rows.sort((a, b) => b.points - a.points).map((row, i) => ({ ...row, rank: i + 1 }));
  }, [points]);
  const you = board.find((r) => r.you);
  const others = board.filter((r) => !r.you);
  const pro = isPro(proUntil);

  return (
    <div className="flex flex-col gap-4 pb-8">
      <header>
        <h1 className="font-display text-[1.7rem] leading-tight font-semibold tracking-tight">
          Haftalık Even Sıralaması
        </h1>
        <p className="mt-1 text-sm text-muted">{hoursLeft} saat sonra sıfırlanır</p>
      </header>

      {you && you.rank <= 3 && !pro ? (
        <button
          type="button"
          className="btn-3d ember xl flex-col items-start gap-1 py-4 text-left"
          onClick={redeemPro}
        >
          <span className="font-display text-lg font-semibold">
            {you.rank}. sıra — 7 gün ücretsiz PRO
          </span>
          <span className="text-sm font-medium opacity-90">Kodu kullan</span>
        </button>
      ) : pro ? (
        <div className="btn-3d xl flex-col items-start gap-1 py-4 text-left">
          <p className="font-display text-lg font-semibold">PRO açık</p>
          <p className="text-sm font-medium opacity-80">Kristal araçlar bu hafta serbest.</p>
        </div>
      ) : (
        <div className="panel rounded-3xl p-4">
          <p className="text-sm text-muted">
            İlk üçe girin, 7 gün PRO kazanın. Araç kullandıkça puan birikir.
          </p>
        </div>
      )}

      {you ? (
        <div className="panel-elevated flex items-center gap-3 rounded-3xl p-3 shadow-[0_0_0_1px_rgb(77_163_255_/_0.45)]">
          <span className="story-ring grid size-14 place-items-center rounded-full" aria-hidden>
            <span className="grid size-12 place-items-center rounded-full bg-inset font-display text-sm font-semibold">
              Sen
            </span>
          </span>
          <div>
            <p className="font-display text-lg font-semibold">Sen</p>
            <p className="text-sm text-muted">
              {you.rank}. sıra · {formatPoints(you.points)} puan
            </p>
          </div>
        </div>
      ) : null}

      <ol className="flex flex-col">
        {others.map((row) => {
          const portrait =
            row.handle === "deniz"
              ? "/media/forest.jpg"
              : row.handle === "arda"
                ? "/media/portrait-arda.jpg"
                : row.handle === "elif"
                  ? "/media/portrait-elif.jpg"
                  : "/media/cafe.jpg";
          return (
            <li key={row.handle} className="flex items-center gap-3 border-b border-line py-3">
              <span className="w-6 text-right font-display text-lg tabular-nums text-muted">
                {row.rank}
              </span>
              <button
                type="button"
                aria-label={`@${row.handle} fotoğrafını stüdyoda aç`}
                className="size-11 overflow-hidden rounded-full bg-elevated"
                onClick={() => createProject(`@${row.handle}`, portrait)}
              >
                <img src={portrait} alt="" className="size-11 object-cover" />
              </button>
              <span className={cn("flex-1 font-medium")}>@{row.handle}</span>
              <span className="tabular-nums text-muted">{formatPoints(row.points)}</span>
            </li>
          );
        })}
      </ol>

      {you && you.rank <= 3 && !pro ? (
        <CrystalButton tone="orange" size="lg" onClick={redeemPro}>
          Kodu kullan — EVEN7
        </CrystalButton>
      ) : null}

      <CrystalButton tone="azure" size="lg" onClick={() => emitEven("paywall")}>
        {pro ? "PRO’yu Play’de yönet" : "Play Store’dan PRO al"}
      </CrystalButton>
    </div>
  );
}

import { CrystalButton } from "@/components/crystal-button";
import { PACK_LABEL, PACK_ORDER, TEMPLATES, feedAlt, templatesFor } from "@/lib/catalog";
import { emitEven } from "@/lib/play-store";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { FeedSort, TemplatePack } from "@/lib/types";
import { Bookmark, Ellipsis, Heart, MessageCircle, Share2, Shield } from "lucide-react";
import { useMemo, useState } from "react";

const SORTS: { id: FeedSort; label: string }[] = [
  { id: "popular", label: "Popüler" },
  { id: "new", label: "En Yeni" },
  { id: "trend", label: "Trend" },
];

export function FeedScreen() {
  const feed = useApp((s) => s.feed);
  const safeMode = useApp((s) => s.safeMode);
  const adultContent = useApp((s) => s.adultContent);
  const setSafeMode = useApp((s) => s.setSafeMode);
  const likePost = useApp((s) => s.likePost);
  const bookmarkPost = useApp((s) => s.bookmarkPost);
  const sharePost = useApp((s) => s.sharePost);
  const reportPost = useApp((s) => s.reportPost);
  const applyTemplate = useApp((s) => s.applyTemplate);
  const openLightbox = useApp((s) => s.openLightbox);
  const setTab = useApp((s) => s.setTab);
  const feedSort = useApp((s) => s.feedSort);
  const setFeedSort = useApp((s) => s.setFeedSort);
  const [market, setMarket] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pack, setPack] = useState<TemplatePack | "all">("all");

  const marketTpls = useMemo(() => (pack === "all" ? TEMPLATES : templatesFor(pack)), [pack]);
  const visible = useMemo(() => {
    const list = feed.filter((p) => !p.reported);
    if (feedSort === "new") return [...list].sort((a, b) => b.createdAt - a.createdAt);
    if (feedSort === "trend") {
      const now = Date.now();
      return [...list].sort((a, b) => {
        const sa = a.likes / Math.pow((now - a.createdAt) / 3600_000 + 2, 1.15);
        const sb = b.likes / Math.pow((now - b.createdAt) / 3600_000 + 2, 1.15);
        return sb - sa;
      });
    }
    return [...list].sort((a, b) => b.likes - a.likes);
  }, [feed, feedSort]);

  return (
    <div className="relative flex flex-col gap-5 pb-8">
      <header className="flex items-center justify-between px-1">
        <div>
          <p className="text-xs font-medium tracking-[0.18em] text-muted">EVENGIRL</p>
          <h1 className="font-display text-[1.85rem] font-semibold leading-none tracking-tight">
            Akış
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => emitEven("play")}
            className="btn-3d sm pill azure inline-flex items-center"
            aria-label="Play Store"
          >
            Play
          </button>
          <button
            type="button"
            onClick={() => setSafeMode(!safeMode)}
            className={cn(
              "btn-3d sm pill inline-flex items-center gap-1.5",
              safeMode ? "orbit" : "ghost",
            )}
          >
            <Shield className="size-3.5" />
            Safe Mode
          </button>
        </div>
      </header>

      <button
        type="button"
        data-create-cta
        onClick={() => setTab("generate")}
        className="btn-3d w-full"
      >
        Üret · görsel ve video
      </button>

      <div className="flex gap-2 overflow-x-auto px-0.5 pb-0.5" role="tablist" aria-label="Akış sıralaması">
        {SORTS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={feedSort === s.id}
            data-feed-sort={s.id}
            onClick={() => setFeedSort(s.id)}
            className={cn("btn-3d sm pill shrink-0", feedSort === s.id ? "" : "ghost")}
          >
            {s.label}
          </button>
        ))}
      </div>

      {visible.map((post) => {
        const blurred = post.sensitive && safeMode && !adultContent;
        return (
          <article key={post.id} className="panel enter-up rounded-3xl p-3" data-feed-post={post.id}>
            <div className="mb-3 flex items-center gap-3">
              <img src={post.image} alt="" className="size-9 rounded-full object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold leading-tight">@{post.handle}</p>
                <p className="text-xs text-muted">
                  {post.caption} · {post.model} · {post.time}
                </p>
              </div>
              <button
                type="button"
                aria-label="Daha fazla"
                className="grid size-11 place-items-center text-muted"
                onClick={() => setConfirmId(post.id)}
              >
                <Ellipsis className="size-5" />
              </button>
            </div>

            <button
              type="button"
              data-feed-photo
              aria-label={feedAlt(post)}
              className="relative block w-full overflow-hidden rounded-2xl text-left"
              onClick={() => openLightbox(post.id)}
            >
              <img
                src={post.image}
                alt={feedAlt(post)}
                className={cn("aspect-[4/5] w-full object-cover", blurred && "scale-105 blur-2xl")}
              />
              {blurred ? (
                <span className="absolute inset-0 flex items-center justify-center bg-bg/30">
                  <span className="rounded-full bg-bg/80 px-3 py-1.5 text-sm font-medium">
                    Safe Mode · dokun, detay
                  </span>
                </span>
              ) : (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg-deep/70 to-transparent px-3 py-2.5 text-xs font-medium">
                  {post.model} · {post.durationSec} sn · detay
                </span>
              )}
            </button>

            <div className="mt-3 flex flex-wrap items-center gap-1">
              <button
                type="button"
                data-feed-like
                className="feed-act"
                onClick={() => likePost(post.id)}
                aria-pressed={post.liked}
                aria-label="Beğen"
              >
                <Heart className={cn("size-4", post.liked ? "fill-ember text-ember" : "text-muted")} />
                <span className="tabular-nums text-muted">{post.likes}</span>
              </button>
              <button
                type="button"
                className="feed-act"
                onClick={() => openLightbox(post.id)}
                aria-label="Yorumlar"
              >
                <MessageCircle className="size-4 text-muted" />
                <span className="tabular-nums text-muted">{post.comments.length}</span>
              </button>
              <button
                type="button"
                data-feed-share
                className="feed-act"
                onClick={() => void sharePost(post.id)}
                aria-label="Paylaş"
              >
                <Share2 className="size-4 text-muted" />
              </button>
              <button
                type="button"
                data-feed-bookmark
                className="feed-act"
                onClick={() => bookmarkPost(post.id)}
                aria-pressed={post.bookmarked}
                aria-label="Kaydet"
              >
                <Bookmark className={cn("size-4", post.bookmarked ? "fill-crystal text-crystal" : "text-muted")} />
              </button>
              <div className="flex-1" />
              <CrystalButton
                size="sm"
                tone="orange"
                pill
                data-apply-look
                onClick={() => void applyTemplate(post.templateId, post.image)}
              >
                Look
              </CrystalButton>
              <CrystalButton size="sm" tone="ghost" pill onClick={() => setConfirmId(post.id)}>
                Rapor
              </CrystalButton>
            </div>
          </article>
        );
      })}

      <button
        type="button"
        onClick={() => setMarket(true)}
        className="panel enter-up flex min-h-14 items-center justify-between rounded-2xl px-4 text-left"
      >
        <span className="text-sm text-muted">Şablon Pazarı — {TEMPLATES.length} orijinal look</span>
        <span className="text-crystal text-xs font-semibold">Aç</span>
      </button>

      {confirmId ? (
        <div className="absolute inset-0 z-30 grid place-items-end bg-bg-deep/70 p-4">
          <div className="panel-elevated w-full rounded-3xl p-5">
            <h3 className="font-display text-lg font-semibold">Gönderiyi raporla</h3>
            <p className="mt-1 text-sm text-muted">Bu içerik akışınızdan kalkar. Hesap istenmez.</p>
            <div className="mt-5 flex gap-3">
              <CrystalButton tone="ghost" className="flex-1" onClick={() => setConfirmId(null)}>
                Vazgeç
              </CrystalButton>
              <CrystalButton
                tone="orange"
                className="flex-1"
                onClick={() => {
                  reportPost(confirmId);
                  setConfirmId(null);
                }}
              >
                Raporla
              </CrystalButton>
            </div>
          </div>
        </div>
      ) : null}

      {market ? (
        <div className="absolute inset-0 z-30 flex flex-col bg-bg">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 className="font-display text-xl font-semibold">Şablon Pazarı</h2>
            <CrystalButton size="sm" tone="ghost" pill onClick={() => setMarket(false)}>
              Kapat
            </CrystalButton>
          </div>
          <p className="px-5 pb-2 text-sm text-muted">
            {TEMPLATES.length} orijinal look — cihazda uygulanır.
          </p>
          <div className="flex gap-2 overflow-x-auto px-5 pb-3">
            <button
              type="button"
              onClick={() => setPack("all")}
              className={cn("btn-3d sm pill shrink-0", pack === "all" ? "" : "ghost")}
            >
              Tümü
            </button>
            {PACK_ORDER.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPack(p)}
                className={cn("btn-3d sm pill shrink-0", pack === p ? "" : "ghost")}
              >
                {PACK_LABEL[p]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 overflow-y-auto px-5 pb-10">
            {marketTpls.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                className="panel overflow-hidden rounded-2xl text-left"
                onClick={() => {
                  setMarket(false);
                  void applyTemplate(tpl.id);
                }}
              >
                <img src={tpl.preview} alt={`${tpl.name} look önizlemesi`} className="aspect-[3/4] w-full object-cover" />
                <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                  <span className="min-w-0 truncate text-sm font-medium">{tpl.name}</span>
                  <span
                    className={cn(
                      "shrink-0 text-[10px] font-semibold uppercase tracking-wide",
                      tpl.free ? "text-crystal" : "text-ember",
                    )}
                  >
                    {tpl.free ? "Ücretsiz" : "Pro"}
                  </span>
                </div>
                {tpl.pack ? (
                  <p className="px-2.5 pb-2 text-[10px] text-muted">{PACK_LABEL[tpl.pack]}</p>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

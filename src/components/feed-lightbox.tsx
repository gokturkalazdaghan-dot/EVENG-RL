import { CrystalButton } from "@/components/crystal-button";
import { feedAlt } from "@/lib/catalog";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Bookmark, Heart, MessageCircle, Share2, X } from "lucide-react";
import { useState } from "react";

export function FeedLightbox() {
  const id = useApp((s) => s.lightboxId);
  const feed = useApp((s) => s.feed);
  const closeLightbox = useApp((s) => s.closeLightbox);
  const likePost = useApp((s) => s.likePost);
  const bookmarkPost = useApp((s) => s.bookmarkPost);
  const commentPost = useApp((s) => s.commentPost);
  const sharePost = useApp((s) => s.sharePost);
  const applyTemplate = useApp((s) => s.applyTemplate);
  const createProject = useApp((s) => s.createProject);
  const [draft, setDraft] = useState("");
  const post = feed.find((p) => p.id === id);
  if (!post) return null;

  return (
    <div className="lightbox" data-lightbox={post.id} role="dialog" aria-modal="true" aria-label="Gönderi detayı">
      <button type="button" className="lightbox-dismiss" aria-label="Kapat" onClick={closeLightbox} />
      <div className="lightbox-card">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.16em] text-muted uppercase">
              {post.model} · {post.durationSec} sn
            </p>
            <h2 className="font-display mt-1 truncate text-xl font-semibold">@{post.handle}</h2>
            <p className="text-sm text-muted">{post.caption}</p>
          </div>
          <button
            type="button"
            className="grid size-11 shrink-0 place-items-center rounded-full text-muted"
            aria-label="Kapat"
            onClick={closeLightbox}
          >
            <X className="size-5" />
          </button>
        </header>

        <img src={post.image} alt={feedAlt(post)} className="lightbox-photo" />

        <p className="text-xs leading-relaxed text-muted">
          Model {post.model}. Look cihazda işlendi, sunucu yok. Orijinal durur.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-feed-like
            className="flex min-h-11 items-center gap-1.5 px-1 text-sm"
            onClick={() => likePost(post.id)}
          >
            <Heart className={cn("size-4", post.liked ? "fill-ember text-ember" : "text-muted")} />
            <span className="tabular-nums">{post.likes}</span>
          </button>
          <button
            type="button"
            className="flex min-h-11 items-center gap-1.5 px-1 text-sm text-muted"
            aria-label="Yorumlar"
          >
            <MessageCircle className="size-4" />
            <span className="tabular-nums">{post.comments.length}</span>
          </button>
          <button
            type="button"
            data-feed-share
            className="flex min-h-11 items-center gap-1.5 px-1 text-sm text-muted"
            onClick={() => void sharePost(post.id)}
          >
            <Share2 className="size-4" />
            Paylaş
          </button>
          <button
            type="button"
            data-feed-bookmark
            className="flex min-h-11 items-center gap-1.5 px-1 text-sm"
            onClick={() => bookmarkPost(post.id)}
          >
            <Bookmark className={cn("size-4", post.bookmarked ? "fill-crystal text-crystal" : "text-muted")} />
            {post.bookmarked ? "Kayıtlı" : "Kaydet"}
          </button>
        </div>

        <div className="flex gap-2">
          <CrystalButton
            size="sm"
            tone="orange"
            className="flex-1"
            onClick={() => {
              closeLightbox();
              void applyTemplate(post.templateId, post.image);
            }}
          >
            Look’u uygula
          </CrystalButton>
          <CrystalButton
            size="sm"
            tone="green"
            className="flex-1"
            onClick={() => {
              closeLightbox();
              createProject(`@${post.handle}`, post.image);
            }}
          >
            Stüdyoda aç
          </CrystalButton>
        </div>

        <ul className="lightbox-comments">
          {post.comments.length === 0 ? (
            <li className="text-xs text-subtle">İlk yorumu yazın. Metin cihazda kalır.</li>
          ) : (
            post.comments.map((c) => (
              <li key={c.id}>
                <span className="font-semibold">@{c.handle}</span> {c.text}
              </li>
            ))
          )}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (commentPost(post.id, draft)) setDraft("");
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={160}
            placeholder="Yorum — HTML yok"
            aria-label="Yorum"
            className="min-h-11 flex-1 rounded-2xl bg-inset px-3 text-sm outline-none ring-1 ring-line"
          />
          <CrystalButton size="sm" tone="ghost" type="submit">
            Gönder
          </CrystalButton>
        </form>
      </div>
    </div>
  );
}

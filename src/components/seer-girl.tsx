import { cn } from "@/lib/utils";
import type { OracleKind } from "@/lib/oracle";

const POSE: Record<OracleKind, { src: string; alt: string }> = {
  coffee: { src: "/media/seer/coffee.jpg?v=kaftan", alt: "Kahin, kaftan ve fincan" },
  palm: { src: "/media/seer/palm.jpg?v=kaftan", alt: "Kahin, kaftan ve açık avuç" },
  dream: { src: "/media/seer/dream.jpg?v=kaftan", alt: "Kahin, kaftan, rüya" },
};

export function SeerGirl({ pose, waiting = false }: { pose: OracleKind; waiting?: boolean }) {
  const card = POSE[pose] || POSE.coffee;
  return (
    <figure className={cn("seer-girl", `is-${pose}`, waiting && "is-wait")}>
      <img src={card.src} alt={card.alt} className="seer-art" draggable={false} />
    </figure>
  );
}

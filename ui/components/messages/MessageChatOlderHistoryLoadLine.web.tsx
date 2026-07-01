import { useEffect, useState } from "react";
import { scrollIndicatorHairlineBorderWidthPx } from "../../scrollIndicatorPx";
import { layout } from "../../theme";

type Props = {
  active: boolean;
  color: string;
};

/** 1px accent line at the chat header seam while older history pages load (web). */
export function MessageChatOlderHistoryLoadLine({ active, color }: Props) {
  const lineH = scrollIndicatorHairlineBorderWidthPx();
  const [phase, setPhase] = useState<"idle" | "loading" | "exit">("idle");

  useEffect(() => {
    if (active) {
      setPhase("loading");
      return;
    }
    setPhase((current) => (current === "loading" ? "exit" : current));
  }, [active]);

  useEffect(() => {
    if (phase !== "exit") return;
    const timer = window.setTimeout(() => setPhase("idle"), 220);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === "idle") return null;

  const className =
    phase === "loading"
      ? "hsp-chat-older-history-load-line"
      : "hsp-chat-older-history-load-line hsp-chat-older-history-load-line--done";

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: -lineH,
        height: lineH,
        pointerEvents: "none",
        zIndex: layout.authenticatedHome.scrollIndicatorOverlayZIndex + 1,
        overflow: "hidden",
      }}
    >
      <div className={className} style={{ height: lineH, backgroundColor: color }} />
    </div>
  );
}

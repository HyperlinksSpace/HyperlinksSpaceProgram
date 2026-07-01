import { useEffect, useRef, type CSSProperties } from "react";
import type { AnimationConfig, AnimationItem } from "lottie-web";
import lottie from "lottie-web/build/player/lottie_canvas";
import { telegramEmojiDebug } from "./telegramEmojiDebug";
import { useElementVisible } from "./useElementVisible.web";
import { MESSAGE_INLINE_EMOJI_VERTICAL_ALIGN_CSS } from "./messageChatLayout";

type Props = {
  animationData: object;
  widthPx: number;
  heightPx?: number;
  loop?: boolean;
  /** Smaller canvas + lower DPR for chat-list inline emoji (telegram-tt low-priority quality). */
  lowPriority?: boolean;
  /** Status badges: always paint frame 0 and skip the global active-player cap. */
  priority?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

const MAX_ACTIVE_PLAYERS = 24;
let activePlayerCount = 0;

function acquirePlaySlot(): boolean {
  if (activePlayerCount >= MAX_ACTIVE_PLAYERS) return false;
  activePlayerCount += 1;
  return true;
}

function releasePlaySlot(): void {
  activePlayerCount = Math.max(0, activePlayerCount - 1);
}

function forcePaintFrame(anim: AnimationItem): void {
  try {
    anim.goToAndStop(0, true);
    const renderer = anim.renderer as { renderFrame?: (frame: number) => void } | undefined;
    if (renderer?.renderFrame) {
      renderer.renderFrame(anim.currentFrame);
    }
  } catch {
    /* lottie not ready yet */
  }
}

function styleLottieCanvas(host: HTMLElement, widthPx: number, heightPx: number): void {
  const canvas = host.querySelector("canvas");
  if (!canvas) return;
  canvas.style.width = `${widthPx}px`;
  canvas.style.height = `${heightPx}px`;
  canvas.style.display = "block";
  canvas.style.verticalAlign = MESSAGE_INLINE_EMOJI_VERTICAL_ALIGN_CSS;
}

/** Canvas-based TGS loop — avoids lottie-react SVG DOM churn. */
export function TgsCanvasPlayer({
  animationData,
  widthPx,
  heightPx,
  loop = true,
  lowPriority = false,
  priority = false,
  className,
  style,
}: Props) {
  const height = heightPx ?? widthPx;
  const hostRef = useRef<HTMLSpanElement>(null);
  const animRef = useRef<AnimationItem | null>(null);
  const slotHeldRef = useRef(false);
  const visibleRef = useRef(true);
  const visible = useElementVisible(hostRef, { enabled: !priority });
  visibleRef.current = visible;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    host.replaceChildren();

    const shouldAutoplay = priority || visibleRef.current;
    const anim = lottie.loadAnimation({
      container: host,
      renderer: "canvas",
      loop,
      autoplay: shouldAutoplay,
      animationData,
      rendererSettings: {
        clearCanvas: true,
        progressiveLoad: false,
        hideOnTransparent: false,
      },
    } as AnimationConfig);
    animRef.current = anim;

    const onReady = () => {
      styleLottieCanvas(host, widthPx, height);
      forcePaintFrame(anim);
      const shouldPlay = priority || visibleRef.current;
      telegramEmojiDebug.playerAction("ready", {
        priority,
        visible: visibleRef.current,
        shouldPlay,
        hasCanvas: Boolean(host.querySelector("canvas")),
      });
      if (shouldPlay) {
        if (!slotHeldRef.current && (priority || acquirePlaySlot())) {
          slotHeldRef.current = true;
        }
        if (slotHeldRef.current || priority) {
          anim.play();
        }
      }
    };
    onReady();
    anim.addEventListener("DOMLoaded", onReady);
    anim.addEventListener("data_ready", onReady);

    return () => {
      if (slotHeldRef.current) {
        releasePlaySlot();
        slotHeldRef.current = false;
      }
      anim.removeEventListener("DOMLoaded", onReady);
      anim.removeEventListener("data_ready", onReady);
      anim.destroy();
      animRef.current = null;
      host.replaceChildren();
    };
  }, [animationData, widthPx, height, loop, lowPriority, priority]);

  useEffect(() => {
    const anim = animRef.current;
    if (!anim) return;

    const shouldPlay = priority || visible;

    if (shouldPlay) {
      if (!slotHeldRef.current && (priority || acquirePlaySlot())) {
        slotHeldRef.current = true;
        anim.play();
        telegramEmojiDebug.playerAction("play", { priority, visible, reason: "slot_acquired" });
      } else if (slotHeldRef.current) {
        anim.play();
        telegramEmojiDebug.playerAction("play", { priority, visible, reason: "slot_held" });
      } else {
        forcePaintFrame(anim);
        telegramEmojiDebug.playerAction("paint_only", { priority, visible, reason: "player_cap" });
      }
      return;
    }

    anim.pause();
    if (slotHeldRef.current) {
      releasePlaySlot();
      slotHeldRef.current = false;
    }
    forcePaintFrame(anim);
    telegramEmojiDebug.playerAction("pause", { priority, visible });
  }, [priority, visible]);

  return (
    <span
      ref={hostRef}
      className={className}
      style={{
        display: "inline-block",
        width: widthPx,
        height,
        verticalAlign: MESSAGE_INLINE_EMOJI_VERTICAL_ALIGN_CSS,
        lineHeight: 1,
        overflow: "visible",
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

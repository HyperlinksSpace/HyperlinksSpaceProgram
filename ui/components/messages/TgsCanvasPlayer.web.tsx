import { useEffect, useRef, type CSSProperties } from "react";
import type { AnimationConfig, AnimationItem } from "lottie-web";
import lottie from "lottie-web/build/player/lottie_canvas";
import { useElementVisible } from "./useElementVisible.web";

type Props = {
  animationData: object;
  widthPx: number;
  heightPx?: number;
  loop?: boolean;
  /** Smaller canvas + lower DPR for chat-list inline emoji (telegram-tt low-priority quality). */
  lowPriority?: boolean;
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

/** Canvas-based TGS loop — avoids lottie-react SVG DOM churn. */
export function TgsCanvasPlayer({
  animationData,
  widthPx,
  heightPx,
  loop = true,
  lowPriority = false,
  className,
  style,
}: Props) {
  const height = heightPx ?? widthPx;
  const hostRef = useRef<HTMLSpanElement>(null);
  const animRef = useRef<AnimationItem | null>(null);
  const slotHeldRef = useRef(false);
  const visible = useElementVisible(hostRef, { enabled: true });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    const quality = lowPriority ? 0.5 : 0.75;
    const renderW = Math.max(1, Math.round(widthPx * dpr * quality));
    const renderH = Math.max(1, Math.round(height * dpr * quality));

    const canvas = document.createElement("canvas");
    canvas.width = renderW;
    canvas.height = renderH;
    canvas.style.width = `${widthPx}px`;
    canvas.style.height = `${height}px`;
    canvas.style.display = "block";
    canvas.style.verticalAlign = "text-bottom";
    host.replaceChildren(canvas);

    const anim = lottie.loadAnimation({
      container: canvas,
      renderer: "canvas",
      loop,
      autoplay: false,
      animationData,
      rendererSettings: {
        clearCanvas: true,
        progressiveLoad: true,
        hideOnTransparent: true,
      },
    } as AnimationConfig);
    animRef.current = anim;

    const paintFirstFrame = () => {
      anim.goToAndStop(0, true);
    };
    paintFirstFrame();
    anim.addEventListener("DOMLoaded", paintFirstFrame);

    return () => {
      if (slotHeldRef.current) {
        releasePlaySlot();
        slotHeldRef.current = false;
      }
      anim.destroy();
      animRef.current = null;
      host.replaceChildren();
    };
  }, [animationData, widthPx, height, loop, lowPriority]);

  useEffect(() => {
    const anim = animRef.current;
    if (!anim) return;

    if (visible) {
      if (!slotHeldRef.current && acquirePlaySlot()) {
        slotHeldRef.current = true;
        anim.play();
      } else if (slotHeldRef.current) {
        anim.play();
      } else {
        anim.goToAndStop(0, true);
      }
      return;
    }

    anim.pause();
    if (slotHeldRef.current) {
      releasePlaySlot();
      slotHeldRef.current = false;
    }
  }, [visible]);

  return (
    <span
      ref={hostRef}
      className={className}
      style={{
        display: "inline-block",
        width: widthPx,
        height,
        verticalAlign: "text-bottom",
        lineHeight: 1,
        overflow: "hidden",
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

import { useEffect, useRef } from "react";

type TelegramBackButton = {
  show?: () => void;
  hide?: () => void;
  onClick?: (callback: () => void) => void;
  offClick?: (callback: () => void) => void;
};

function readBackButton(): TelegramBackButton | null {
  if (typeof window === "undefined") return null;
  const backButton = (window as Window).Telegram?.WebApp?.BackButton;
  if (!backButton || typeof backButton !== "object") return null;
  return backButton as TelegramBackButton;
}

/** Shows Telegram Mini App back (instead of close) while `enabled`; restores hide on cleanup. */
export function useTelegramWebAppBackButton(onBack: () => void, enabled: boolean) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!enabled) return;

    const backButton = readBackButton();
    if (!backButton?.show || !backButton.onClick) return;

    const handler = () => {
      onBackRef.current();
    };

    backButton.onClick(handler);
    backButton.show();

    return () => {
      backButton.offClick?.(handler);
      backButton.hide?.();
    };
  }, [enabled]);
}

import { createContext, useContext, useMemo, type ReactNode } from "react";

type TelegramMessagesConnectionCtx = {
  /** Live Telegram message stream connected (distinct from Telegram login). */
  isTelegramMessagesConnected: boolean;
};

const TelegramMessagesConnectionContext = createContext<TelegramMessagesConnectionCtx | null>(null);

/** Stub until Telegram message streaming is wired; default is disconnected. */
export function TelegramMessagesConnectionProvider({ children }: { children: ReactNode }) {
  const value = useMemo(
    (): TelegramMessagesConnectionCtx => ({
      isTelegramMessagesConnected: false,
    }),
    [],
  );
  return (
    <TelegramMessagesConnectionContext.Provider value={value}>{children}</TelegramMessagesConnectionContext.Provider>
  );
}

export function useTelegramMessagesConnection(): TelegramMessagesConnectionCtx {
  const ctx = useContext(TelegramMessagesConnectionContext);
  if (!ctx) {
    throw new Error("useTelegramMessagesConnection must be used within TelegramMessagesConnectionProvider");
  }
  return ctx;
}

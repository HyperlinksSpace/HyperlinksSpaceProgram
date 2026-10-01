import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { MessageChatBotWebAppSheet } from "./MessageChatBotWebAppSheet";

export type MessageChatBotWebAppSession = {
  url: string;
  title: string;
  launchId: string | null;
};

type MessageChatBotWebAppContextValue = {
  open: (session: MessageChatBotWebAppSession) => void;
  close: () => void;
  session: MessageChatBotWebAppSession | null;
};

const MessageChatBotWebAppContext = createContext<MessageChatBotWebAppContextValue | null>(
  null,
);

export function useMessageChatBotWebApp(): MessageChatBotWebAppContextValue | null {
  return useContext(MessageChatBotWebAppContext);
}

export function MessageChatBotWebAppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<MessageChatBotWebAppSession | null>(null);
  const open = useCallback((next: MessageChatBotWebAppSession) => {
    setSession(next);
  }, []);
  const close = useCallback(() => setSession(null), []);
  const value = useMemo(
    () => ({
      open,
      close,
      session,
    }),
    [close, open, session],
  );
  return (
    <MessageChatBotWebAppContext.Provider value={value}>
      {children}
      <MessageChatBotWebAppSheet session={session} onClose={close} />
    </MessageChatBotWebAppContext.Provider>
  );
}

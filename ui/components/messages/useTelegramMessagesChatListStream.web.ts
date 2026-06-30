import { useEffect, useRef } from "react";
import { buildApiUrl } from "../../../api/_base";
import { logPageDisplay } from "../../pageDisplayLog";

type Options = {
  enabled: boolean;
  getSinceRevision: () => number | null;
  onRevision: (revision: number) => void;
};

const STREAM_RECONNECT_MS = 3_000;

/** SSE push from gateway (via API proxy) — replaces fast chat-list polling on web. */
export function useTelegramMessagesChatListStream(options: Options): void {
  const { enabled, getSinceRevision, onRevision } = options;
  const onRevisionRef = useRef(onRevision);
  const getSinceRevisionRef = useRef(getSinceRevision);

  useEffect(() => {
    onRevisionRef.current = onRevision;
  }, [onRevision]);

  useEffect(() => {
    getSinceRevisionRef.current = getSinceRevision;
  }, [getSinceRevision]);

  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") {
      return;
    }

    let cancelled = false;
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (cancelled) return;
      eventSource?.close();

      const params = new URLSearchParams();
      const sinceRevision = getSinceRevisionRef.current();
      if (sinceRevision != null && sinceRevision > 0) {
        params.set("since_revision", String(sinceRevision));
      }
      const query = params.toString();
      const url = buildApiUrl(
        query ? `/api/telegram-messages-chats-stream?${query}` : "/api/telegram-messages-chats-stream",
      );

      eventSource = new EventSource(url);
      logPageDisplay("messages_chats_stream_connect", {
        sinceRevision: sinceRevision ?? null,
      });

      eventSource.addEventListener("revision", (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as { revision?: number };
          if (typeof data.revision === "number" && data.revision > 0) {
            onRevisionRef.current(data.revision);
          }
        } catch {
          /* ignore malformed event */
        }
      });

      eventSource.addEventListener("ready", () => {
        logPageDisplay("messages_chats_stream_ready", {
          sinceRevision: getSinceRevisionRef.current(),
        });
      });

      eventSource.onerror = () => {
        eventSource?.close();
        eventSource = null;
        if (cancelled) return;
        if (reconnectTimer != null) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, STREAM_RECONNECT_MS);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer != null) clearTimeout(reconnectTimer);
      eventSource?.close();
    };
  }, [enabled]);
}

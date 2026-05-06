import { useEffect, useLayoutEffect, useRef, useState, type ComponentRef } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { buildApiUrl } from "../../api/_base";
import {
  AUTHENTICATED_FEED_FETCH_TIMEOUT_MS,
  loadAuthenticatedFeedDeduped,
} from "../authenticatedFeedDedupedFetch";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../fonts";
import { logPageDisplay } from "../pageDisplayLog";
import { layout, type ThemeColors } from "../theme";
import { useTelegram } from "./Telegram";

const ROW_HEIGHT_PX = 40;
const ICON_PX = 30;
const ICON_TEXT_GAP_PX = 15;
const NAME_TIME_GAP_PX = 15;
const FONT_SIZE_PX = 15;
const LINE_HEIGHT_PX = 20;
const ROW_MARGIN_BOTTOM_PX = 20;

type FeedRow = {
  id: number;
  /** ISO string preferred; numeric epoch ms/s may appear after JSON coercion. */
  sent_at?: string | null | number | undefined;
  card_type: string;
  layout_variant: string | null;
  payload: unknown;
};

/**
 * Matches `sql/seed-welcome-messages.sql` (+ `database/feed.ts` welcome keys): shown immediately so
 * the feed is not an empty spinner while `/api/feed` reconciles rows (incl. after Strict Mode remount).
 */
const WELCOME_PLACEHOLDER_FEED_ITEMS: FeedRow[] = [
  {
    id: -1,
    sent_at: null,
    card_type: "system_action",
    layout_variant: "action_hint",
    payload: {
      welcome_order: 1,
      title: "Wallet created",
      subtitle: "Press to save 24 words",
      icon: { type: "svg_url", url: "/welcome_messages/welcome.svg" },
    },
  },
  {
    id: -2,
    sent_at: null,
    card_type: "user_status",
    layout_variant: "compact",
    payload: {
      welcome_order: 2,
      title: "You are likely a creator",
      subtitle: "Press to access creators page",
      icon: { type: "svg_url", url: "/welcome_messages/creator.svg" },
    },
  },
  {
    id: -3,
    sent_at: null,
    card_type: "transaction_asset",
    layout_variant: "value_trailing",
    payload: {
      welcome_order: 3,
      title: "NFT recieved",
      subtitle: "$24",
      trailing_label: "NFT recieved",
      icon: { type: "svg_url", url: "/welcome_messages/NFT.svg" },
    },
  },
  {
    id: -4,
    sent_at: null,
    card_type: "reward_token",
    layout_variant: "value_trailing",
    payload: {
      welcome_order: 4,
      title: "Token granted",
      subtitle: "$1",
      trailing_label: "+1 DLLR",
      icon: { type: "svg_url", url: "/welcome_messages/token.svg" },
    },
  },
  {
    id: -5,
    sent_at: null,
    card_type: "task_gig",
    layout_variant: "compact",
    payload: {
      welcome_order: 5,
      title: "Incoming task",
      subtitle: "$24",
      icon: { type: "svg_url", url: "/welcome_messages/task.svg" },
    },
  },
];

/** Shown whenever `sent_at` is absent (preview rows, or API lag until `/api/feed` hydrates). */
const FEED_TIME_PENDING_LABEL = "--:--";

function formatWallClock(raw: unknown): string {
  if (raw == null || raw === "") return "";
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = raw < 12_000_000_000 ? raw * 1000 : raw;
    const d = new Date(n);
    if (!Number.isNaN(d.getTime())) {
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${hh}:${mm}`;
    }
  }
  if (typeof raw === "string" && raw.trim()) {
    const d = new Date(raw.trim());
    if (!Number.isNaN(d.getTime())) {
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${hh}:${mm}`;
    }
  }
  return "";
}

function coercePayload(p: unknown): Record<string, unknown> {
  if (p && typeof p === "object" && !Array.isArray(p)) return p as Record<string, unknown>;
  return {};
}

function resolveIconUrl(icon: unknown): string | null {
  if (!icon || typeof icon !== "object") return null;
  const o = icon as { type?: string; url?: string; key?: string };
  if (o.type === "svg_url" || o.type === "preset") {
    const u = typeof o.url === "string" ? o.url : null;
    if (!u) return null;
    if (u.startsWith("http://") || u.startsWith("https://")) return u;
    return buildApiUrl(u.startsWith("/") ? u : `/${u}`);
  }
  return null;
}

function FeedFeedRow({
  item,
  isLast,
  colors,
}: {
  item: FeedRow;
  isLast: boolean;
  colors: ThemeColors;
}) {
  const p = coercePayload(item.payload);
  const title = typeof p.title === "string" ? p.title : "";
  const subtitle = typeof p.subtitle === "string" ? p.subtitle : "";
  const trailing =
    typeof p.trailing_label === "string" ? p.trailing_label : "";

  const iconUrl = resolveIconUrl(p.icon);
  const parsedClock = formatWallClock(item.sent_at);
  const timeLabel = parsedClock || FEED_TIME_PENDING_LABEL;
  const timeIsProvisional = !parsedClock;
  const gapTitleTime = !!(title.trim() && timeLabel.trim());
  const gapSubtitleTrailing = !!(subtitle.trim() && trailing.trim());

  const textBase = {
    fontFamily: Platform.OS === "web" ? WEB_UI_SANS_STACK : FONT_UI_SANS_REGULAR,
    fontSize: FONT_SIZE_PX,
    lineHeight: LINE_HEIGHT_PX,
    includeFontPadding: false,
    paddingVertical: 0,
  } as const;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        height: ROW_HEIGHT_PX,
        marginBottom: isLast ? 0 : ROW_MARGIN_BOTTOM_PX,
        width: "100%",
        alignSelf: "stretch",
      }}
    >
      <View
        style={{
          width: ICON_PX,
          height: ICON_PX,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {iconUrl ? (
          <Image
            source={{ uri: iconUrl }}
            accessibilityIgnoresInvertColors
            style={{ width: ICON_PX, height: ICON_PX }}
            contentFit="contain"
          />
        ) : (
          <View style={{ width: ICON_PX, height: ICON_PX, backgroundColor: colors.secondary }} />
        )}
      </View>
      <View style={{ width: ICON_TEXT_GAP_PX }} />
      <View style={{ flex: 1, minWidth: 0, justifyContent: "center" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            minHeight: LINE_HEIGHT_PX,
          }}
        >
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{
              ...textBase,
              flex: 1,
              minWidth: 0,
              color: colors.primary,
            }}
          >
            {title}
          </Text>
          {gapTitleTime ? <View style={{ width: NAME_TIME_GAP_PX }} /> : null}
          {timeLabel ? (
            <Text
              numberOfLines={1}
              style={{
                ...textBase,
                flexShrink: 0,
                color: timeIsProvisional ? colors.secondary : colors.primary,
              }}
            >
              {timeLabel}
            </Text>
          ) : null}
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            minHeight: LINE_HEIGHT_PX,
          }}
        >
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{
              ...textBase,
              flex: trailing ? 1 : 1,
              minWidth: 0,
              color: colors.secondary,
            }}
          >
            {subtitle}
          </Text>
          {trailing ? (
            <>
              {gapSubtitleTrailing ? <View style={{ width: NAME_TIME_GAP_PX }} /> : null}
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{
                  ...textBase,
                  flexShrink: 0,
                  maxWidth: "45%",
                  color: colors.secondary,
                  textAlign: "right",
                }}
              >
                {trailing}
              </Text>
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function AuthenticatedHomeFeedPanel({ colors }: { colors: ThemeColors }) {
  const { initData, status, telegramBootstrapFeed } = useTelegram();
  const [items, setItems] = useState<FeedRow[]>(() => [...WELCOME_PLACEHOLDER_FEED_ITEMS]);
  const [error, setError] = useState<string | null>(null);
  const feedScrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  useLayoutEffect(() => {
    if (Platform.OS !== "web") return;
    const run = () => {
      const instance = feedScrollRef.current as unknown as {
        getScrollableNode?: () => HTMLElement | null | undefined;
      } | null;
      const el = instance?.getScrollableNode?.();
      if (el?.style) {
        el.style.setProperty("scrollbar-color", `${colors.accent} ${colors.background}`);
      }
    };
    const id = requestAnimationFrame(() => {
      run();
      requestAnimationFrame(run);
    });
    return () => cancelAnimationFrame(id);
  }, [colors.accent, colors.background, items.length, error]);

  useEffect(() => {
    if (!telegramBootstrapFeed || telegramBootstrapFeed.length === 0) return;
    logPageDisplay("feed_panel_bootstrap_from_telegram", {
      itemCount: telegramBootstrapFeed.length,
    });
    setItems(telegramBootstrapFeed as FeedRow[]);
  }, [telegramBootstrapFeed]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const startedAt = Date.now();

      const initDataTrimmed = typeof initData === "string" ? initData.trim() : "";
      const initDataOk = initDataTrimmed !== "";

      logPageDisplay("feed_panel_mount_effect", {
        telegramStatus: status,
        initDataChars: initDataOk ? initDataTrimmed.length : 0,
        note:
          status === "loading"
            ? "fetch_runs_even_while_loading"
            : "effect_fetch_start",
      });

      logPageDisplay("feed_fetch_start", {
        url: buildApiUrl("/api/feed"),
        telegramStatus: status,
        initDataChars: initDataOk ? initDataTrimmed.length : 0,
        method: initDataOk ? "POST" : "GET",
        dedupedSingleton: true,
        timeoutMs: AUTHENTICATED_FEED_FETCH_TIMEOUT_MS,
      });

      if (!cancelled) setError(null);

      try {
        const res = await loadAuthenticatedFeedDeduped(initDataOk ? initDataTrimmed : null);

        logPageDisplay("feed_fetch_headers", {
          httpStatus: res.httpStatus,
          ok: res.httpOk,
          durationMs: Date.now() - startedAt,
          cancelledBeforeBody: cancelled,
        });

        if (cancelled) {
          logPageDisplay("feed_fetch_headers_superseded");
          return;
        }

        const text = res.bodyText;
        let j: Record<string, unknown> = {};
        try {
          j = JSON.parse(text) as Record<string, unknown>;
        } catch {
          logPageDisplay("feed_fetch_json_invalid", {
            httpStatus: res.httpStatus,
            bodyPreview: text.slice(0, 280),
            durationMs: Date.now() - startedAt,
          });
          if (cancelled) {
            logPageDisplay("feed_fetch_json_invalid_superseded");
            return;
          }
          setError(`bad_json (${res.httpStatus})`);
          return;
        }

        const itemsRaw = j.items;
        const ok = j.ok === true;
        const errStr = typeof j.error === "string" ? j.error : null;

        const firstRow =
          Array.isArray(itemsRaw) && itemsRaw.length > 0 && typeof itemsRaw[0] === "object"
            ? (itemsRaw[0] as Record<string, unknown>)
            : null;
        const firstSentAtRaw = firstRow?.sent_at;

        logPageDisplay("feed_fetch_response", {
          httpStatus: res.httpStatus,
          ok,
          durationMs: Date.now() - startedAt,
          itemCount: Array.isArray(itemsRaw) ? itemsRaw.length : null,
          error: errStr,
          firstItemSentAtType:
            firstSentAtRaw == null ? "absent" : typeof firstSentAtRaw,
          firstItemSentAtPreview:
            typeof firstSentAtRaw === "string" ? firstSentAtRaw.slice(0, 32) : null,
          keys:
            typeof j === "object" && j !== null
              ? Object.keys(j).filter((k) => k !== "items")
              : [],
        });

        if (cancelled) {
          logPageDisplay("feed_fetch_response_superseded");
          return;
        }

        if (!res.httpOk || !ok || !Array.isArray(itemsRaw)) {
          setError(errStr ?? `HTTP ${res.httpStatus}`);
          return;
        }

        setError(null);
        const next = itemsRaw as FeedRow[];
        if (next.length === 0) {
          logPageDisplay("feed_fetch_empty_server", {
            durationMs: Date.now() - startedAt,
          });
        }
        setItems((prev) => {
          if (next.length > 0) return next;
          if (prev.some((r) => r.id > 0)) return prev;
          return [...WELCOME_PLACEHOLDER_FEED_ITEMS];
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const aborted = e instanceof Error && e.name === "AbortError";
        logPageDisplay("feed_fetch_catch", {
          message: msg,
          aborted,
          fromCleanupAbort: aborted && cancelled,
          durationMs: Date.now() - startedAt,
          telegramStatus: status,
        });
        if (cancelled) {
          logPageDisplay("feed_fetch_superseded_catch");
          return;
        }
        setError(aborted ? `timeout_after_${AUTHENTICATED_FEED_FETCH_TIMEOUT_MS}ms` : msg);
      } finally {
        logPageDisplay("feed_fetch_finally", {
          durationMs: Date.now() - startedAt,
          supersededRun: cancelled,
        });
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [initData, status]);

  if (error && items.length === 0) {
    return (
      <Text style={{ color: colors.secondary, fontSize: 13, lineHeight: 18, marginBottom: 8 }}>
        {error}
      </Text>
    );
  }

  if (items.length === 0) {
    return (
      <Text style={{ color: colors.secondary, fontSize: 13, lineHeight: 18 }}>
        No feed items yet.
      </Text>
    );
  }

  return (
    <ScrollView
      ref={feedScrollRef}
      style={{ alignSelf: "stretch" }}
      contentContainerStyle={{ paddingBottom: layout.contentSideInsetPx }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {error ? (
        <Text
          style={{
            color: colors.secondary,
            fontSize: 11,
            lineHeight: 16,
            marginBottom: 10,
          }}
          accessibilityRole="text"
        >
          {error}{" "}
          <Text style={{ color: colors.primary }}>(offline preview)</Text>
        </Text>
      ) : null}
      {items.map((it, i) => (
        <FeedFeedRow key={it.id} item={it} isLast={i === items.length - 1} colors={colors} />
      ))}
    </ScrollView>
  );
}

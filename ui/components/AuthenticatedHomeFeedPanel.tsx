import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { buildApiUrl } from "../../api/_base";
import {
  AUTHENTICATED_FEED_FETCH_TIMEOUT_MS,
  loadAuthenticatedFeedDeduped,
} from "../authenticatedFeedDedupedFetch";
import { FONT_UI_SANS_REGULAR, WEB_UI_SANS_STACK } from "../fonts";
import { logPageDisplay } from "../pageDisplayLog";
import { layout, type ThemeColors } from "../theme";
import type { AppLocale, AppStringKey } from "../../locales/appStrings";
import { getAppString } from "../../locales/appStrings";
import { useAppStrings } from "../../locales/AppStringsContext";
import { useTelegram } from "./Telegram";

/** One extra attempt after client abort (slow TMA / cold API) before showing timeout + offline preview. */
const FEED_FETCH_ATTEMPTS_ON_TIMEOUT = 2;
/** Short backoff so a cold retry starts quickly without hammering the API. */
const FEED_FETCH_RETRY_DELAY_MS = 200;

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
}

/**
 * Matches `sql/seed-welcome-messages.sql` (+ `database/feed.ts` welcome keys): placeholder rows until `/api/feed` hydrates.
 */
function buildWelcomePlaceholderFeed(catalogLocale: AppLocale): FeedRow[] {
  const t = (key: AppStringKey) => getAppString(catalogLocale, key);
  return [
    {
      id: -1,
      sent_at: null,
      card_type: "system_action",
      layout_variant: "action_hint",
      payload: {
        welcome_order: 1,
        title: t("feed.placeholder.walletTitle"),
        subtitle: t("feed.placeholder.walletSubtitle"),
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
        title: t("feed.placeholder.creatorTitle"),
        subtitle: t("feed.placeholder.creatorSubtitle"),
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
        title: t("feed.placeholder.nftTitle"),
        subtitle: t("feed.placeholder.nftSubtitle"),
        trailing_label: t("feed.placeholder.nftTrailing"),
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
        title: t("feed.placeholder.tokenTitle"),
        subtitle: t("feed.placeholder.tokenSubtitle"),
        trailing_label: t("feed.placeholder.tokenTrailing"),
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
        title: t("feed.placeholder.taskTitle"),
        subtitle: t("feed.placeholder.taskSubtitle"),
        icon: { type: "svg_url", url: "/welcome_messages/task.svg" },
      },
    },
  ];
}

/** Shown whenever `sent_at` is absent (preview rows, or API lag until `/api/feed` hydrates). */
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
  timePendingLabel,
}: {
  item: FeedRow;
  isLast: boolean;
  colors: ThemeColors;
  timePendingLabel: string;
}) {
  const p = coercePayload(item.payload);
  const title = typeof p.title === "string" ? p.title : "";
  const subtitle = typeof p.subtitle === "string" ? p.subtitle : "";
  const trailing =
    typeof p.trailing_label === "string" ? p.trailing_label : "";

  const iconUrl = resolveIconUrl(p.icon);
  const parsedClock = formatWallClock(item.sent_at);
  const timeLabel = parsedClock || timePendingLabel;
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
  const {
    t,
    welcomeFeedCatalogLocale,
    welcomeFeedManualTranslation,
    setWelcomeFeedManualTranslation,
  } = useAppStrings();
  const welcomePlaceholderFeedItems = useMemo(
    () => buildWelcomePlaceholderFeed(welcomeFeedCatalogLocale),
    [welcomeFeedCatalogLocale],
  );
  const welcomePlaceholderRef = useRef(welcomePlaceholderFeedItems);
  welcomePlaceholderRef.current = welcomePlaceholderFeedItems;

  const { initData, status, telegramBootstrapFeed } = useTelegram();
  const [items, setItems] = useState<FeedRow[]>(welcomePlaceholderFeedItems);
  const [error, setError] = useState<string | null>(null);
  const feedScrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    setItems((prev) => {
      const hasPositive = prev.some((r) => r.id > 0);
      if (hasPositive) {
        return prev.map((r) => (r.id < 0 ? welcomePlaceholderFeedItems.find((w) => w.id === r.id) ?? r : r));
      }
      if (prev.length === 0 || prev.every((r) => r.id < 0)) {
        return [...welcomePlaceholderFeedItems];
      }
      return prev;
    });
  }, [welcomePlaceholderFeedItems]);

  /**
   * When `initData` is present, key is **only** the trimmed string so `status` going `loading`→`ok`
   * does not cancel an in-flight `/api/feed` and restart (that duplicated cold work and slowed updates).
   * Session-only GET keeps `status` in the key so a refetch can run after the session cookie is ready.
   */
  const feedLoadKey = useMemo(() => {
    if (status === "error") return null;
    const trimmed = typeof initData === "string" ? initData.trim() : "";
    if (trimmed !== "") return `post:${trimmed}:${welcomeFeedCatalogLocale}`;
    return `get:${status}:${welcomeFeedCatalogLocale}`;
  }, [initData, status, welcomeFeedCatalogLocale]);

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
    if (feedLoadKey === null) return;

    const feedKey = feedLoadKey;
    let cancelled = false;

    async function load() {
      const startedAt = Date.now();

      const initDataTrimmed = typeof initData === "string" ? initData.trim() : "";
      const initDataOk = initDataTrimmed !== "";

      logPageDisplay("feed_panel_mount_effect", {
        telegramStatus: status,
        initDataChars: initDataOk ? initDataTrimmed.length : 0,
        feedLoadKey: feedKey.slice(0, 64),
        note: initDataOk ? "feed_key_stable_across_status" : "session_feed_key_includes_status",
      });

      logPageDisplay("feed_fetch_start", {
        url: buildApiUrl("/api/feed"),
        telegramStatus: status,
        initDataChars: initDataOk ? initDataTrimmed.length : 0,
        method: initDataOk ? "POST" : "GET",
        catalogLocale: welcomeFeedCatalogLocale,
        welcomeFeedManualTranslation,
        dedupedSingleton: true,
        timeoutMs: AUTHENTICATED_FEED_FETCH_TIMEOUT_MS,
      });

      if (!cancelled) setError(null);

      let res: Awaited<ReturnType<typeof loadAuthenticatedFeedDeduped>> | undefined;
      try {
        for (let attempt = 0; attempt < FEED_FETCH_ATTEMPTS_ON_TIMEOUT; attempt++) {
          if (cancelled) {
            logPageDisplay("feed_fetch_superseded_before_attempt");
            return;
          }
          try {
            res = await loadAuthenticatedFeedDeduped(
              initDataOk ? initDataTrimmed : null,
              welcomeFeedCatalogLocale,
            );
            break;
          } catch (e) {
            const aborted = e instanceof Error && e.name === "AbortError";
            if (cancelled) {
              logPageDisplay("feed_fetch_superseded_catch");
              return;
            }
            if (aborted && attempt < FEED_FETCH_ATTEMPTS_ON_TIMEOUT - 1) {
              logPageDisplay("feed_fetch_timeout_retry", {
                attempt: attempt + 1,
                delayMs: FEED_FETCH_RETRY_DELAY_MS,
                timeoutMs: AUTHENTICATED_FEED_FETCH_TIMEOUT_MS,
              });
              await new Promise((r) => setTimeout(r, FEED_FETCH_RETRY_DELAY_MS));
              continue;
            }
            const msg = e instanceof Error ? e.message : String(e);
            logPageDisplay("feed_fetch_catch", {
              message: msg,
              aborted,
              fromCleanupAbort: aborted && cancelled,
              durationMs: Date.now() - startedAt,
              telegramStatus: status,
              attempt: attempt + 1,
            });
            setError(aborted ? `timeout_after_${AUTHENTICATED_FEED_FETCH_TIMEOUT_MS}ms` : msg);
            return;
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logPageDisplay("feed_fetch_catch", {
          message: msg,
          aborted: false,
          durationMs: Date.now() - startedAt,
          telegramStatus: status,
        });
        if (!cancelled) setError(msg);
        return;
      }

      if (!res || cancelled) {
        if (cancelled) logPageDisplay("feed_fetch_headers_superseded");
        return;
      }

      try {
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
          return [...welcomePlaceholderRef.current];
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logPageDisplay("feed_fetch_response_parse_catch", {
          message: msg,
          durationMs: Date.now() - startedAt,
        });
        if (!cancelled) setError(msg);
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
    // Intentionally only `feedLoadKey`: for POST-with-initData the key omits `status` so `loading`→`ok`
    // does not cancel/restart the in-flight fetch. `load()` still reads the latest `initData`/`status`
    // from the render that created this effect run.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- trigger is feedLoadKey only
  }, [feedLoadKey]);

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
        {t("feed.empty")}
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
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: welcomeFeedManualTranslation }}
        accessibilityLabel={t("feed.manualWelcomeTranslationA11y")}
        onPress={() => setWelcomeFeedManualTranslation(!welcomeFeedManualTranslation)}
        style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}
      >
        <View
          style={{
            width: 16,
            height: 16,
            borderWidth: 1,
            borderColor: colors.accent,
            marginRight: 8,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: welcomeFeedManualTranslation ? colors.accent : "transparent",
          }}
        >
          {welcomeFeedManualTranslation ? (
            <Text style={{ color: colors.background, fontSize: 11, lineHeight: 14 }}>✓</Text>
          ) : null}
        </View>
        <Text style={{ color: colors.secondary, fontSize: 12, lineHeight: 16, flex: 1 }}>
          {t("feed.manualWelcomeTranslation")}
        </Text>
      </Pressable>
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
          <Text style={{ color: colors.primary }}>{t("feed.offlinePreview")}</Text>
        </Text>
      ) : null}
      {items.map((it, i) => (
        <FeedFeedRow
          key={it.id}
          item={it}
          isLast={i === items.length - 1}
          colors={colors}
          timePendingLabel={t("feed.timePending")}
        />
      ))}
    </ScrollView>
  );
}

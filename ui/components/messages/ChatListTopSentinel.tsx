import { useEffect, useRef, type RefObject } from "react";
import { View } from "react-native";
import { debounceLeading } from "../../util/debounceLeading";
import { useElementVisible } from "./useElementVisible";

const CHAT_LIST_SENTINEL_ROOT_MARGIN_PX = "120px";
const CHAT_LIST_SENTINEL_DEBOUNCE_MS = 200;

type Props = {
  enabled: boolean;
  onNearTop: () => void;
};

/** Intersection-observer sentinel for chat-list near-top archive reveal. */
export function ChatListTopSentinel({ enabled, onNearTop }: Props) {
  const ref = useRef<View>(null);
  const onNearTopRef = useRef(onNearTop);
  const debouncedRef = useRef(
    debounceLeading(() => {
      onNearTopRef.current();
    }, CHAT_LIST_SENTINEL_DEBOUNCE_MS),
  );

  useEffect(() => {
    onNearTopRef.current = onNearTop;
  }, [onNearTop]);

  const visible = useElementVisible(ref as RefObject<Element | null>, {
    rootMargin: CHAT_LIST_SENTINEL_ROOT_MARGIN_PX,
    enabled,
  });

  useEffect(() => {
    if (!enabled || !visible) return;
    debouncedRef.current();
  }, [enabled, visible]);

  return (
    <View
      ref={ref}
      style={{ width: "100%", height: 1, opacity: 0 }}
      pointerEvents="none"
    />
  );
}

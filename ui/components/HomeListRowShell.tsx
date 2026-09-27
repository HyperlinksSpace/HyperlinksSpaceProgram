import { type ReactNode } from "react";
import {
  Platform,
  Pressable,
  type GestureResponderEvent,
} from "react-native";
import {
  layout,
  type ThemeColors,
  type ThemeName,
  aiPromptButtonActiveBackground,
  aiPromptButtonHoverBackground,
} from "../theme";
import { useTelegram } from "./Telegram";
import { LIST_ROW_PRESS_HIGHLIGHT_PADDING_Y_PX } from "./messages/messageListLayout";

type Props = {
  isLast: boolean;
  isActive?: boolean;
  colors: ThemeColors;
  onPress?: () => void;
  onPressIn?: () => void;
  onLongPress?: (event: GestureResponderEvent) => void;
  onHoverIn?: () => void;
  onContextMenu?: (event: GestureResponderEvent) => void;
  children: ReactNode;
};

function rowShellBackground(
  colors: ThemeColors,
  scheme: ThemeName,
  state: { pressed: boolean; hovered: boolean },
  isActive: boolean,
): string {
  if (isActive) return colors.undercover;
  if (state.pressed) return aiPromptButtonActiveBackground(colors, scheme);
  if (state.hovered) return aiPromptButtonHoverBackground(colors, scheme);
  return "transparent";
}

/**
 * Feed / Messages row chrome. Same undercover geometry on compact and wide:
 * 7.5px vertical pad per row (adjacent pads = 15px gap), side-bleed to the column
 * edge; list shell top/bottom inset is also 7.5px so first/last rows match.
 */
export function HomeListRowShell({
  isLast: _isLast,
  isActive = false,
  colors,
  onPress,
  onPressIn,
  onLongPress,
  onHoverIn,
  onContextMenu,
  children,
}: Props) {
  const { colorScheme } = useTelegram();
  const columnBleedPx = layout.contentSideInsetPx;

  const webContextMenuProps =
    Platform.OS === "web" && onContextMenu
      ? {
          onContextMenu: (event: GestureResponderEvent & { preventDefault?: () => void }) => {
            event.preventDefault?.();
            onContextMenu(event);
          },
        }
      : {};

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      onPress={onPress}
      onPressIn={onPressIn}
      onLongPress={onLongPress}
      delayLongPress={450}
      onHoverIn={onHoverIn}
      {...webContextMenuProps}
      style={({ pressed, hovered }) => ({
        marginHorizontal: -columnBleedPx,
        paddingHorizontal: columnBleedPx,
        paddingVertical: LIST_ROW_PRESS_HIGHLIGHT_PADDING_Y_PX,
        marginBottom: 0,
        alignSelf: "stretch",
        backgroundColor: rowShellBackground(
          colors,
          colorScheme,
          { pressed, hovered: hovered ?? false },
          isActive,
        ),
      })}
    >
      {children}
    </Pressable>
  );
}

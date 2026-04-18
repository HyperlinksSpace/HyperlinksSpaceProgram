import { View, Pressable, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useColors } from "../../ui/theme";
import { useAuth } from "../../auth/AuthContext";
import { WelcomeMarketingHeader } from "../../ui/components/WelcomeMarketingHeader";
import { useTelegram } from "../../ui/components/Telegram";
import { isMobileWebUserAgent } from "../../ui/components/telegramWebApp";

/**
 * Welcome screen: marketing header (black bar + wordmark + About) on non–mobile-TMA;
 * on mobile TMA the root layout shows GlobalLogoBar (same as home).
 */
export default function WelcomeScreen() {
  const colors = useColors();
  const { signIn } = useAuth();
  const router = useRouter();
  const { isInTelegram } = useTelegram();
  const showMarketingHeader = !(Platform.OS === "web" && isInTelegram && isMobileWebUserAgent());

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {showMarketingHeader ? <WelcomeMarketingHeader /> : null}
      <Pressable
        style={{ flex: 1 }}
        onPress={() => {
          signIn();
          router.replace("/home");
        }}
        accessibilityRole="button"
        accessibilityLabel="Continue to app"
      />
    </View>
  );
}

import { Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useColors } from "../../ui/theme";
import { useAuth } from "../../auth/AuthContext";

/**
 * Placeholder Welcome screen. Tap anywhere to continue with stub auth (replace with real login).
 */
export default function WelcomeScreen() {
  const colors = useColors();
  const { signIn } = useAuth();
  const router = useRouter();

  return (
    <Pressable
      style={{ flex: 1, backgroundColor: colors.background }}
      onPress={() => {
        signIn();
        router.replace("/home");
      }}
      accessibilityRole="button"
      accessibilityLabel="Continue to app"
    />
  );
}

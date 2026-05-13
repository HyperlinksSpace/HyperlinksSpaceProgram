import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../auth/AuthContext";
import { useAppStrings } from "../../locales/AppStringsContext";
import { typographySansSemibold, useColors } from "../../ui/theme";

export default function AiScreen() {
  const { isAuthenticated, authReady } = useAuth();
  const { t } = useAppStrings();
  const colors = useColors();
  const { prompt } = useLocalSearchParams<{ prompt?: string }>();

  if (!authReady) {
    return null;
  }
  if (!isAuthenticated) {
    return <Redirect href="/" />;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.primary }]}>{t("ai.title")}</Text>
      {prompt ? (
        <Text style={[styles.prompt, { color: colors.primary }]}>
          {t("ai.promptPrefix")} {prompt}
        </Text>
      ) : (
        <Text style={[styles.hint, { color: colors.secondary }]}>{t("ai.noPrompt")}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    justifyContent: "flex-start",
  },
  title: {
    ...typographySansSemibold,
    fontSize: 18,
    marginBottom: 12,
  },
  prompt: {
    fontSize: 14,
  },
  hint: {
    fontSize: 14,
  },
});

import React from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../auth/AuthContext";
import { AiChatPanel } from "../../ui/components/ai/AiChatPanel";

export default function AiScreen() {
  const { isAuthenticated, authReady } = useAuth();
  const { prompt, route } = useLocalSearchParams<{ prompt?: string; route?: string }>();

  if (!authReady) {
    return null;
  }
  if (!isAuthenticated) {
    return <Redirect href="/" />;
  }

  const initialPrompt = typeof prompt === "string" ? prompt : undefined;
  const screenRoute = typeof route === "string" ? route : undefined;

  return <AiChatPanel initialPrompt={initialPrompt} screenRoute={screenRoute} />;
}

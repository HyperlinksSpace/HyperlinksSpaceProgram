import { Redirect } from "expo-router";

/** Legacy `/welcome` path: same content as `/`. */
export default function WelcomeAlias() {
  return <Redirect href="/" />;
}

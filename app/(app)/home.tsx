import { Redirect } from "expo-router";

/** Legacy `/home` path: same content as `/`. */
export default function HomeAlias() {
  return <Redirect href="/" />;
}

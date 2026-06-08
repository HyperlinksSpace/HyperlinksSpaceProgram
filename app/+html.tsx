import { ScrollViewStyleReset } from "expo-router/html";
import { type ReactNode } from "react";

const WEB_DOCUMENT_TITLE = "Hyperlinks Space App";

/** Root HTML shell for the web build (browser tab title and viewport). */
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <title>{WEB_DOCUMENT_TITLE}</title>
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}

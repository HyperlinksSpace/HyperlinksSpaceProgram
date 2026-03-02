/**
 * Renders GlobalLogoBar; on SDK error (e.g. browser) renders GlobalLogoBarFallback.
 */
import React, { Component, type ReactNode } from "react";
import { GlobalLogoBar } from "./GlobalLogoBar";
import { GlobalLogoBarFallback } from "./GlobalLogoBarFallback";

type Props = Record<string, never>;
type State = { hasError: boolean };

export class GlobalLogoBarWithFallback extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return <GlobalLogoBarFallback />;
    }
    return <GlobalLogoBar />;
  }
}

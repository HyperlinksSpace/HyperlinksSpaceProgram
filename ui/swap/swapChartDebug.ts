import { logPageDisplay } from "../pageDisplayLog";

/** Swap chart diagnostics — filter devtools with `[page-display]` and `swap_chart`. */

export function swapChartLog(step: string, details?: Record<string, unknown>): void {
  logPageDisplay(`swap_chart_${step}`, details);
}

export function swapChartWarn(step: string, details?: Record<string, unknown>): void {
  logPageDisplay(`swap_chart_${step}`, { ...details, level: "warn" });
}

export function swapChartError(step: string, details?: Record<string, unknown>): void {
  logPageDisplay(`swap_chart_${step}`, { ...details, level: "error" });
}

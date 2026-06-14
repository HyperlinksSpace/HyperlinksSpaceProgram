import { CHOOSE_CURRENCY_TABLE_MIN_SHELL_WIDTH_PX } from "./chooseCurrencyTableConstants";
import type { ChooseCurrencyColumnMetrics } from "./chooseCurrencyTableMeasure";
import { CHOOSE_CURRENCY_COLUMN_ORDER, CHOOSE_CURRENCY_COLUMN_PRIORITY } from "./chooseCurrencyTableTypes";
import type { ChooseCurrencyColumnKey } from "./chooseCurrencyTableTypes";

export type ChooseCurrencyVisibleColumn = {
  key: ChooseCurrencyColumnKey;
  widthPx: number;
};

type LayoutColumn = ChooseCurrencyColumnMetrics & {
  widthPx: number;
  maxWidthPx: number;
};

function metricsByKey(metrics: readonly ChooseCurrencyColumnMetrics[]): Map<ChooseCurrencyColumnKey, ChooseCurrencyColumnMetrics> {
  return new Map(metrics.map((entry) => [entry.key, entry]));
}

function orderedMetrics(metrics: readonly ChooseCurrencyColumnMetrics[]): ChooseCurrencyColumnMetrics[] {
  const byKey = metricsByKey(metrics);
  return CHOOSE_CURRENCY_COLUMN_ORDER.map((key) => byKey.get(key)).filter(
    (entry): entry is ChooseCurrencyColumnMetrics => entry != null,
  );
}

function selectVisibleColumns(
  shellWidthPx: number,
  metrics: readonly ChooseCurrencyColumnMetrics[],
): ChooseCurrencyColumnMetrics[] {
  const ordered = orderedMetrics(metrics);
  let visible = [...ordered];

  const sumMins = (keys: ChooseCurrencyColumnMetrics[]) =>
    keys.reduce((sum, column) => sum + column.minWidthPx, 0);

  while (visible.length > 2 && sumMins(visible) > shellWidthPx) {
    const dropKey = visible.reduce((lowest, column) =>
      CHOOSE_CURRENCY_COLUMN_PRIORITY[column.key] > CHOOSE_CURRENCY_COLUMN_PRIORITY[lowest.key]
        ? column
        : lowest,
    ).key;
    visible = visible.filter((column) => column.key !== dropKey);
  }

  return visible;
}

function dynamicMaxWidthPx(column: ChooseCurrencyColumnMetrics, shellWidthPx: number): number {
  return Math.max(column.floorWidthPx, Math.floor(shellWidthPx * column.maxShellFraction));
}

function distributeSpareWidth(columns: LayoutColumn[], sparePx: number): number {
  if (sparePx <= 0) return 0;

  let remaining = sparePx;
  let guard = 0;

  while (remaining > 0.5 && guard < 8) {
    guard += 1;
    const growable = columns.filter(
      (column) => column.flexWeight > 0 && column.widthPx < column.maxWidthPx - 0.5,
    );
    if (growable.length === 0) break;

    const weightSum = growable.reduce((sum, column) => sum + column.flexWeight, 0);
    let consumed = 0;

    for (const column of growable) {
      const headroom = column.maxWidthPx - column.widthPx;
      const share = (remaining * column.flexWeight) / weightSum;
      const grow = Math.min(headroom, share);
      if (grow <= 0) continue;
      column.widthPx += grow;
      consumed += grow;
    }

    if (consumed <= 0.25) break;
    remaining -= consumed;
  }

  return remaining;
}

function absorbRemainingGap(columns: LayoutColumn[], gapPx: number): void {
  if (gapPx <= 0.5 || columns.length === 0) return;

  const currency =
    columns.find((column) => column.key === "currency") ??
    columns.reduce((widest, column) => (column.flexWeight >= widest.flexWeight ? column : widest));

  currency.widthPx += gapPx;
}

/**
 * Picks visible columns by priority, then assigns widths that sum to `shellWidthPx`.
 * Spare space flows to flexible columns (currency first) up to dynamic per-column caps.
 */
export function resolveChooseCurrencyColumnLayout(
  shellWidthPx: number,
  metrics: readonly ChooseCurrencyColumnMetrics[],
): ChooseCurrencyVisibleColumn[] {
  if (metrics.length === 0) return [];

  if (!Number.isFinite(shellWidthPx) || shellWidthPx <= 0) {
    return orderedMetrics(metrics).map((column) => ({
      key: column.key,
      widthPx: column.idealWidthPx,
    }));
  }

  const effectiveShell = Math.max(shellWidthPx, CHOOSE_CURRENCY_TABLE_MIN_SHELL_WIDTH_PX);
  const visible = selectVisibleColumns(effectiveShell, metrics);
  if (visible.length === 0) return [];

  const columns: LayoutColumn[] = visible.map((column) => ({
    ...column,
    widthPx: column.minWidthPx,
    maxWidthPx: dynamicMaxWidthPx(column, effectiveShell),
  }));

  for (const column of columns) {
    column.maxWidthPx = Math.max(column.maxWidthPx, column.minWidthPx);
    column.widthPx = Math.min(column.widthPx, column.maxWidthPx);
  }

  let assigned = columns.reduce((sum, column) => sum + column.widthPx, 0);
  if (assigned > effectiveShell) {
    const scale = effectiveShell / assigned;
    for (const column of columns) {
      column.widthPx = Math.max(column.floorWidthPx, column.widthPx * scale);
    }
    assigned = columns.reduce((sum, column) => sum + column.widthPx, 0);
  }

  let spare = effectiveShell - assigned;

  for (const column of columns) {
    if (spare <= 0) break;
    const toIdeal = Math.min(column.idealWidthPx, column.maxWidthPx) - column.widthPx;
    if (toIdeal <= 0) continue;
    const grow = Math.min(toIdeal, spare);
    column.widthPx += grow;
    spare -= grow;
  }

  spare = distributeSpareWidth(columns, spare);

  assigned = columns.reduce((sum, column) => sum + column.widthPx, 0);
  absorbRemainingGap(columns, effectiveShell - assigned);

  const rounded = columns.map((column) => ({
    key: column.key,
    widthPx: Math.max(1, Math.round(column.widthPx)),
  }));

  const roundedSum = rounded.reduce((sum, column) => sum + column.widthPx, 0);
  const roundingGap = effectiveShell - roundedSum;
  if (Math.abs(roundingGap) >= 1 && rounded.length > 0) {
    const currencyIndex = rounded.findIndex((column) => column.key === "currency");
    const adjustIndex = currencyIndex >= 0 ? currencyIndex : rounded.length - 1;
    rounded[adjustIndex] = {
      ...rounded[adjustIndex]!,
      widthPx: Math.max(1, rounded[adjustIndex]!.widthPx + roundingGap),
    };
  }

  return rounded;
}

/** @deprecated Use resolveChooseCurrencyColumnLayout. */
export function resolveChooseCurrencyVisibleColumns(
  availableWidthPx: number,
  minWidthsPx: Record<ChooseCurrencyColumnKey, number>,
): ChooseCurrencyVisibleColumn[] {
  const metrics: ChooseCurrencyColumnMetrics[] = CHOOSE_CURRENCY_COLUMN_ORDER.filter(
    (key) => minWidthsPx[key] != null,
  ).map((key) => ({
    key,
    minWidthPx: minWidthsPx[key],
    idealWidthPx: minWidthsPx[key],
    flexWeight: key === "currency" ? 4 : 1,
    maxShellFraction: key === "currency" ? 0.5 : 0.2,
    floorWidthPx: minWidthsPx[key],
  }));

  return resolveChooseCurrencyColumnLayout(availableWidthPx, metrics);
}

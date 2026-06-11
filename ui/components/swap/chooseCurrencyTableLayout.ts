import { CHOOSE_CURRENCY_COLUMN_ORDER, CHOOSE_CURRENCY_COLUMN_PRIORITY } from "./chooseCurrencyTableTypes";
import type { ChooseCurrencyColumnKey } from "./chooseCurrencyTableTypes";

export type ChooseCurrencyVisibleColumn = {
  key: ChooseCurrencyColumnKey;
  minWidthPx: number;
};

/**
 * Drops lowest-priority columns until the sum of min widths fits `availableWidthPx`.
 * Columns stay in display order (rank → lastYear).
 */
export function resolveChooseCurrencyVisibleColumns(
  availableWidthPx: number,
  minWidthsPx: Record<ChooseCurrencyColumnKey, number>,
): ChooseCurrencyVisibleColumn[] {
  const ordered = [...CHOOSE_CURRENCY_COLUMN_ORDER].sort(
    (left, right) => CHOOSE_CURRENCY_COLUMN_PRIORITY[left] - CHOOSE_CURRENCY_COLUMN_PRIORITY[right],
  );

  let visibleKeys = [...ordered];
  const totalWidth = () => visibleKeys.reduce((sum, key) => sum + minWidthsPx[key], 0);

  while (visibleKeys.length > 0 && totalWidth() > availableWidthPx) {
    const lowestPriorityKey = visibleKeys.reduce((dropKey, key) =>
      CHOOSE_CURRENCY_COLUMN_PRIORITY[key] > CHOOSE_CURRENCY_COLUMN_PRIORITY[dropKey] ? key : dropKey,
    );
    visibleKeys = visibleKeys.filter((key) => key !== lowestPriorityKey);
  }

  return CHOOSE_CURRENCY_COLUMN_ORDER.filter((key) => visibleKeys.includes(key)).map((key) => ({
    key,
    minWidthPx: minWidthsPx[key],
  }));
}

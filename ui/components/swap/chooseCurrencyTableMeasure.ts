import { Platform } from "react-native";

import { WEB_AEROPORT_STACK, WEB_UI_SANS_STACK } from "../../fonts";
import {
  CHOOSE_CURRENCY_TABLE_CELL_PADDING_HORIZONTAL_PX,
  CHOOSE_CURRENCY_TABLE_CURRENCY_ICON_SIZE_PX,
  CHOOSE_CURRENCY_TABLE_CURRENCY_ICON_TEXT_GAP_PX,
  CHOOSE_CURRENCY_TABLE_MINI_CHART_MIN_WIDTH_PX,
  CHOOSE_CURRENCY_TABLE_RANK_CELL_PADDING_RIGHT_PX,
} from "./chooseCurrencyTableConstants";
import type { ChooseCurrencyColumnKey, ChooseCurrencyRow } from "./chooseCurrencyTableTypes";

const HEADER_FONT_SIZE_PX = 15;
const HEADER_LINE_HEIGHT_PX = 20;
const CELL_FONT_SIZE_PX = 15;
const CELL_LINE_HEIGHT_PX = 20;
const CURRENCY_NAME_FONT_SIZE_PX = 15;
const CURRENCY_NAME_LINE_HEIGHT_PX = 20;

type TextMeasureStyle = {
  fontFamily: string;
  fontSizePx: number;
  lineHeightPx: number;
  fontWeight?: string;
};

function estimateTextWidthPx(text: string, style: TextMeasureStyle): number {
  if (!text) return 0;
  const weightFactor = style.fontFamily.includes("SemiBold") || style.fontWeight === "600" ? 1.06 : 1;
  return Math.ceil(text.length * style.fontSizePx * 0.56 * weightFactor);
}

function measureTextWidthPxWeb(text: string, style: TextMeasureStyle): number {
  if (!text || Platform.OS !== "web" || typeof document === "undefined") {
    return estimateTextWidthPx(text, style);
  }

  const probe = document.createElement("span");
  probe.style.position = "fixed";
  probe.style.left = "-9999px";
  probe.style.top = "0";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.whiteSpace = "nowrap";
  probe.style.fontFamily = style.fontFamily;
  probe.style.fontSize = `${style.fontSizePx}px`;
  probe.style.fontWeight = style.fontWeight ?? "400";
  probe.style.lineHeight = `${style.lineHeightPx}px`;
  probe.textContent = text;
  document.body.appendChild(probe);
  const width = Math.ceil(probe.getBoundingClientRect().width);
  document.body.removeChild(probe);
  return width;
}

function measureTextWidthPx(text: string, style: TextMeasureStyle): number {
  if (Platform.OS === "web") {
    return measureTextWidthPxWeb(text, style);
  }
  return estimateTextWidthPx(text, style);
}

const headerTextStyle: TextMeasureStyle = {
  fontFamily: WEB_AEROPORT_STACK,
  fontSizePx: HEADER_FONT_SIZE_PX,
  lineHeightPx: HEADER_LINE_HEIGHT_PX,
};

const cellTextStyle: TextMeasureStyle = {
  fontFamily: WEB_AEROPORT_STACK,
  fontSizePx: CELL_FONT_SIZE_PX,
  lineHeightPx: CELL_LINE_HEIGHT_PX,
};

const currencyNameTextStyle: TextMeasureStyle = {
  fontFamily: WEB_UI_SANS_STACK,
  fontSizePx: CURRENCY_NAME_FONT_SIZE_PX,
  lineHeightPx: CURRENCY_NAME_LINE_HEIGHT_PX,
  fontWeight: "600",
};

const currencyTickerTextStyle: TextMeasureStyle = {
  fontFamily: WEB_AEROPORT_STACK,
  fontSizePx: CURRENCY_NAME_FONT_SIZE_PX,
  lineHeightPx: CURRENCY_NAME_LINE_HEIGHT_PX,
};

function rankColumnMinWidthPx(header: string, rows: readonly ChooseCurrencyRow[]): number {
  const contentWidth = Math.max(
    measureTextWidthPx(header, headerTextStyle),
    ...rows.map((row) => measureTextWidthPx(row.rank, cellTextStyle)),
  );
  return contentWidth + CHOOSE_CURRENCY_TABLE_RANK_CELL_PADDING_RIGHT_PX;
}

function currencyColumnMinWidthPx(header: string, rows: readonly ChooseCurrencyRow[]): number {
  const headerWidth = measureTextWidthPx(header, headerTextStyle);
  const rowContentWidths = rows.map((row) => {
    const textWidth = Math.max(
      measureTextWidthPx(row.currency.name, currencyNameTextStyle),
      measureTextWidthPx(row.currency.ticker, currencyTickerTextStyle),
    );
    return (
      CHOOSE_CURRENCY_TABLE_CURRENCY_ICON_SIZE_PX +
      CHOOSE_CURRENCY_TABLE_CURRENCY_ICON_TEXT_GAP_PX +
      textWidth
    );
  });
  const contentWidth = Math.max(headerWidth, ...rowContentWidths);
  return contentWidth + CHOOSE_CURRENCY_TABLE_CELL_PADDING_HORIZONTAL_PX * 2;
}

function textColumnMinWidthPx(
  header: string,
  values: readonly string[],
): number {
  const contentWidth = Math.max(
    measureTextWidthPx(header, headerTextStyle),
    ...values.map((value) => measureTextWidthPx(value, cellTextStyle)),
  );
  return contentWidth + CHOOSE_CURRENCY_TABLE_CELL_PADDING_HORIZONTAL_PX * 2;
}

function lastYearColumnMinWidthPx(header: string): number {
  const contentWidth = Math.max(
    measureTextWidthPx(header, headerTextStyle),
    CHOOSE_CURRENCY_TABLE_MINI_CHART_MIN_WIDTH_PX,
  );
  return contentWidth + CHOOSE_CURRENCY_TABLE_CELL_PADDING_HORIZONTAL_PX * 2;
}

export function buildChooseCurrencyColumnMinWidthsPx(
  headers: Record<ChooseCurrencyColumnKey, string>,
  rows: readonly ChooseCurrencyRow[],
): Record<ChooseCurrencyColumnKey, number> {
  return {
    rank: rankColumnMinWidthPx(headers.rank, rows),
    currency: currencyColumnMinWidthPx(headers.currency, rows),
    balance: textColumnMinWidthPx(
      headers.balance,
      rows.map((row) => row.balance),
    ),
    rate: textColumnMinWidthPx(
      headers.rate,
      rows.map((row) => row.rate),
    ),
    networks: textColumnMinWidthPx(
      headers.networks,
      rows.map((row) => row.networks),
    ),
    marketCap: textColumnMinWidthPx(
      headers.marketCap,
      rows.map((row) => row.marketCap),
    ),
    volume: textColumnMinWidthPx(
      headers.volume,
      rows.map((row) => row.volume),
    ),
    lastYear: lastYearColumnMinWidthPx(headers.lastYear),
  };
}

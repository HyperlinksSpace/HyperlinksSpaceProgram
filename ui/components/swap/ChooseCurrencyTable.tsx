import { Image } from "expo-image";
import { useMemo } from "react";
import { PixelRatio, Platform, StyleSheet, Text, View } from "react-native";

import { useAppStrings } from "../../../locales/AppStringsContext";
import { useObservedWidth } from "../../smart/useObservedWidth";
import {
  typographyAeroport15,
  typographySansSemibold,
  useColors,
} from "../../theme";
import {
  CHOOSE_CURRENCY_TABLE_CELL_PADDING_HORIZONTAL_PX,
  CHOOSE_CURRENCY_TABLE_CURRENCY_ICON_SIZE_PX,
  CHOOSE_CURRENCY_TABLE_CURRENCY_ICON_TEXT_GAP_PX,
  CHOOSE_CURRENCY_TABLE_MINI_CHART_HEIGHT_PX,
  CHOOSE_CURRENCY_TABLE_RANK_CELL_PADDING_RIGHT_PX,
  CHOOSE_CURRENCY_TABLE_ROW_HEIGHT_PX,
  CHOOSE_CURRENCY_TABLE_ROW_PADDING_VERTICAL_PX,
} from "./chooseCurrencyTableConstants";
import { resolveChooseCurrencyVisibleColumns } from "./chooseCurrencyTableLayout";
import { buildChooseCurrencyColumnMinWidthsPx } from "./chooseCurrencyTableMeasure";
import {
  CHOOSE_CURRENCY_SAMPLE_ROWS,
  type ChooseCurrencyColumnKey,
  type ChooseCurrencyRow,
} from "./chooseCurrencyTableTypes";

function miniChartLineThicknessPx(): number {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.devicePixelRatio > 0) {
      return 1 / window.devicePixelRatio;
    }
    return 1;
  }
  return PixelRatio.roundToNearestPixel(1 / PixelRatio.get());
}

function StablecoinMiniChart() {
  const colors = useColors();
  const lineThickness = miniChartLineThicknessPx();

  return (
    <View
      style={{
        width: "100%",
        height: CHOOSE_CURRENCY_TABLE_MINI_CHART_HEIGHT_PX,
        justifyContent: "center",
        alignItems: "stretch",
      }}
    >
      <View
        style={{
          width: "100%",
          height: lineThickness,
          backgroundColor: colors.primary,
        }}
      />
    </View>
  );
}

function CurrencyCell({ row }: { row: ChooseCurrencyRow }) {
  const colors = useColors();

  return (
    <View style={styles.currencyCell}>
      <Image
        source={row.currency.icon}
        style={{
          width: CHOOSE_CURRENCY_TABLE_CURRENCY_ICON_SIZE_PX,
          height: CHOOSE_CURRENCY_TABLE_CURRENCY_ICON_SIZE_PX,
        }}
        contentFit="contain"
      />
      <View style={{ width: CHOOSE_CURRENCY_TABLE_CURRENCY_ICON_TEXT_GAP_PX }} />
      <View style={styles.currencyTextStack}>
        <Text
          style={[typographyAeroport15, typographySansSemibold, { color: colors.primary }]}
          numberOfLines={1}
        >
          {row.currency.name}
        </Text>
        <Text style={[typographyAeroport15, { color: colors.secondary }]} numberOfLines={1}>
          {row.currency.ticker}
        </Text>
      </View>
    </View>
  );
}

function CellContent({ columnKey, row }: { columnKey: ChooseCurrencyColumnKey; row: ChooseCurrencyRow }) {
  const colors = useColors();

  switch (columnKey) {
    case "rank":
      return (
        <Text style={[typographyAeroport15, styles.rankCellText, { color: colors.primary }]} numberOfLines={1}>
          {row.rank}
        </Text>
      );
    case "currency":
      return <CurrencyCell row={row} />;
    case "balance":
    case "rate":
    case "networks":
    case "marketCap":
    case "volume":
      return (
        <Text style={[typographyAeroport15, styles.centeredCellText, { color: colors.primary }]} numberOfLines={1}>
          {row[columnKey]}
        </Text>
      );
    case "lastYear":
      return <StablecoinMiniChart />;
    default:
      return null;
  }
}

function HeaderLabel({ columnKey, label }: { columnKey: ChooseCurrencyColumnKey; label: string }) {
  const colors = useColors();

  if (columnKey === "rank") {
    return (
      <Text style={[typographyAeroport15, styles.rankCellText, { color: colors.primary }]} numberOfLines={1}>
        {label}
      </Text>
    );
  }

  return (
    <Text style={[typographyAeroport15, styles.centeredCellText, { color: colors.primary }]} numberOfLines={1}>
      {label}
    </Text>
  );
}

type Props = {
  rows?: readonly ChooseCurrencyRow[];
};

export function ChooseCurrencyTable({ rows = CHOOSE_CURRENCY_SAMPLE_ROWS }: Props) {
  const { t } = useAppStrings();
  const { widthPx, onLayout, onRef } = useObservedWidth("choose_currency_table");

  const headers = useMemo(
    () =>
      ({
        rank: t("swap.chooseCurrency.col.rank"),
        currency: t("swap.chooseCurrency.col.currency"),
        balance: t("swap.chooseCurrency.col.balance"),
        rate: t("swap.chooseCurrency.col.rate"),
        networks: t("swap.chooseCurrency.col.networks"),
        marketCap: t("swap.chooseCurrency.col.marketCap"),
        volume: t("swap.chooseCurrency.col.volume"),
        lastYear: t("swap.chooseCurrency.col.lastYear"),
      }) as const,
    [t],
  );

  const visibleColumns = useMemo(() => {
    const minWidthsPx = buildChooseCurrencyColumnMinWidthsPx(headers, rows);
    const availableWidthPx = widthPx > 0 ? widthPx : Number.POSITIVE_INFINITY;
    return resolveChooseCurrencyVisibleColumns(availableWidthPx, minWidthsPx);
  }, [headers, rows, widthPx]);

  return (
    <View style={styles.root} onLayout={onLayout} ref={onRef as never}>
      <View style={styles.headerRow}>
        {visibleColumns.map((column) => (
          <View
            key={column.key}
            style={[
              styles.column,
              column.key === "rank" ? styles.rankColumn : styles.centeredColumn,
              { minWidth: column.minWidthPx, flexGrow: 1, flexShrink: 0, flexBasis: column.minWidthPx },
            ]}
          >
            <HeaderLabel columnKey={column.key} label={headers[column.key]} />
          </View>
        ))}
      </View>

      {rows.map((row, rowIndex) => (
        <View
          key={`${row.currency.ticker}-${rowIndex}`}
          style={{
            paddingTop: CHOOSE_CURRENCY_TABLE_ROW_PADDING_VERTICAL_PX,
            paddingBottom: CHOOSE_CURRENCY_TABLE_ROW_PADDING_VERTICAL_PX,
          }}
        >
          <View style={styles.bodyRow}>
            {visibleColumns.map((column) => (
              <View
                key={column.key}
                style={[
                  styles.column,
                  column.key === "rank" ? styles.rankColumn : styles.centeredColumn,
                  { minWidth: column.minWidthPx, flexGrow: 1, flexShrink: 0, flexBasis: column.minWidthPx },
                ]}
              >
                <CellContent columnKey={column.key} row={row} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    alignSelf: "stretch",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    height: CHOOSE_CURRENCY_TABLE_ROW_HEIGHT_PX,
    width: "100%",
  },
  bodyRow: {
    flexDirection: "row",
    alignItems: "center",
    height: CHOOSE_CURRENCY_TABLE_ROW_HEIGHT_PX,
    width: "100%",
  },
  column: {
    justifyContent: "center",
    minHeight: CHOOSE_CURRENCY_TABLE_ROW_HEIGHT_PX,
  },
  rankColumn: {
    alignItems: "flex-start",
    paddingRight: CHOOSE_CURRENCY_TABLE_RANK_CELL_PADDING_RIGHT_PX,
  },
  centeredColumn: {
    alignItems: "center",
    paddingHorizontal: CHOOSE_CURRENCY_TABLE_CELL_PADDING_HORIZONTAL_PX,
  },
  rankCellText: {
    textAlign: "left",
  },
  centeredCellText: {
    textAlign: "center",
    width: "100%",
  },
  currencyCell: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    maxWidth: "100%",
  },
  currencyTextStack: {
    justifyContent: "center",
    minWidth: 0,
    flexShrink: 1,
  },
});

export type ScrollbarMetrics = {
  indicatorHeight: number;
  topPosition: number;
};

export type BottomBarMetrics = {
  rawLines: number;
  barHeight: number;
  viewportHeight: number;
  contentHeightWithGaps: number;
  showScrollbar: boolean;
  scrollbar: ScrollbarMetrics;
};

type BottomBarMetricParams = {
  baseHeight: number;
  scrollY: number;
  lineHeight: number;
  innerPadding: number;
  maxLinesBeforeScroll: number;
  maxBarHeight: number;
  minBarHeight?: number;
  scrollRangeOverride?: number;
};

function getScrollbarMetrics(
  showScrollbar: boolean,
  viewportHeight: number,
  contentHeightWithGaps: number,
  barHeight: number,
  scrollY: number,
  scrollRange: number,
): ScrollbarMetrics {
  if (!showScrollbar || scrollRange <= 0 || contentHeightWithGaps <= 0) {
    return { indicatorHeight: 0, topPosition: 0 };
  }

  const indicatorHeightRatio = Math.min(1, Math.max(0, viewportHeight / contentHeightWithGaps));
  const indicatorHeight = Math.min(barHeight, Math.max(0, barHeight * indicatorHeightRatio));
  const scrollPosition = Math.min(1, Math.max(0, scrollY / scrollRange));
  const availableSpace = Math.min(barHeight, Math.max(0, barHeight - indicatorHeight));
  const topPosition = Math.min(barHeight, Math.max(0, scrollPosition * availableSpace));
  return { indicatorHeight, topPosition };
}

export function getBottomBarMetrics({
  baseHeight,
  scrollY,
  lineHeight,
  innerPadding,
  maxLinesBeforeScroll,
  maxBarHeight,
  minBarHeight = 60,
  scrollRangeOverride,
}: BottomBarMetricParams): BottomBarMetrics {
  const effectiveTextHeight = Math.max(0, baseHeight - innerPadding * 2);
  const rawLines = Math.max(1, Math.floor((effectiveTextHeight + lineHeight * 0.2) / lineHeight));
  const visibleLines = Math.min(rawLines, maxLinesBeforeScroll);
  const barHeight = Math.max(
    minBarHeight,
    Math.min(maxBarHeight, innerPadding * 2 + visibleLines * lineHeight),
  );
  const viewportHeight = barHeight;
  const contentHeightWithGaps = baseHeight;
  const scrollRange = Math.max(contentHeightWithGaps - viewportHeight, 0);
  const effectiveScrollRange =
    scrollRangeOverride != null && scrollRangeOverride > 0 ? scrollRangeOverride : scrollRange;
  const showScrollbar = contentHeightWithGaps > viewportHeight && effectiveScrollRange > 0;

  return {
    rawLines,
    barHeight,
    viewportHeight,
    contentHeightWithGaps,
    showScrollbar,
    scrollbar: getScrollbarMetrics(
      showScrollbar,
      viewportHeight,
      contentHeightWithGaps,
      barHeight,
      scrollY,
      effectiveScrollRange,
    ),
  };
}

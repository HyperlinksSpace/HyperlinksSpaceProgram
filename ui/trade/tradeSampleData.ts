export type TradeFeedItem = {
  primaryText: string;
  secondaryText: string;
  timestamp: string;
  rightText: string;
};

export const TRADE_SAMPLE_FEED_ITEMS: TradeFeedItem[] = [
  {
    primaryText: "Some walley",
    secondaryText: "777$",
    timestamp: "1",
    rightText: "10,123$",
  },
  {
    primaryText: "Sty. ker",
    secondaryText: "537$",
    timestamp: "2",
    rightText: "9,9999$",
  },
  {
    primaryText: "4iza",
    secondaryText: "157$",
    timestamp: "3",
    rightText: "7111$",
  },
];

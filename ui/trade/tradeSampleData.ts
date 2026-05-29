import {
  tradeDllrImage,
  tradeHaramartaImage,
  tradePixakatsImage,
  tradeTonSampleImage,
} from "./tradeAssets";

export type TradeCollectionItem = {
  image: number;
  title: string;
  subtitle: string;
};

/** Up to four collections for the responsive first-row grid (2–4 columns). */
export const TRADE_SAMPLE_COLLECTIONS: TradeCollectionItem[] = [
  { image: tradePixakatsImage, title: "pixa kats", subtitle: "Tandam" },
  { image: tradeHaramartaImage, title: "Haramarta", subtitle: "Bid Raits" },
  { image: tradeDllrImage, title: "DLLR", subtitle: "Stable" },
  { image: tradeTonSampleImage, title: "TON", subtitle: "Native" },
];

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

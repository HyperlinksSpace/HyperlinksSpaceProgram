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
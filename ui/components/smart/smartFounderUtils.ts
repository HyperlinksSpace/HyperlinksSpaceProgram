const FIXED_NAME_PLACEHOLDERS = [
  "e.g. Vsevolod Ignatyev",
  "e.g. anriltine",
  "e.g. Сева",
] as const;

const RANDOM_NAME_SAMPLES = [
  "Alex Mercer",
  "Jordan Lee",
  "Sam Chen",
  "Taylor Brooks",
  "Riley Quinn",
  "Morgan Blake",
  "Casey Hart",
  "Jamie Frost",
  "Avery Cole",
  "Quinn Wells",
  "Noah Park",
  "Elena Russo",
  "Marcus Webb",
  "Priya Shah",
  "Leo Berg",
  "Nina Kova",
  "Omar Haddad",
  "Zoe Finch",
  "Ivan Petrov",
  "Mia Santos",
] as const;

/** English ordinal suffix for founder label, e.g. st / nd / rd / th. */
export function englishFounderOrdinalSuffix(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return "th";
  switch (n % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function ordinalSuffix(n: number): string {
  return englishFounderOrdinalSuffix(n);
}

/** e.g. `1st founder`, `2nd founder`. Prefer {@link useAppStrings} `tf("smart.company.founderOrdinal")` in UI. */
export function formatFounderOrdinalLabel(index: number): string {
  const n = index + 1;
  return `${n}${ordinalSuffix(n)} founder`;
}

function formatShareValue(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/(\.\d*[1-9])0+$/, "$1");
}

/**
 * Split 100% across founders with at most two decimal places.
 * Remainder from flooring is added to the first founder.
 */
export function splitFounderShares(count: number): string[] {
  if (count <= 0) return [];
  if (count === 1) return ["100"];

  const baseShare = Math.floor((10000 / count)) / 100;
  const remainder = Math.round((100 - baseShare * count) * 100) / 100;
  const shares = Array.from({ length: count }, () => formatShareValue(baseShare));

  if (remainder > 0) {
    shares[0] = formatShareValue(baseShare + remainder);
  }

  return shares;
}

function pickRandomNameSample(): string {
  const index = Math.floor(Math.random() * RANDOM_NAME_SAMPLES.length);
  return RANDOM_NAME_SAMPLES[index] ?? RANDOM_NAME_SAMPLES[0];
}

/** First three placeholders are fixed; later ones are randomly generated once per slot. */
export function getFounderNamePlaceholder(index: number): string {
  if (index < FIXED_NAME_PLACEHOLDERS.length) {
    return FIXED_NAME_PLACEHOLDERS[index] ?? FIXED_NAME_PLACEHOLDERS[0];
  }
  return `e.g. ${pickRandomNameSample()}`;
}

export type FounderFieldState = {
  name: string;
  wallet: string;
  share: string;
  namePlaceholder: string;
};

export function createFounderFields(count: number, previous?: FounderFieldState[]): FounderFieldState[] {
  const shares = splitFounderShares(count);

  return Array.from({ length: count }, (_, index) => {
    const prev = previous?.[index];
    return {
      name: prev?.name ?? "",
      wallet: prev?.wallet ?? "",
      share: shares[index] ?? "",
      namePlaceholder: prev?.namePlaceholder ?? getFounderNamePlaceholder(index),
    };
  });
}

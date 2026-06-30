type Options = {
  enabled: boolean;
  getSinceRevision: () => number | null;
  onRevision: (revision: number) => void;
};

/** Native / non-web: chat list uses HTTP polling only. */
export function useTelegramMessagesChatListStream(_options: Options): void {
  /* polling only */
}

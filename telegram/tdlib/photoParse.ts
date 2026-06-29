/**
 * TDLib photo parsing aligned with:
 * - photo: minithumbnail (preview JPEG ~40px) + sizes[] (photoSize variants)
 * - photoSize: type, photo (file), width, height, progressive_sizes (byte prefix lengths)
 *
 * @see https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1photo.html
 * @see https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1photo_size.html
 * @see https://core.telegram.org/tdlib/docs/classtd_1_1td__api_1_1minithumbnail.html
 */

/** Telegram photoSize.type letters, largest first (see photoSize constructor). */
const PHOTO_SIZE_TYPE_PRIORITY: Record<string, number> = {
  w: 6,
  x: 5,
  y: 4,
  m: 3,
  s: 2,
  i: 1,
  a: 0,
};

type PhotoSizeRow = {
  _?: string;
  type?: string;
  photo?: { id?: number };
  width?: number;
  height?: number;
  /** Progressive JPEG prefix byte lengths on photoSize; not nested photo rows. */
  progressive_sizes?: unknown;
  /** Legacy TDLib wrapper; progressive chunk lengths lived here. */
  sizes?: unknown;
};

export type PhotoMinithumbnail = {
  data: Buffer;
  width: number | null;
  height: number | null;
};

export type PhotoSizeCandidate = {
  fileId: number;
  width: number | null;
  height: number | null;
  type: string;
  sortKey: number;
};

function readPhotoSizeType(row: PhotoSizeRow): string {
  const type = row.type;
  return typeof type === "string" ? type.trim().toLowerCase() : "";
}

function photoSizeArea(row: PhotoSizeRow): number {
  const w = Number(row.width);
  const h = Number(row.height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 0;
  return w * h;
}

function photoSizeSortKey(row: PhotoSizeRow): number {
  const area = photoSizeArea(row);
  if (area > 0) return area;
  const typePriority = PHOTO_SIZE_TYPE_PRIORITY[readPhotoSizeType(row)] ?? -1;
  return typePriority * 1_000_000;
}

function photoSizeFileId(row: PhotoSizeRow): number | null {
  const id = row.photo?.id;
  return typeof id === "number" ? id : null;
}

/** Accept photoSize and legacy TDLib size wrappers that still carry a file id. */
function collectPhotoSizeRows(raw: unknown): PhotoSizeRow[] {
  if (!raw || typeof raw !== "object") return [];
  const row = raw as PhotoSizeRow;
  if (
    row._ === "photoSize" ||
    row._ === "photoSizeProgressive" ||
    row._ === "photoCachedSize"
  ) {
    return photoSizeFileId(row) != null ? [row] : [];
  }
  if (photoSizeFileId(row) != null) return [row];
  return [];
}

function photoRecordFromContent(content: Record<string, unknown>): {
  minithumbnail?: { data?: string; width?: number; height?: number };
  sizes?: unknown[];
} | null {
  const photo = content.photo;
  if (!photo || typeof photo !== "object") return null;
  return photo as {
    minithumbnail?: { data?: string; width?: number; height?: number };
    sizes?: unknown[];
  };
}

/** photo.minithumbnail — low-res JPEG for instant preview (not for full display). */
export function readPhotoMinithumbnail(content: Record<string, unknown>): PhotoMinithumbnail | null {
  const photo = photoRecordFromContent(content);
  const mini = photo?.minithumbnail;
  const data = mini?.data;
  if (typeof data !== "string" || data.length === 0) return null;
  try {
    const buffer = Buffer.from(data, "base64");
    if (buffer.length === 0) return null;
    const width = Number(mini?.width);
    const height = Number(mini?.height);
    return {
      data: buffer,
      width: Number.isFinite(width) && width > 0 ? width : null,
      height: Number.isFinite(height) && height > 0 ? height : null,
    };
  } catch {
    return null;
  }
}

/** photo.sizes — all downloadable photoSize variants, largest first. */
export function listPhotoSizeCandidates(content: Record<string, unknown>): PhotoSizeCandidate[] {
  const photo = photoRecordFromContent(content);
  const sizes = photo?.sizes;
  if (!Array.isArray(sizes) || sizes.length === 0) return [];

  const deduped = new Map<number, PhotoSizeCandidate>();
  for (const raw of sizes) {
    for (const row of collectPhotoSizeRows(raw)) {
      const fileId = photoSizeFileId(row);
      if (fileId == null) continue;
      const width = Number(row.width);
      const height = Number(row.height);
      const candidate: PhotoSizeCandidate = {
        fileId,
        width: Number.isFinite(width) && width > 0 ? width : null,
        height: Number.isFinite(height) && height > 0 ? height : null,
        type: readPhotoSizeType(row),
        sortKey: photoSizeSortKey(row),
      };
      const prev = deduped.get(fileId);
      if (!prev || candidate.sortKey > prev.sortKey) deduped.set(fileId, candidate);
    }
  }

  return [...deduped.values()].sort((a, b) => b.sortKey - a.sortKey);
}

/** Largest declared width/height from photo.sizes (for bubble layout). */
export function largestPhotoDimensions(content: Record<string, unknown>): {
  width: number | null;
  height: number | null;
} {
  const candidates = listPhotoSizeCandidates(content);
  if (candidates.length === 0) return { width: null, height: null };
  const best = candidates[0]!;
  return { width: best.width, height: best.height };
}

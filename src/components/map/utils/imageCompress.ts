// File: src/components/map/utils/imageCompress.ts
export type CompressOptions = {
  maxWidth?: number;     // 例: 1600
  maxHeight?: number;    // 例: 1600
  quality?: number;      // 0.0 - 1.0 (JPEG)
  mime?: 'image/jpeg' | 'image/webp';
};

export async function compressImageFile(
  file: File,
  opts: CompressOptions = {}
): Promise<File> {
  const {
    maxWidth = 1600,
    maxHeight = 1600,
    quality = 0.7,
    mime = 'image/jpeg',
  } = opts;

  const img = await loadImageFromFile(file);
  const { width, height } = fitWithin(img.width, img.height, maxWidth, maxHeight);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return file;

  // 高品質縮小のための補助
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(img, 0, 0, width, height);

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), mime, quality)
  );

  if (!blob) return file;

  // 新しいファイル名に "-compressed" を付ける
  const newName = appendSuffixToFilename(file.name, '-compressed', mime);
  return new File([blob], newName, { type: mime, lastModified: Date.now() });
}

function fitWithin(srcW: number, srcH: number, maxW: number, maxH: number) {
  const ratio = Math.min(maxW / srcW, maxH / srcH, 1); // 拡大はしない
  return { width: Math.round(srcW * ratio), height: Math.round(srcH * ratio) };
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function appendSuffixToFilename(name: string, suffix: string, mime: string) {
  const dot = name.lastIndexOf('.');
  const base = dot >= 0 ? name.slice(0, dot) : name;
  const ext = mime === 'image/webp' ? 'webp' : 'jpg';
  return `${base}${suffix}.${ext}`;
}

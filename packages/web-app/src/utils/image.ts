import jsQR from 'jsqr';

export interface EncodedImageResult {
  bytes: Uint8Array;
  width: number;
  height: number;
  blob: Blob;
}

export function toSafeArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

export async function reencodeImageToJpeg(file: File | Blob, quality = 0.92): Promise<EncodedImageResult> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2Dコンテキストの取得に失敗しました。');
  }

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => {
        if (value) {
          resolve(value);
          return;
        }
        reject(new Error('JPEG変換に失敗しました。'));
      },
      'image/jpeg',
      quality,
    );
  });

  const bytes = new Uint8Array(await blob.arrayBuffer());
  return {
    bytes,
    width: canvas.width,
    height: canvas.height,
    blob,
  };
}

export async function extractQrTextFromImage(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('2Dコンテキストの取得に失敗しました。');
  }

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return extractQrTextFromImageData(imageData);
}

export function extractQrTextFromImageData(imageData: ImageData): string | null {
  const qr = jsQR(imageData.data, imageData.width, imageData.height);
  return qr?.data ?? null;
}

export async function loadImageBitmapFromBytes(bytes: Uint8Array): Promise<ImageBitmap> {
  const blob = new Blob([toSafeArrayBuffer(bytes)], { type: 'image/jpeg' });
  return createImageBitmap(blob);
}

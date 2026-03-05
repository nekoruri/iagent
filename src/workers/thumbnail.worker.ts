/// <reference lib="webworker" />

import type { ThumbnailWorkerCommand, ThumbnailWorkerEvent } from './thumbnailWorkerProtocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function blobToDataUri(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const mimeType = blob.type || 'image/jpeg';
  return `data:${mimeType};base64,${arrayBufferToBase64(buffer)}`;
}

function postMessageSafe(message: ThumbnailWorkerEvent): void {
  ctx.postMessage(message);
}

async function generateThumbnailDataUri(dataUri: string, maxSize: number): Promise<string> {
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
    throw new Error('worker-thumbnail-unsupported');
  }

  const sourceBlob = await fetch(dataUri).then((res) => res.blob());
  const bitmap = await createImageBitmap(sourceBlob);
  try {
    let width = bitmap.width;
    let height = bitmap.height;
    if (width > maxSize || height > maxSize) {
      if (width > height) {
        height = Math.round((height * maxSize) / width);
        width = maxSize;
      } else {
        width = Math.round((width * maxSize) / height);
        height = maxSize;
      }
    }

    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('worker-thumbnail-canvas-context-error');
    }
    context.drawImage(bitmap, 0, 0, width, height);
    const thumbnailBlob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: 0.7,
    });
    return blobToDataUri(thumbnailBlob);
  } finally {
    bitmap.close();
  }
}

ctx.addEventListener('message', async (event: MessageEvent<ThumbnailWorkerCommand>) => {
  const command = event.data;
  if (command?.type !== 'thumbnail-generate') return;

  try {
    const thumbnailUri = await generateThumbnailDataUri(command.dataUri, command.maxSize);
    postMessageSafe({
      type: 'thumbnail-success',
      requestId: command.requestId,
      thumbnailUri,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'worker-thumbnail-generate-failed';
    postMessageSafe({
      type: 'thumbnail-error',
      requestId: command.requestId,
      error: message,
    });
  }
});

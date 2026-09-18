'use client';

export type ClipboardImage = { url: string; name: string };

const MAX_SIDE = 2400;
const TILE_WIDTH = 720;
const TILE_HEIGHT = 560;
const TILE_GAP = 24;
const TILE_PADDING = 18;
const CAPTION_HEIGHT = 42;

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Görsel panoya hazırlanamadı.')), 'image/png'));
}

async function loadImage(source: ClipboardImage): Promise<HTMLImageElement> {
  const response = await fetch(source.url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`${source.name} indirilemedi.`);
  const blob = await response.blob();
  if (!blob.type.startsWith('image/')) throw new Error(`${source.name} geçerli bir görsel değil.`);
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = objectUrl;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function drawContained(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

async function imageBlob(source: ClipboardImage): Promise<Blob> {
  const image = await loadImage(source);
  const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Görsel panoya hazırlanamadı.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvasBlob(canvas);
}

async function imageCollectionBlob(sources: ClipboardImage[]): Promise<Blob> {
  if (sources.length === 1) return imageBlob(sources[0]);
  const images = await Promise.all(sources.map(loadImage));
  const columns = Math.min(3, Math.ceil(Math.sqrt(images.length)));
  const rows = Math.ceil(images.length / columns);
  const canvas = document.createElement('canvas');
  canvas.width = columns * TILE_WIDTH + (columns + 1) * TILE_GAP;
  canvas.height = rows * TILE_HEIGHT + (rows + 1) * TILE_GAP;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Görseller panoya hazırlanamadı.');
  context.fillStyle = '#f4f2f7';
  context.fillRect(0, 0, canvas.width, canvas.height);
  images.forEach((image, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = TILE_GAP + column * TILE_WIDTH;
    const y = TILE_GAP + row * TILE_HEIGHT;
    context.fillStyle = '#ffffff';
    context.fillRect(x, y, TILE_WIDTH, TILE_HEIGHT);
    drawContained(context, image, x + TILE_PADDING, y + TILE_PADDING, TILE_WIDTH - TILE_PADDING * 2, TILE_HEIGHT - CAPTION_HEIGHT - TILE_PADDING * 2);
    context.fillStyle = '#4d4855';
    context.font = '600 18px system-ui, sans-serif';
    context.textBaseline = 'middle';
    const label = sources[index].name || `Görsel ${index + 1}`;
    context.fillText(label.length > 58 ? `${label.slice(0, 55)}…` : label, x + TILE_PADDING, y + TILE_HEIGHT - CAPTION_HEIGHT / 2, TILE_WIDTH - TILE_PADDING * 2);
  });
  return canvasBlob(canvas);
}

function clipboardSupportsImages(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.clipboard?.write && typeof ClipboardItem !== 'undefined';
}

export async function copyTextWithImages(text: string, images: ClipboardImage[]): Promise<void> {
  if (!images.length) {
    await navigator.clipboard.writeText(text);
    return;
  }
  if (!clipboardSupportsImages()) throw new Error('Bu tarayıcı görsel kopyalamayı desteklemiyor.');
  await navigator.clipboard.write([new ClipboardItem({
    'text/plain': new Blob([text], { type: 'text/plain' }),
    'image/png': imageCollectionBlob(images),
  })]);
}

export async function copyImage(image: ClipboardImage): Promise<void> {
  if (!clipboardSupportsImages()) throw new Error('Bu tarayıcı görsel kopyalamayı desteklemiyor.');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': imageBlob(image) })]);
}

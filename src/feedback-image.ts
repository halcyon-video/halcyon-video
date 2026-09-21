// Limit feedback uploads independently of the display drawing buffer. A noisy
// 4K floor can exceed the server's 20 MiB JSON limit after base64 encoding.
// Keep unrestricted captures for photography tools that need full resolution.
export function capturePinPng(source: HTMLCanvasElement, maxEdge?: number): string {
  if (!maxEdge || Math.max(source.width, source.height) <= maxEdge) {
    return source.toDataURL('image/png');
  }
  const scale = maxEdge / Math.max(source.width, source.height);
  const image = document.createElement('canvas');
  image.width = Math.max(1, Math.round(source.width * scale));
  image.height = Math.max(1, Math.round(source.height * scale));
  const context = image.getContext('2d');
  if (!context) throw new Error('Could not prepare feedback image');
  context.drawImage(source, 0, 0, image.width, image.height);
  return image.toDataURL('image/png');
}

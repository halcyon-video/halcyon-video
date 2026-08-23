// ?clerk_template=1 — hand the user the procedural clerk sprite sheet as a
// PNG download, straight from the canvas the boot just painted (so it wears
// the active theme's livery, exactly as she does). It is the starting point
// for a custom sheet (public/user-assets/README.md "clerk/"): edit the cells,
// keep the grid, drop the result back in as user-assets/clerk/default.png.
// A boot param rather than a menu item so it works identically in demo,
// kiosk and dev boots with zero UI surface.

let served = false;

export function maybeServeClerkTemplate(atlas: HTMLCanvasElement): void {
  if (served) return;
  if (new URLSearchParams(location.search).get('clerk_template') !== '1') return;
  served = true;
  atlas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    // The object URL is deliberately never revoked: revoking can race the
    // download, and a scene rebuild never serves twice (`served`).
    a.href = URL.createObjectURL(blob);
    a.download = 'clerk-sprite-template.png';
    a.click();
  }, 'image/png');
}

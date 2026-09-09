// Public-safe technical inserts. Deliberately not replicas of commercial art.
import type { Title } from '../../src/providers/media-source-provider';
function insert(label: string, face: string, color: string, w = 560, h = 490): string {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const c = canvas.getContext('2d')!;
  if (face === 'SPINE') {
    c.fillStyle=color;c.fillRect(0,0,w,h);c.fillStyle='#ffffff';
    c.font='12px sans-serif';c.textAlign='center';c.fillText('TOP ↑',w/2,24);
    c.translate(w/2,h-28);c.rotate(-Math.PI/2);c.font='24px sans-serif';c.textAlign='left';
    c.fillText('SPINE · FORMAT STUDY →',0,8, h-75);
    return canvas.toDataURL('image/png');
  }
  c.scale(w / 560, h / 490);
  c.fillStyle = color; c.fillRect(0, 0, 560, 490);
  c.fillStyle = '#e5d7b2'; c.fillRect(30, 65, 500, 3); c.fillRect(30, 420, 500, 3);
  c.fillStyle = '#ffffff'; c.font = '23px sans-serif'; c.fillText(`TOP ↑ · ${face}`, 30, 45);
  c.font = '37px sans-serif'; c.fillText(label, 30, 155);
  c.font = '21px sans-serif'; c.fillText('PHYSICAL FORMAT STUDY', 30, 207);
  c.fillStyle = '#d9ad59'; c.beginPath(); c.moveTo(330, 270); c.lineTo(415, 200); c.lineTo(485, 340); c.lineTo(315, 380); c.fill();
  c.fillStyle = '#ffffff'; c.font = '17px sans-serif'; c.fillText('SYNTHETIC INSERT · NO SCANNED TITLE ART', 30, 450);
  c.font = '18px sans-serif'; c.fillText('LEFT ←                         → RIGHT', 30, 390);
  return canvas.toDataURL('image/png');
}
export function packagingFixtures(): Title[] {
  const formats: [string, string, number][] = [
    ['Single-disc jewel study', 'PLAYSTATION', 1], ['Four-disc jewel study', 'PLAYSTATION', 4],
    ['Saturn nominal study', 'SEGA SATURN', 1], ['Sega CD nominal study', 'SEGA CD', 1],
    ['Dreamcast nominal study', 'DREAMCAST', 1], ['DVD console study', 'PLAYSTATION 2', 1],
    ['Handheld keepcase study', 'NINTENDO 3DS', 1], ['Cartridge carton study', 'SNES', 1],
    ['Molded cartridge study', 'GENESIS', 1], ['Unknown format study', 'UNKNOWN', 1],
  ];
  return formats.map(([title, platform, discCount], i) => ({
    id: `packaging-study-${i}`, title, platform, discCount, game: true,
    year: 1999, rating: 'NR', duration: 'N/A', overview: `Synthetic physical packaging verification; disc count ${discCount}. Nominal inherited dimensions, not an exact regional retail edition.`,
    director: 'Format study', actors: [], genres: ['Games'], localPath: '',
    posterUrl: insert(discCount === 4 ? 'FOUR DISCS' : 'FORMAT STUDY', 'FRONT', '#173c55'),
    gameArt: { back: insert('BACK INLAY', 'BACK', '#543742'), spine: insert('SPINE', 'SPINE', '#3d5250', 40, 490) },
  }));
}

// Platform resolution and toggle checks for video games.
// Kept free of heavyweight modules so tests and loaders run in clean Node ESM.

const DEFAULT_PLATFORMS = new Set(['snes', 'n64', 'genesis', 'psx']);

export function platformSettingKey(label: string): string {
  const key = label.toLowerCase().replace(/\s+/g, '');
  if (key === 'snes' || key === 'supernintendo') return 'bb_platform_snes';
  if (key === 'superfamicom' || key === 'sfam' || key === 'sfc') return 'bb_platform_sfam';
  if (key === 'nes' || key === 'famicom' || key === 'nintendoentertainment') return 'bb_platform_nes';
  if (key === 'n64' || key === 'nintendo64') return 'bb_platform_n64';
  if (key === '3ds' || key === 'nintendo3ds') return 'bb_platform_3ds';
  if (key === 'psp' || key === 'playstationportable') return 'bb_platform_psp';
  if (key === 'nintendodsi' || key === 'dsi') return 'bb_platform_dsi';
  if (key === 'nintendoswitch' || key === 'switch') return 'bb_platform_switch';
  if (key === 'wiiu') return 'bb_platform_wiiu';
  if (key === 'xbox') return 'bb_platform_xbox';
  if (key === 'segasaturn' || key === 'saturn') return 'bb_platform_saturn';
  if (key === 'genesis' || key === 'segagenesis' || key === 'megadrive') return 'bb_platform_genesis';
  if (key === 'psx' || key === 'ps1' || key === 'playstation') return 'bb_platform_psx';
  if (key === 'ps2' || key === 'playstation2') return 'bb_platform_ps2';
  if (key === 'gamecube' || key === 'nintendogamecube') return 'bb_platform_gamecube';
  if (key === 'dreamcast' || key === 'segadreamcast') return 'bb_platform_dreamcast';
  if (key === 'gba' || key === 'gameboyadvance') return 'bb_platform_gba';
  if (key === 'gbc' || key === 'gameboycolor') return 'bb_platform_gbc';
  if (key === 'gb' || key === 'gameboy') return 'bb_platform_gb';
  if (key === 'arcade' || key === 'mame' || key === 'neogeo') return 'bb_platform_arcade';
  if (key === 'atari') return 'bb_platform_atari';
  return `bb_platform_${key}`;
}

export function isPlatformEnabled(label: string): boolean {
  const settingKey = platformSettingKey(label);
  const raw = settingKey.replace('bb_platform_', '');
  const defVal = DEFAULT_PLATFORMS.has(raw);
  if (typeof localStorage === 'undefined') return defVal;
  const val = localStorage.getItem(settingKey);
  if (val === null) return defVal;
  return val === '1' || val === 'true';
}

export function isGamesOnly(): boolean {
  if (typeof localStorage === 'undefined') return false;
  const gamesEnabled = localStorage.getItem('bb_games_enabled');
  const gamesOnly = localStorage.getItem('bb_games_only');
  return (gamesEnabled === '1' || gamesEnabled === 'true') && (gamesOnly === '1' || gamesOnly === 'true');
}

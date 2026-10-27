// Platform signboard labels shared by every games source (Romm, EmulationStation).
// Pure on purpose: no Tauri or DOM imports, so node tests can load it.
// Friendly, era-appropriate section label for a Romm platform (matches the
// signboards a real rental game wall carried). Falls back to the platform's
// own name for anything not in the map so unknown systems still get a sign.
export function platformLabel(name: string, slug: string): string {
  const key = `${slug} ${name}`.toLowerCase();

  // Word-boundary matching matters here: a bare substring test for 'nes'
  // also matches "genesis" and "nintendo entertainment"-less names, which
  // mislabels whole platforms and makes them leak through (or vanish from)
  // the platform toggles.
  // Super Famicom BEFORE Snes: the Japanese carton is a different object, not a
  // regional label on the same one. An SFC box is tall and narrow (~10.7 x 19.1
  // cm, 0.56) where the NA Snes box is wide (7.5 x 5.25 in, 1.43), and their
  // scans match those shapes — 0.553 vs 1.368 measured on this library. Sharing
  // one label stretched every SFC cover 2.6x across a landscape face.
  if (/\bsfam\b|\bsfc\b|super\s*famicom/.test(key)) {
    return 'SUPER FAMICOM';
  }
  if (/\bsnes\b|super\s*nintendo/.test(key)) {
    return 'SNES';
  }
  if (/\bnes\b|famicom|famicon|nintendo entertainment|\bfc\b/.test(key)) {
    return 'NES';
  }

  const rules: [RegExp, string][] = [
    [/n64|nintendo[-\s]?64/, 'NINTENDO 64'],
    [/\b3ds\b|nintendo[-\s]?3ds/, 'NINTENDO 3DS'],
    [/gamecube|ngc|\bgc\b/, 'GAMECUBE'],
    [/wii[-\s]?u/, 'WII U'],
    [/\bswitch\b/, 'NINTENDO SWITCH'],
    [/\bdsi\b/, 'NINTENDO DSI'],
    [/\bxbox\b/, 'XBOX'],
    [/genesis|mega[-\s]?drive|megadrive/, 'GENESIS'],
    [/sega[-\s]?cd|segacd/, 'SEGA CD'],
    [/saturn/, 'SEGA SATURN'],
    [/dreamcast/, 'DREAMCAST'],
    [/master[-\s]?system/, 'SEGA MASTER SYSTEM'],
    [/\bpsp\b|playstation[-\s]?portable/, 'PSP'],
    [/\bps2\b|playstation[-\s]?2/, 'PLAYSTATION 2'],
    [/\bpsx\b|\bps1\b|\bps\b|playstation/, 'PLAYSTATION'],
    [/game[-\s]?boy[-\s]?advance|\bgba\b/, 'GAME BOY ADVANCE'],
    [/game[-\s]?boy[-\s]?color|\bgbc\b/, 'GAME BOY COLOR'],
    [/game[-\s]?boy|\bgb\b/, 'GAME BOY'],
    [/arcade|mame|fbneo|fba|neo[-\s]?geo/, 'ARCADE'],
    [/atari/, 'ATARI'],
    [/turbo[-\s]?grafx|pc[-\s]?engine|\btg[-]?16\b/, 'TURBOGRAFX-16'],
  ];
  for (const [re, label] of rules) if (re.test(key)) return label;
  return name.toUpperCase();
}

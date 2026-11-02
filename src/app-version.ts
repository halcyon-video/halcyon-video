// APP VERSION — the release version from package.json (e.g. "0.30.2"),
// stamped in by Vite's define at build time. One source for every place the
// app names its version: the rental terminal's title bar and the setup
// failure report. Unit tests run without Vite, so they read 'dev'.

export const APP_VERSION: string =
  typeof __HALCYON_APP_VERSION__ === 'undefined' ? 'dev' : __HALCYON_APP_VERSION__;

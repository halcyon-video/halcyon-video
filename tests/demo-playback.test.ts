// Unit tests for the demo-playback overlay card (movie playback and game rental).
//
//   npm test (or: node --experimental-strip-types --test tests/demo-playback.test.ts)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderDemoOverlayHtml,
  openDemoPlaybackOverlay,
  closeDemoPlaybackOverlay,
  initDemoPlayback,
  type DemoPlaybackDeps,
} from '../src/demo-playback.ts';
import { PROJECT_PAGE_URL } from '../src/counter-terminal.ts';

test('renderDemoOverlayHtml for video renders the playback-disabled card', () => {
  const html = renderDemoOverlayHtml('video');
  assert.ok(html.includes('PLAYBACK DISABLED'), 'header indicates playback disabled');
  assert.ok(html.includes('THIS PUBLIC DEMO HAS NO MEDIA SERVER'), 'explains no media server');
  assert.ok(
    html.includes('Point Halcyon at your Jellyfin or Plex server to stream your own collection.'),
    'explains pointing to Jellyfin/Plex',
  );
  assert.ok(html.includes(PROJECT_PAGE_URL), 'links to GitHub repo');
  assert.ok(html.includes('BACK TO THE STORE'), 'has back button');
  assert.ok(html.includes('OR PRESS ESC'), 'has Esc hint');
});

test('renderDemoOverlayHtml for game renders the game-play-disabled card', () => {
  const html = renderDemoOverlayHtml('game');
  assert.ok(html.includes('GAME PLAY DISABLED'), 'header indicates game play disabled');
  assert.ok(html.includes('THIS PUBLIC DEMO HAS NO GAME SERVER'), 'explains no game server');
  assert.ok(
    html.includes('Point Halcyon at your Romm server to play your retro game collection.'),
    'explains pointing to Romm server',
  );
  assert.ok(html.includes(PROJECT_PAGE_URL), 'links to GitHub repo');
  assert.ok(html.includes('BACK TO THE STORE'), 'has back button');
  assert.ok(html.includes('OR PRESS ESC'), 'has Esc hint');
});

test('openDemoPlaybackOverlay and closeDemoPlaybackOverlay manage deps lifecycle for game rentals', () => {
  const logs: Array<{ message: string; type: string }> = [];
  let closedCount = 0;
  const ui = { isPlaybackActive: false };

  const fakeDeps: DemoPlaybackDeps = {
    ui,
    scene: () => null,
    log: (message, type) => {
      logs.push({ message, type });
    },
    onClosed: () => {
      closedCount++;
    },
  };

  initDemoPlayback(fakeDeps);

  openDemoPlaybackOverlay('Chrono Trigger', false, 'game');
  assert.equal(ui.isPlaybackActive, true);
  assert.ok(logs.some((l) => l.message.includes('Chrono Trigger') && l.message.includes('no game server')));

  closeDemoPlaybackOverlay();
  assert.equal(ui.isPlaybackActive, false);
  assert.equal(closedCount, 1);
  assert.ok(logs.some((l) => l.message.includes('Demo game rental screen dismissed')));
});

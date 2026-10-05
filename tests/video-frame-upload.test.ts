import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VideoFrameUploadGate } from '../src/video-frame-upload.ts';

test('a 24Hz decoder under 60Hz composites repairs only fresh frames', () => {
  const gate = new VideoFrameUploadGate();
  const video = { currentTime: 0, webkitDecodedFrameCount: 0 };
  let version = 0, uploads = 0;
  gate.needsUpload(video, version, 0);
  for (let tick = 1; tick <= 120; tick++) {
    video.currentTime = tick / 60;
    video.webkitDecodedFrameCount = Math.floor(tick * 24 / 60);
    if (gate.needsUpload(video, version, tick * 1000 / 60)) {
      uploads++; gate.uploaded(++version);
    }
  }
  assert.equal(uploads, 48, 'continuous playback time must not upload 120 copies');
});

test('native texture callbacks require no duplicate dirty marks', () => {
  const gate = new VideoFrameUploadGate();
  const video = { currentTime: 0, webkitDecodedFrameCount: 0 };
  let version = 0;
  gate.needsUpload(video, version, 0);
  for (let tick = 1; tick <= 120; tick++) {
    const frames = Math.floor(tick * 24 / 60);
    if (frames !== video.webkitDecodedFrameCount) version++;
    video.currentTime = tick / 60; video.webkitDecodedFrameCount = frames;
    assert.equal(gate.needsUpload(video, version, tick * 1000 / 60), false);
  }
});

test('a stopped callback chain after seek repairs from playback frame counts', () => {
  const gate = new VideoFrameUploadGate();
  let frames = 12, polls = 0, version = 4, uploads = 0;
  const video = { currentTime: .5, requestVideoFrameCallback: () => 1,
    getVideoPlaybackQuality: () => { polls++; return { totalVideoFrames: frames }; } };
  assert.equal(gate.needsUpload(video, version, 0), false);
  // Normal callback grace must not allocate quality objects on every composite.
  for (let tick = 1; tick < 15; tick++) gate.needsUpload(video, version, tick * 1000 / 60);
  assert.equal(polls, 0);
  for (let tick = 15; tick <= 90; tick++) {
    video.currentTime = tick / 60; frames = Math.floor(tick * 24 / 60);
    if (gate.needsUpload(video, version, tick * 1000 / 60)) {
      uploads++; gate.uploaded(++version);
    }
  }
  assert.ok(uploads >= 20 && uploads <= 31, 'seek fallback keeps presenting fresh decoded frames');
  assert.ok(polls <= 39, 'fallback polling stays bounded rather than following display refresh');
});

test('counter resets after source swaps and seeks still repaint the new frame', () => {
  const gate = new VideoFrameUploadGate();
  const video = { currentTime: 10, webkitDecodedFrameCount: 240 };
  gate.needsUpload(video, 1, 0);
  video.currentTime = .1; video.webkitDecodedFrameCount = 2;
  assert.equal(gate.needsUpload(video, 1, 16), true);
  gate.uploaded(2);
  assert.equal(gate.needsUpload(video, 2, 33), false);
});

test('legacy clock fallback remains available and bounded when counts are missing', () => {
  const gate = new VideoFrameUploadGate();
  const video = { currentTime: 0 };
  let version = 0, uploads = 0;
  gate.needsUpload(video, version, 0);
  for (let tick = 1; tick <= 120; tick++) {
    video.currentTime = tick / 60;
    if (gate.needsUpload(video, version, tick * 1000 / 60)) {
      uploads++; gate.uploaded(++version);
    }
  }
  assert.ok(uploads >= 40 && uploads <= 60);
  // The cap may have deferred the last changed picture at tick 120. Present
  // that one pending frame before checking a truly unchanged parked clock.
  if (gate.needsUpload(video, version, 2100)) { uploads++; gate.uploaded(++version); }
  const old = uploads;
  for (let tick = 127; tick <= 240; tick++) {
    if (gate.needsUpload(video, version, tick * 1000 / 60)) { uploads++; gate.uploaded(++version); }
  }
  assert.equal(uploads, old, 'a stopped media clock never causes a repair upload');
});

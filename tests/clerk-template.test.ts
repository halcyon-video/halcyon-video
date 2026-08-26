import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  maybeServeClerkTemplate,
  resetClerkTemplateServedForTesting,
} from '../src/clerk-template.ts';

test('maybeServeClerkTemplate is a no-op when location/document are undefined or param absent', () => {
  resetClerkTemplateServedForTesting();
  const fakeCanvas = {
    toBlob: () => {
      assert.fail('toBlob should not be called when location is undefined');
    },
  } as unknown as HTMLCanvasElement;

  // In standard node environment where global location is undefined:
  maybeServeClerkTemplate(fakeCanvas);
});

test('maybeServeClerkTemplate triggers download once when ?clerk_template=1 is present', () => {
  resetClerkTemplateServedForTesting();

  let clicked = false;
  let downloadedName = '';
  let downloadUrl = '';

  const origLocation = (globalThis as any).location;
  const origDocument = (globalThis as any).document;
  const origUrl = (globalThis as any).URL;

  try {
    (globalThis as any).location = { search: '?clerk_template=1' };
    (globalThis as any).URL = {
      createObjectURL: (_blob: any) => 'blob:test-template-url',
    };
    (globalThis as any).document = {
      createElement: (tag: string) => {
        if (tag === 'a') {
          return {
            set href(val: string) { downloadUrl = val; },
            get href() { return downloadUrl; },
            set download(val: string) { downloadedName = val; },
            get download() { return downloadedName; },
            click: () => { clicked = true; },
          };
        }
        return {};
      },
    };

    let blobCallbackCalled = false;
    const fakeBlob = {};
    const fakeCanvas = {
      toBlob: (cb: (blob: any) => void, mime: string) => {
        assert.equal(mime, 'image/png');
        blobCallbackCalled = true;
        cb(fakeBlob);
      },
    } as unknown as HTMLCanvasElement;

    maybeServeClerkTemplate(fakeCanvas);

    assert.ok(blobCallbackCalled, 'toBlob callback should have been invoked');
    assert.ok(clicked, 'download link should have been clicked');
    assert.equal(downloadedName, 'clerk-sprite-template.png');
    assert.equal(downloadUrl, 'blob:test-template-url');

    // Second call should be ignored (served once)
    let secondCall = false;
    const fakeCanvas2 = {
      toBlob: () => { secondCall = true; },
    } as unknown as HTMLCanvasElement;

    maybeServeClerkTemplate(fakeCanvas2);
    assert.equal(secondCall, false, 'second call must be suppressed');
  } finally {
    (globalThis as any).location = origLocation;
    (globalThis as any).document = origDocument;
    (globalThis as any).URL = origUrl;
    resetClerkTemplateServedForTesting();
  }
});

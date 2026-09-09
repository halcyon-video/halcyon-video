import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSeerrCredentialsInput,
  classifySeerrError,
} from '../src/seerr-config.ts';

test('validateSeerrCredentialsInput checks missing fields', () => {
  const noUrl = validateSeerrCredentialsInput('', 'somekey');
  assert.equal(noUrl.ok, false);
  assert.match(noUrl.reason ?? '', /Server URL is required/i);

  const noKey = validateSeerrCredentialsInput('http://192.168.1.50:5055', '');
  assert.equal(noKey.ok, false);
  assert.match(noKey.reason ?? '', /API key is required/i);
});

test('validateSeerrCredentialsInput allows missing key if operator-managed', () => {
  const opManaged = validateSeerrCredentialsInput('http://operator:5055', '', true);
  assert.equal(opManaged.ok, true);
  assert.equal(opManaged.normalized?.url, 'http://operator:5055');
  assert.equal(opManaged.normalized?.apiKey, '');
});

test('validateSeerrCredentialsInput normalizes url trailing slashes and pads base64 keys', () => {
  const res = validateSeerrCredentialsInput(' http://box:5055/// ', ' MTIzNDU2Nzg5MA ');
  assert.equal(res.ok, true);
  assert.equal(res.normalized?.url, 'http://box:5055');
  assert.equal(res.normalized?.apiKey, 'MTIzNDU2Nzg5MA==');
});

test('classifySeerrError translates raw errors into readable advice', () => {
  assert.match(classifySeerrError('HTTP error 401: Unauthorized'), /Invalid API key/i);
  assert.match(classifySeerrError('HTTP error 403: Forbidden'), /Access forbidden/i);
  assert.match(classifySeerrError('HTTP error 404: Not Found'), /Endpoint not found/i);
  assert.match(classifySeerrError('fetch failed: connect ECONNREFUSED'), /Cannot reach server/i);
  assert.match(classifySeerrError('Request timed out'), /timed out/i);
});

const COMPANION = 'http://127.0.0.1:1421/v1';
const PAIR_TOKEN = 'halcyon_steam_companion_pair';
const COMPANION_DOWNLOAD = 'https://github.com/halcyon-video/halcyon-video/releases/latest';
let pairing: Promise<string> | null = null;
const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));
function requireSecureCrypto(): void {
  if (!window.isSecureContext || !globalThis.crypto?.subtle) throw 'Steam companion pairing requires Halcyon over HTTPS or localhost. Plain HTTP LAN pages cannot protect your Steam pairing key.';
}
const bytes = (value: string) => new TextEncoder().encode(value);
const hex = (value: ArrayBuffer) => Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, '0')).join('');
async function sha256(value: string): Promise<string> { return hex(await crypto.subtle.digest('SHA-256', bytes(value))); }
async function hmac(token: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', bytes(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, bytes(value)));
}
async function verifyHmac(token: string, value: string, proof: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(proof)) return false;
  const key = await crypto.subtle.importKey('raw', bytes(token), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const signature = new Uint8Array(proof.match(/../g)!.map(byte => parseInt(byte, 16)));
  return crypto.subtle.verify('HMAC', key, signature, bytes(value));
}
async function ensureCompanion(): Promise<string> {
  requireSecureCrypto();
  const saved = localStorage.getItem(PAIR_TOKEN);
  if (saved) return saved;
  if (pairing) return pairing;
  pairing = (async () => {
    try {
      const status = await fetch(`${COMPANION}/status`);
      if (!status.ok) throw new Error();
      const started = await fetch(`${COMPANION}/pair`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origin: location.origin }) });
      const request = await started.json();
      if (!started.ok || typeof request.requestId !== 'string') throw new Error(typeof request.error === 'string' ? request.error : 'The Steam companion could not start pairing.');
      for (let attempt = 0; attempt < 120; attempt++) {
        await wait(500);
        const check = await fetch(`${COMPANION}/pair/${encodeURIComponent(request.requestId)}`);
        const answer = await check.json();
        if (typeof answer.token === 'string') { localStorage.setItem(PAIR_TOKEN, answer.token); return answer.token; }
        if (answer.pending === false) throw new Error('Steam companion pairing was denied.');
      }
      throw new Error('Steam companion pairing timed out.');
    } catch (error) {
      if (error instanceof TypeError) throw 'Install and start the Halcyon Steam Companion, then choose Connect Steam again.';
      throw error;
    }
  })().finally(() => { pairing = null; });
  return pairing;
}
export function clearCompanionPair(): void { localStorage.removeItem(PAIR_TOKEN); }
export function installSteamCompanion(): void { window.open(COMPANION_DOWNLOAD, '_blank', 'noopener'); }
export async function companionInvoke<T>(action: string, args: Record<string, unknown> = {}, method = 'POST'): Promise<T> {
  requireSecureCrypto();
  const token = await ensureCompanion();
  const challengeResponse = await fetch(`${COMPANION}/challenge`);
  const challenge = await challengeResponse.json().catch(() => ({}));
  if (!challengeResponse.ok || typeof challenge.nonce !== 'string') throw 'Steam companion authentication could not start.';
  const path = `/v1/${action}`; const body = method === 'DELETE' ? '' : JSON.stringify(args);
  const proof = await hmac(token, `${method}\n${path}\n${challenge.nonce}\n${await sha256(body)}`);
  const response = await fetch(`${COMPANION}/${action}`, { method, headers: { 'Content-Type': 'application/json', 'X-Halcyon-Nonce': challenge.nonce, 'X-Halcyon-Proof': proof }, body: method === 'DELETE' ? undefined : body });
  const text = await response.text(); const responseProof = response.headers.get('X-Halcyon-Response-Proof') || '';
  if (!await verifyHmac(token, `response\n${challenge.nonce}\n${response.status}\n${await sha256(text)}`, responseProof)) throw 'Steam companion response could not be authenticated.';
  const payload = (() => { try { return JSON.parse(text); } catch { return {}; } })();
  if (!response.ok) throw (typeof payload.error === 'string' ? payload.error : 'Steam companion could not complete this request.');
  return payload as T;
}

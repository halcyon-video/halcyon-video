// SETUP FAILURE REPORT (#132) — visitor-copyable diagnostic summary when first-run setup fails.
//
// When setup fails (Plex PIN expired, library listing failed, catalog sync stalled/errored,
// server unreachable), this builds a short, clean, scrubbed diagnostic report that can be
// copied directly to clipboard from the counter CRT setup terminal.
//
// Non-goals: NO telemetry, NO network upload, NO dependencies.
// All tokens (Plex/Jellyfin/Bearer), IP addresses, URLs, and account/user names are scrubbed.

export const APP_VERSION = '0.11.1';

export interface SetupStageRecord {
  name: string;
  startMs: number;
  durationMs: number;
  status: 'ok' | 'failed' | 'in-flight';
  error?: string;
}

export interface SetupLibraryShape {
  name: string;
  type?: string;
  carried?: boolean;
}

export interface SetupServerInfo {
  product?: string;
  version?: string;
  isRelay?: boolean;
  address?: string;
  username?: string;
}

export interface SetupReportState {
  appVersion: string;
  provider: string;
  serverProduct?: string;
  serverVersion?: string;
  isRelay?: boolean;
  libraries: SetupLibraryShape[];
  stages: SetupStageRecord[];
  failingStage?: string;
  failureReason?: string;
  sensitiveStrings: Set<string>;
}

let activeReport: SetupReportState = createEmptyState();
let lastGeneratedReport = '';

function createEmptyState(provider = 'unknown'): SetupReportState {
  return {
    appVersion: APP_VERSION,
    provider,
    libraries: [],
    stages: [],
    sensitiveStrings: new Set<string>(),
  };
}

export function initSetupReport(provider = 'unknown'): void {
  activeReport = createEmptyState(provider);
  lastGeneratedReport = '';
}

export function getActiveSetupReport(): SetupReportState {
  return activeReport;
}

export function registerSensitiveString(value: string | null | undefined): void {
  if (!value) return;
  const clean = String(value).trim();
  if (clean.length >= 3 && !['http://', 'https://', 'http', 'https', 'localhost'].includes(clean.toLowerCase())) {
    activeReport.sensitiveStrings.add(clean);
  }
}

export function recordSetupServer(info: SetupServerInfo): void {
  if (info.product) activeReport.serverProduct = info.product;
  if (info.version) activeReport.serverVersion = info.version;
  if (info.isRelay !== undefined) activeReport.isRelay = info.isRelay;
  if (info.address) registerSensitiveString(info.address);
  if (info.username) registerSensitiveString(info.username);
}

export function recordSetupLibraries(libs: SetupLibraryShape[]): void {
  activeReport.libraries = [...libs];
}

export function startSetupStage(name: string): void {
  const now = Date.now();
  // Close any preceding in-flight stage
  for (const st of activeReport.stages) {
    if (st.status === 'in-flight') {
      st.status = 'ok';
      st.durationMs = Math.max(1, now - st.startMs);
    }
  }
  activeReport.stages.push({
    name,
    startMs: now,
    durationMs: 0,
    status: 'in-flight',
  });
}

export function endSetupStage(name: string, status: 'ok' | 'failed' = 'ok', error?: string): void {
  const now = Date.now();
  const st = [...activeReport.stages].reverse().find((s) => s.name === name || s.status === 'in-flight');
  if (st) {
    st.status = status;
    st.durationMs = Math.max(1, now - st.startMs);
    if (error) st.error = error;
  }
}

export function recordSetupFailure(error: string | Error, failingStage?: string): void {
  const now = Date.now();
  const rawMsg = typeof error === 'string' ? error : error?.message || String(error);
  activeReport.failureReason = rawMsg;

  // Mark currently in-flight stage as failed
  let inFlight = [...activeReport.stages].reverse().find((s) => s.status === 'in-flight');
  if (inFlight) {
    inFlight.status = 'failed';
    inFlight.durationMs = Math.max(1, now - inFlight.startMs);
    inFlight.error = rawMsg;
    activeReport.failingStage = failingStage || inFlight.name;
  } else {
    activeReport.failingStage = failingStage || (activeReport.stages.length ? activeReport.stages[activeReport.stages.length - 1].name : 'Setup');
  }

  // Generate and cache report
  lastGeneratedReport = buildScrubbedSetupReport(activeReport);
  if (typeof window !== 'undefined') {
    (window as any).__lastSetupReport = lastGeneratedReport;
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Strips tokens, URLs, IP addresses, domains, and sensitive names from report text.
 */
export function scrubText(text: string, extraSensitive: string[] = []): string {
  let out = String(text || '');

  // 1. Redact known sensitive strings first (exact matches, longer first)
  const sensitive = [...activeReport.sensitiveStrings, ...extraSensitive]
    .filter((s) => s && s.length >= 3)
    .sort((a, b) => b.length - a.length);

  for (const s of sensitive) {
    // Escape regex characters
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(escaped, 'gi'), '[redacted]');
  }

  // 2. Query param tokens (X-Plex-Token, Token, api_key, etc.)
  out = out.replace(/X-Plex-Token=[^&\s"'`)]+/gi, 'X-Plex-Token=***');
  out = out.replace(/Token="[^"]*"/gi, 'Token="***"');
  out = out.replace(/api_key=[^&\s"'`)]+/gi, 'api_key=***');
  out = out.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer ***');

  // 3. Plex direct target hostnames (*.plex.direct)
  out = out.replace(/[a-zA-Z0-9-]+\.plex\.direct(?::\d+)?/gi, (match) => {
    const portMatch = match.match(/:(\d+)$/);
    return `[redacted].plex.direct${portMatch ? `:${portMatch[1]}` : ''}`;
  });

  // 4. URLs with http:// or https:// (preserve SCHEME and port, redact host/IP).
  // The scheme is diagnostic and must survive: a Plex sync that fails over
  // https is the certificate/secure-connection class of bug, and rewriting it
  // to http hides exactly the clue this report exists to carry.
  out = out.replace(/(https?):\/\/([^/\s:?'"()]+)(?::(\d+))?/gi, (_match, scheme, host, port) => {
    const portPart = port ? `:${port}` : '';
    const s = scheme.toLowerCase();
    if (host.toLowerCase() === 'localhost' || host === '127.0.0.1' || host === '::1') {
      return `${s}://localhost${portPart}`;
    }
    return `${s}://[redacted-host]${portPart}`;
  });

  // 5. IPv4 addresses
  out = out.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (ip) => {
    if (ip === '127.0.0.1') return ip;
    return '[redacted-ip]';
  });

  // 6. IPv6 addresses
  out = out.replace(/\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b/g, (ip) => {
    if (ip === '::1') return ip;
    return '[redacted-ip]';
  });

  // 7. Email addresses
  out = out.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[redacted-email]');

  return out;
}

export function buildScrubbedSetupReport(state: SetupReportState = activeReport): string {
  const lines: string[] = [];
  lines.push('=== Halcyon Setup Failure Report ===');
  lines.push(`App: Halcyon ${state.appVersion}`);

  const product = state.serverProduct || (state.provider !== 'unknown' ? state.provider.toUpperCase() : 'Unknown');
  const details: string[] = [];
  if (state.serverVersion) details.push(`v${state.serverVersion}`);
  if (state.isRelay !== undefined) details.push(`relay: ${state.isRelay}`);
  const detailsPart = details.length ? ` (${details.join(', ')})` : '';
  lines.push(`Server: ${product}${detailsPart}`);

  if (state.libraries.length > 0) {
    const carriedCount = state.libraries.filter((l) => l.carried !== false).length;
    lines.push(`Libraries (${state.libraries.length} found, ${carriedCount} carried):`);
    for (const lib of state.libraries) {
      const typePart = lib.type ? `, ${lib.type}` : '';
      const carriedPart = lib.carried === false ? ', excluded' : ', carried';
      lines.push(`  - ${lib.name}${typePart}${carriedPart}`);
    }
  } else {
    lines.push('Libraries: none listed');
  }

  if (state.failingStage) {
    lines.push(`Failing stage: ${state.failingStage}`);
  }

  if (state.failureReason) {
    lines.push(`Error: ${scrubText(state.failureReason)}`);
  }

  if (state.stages.length > 0) {
    lines.push('');
    lines.push('Stage timings:');
    for (const st of state.stages) {
      const dur = formatDuration(st.durationMs);
      const err = st.error ? ` — ${scrubText(st.error)}` : '';
      lines.push(`  - ${st.name}: ${dur} (${st.status})${err}`);
    }
  }

  lines.push('====================================');
  return lines.map((l) => scrubText(l)).join('\n');
}

export function getLastSetupReport(): string {
  return lastGeneratedReport || buildScrubbedSetupReport();
}

/**
 * Copies the scrubbed report to clipboard. Safe in DOM, navigator, and headless environments.
 */
export async function copySetupReportToClipboard(reportText?: string): Promise<boolean> {
  const text = reportText ?? getLastSetupReport();
  if (typeof window !== 'undefined') {
    (window as any).__lastSetupReport = text;
  }
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback below
    }
  }
  if (typeof document !== 'undefined' && typeof document.createElement === 'function' && document.body) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (ok) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

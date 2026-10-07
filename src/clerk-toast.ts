// Small period-styled speech card used for carry refusals, the empty-handed
// checkout nudge and the clerk's checkout line. One reused DOM node.

let toastEl: HTMLDivElement | null = null;
let toastTimer: number | null = null;

export function showClerkToast(text: string, ms = 3200, speaker = 'CLERK'): void {
  if (typeof document === 'undefined') return;
  if (!toastEl) {
    toastEl = document.createElement('div');
    // 10-ft type floor (review §4.4): ≥20px in the design mono.
    toastEl.style.cssText =
      'position:fixed;left:50%;bottom:110px;transform:translateX(-50%) translateY(10px);' +
      'z-index:62;pointer-events:none;opacity:0;transition:opacity .2s,transform .2s;width:max-content;' +
      "font-family:var(--font-mono,'Courier New',monospace);font-size:20px;font-weight:400;letter-spacing:.03em;" +
      'color:#fff;background:rgba(5,10,22,.88);' +
      'border:0;border-left:3px solid var(--bb-secondary, #f2e8c9);border-radius:0;padding:10px 16px;max-width:min(720px,84vw);' +
      'box-sizing:border-box;text-shadow:0 2px 1px #000;';
    const name = document.createElement('span');
    name.className = 'clerk-toast-speaker';
    name.textContent = `${speaker}  `;
    name.style.cssText = 'color:var(--bb-secondary, #f2e8c9);letter-spacing:.18em;font-size:20px;font-weight:700;';
    toastEl.appendChild(name);
    const body = document.createElement('span');
    body.className = 'clerk-toast-body';
    toastEl.appendChild(body);
    document.body.appendChild(toastEl);
  }
  const speakerEl = toastEl.querySelector('.clerk-toast-speaker') as HTMLSpanElement | null;
  if (speakerEl) speakerEl.textContent = `${speaker}  `;
  (toastEl.querySelector('.clerk-toast-body') as HTMLSpanElement).textContent = text;
  toastEl.style.opacity = '1';
  toastEl.style.transform = 'translateX(-50%) translateY(0)';
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    if (toastEl) {
      toastEl.style.opacity = '0';
      toastEl.style.transform = 'translateX(-50%) translateY(10px)';
    }
    toastTimer = null;
  }, ms);
}

/** Hide the toast now — e.g. the clerk dialog it was heralding just opened. */
export function hideClerkToast(): void {
  if (toastTimer !== null) {
    window.clearTimeout(toastTimer);
    toastTimer = null;
  }
  if (toastEl) {
    toastEl.style.opacity = '0';
    toastEl.style.transform = 'translateX(-50%) translateY(10px)';
  }
}

/** Test/teardown helper — drops the toast DOM node. */
export function disposeClerkToast(): void {
  if (toastTimer !== null) {
    window.clearTimeout(toastTimer);
    toastTimer = null;
  }
  toastEl?.remove();
  toastEl = null;
}

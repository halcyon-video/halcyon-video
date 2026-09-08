// Lightweight store quality notice UI module
// Displays a top-right prototype notice and native full-quality comparison dialog.

export interface QualityNoticeHandle {
  isOpen: () => boolean;
}

const STYLE_ID = 'halcyon-quality-notice-styles';

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .hqn-notice {
      position: fixed;
      top: max(12px, env(safe-area-inset-top));
      right: 12px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 6px;
      padding: 10px 12px;
      background: rgba(11, 19, 38, 0.92);
      border: 1px solid rgba(244, 235, 208, 0.25);
      border-radius: 8px;
      color: #f4ebd0;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      box-sizing: border-box;
      max-width: 220px;
      pointer-events: auto;
    }

    .hqn-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .hqn-title {
      font-size: 13px;
      font-weight: 600;
      color: #f4ebd0;
      line-height: 1.2;
    }

    .hqn-badge {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 2px 6px;
      background: rgba(244, 235, 208, 0.12);
      color: #ebdcb9;
      border: 1px solid rgba(244, 235, 208, 0.3);
      border-radius: 4px;
      line-height: 1;
    }

    .hqn-btn-see-full {
      min-height: 44px;
      min-width: 44px;
      width: 100%;
      padding: 8px 12px;
      font-size: 13px;
      font-weight: 600;
      font-family: inherit;
      color: #f4ebd0;
      background: #1e2e4e;
      border: 1px solid #3b527e;
      border-radius: 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      transition: background-color 0.15s ease, border-color 0.15s ease;
      box-sizing: border-box;
    }

    .hqn-btn-see-full:hover {
      background: #283d66;
      border-color: #4f6ca5;
    }

    .hqn-btn-see-full:focus-visible {
      outline: 2px solid #f4ebd0;
      outline-offset: 2px;
    }

    .hqn-dialog {
      position: fixed;
      inset: 0;
      margin: auto;
      padding: 20px;
      width: calc(100vw - 32px);
      max-width: 400px;
      max-height: 85vh;
      background: #0b1326;
      color: #f4ebd0;
      border: 1px solid rgba(244, 235, 208, 0.3);
      border-radius: 12px;
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.7);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      box-sizing: border-box;
      overflow-y: auto;
      z-index: 10000;
    }

    .hqn-dialog::backdrop {
      background: rgba(5, 10, 20, 0.8);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
    }

    .hqn-dialog-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }

    .hqn-dialog-heading {
      font-size: 16px;
      font-weight: 700;
      color: #f4ebd0;
      margin: 0;
    }

    .hqn-btn-x {
      min-height: 44px;
      min-width: 44px;
      padding: 0;
      background: transparent;
      border: none;
      color: #ebdcb9;
      font-size: 20px;
      font-weight: 400;
      line-height: 1;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
    }

    .hqn-btn-x:hover {
      color: #ffffff;
      background: rgba(244, 235, 208, 0.1);
    }

    .hqn-btn-x:focus-visible {
      outline: 2px solid #f4ebd0;
      outline-offset: 2px;
    }

    .hqn-img-container {
      width: 100%;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid rgba(244, 235, 208, 0.2);
      background: #131f37;
      margin-bottom: 14px;
      min-height: 160px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .hqn-img {
      width: 100%;
      height: auto;
      display: block;
      object-fit: cover;
    }

    .hqn-desc {
      font-size: 14px;
      line-height: 1.5;
      color: #ebdcb9;
      margin: 0 0 16px 0;
    }

    .hqn-full-store-box {
      background: #131f37;
      border: 1px solid rgba(244, 235, 208, 0.2);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .hqn-link-full-store {
      font-size: 14px;
      font-weight: 600;
      color: #f4ebd0;
      text-decoration: underline;
      text-underline-offset: 3px;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
    }

    .hqn-link-full-store:hover {
      color: #ffffff;
    }

    .hqn-link-full-store:focus-visible {
      outline: 2px solid #f4ebd0;
      outline-offset: 2px;
    }

    .hqn-warning {
      font-size: 12px;
      color: #c4b595;
      line-height: 1.4;
    }

    .hqn-actions {
      display: flex;
      justify-content: flex-end;
    }

    .hqn-btn-close {
      min-height: 44px;
      min-width: 80px;
      padding: 8px 16px;
      font-size: 14px;
      font-weight: 600;
      font-family: inherit;
      color: #0b1326;
      background: #f4ebd0;
      border: 1px solid #f4ebd0;
      border-radius: 6px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.15s ease;
    }

    .hqn-btn-close:hover {
      background: #ffffff;
    }

    .hqn-btn-close:focus-visible {
      outline: 2px solid #f4ebd0;
      outline-offset: 2px;
    }

    @media (prefers-reduced-motion: reduce) {
      .hqn-btn-see-full,
      .hqn-btn-close,
      .hqn-btn-x,
      .hqn-link-full-store {
        transition: none !important;
        animation: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}

export function mountQualityNotice(): QualityNoticeHandle {
  injectStyles();

  const noticeEl = document.createElement('div');
  noticeEl.className = 'hqn-notice';

  const header = document.createElement('div');
  header.className = 'hqn-header';

  const title = document.createElement('span');
  title.className = 'hqn-title';
  title.textContent = 'Low detail 3D';

  const badge = document.createElement('span');
  badge.className = 'hqn-badge';
  badge.textContent = 'Prototype';

  header.appendChild(title);
  header.appendChild(badge);

  const seeFullBtn = document.createElement('button');
  seeFullBtn.type = 'button';
  seeFullBtn.className = 'hqn-btn-see-full';
  seeFullBtn.textContent = 'See full quality';

  noticeEl.appendChild(header);
  noticeEl.appendChild(seeFullBtn);

  const dialog = document.createElement('dialog');
  dialog.className = 'hqn-dialog';

  const dialogTop = document.createElement('div');
  dialogTop.className = 'hqn-dialog-top';

  const heading = document.createElement('h2');
  heading.className = 'hqn-dialog-heading';
  heading.textContent = 'The store at full quality';
  heading.id = 'light-quality-heading';
  dialog.setAttribute('aria-labelledby', heading.id);

  const xBtn = document.createElement('button');
  xBtn.type = 'button';
  xBtn.className = 'hqn-btn-x';
  xBtn.setAttribute('aria-label', 'Close dialog');
  xBtn.textContent = '✕';

  dialogTop.appendChild(heading);
  dialogTop.appendChild(xBtn);

  const imgContainer = document.createElement('div');
  imgContainer.className = 'hqn-img-container';

  const fullImg = document.createElement('img');
  fullImg.className = 'hqn-img';
  fullImg.alt = 'Full quality store render preview';
  imgContainer.appendChild(fullImg);

  const desc = document.createElement('p');
  desc.className = 'hqn-desc';
  desc.textContent =
    'This prototype uses simple lighting and smaller shelf covers. The full store adds detailed fixtures, richer lighting and shadows.';

  const fullStoreBox = document.createElement('div');
  fullStoreBox.className = 'hqn-full-store-box';

  const fullStoreLink = document.createElement('a');
  fullStoreLink.className = 'hqn-link-full-store';
  const base = import.meta.env.BASE_URL || '/';
  const baseUrl = base.endsWith('/') ? base : base + '/';
  fullStoreLink.href = baseUrl + 'index.html';
  fullStoreLink.textContent = 'Open full store';

  const warning = document.createElement('span');
  warning.className = 'hqn-warning';
  warning.textContent = 'Requires more graphics power and data.';

  fullStoreBox.appendChild(fullStoreLink);
  fullStoreBox.appendChild(warning);

  const actions = document.createElement('div');
  actions.className = 'hqn-actions';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'hqn-btn-close';
  closeBtn.textContent = 'Close';

  actions.appendChild(closeBtn);

  dialog.appendChild(dialogTop);
  dialog.appendChild(imgContainer);
  dialog.appendChild(desc);
  dialog.appendChild(fullStoreBox);
  dialog.appendChild(actions);

  document.body.appendChild(noticeEl);
  document.body.appendChild(dialog);

  let openerElement: HTMLElement | null = null;

  const openDialog = () => {
    openerElement = (document.activeElement as HTMLElement) || seeFullBtn;
    fullImg.src = baseUrl + 'light-store/full-quality.webp';
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    closeBtn.focus();
  };

  const closeDialog = () => {
    if (dialog.open || dialog.hasAttribute('open')) {
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    }
    fullImg.removeAttribute('src');
    if (openerElement && typeof openerElement.focus === 'function') {
      openerElement.focus();
    }
  };

  seeFullBtn.addEventListener('click', openDialog);
  closeBtn.addEventListener('click', closeDialog);
  xBtn.addEventListener('click', closeDialog);

  dialog.addEventListener('close', () => {
    fullImg.removeAttribute('src');
    if (openerElement && typeof openerElement.focus === 'function') {
      openerElement.focus();
    }
  });

  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeDialog();
  });

  const stopProp = (e: Event) => {
    e.stopPropagation();
  };

  const eventTypes = [
    'pointerdown',
    'pointerup',
    'pointermove',
    'pointercancel',
    'mousedown',
    'mouseup',
    'mousemove',
    'click',
    'dblclick',
    'touchstart',
    'touchend',
    'touchmove',
    'touchcancel',
    'wheel',
    'keydown',
    'keyup',
  ];

  eventTypes.forEach((type) => {
    noticeEl.addEventListener(type, stopProp);
    dialog.addEventListener(type, stopProp);
  });

  return {
    isOpen: () => dialog.open || dialog.hasAttribute('open'),
  };
}

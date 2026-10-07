
/** A real, user-activated link survives popup blockers and keeps the store alive. */
export function showStreamingHandoff(title: string, service: string, url: string): void {
  (document.getElementById('streaming-handoff') as HTMLDialogElement | null)?.close();
  const previousFocus = document.activeElement as HTMLElement | null;
  const dialog = document.createElement('dialog');
  dialog.id = 'streaming-handoff';
  dialog.setAttribute('aria-labelledby', 'streaming-handoff-title');
  const heading = document.createElement('h2');
  heading.id = 'streaming-handoff-title';
  heading.textContent = 'READY TO WATCH';
  const movie = document.createElement('p');
  movie.textContent = title;
  const hint = document.createElement('p');
  hint.textContent = `${service} opens in a separate tab. Close that tab or switch back here to return to the store.`;
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'OPEN STREAMING SERVICE';
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'BACK TO STORE';
  const close = () => dialog.close();
  back.addEventListener('click', close);
  link.addEventListener('click', () => back.focus());
  const keys = (event: KeyboardEvent) => {
    if (!dialog.open || event.ctrlKey || event.metaKey || event.altKey) return;
    event.stopImmediatePropagation();
    if (['Escape', 'Backspace', 'BrowserBack'].includes(event.key)) {
      event.preventDefault(); close();
    } else if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      (document.activeElement === link ? back : link).focus();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      (document.activeElement === back ? back : link).click();
    }
  };
  dialog.addEventListener('close', () => {
    window.removeEventListener('keydown', keys, true);
    dialog.remove();
    if (previousFocus?.isConnected && !document.querySelector('dialog[open]')) previousFocus.focus({ preventScroll: true });
  }, { once: true });
  for (const event of ['pointerdown', 'pointerup', 'click']) {
    dialog.addEventListener(event, e => e.stopPropagation());
  }
  dialog.append(heading, movie, hint, link, back);
  document.body.append(dialog);
  window.addEventListener('keydown', keys, true);
  document.exitPointerLock?.();
  dialog.showModal();
  link.focus();
}

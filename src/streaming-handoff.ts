
import { streamingDestinationKind } from './streaming-catalog.ts';

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
  movie.className = 'streaming-handoff-title';
  const hint = document.createElement('p');
  // Say what the link really is: only an exact title page claims the movie.
  const kind = streamingDestinationKind(url);
  const where = kind === 'title' ? `Opens this movie's page on ${service} in a separate tab.`
    : kind === 'search' ? `Opens ${service}'s search for this movie in a separate tab.`
    : `Opens TMDB's watch options for this movie in a separate tab, where ${service} is listed.`;
  hint.textContent = `${where} Your ${service} account and subscription apply there. Close that tab or switch back here to return to the store.`;
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = kind === 'title' ? `OPEN ON ${service.toUpperCase()}`
    : kind === 'search' ? `SEARCH ${service.toUpperCase()}` : 'SEE WATCH OPTIONS';
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = 'BACK TO STORE';
  const close = () => dialog.close();
  back.addEventListener('click', close);
  // One handoff, one tab: the dialog leaves once its link has been followed.
  link.addEventListener('click', () => { setTimeout(close, 0); }, { once: true });
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

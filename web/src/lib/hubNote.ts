// Notes the Bookmark Hub asks us to open, inside the frame that is already signed in.
//
// The Hub opens a note from elsewhere (a link in an AI chat reply, its own search,
// "查看" after saving to the inbox). It used to load a fresh frame through its
// /vault/open each time — a new sign-in, a second or two. Now, once the workspace is
// restored, we tell the Hub we are ready ({source:'webobsidian', type:'ready'}); from
// then on it posts {source:'hub', type:'open-note', id, path} and we open the note
// here, answering {source:'webobsidian', type:'open-note', id, ok}. Without an answer
// (still loading, signed out meanwhile, an older build) the Hub loads a fresh frame.
import { fromHub, hubOrigin, isFramed } from './hub';

/**
 * A vault-relative note path, or '' when it is not one: no absolute path, backslash,
 * empty segment, `..` or dot segment (.git, .obsidian), control character. The Hub
 * checks the same before sending; the server checks again when reading.
 */
export function cleanNotePath(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > 512 || /^\/|\\|[\x00-\x1f\x7f]/.test(text)) return '';
  return text.split('/').some((part) => !part || part.startsWith('.')) ? '' : text;
}

/** Tell the framing Hub it can hand us notes from now on. */
function announceReady(): void {
  const origin = hubOrigin();
  if (!isFramed() || !origin) return;
  try {
    window.parent.postMessage({ source: 'webobsidian', type: 'ready' }, origin);
  } catch {
    /* the Hub keeps loading fresh frames */
  }
}

type OpenNoteMessage = { source?: unknown; type?: unknown; id?: unknown; path?: unknown };

/**
 * Opens each note the Hub sends with `open` and answers whether it worked; announces
 * readiness right away. Returns the unsubscribe.
 */
export function onHubOpenNote(open: (path: string) => Promise<unknown>): () => void {
  const onMessage = (event: MessageEvent) => {
    if (!fromHub(event)) return;
    const data = event.data as OpenNoteMessage | null;
    if (!data || typeof data !== 'object' || data.source !== 'hub' || data.type !== 'open-note') return;
    const id = typeof data.id === 'number' || typeof data.id === 'string' ? data.id : null;
    const reply = (ok: boolean) => {
      try {
        (event.source as Window).postMessage({ source: 'webobsidian', type: 'open-note', id, ok }, event.origin);
      } catch {
        /* no answer: the Hub falls back to a fresh frame */
      }
    };
    const path = cleanNotePath(data.path);
    if (!path) return reply(false);
    Promise.resolve()
      .then(() => open(path))
      .then(
        () => reply(true),
        () => reply(false),
      );
  };
  window.addEventListener('message', onMessage);
  announceReady();
  return () => window.removeEventListener('message', onMessage);
}

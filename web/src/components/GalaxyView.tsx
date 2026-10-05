import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useStore } from '../lib/store';
import { api } from '../lib/api';
import Icon from './Icon';
import { LOCALE, t } from '../lib/i18n';
import { deliverScreenshot } from '../lib/canvasShot';
import { GalaxyEngine } from '../lib/galaxyEngine';
import { buildGalaxy, countChars, excerpt, formatSize, OTHER_KEY, ROOT_KEY, type GalaxyFolder, type GalaxyNote, type RawGraph } from '../lib/galaxyModel';

const ROW_H = 52; // fixed row height: the engine maps scrollTop to visible rows without measuring all
const MAX_ROWS = 400;
const LIST_W = 330, DETAIL_W = 380, GAP = 16;
const BG = '#050507';

/** "NOTE · 笔记": English kicker, plus the Chinese word on a Chinese browser. */
const kicker = (en: string, key: string) => (LOCALE === 'zh' ? `${en} · ${t(key)}` : en);
const folderName = (f: GalaxyFolder) => (f.key === ROOT_KEY ? t('Root') : f.key === OTHER_KEY ? t('Other') : f.name);
const day = (ms: number) => {
  if (!ms) return '—';
  const d = new Date(ms), p = (n: number) => String(n).padStart(2, '0');
  return d.getFullYear() === new Date().getFullYear() ? `${p(d.getMonth() + 1)}-${p(d.getDate())}` : `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * Graph tab, 星图 mode (PRD 2.0): the vault as a galaxy — wireframe core, one jellyfish per
 * top-level folder, real wikilinks between note specks. Choosing a folder fans fibres out to its
 * notes; choosing a note shows its numbers and summary. All controls are DOM buttons; the
 * canvas is decoration.
 */
export default function GalaxyView() {
  const openFile = useStore((s) => s.openFile);
  const searchFor = useStore((s) => s.searchFor);
  const tree = useStore((s) => s.tree);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GalaxyEngine | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  const cards = useRef(new Map<string, HTMLElement>()).current;

  const [raw, setRaw] = useState<RawGraph | null>(null);
  const [failed, setFailed] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [sel, setSel] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<{ id: string; chars: number; bytes: number; summary: string } | { id: string; error: true } | null>(null);

  const galaxy = useMemo(() => (raw ? buildGalaxy(raw, tree) : null), [raw, tree]);
  const folder = galaxy?.folders.find((f) => f.key === sel) ?? null;
  const branch = !!folder;
  const note = active ? galaxy?.notes.get(active) ?? null : null;
  const phone = size.w > 0 && size.w <= 768;
  const wide = size.w >= 1180;
  const panelW = branch && !phone ? (wide ? LIST_W + DETAIL_W + GAP * 3 : LIST_W + GAP * 2) : 0;
  const sheetH = branch && phone ? Math.round(size.h * 0.6) : 0;

  useEffect(() => {
    let cancelled = false;
    api.graph().then((g) => { if (!cancelled) setRaw(g); }).catch(() => { if (!cancelled) { setFailed(true); setRaw({ nodes: [], edges: [] }); } });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const engine = new GalaxyEngine(canvasRef.current!, {
      cards,
      list: () => rowsRef.current,
      rows: () => {
        const box = rowsRef.current;
        if (!box) return [];
        const first = Math.floor(box.scrollTop / ROW_H), n = Math.ceil(box.clientHeight / ROW_H) + 1;
        return Array.from(box.children).slice(first, first + n).map((el) => ({ id: (el as HTMLElement).dataset.id ?? '', el: el as HTMLElement }));
      },
      onHub: (key) => openRef.current(key),
    });
    engineRef.current = engine;
    return () => { engine.destroy(); engineRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (galaxy) engineRef.current?.setData(galaxy); }, [galaxy]);
  useEffect(() => {
    engineRef.current?.setState({ mode: branch ? 'branch' : 'galaxy', sel: branch ? sel : null, active, panelW, sheetH });
  }, [branch, sel, active, panelW, sheetH]);

  // A folder that disappeared (renamed/deleted) closes the branch.
  useEffect(() => { if (sel !== null && galaxy && !folder) { setSel(null); setActive(null); } }, [galaxy, folder, sel]);

  const openFolder = (key: string) => {
    const f = galaxy?.folders.find((x) => x.key === key);
    setSel(key);
    setQuery('');
    setActive(wide && f?.notes.length ? f.notes[0].id : null);
    if (rowsRef.current) rowsRef.current.scrollTop = 0;
  };
  const openRef = useRef(openFolder);
  openRef.current = openFolder;
  // Focus follows what is on screen, so Esc keeps working when a panel hides the one in focus.
  const focusSoon = (el: () => HTMLElement | null | undefined) => requestAnimationFrame(() => el()?.focus({ preventScroll: true }));
  const rowEl = (id: string | null) => Array.from(rowsRef.current?.children ?? []).find((el) => (el as HTMLElement).dataset.id === id) as HTMLElement | undefined;
  const close = () => {
    const key = sel;
    setSel(null); setActive(null);
    if (key !== null) focusSoon(() => cards.get(key));
  };
  const closeDetail = () => {
    const id = active;
    setActive(null);
    if (!wide) focusSoon(() => rowEl(id));
  };
  const pick = (n: GalaxyNote) => {
    setSel(n.folder);
    setActive(n.id);
    setQuery('');
  };

  // Keep the chosen row in view (search results, related notes).
  useEffect(() => {
    const box = rowsRef.current;
    if (!box || !active) return;
    rowEl(active)?.scrollIntoView({ block: 'nearest' });
  }, [active, sel]);

  useEffect(() => { if (active && !wide) focusSoon(() => detailRef.current); }, [active, wide]);

  // Detail numbers and summary come from the note itself; cached per note while the view lives.
  const cache = useRef(new Map<string, string>());
  useEffect(() => {
    if (!active) { setDetail(null); return; }
    let closed = false;
    const show = (content: string) => !closed && setDetail({ id: active, chars: countChars(content), bytes: new TextEncoder().encode(content).length, summary: excerpt(content) || t('This note is empty.') });
    const hit = cache.current.get(active);
    if (hit !== undefined) show(hit);
    else {
      setDetail(null);
      api.read(active).then((r) => { cache.current.set(active, r.content); show(r.content); }).catch(() => { if (!closed) setDetail({ id: active, error: true }); });
    }
    return () => { closed = true; };
  }, [active]);

  useEffect(() => {
    const onShot = () => { const e = engineRef.current; if (e) void deliverScreenshot(e.snapshot(BG), 'galaxy.png'); };
    window.addEventListener('wo-graph-screenshot', onShot);
    return () => window.removeEventListener('wo-graph-screenshot', onShot);
  }, []);

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length || !galaxy) return [];
    const out: GalaxyNote[] = [];
    for (const n of galaxy.notes.values()) {
      const hay = `${n.label}\n${n.id}\n${n.tags.join(' ')}`.toLowerCase();
      if (words.every((w) => hay.includes(w))) out.push(n);
      if (out.length >= 8) break;
    }
    return out;
  }, [query, galaxy]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (query) setQuery('');
    else if (active && !wide) closeDetail();
    else if (branch) close();
    else return;
    e.stopPropagation();
  };

  const folders = galaxy?.folders ?? [];
  const compact = phone || (folders.length > 0 && size.w > 0 && Math.PI * (size.w * 0.38 + size.h * 0.34) / folders.length < 150);
  const totalLinks = galaxy ? galaxy.links.length : 0;
  const showDetail = branch && !!note;
  const loaded = detail && note && detail.id === note.id && 'chars' in detail ? detail : null;
  const style = { '--panel-w': `${panelW}px`, '--sheet-h': `${sheetH}px` } as CSSProperties;

  return (
    <div className={`galaxy${phone ? ' is-phone' : ''}${branch ? ' is-branch' : ''}${wide ? ' is-wide' : ''}`} ref={wrapRef} style={style} onKeyDown={onKey}>
      <canvas ref={canvasRef} className="galaxy-canvas" aria-hidden="true" />

      <header className="galaxy-brand">
        {branch ? (
          <button className="galaxy-back" onClick={close} aria-label={t('Back to galaxy')}>
            <Icon name="arrow-left" size={15} />
            <span>{t('Galaxy')}</span><b>/</b><span className="galaxy-crumb" style={{ color: folder.color }}>{folderName(folder)}</span>
          </button>
        ) : (
          <>
            <span className="galaxy-mark" aria-hidden="true" />
            <div>
              <div className="galaxy-title">NEURAL · VAULT</div>
              <div className="galaxy-sub">{t('Knowledge galaxy')}</div>
            </div>
          </>
        )}
      </header>

      <div className="galaxy-cards" role="group" aria-label={t('Graph folders')}>
        {folders.map((f) => (
          <button
            key={f.key}
            ref={(el) => { if (el) cards.set(f.key, el); else cards.delete(f.key); }}
            className={`galaxy-card${compact ? ' compact' : ''}${sel === f.key ? ' on' : ''}${f.notes.length ? '' : ' empty'}`}
            style={{ '--c': f.color } as CSSProperties}
            aria-pressed={sel === f.key}
            title={f.members.length > 1 ? f.members.join(' · ') : undefined}
            onClick={() => (sel === f.key ? close() : openFolder(f.key))}
            onPointerEnter={() => engineRef.current?.setHover(f.key)}
            onPointerLeave={() => engineRef.current?.setHover(null)}
          >
            <span className="galaxy-card-count">{f.notes.length}</span>
            <span className="galaxy-card-name">{folderName(f)}</span>
            {!compact && <span className="galaxy-card-meta">{f.notes.length ? t('Updated {date}', { date: day(f.updated) }) : t('Empty')}</span>}
          </button>
        ))}
      </div>

      {galaxy && (
        <div className="galaxy-stats" aria-label={t('{notes} notes · {links} links · {folders} folders', { notes: galaxy.notes.size, links: totalLinks, folders: folders.length })}>
          <span><b>N</b>{galaxy.notes.size}</span><span><b>L</b>{totalLinks}</span><span><b>F</b>{folders.length}</span>
        </div>
      )}
      {failed && <div className="galaxy-empty">{t('Could not load the graph.')}</div>}
      {galaxy && !failed && galaxy.notes.size === 0 && <div className="galaxy-empty">{t('The vault has no notes yet.')}</div>}

      {branch && (
        <section className="galaxy-list glass" aria-label={t('Notes in {name}', { name: folderName(folder) })} hidden={!wide && !!note}>
          <header className="galaxy-list-head">
            <span className="galaxy-dot" style={{ background: folder.color }} />
            <span className="galaxy-list-name">{folderName(folder)}</span>
            <span className="galaxy-list-count">{t('{n} notes', { n: folder.notes.length })}</span>
            {phone && <button className="galaxy-x" aria-label={t('Back to galaxy')} onClick={close}><Icon name="x" size={15} /></button>}
          </header>
          <div className="galaxy-rows" ref={rowsRef} onScroll={() => engineRef.current?.redraw()}>
            {folder.notes.slice(0, MAX_ROWS).map((n) => (
              <button
                key={n.id}
                data-id={n.id}
                className="galaxy-row"
                aria-current={n.id === active ? 'true' : undefined}
                style={{ '--c': folder.color } as CSSProperties}
                onClick={() => setActive(n.id)}
                onDoubleClick={() => openFile(n.id)}
                title={t('Double-click a note to open it')}
              >
                <span className="galaxy-row-title">{n.label}</span>
                <span className="galaxy-row-meta">{day(n.mtime)} · ⇄ {new Set([...n.in, ...n.out]).size}</span>
              </button>
            ))}
          </div>
          {folder.notes.length === 0 && <p className="galaxy-list-note">{t('This folder has no notes yet.')}</p>}
          {folder.notes.length > MAX_ROWS && <p className="galaxy-list-note">{t('Showing the newest {n}; search to find the rest.', { n: MAX_ROWS })}</p>}
        </section>
      )}

      {showDetail && note && (
        <aside className="galaxy-detail glass" ref={detailRef} tabIndex={-1} aria-label={t('Selected note')} style={{ '--c': folder!.color } as CSSProperties}>
          <div className="galaxy-detail-head">
            <span className="galaxy-kicker">{kicker('NOTE', 'Note')}</span>
            <button className="galaxy-x" aria-label={wide ? t('Close note details') : t('Back to list')} onClick={closeDetail}><Icon name="x" size={15} /></button>
          </div>
          <h3>{note.label}</h3>
          <p className="galaxy-detail-path">{note.id}</p>
          <div className="galaxy-tiles">
            <div><b>{loaded ? loaded.chars.toLocaleString() : '…'}</b><span>{kicker('WORDS', 'Characters')}</span></div>
            <div><b>{loaded ? formatSize(loaded.bytes) : '…'}</b><span>{kicker('SIZE', 'Size')}</span></div>
            <div><b>{new Set([...note.in, ...note.out]).size}</b><span>{kicker('LINKS', 'Links')}</span></div>
            <div><b>{day(note.mtime)}</b><span>{kicker('UPDATED', 'Updated')}</span></div>
          </div>
          <button className="galaxy-open" onClick={() => openFile(note.id)}><Icon name="arrow-up-right" size={14} />{t('Open note')}</button>
          <h4 className="galaxy-kicker">{kicker('SUMMARY', 'Summary')}</h4>
          <p className="galaxy-summary">
            {!detail || detail.id !== note.id ? t('Loading summary…') : 'error' in detail ? t('Summary unavailable. You can still open this note.') : detail.summary}
          </p>
          {note.tags.length > 0 && (
            <div className="galaxy-tags">{note.tags.map((tag) => <button key={tag} onClick={() => searchFor('tag:' + tag)}>#{tag}</button>)}</div>
          )}
          {(note.in.length > 0 || note.out.length > 0) && (
            <>
              <h4 className="galaxy-kicker">{t('Linked notes · {n}', { n: new Set([...note.in, ...note.out]).size })}</h4>
              <div className="galaxy-related">
                {[...new Set([...note.out, ...note.in])].slice(0, 30).map((id) => {
                  const n = galaxy!.notes.get(id)!;
                  const f = galaxy!.folders.find((x) => x.key === n.folder)!;
                  return (
                    <button key={id} onClick={() => pick(n)} style={{ '--c': f.color } as CSSProperties}>
                      <span className="galaxy-dot" />{n.label}
                      {note.out.includes(id) && note.in.includes(id) && <span className="galaxy-mutual" title={t('Mutual')}>⇄</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </aside>
      )}

      {!(phone && branch) && (
        <div className="galaxy-search glass">
          <Icon name="search" size={14} />
          <input
            value={query}
            placeholder={t('Search notes, tags or folders…')}
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) pick(results[0]); }}
            aria-label={t('Search notes, tags or folders…')}
          />
          {query.trim() !== '' && (
            <div className="galaxy-results">
              {results.length === 0 && <div className="galaxy-results-empty">{t('No matching notes')}</div>}
              {results.map((n) => {
                const f = galaxy!.folders.find((x) => x.key === n.folder)!;
                return (
                  <button key={n.id} onClick={() => pick(n)} style={{ '--c': f.color } as CSSProperties}>
                    <span className="galaxy-dot" /><span className="galaxy-results-title">{n.label}</span><span className="galaxy-results-folder">{folderName(f)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

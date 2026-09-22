// Bookmark Hub sign-in bridge (server/src/services/hubsso.ts, routes/hub.ts).
//
// Each direction that would be bad if wrong has a test here: only the Hub's page can
// post a ticket, a ticket works once and only for this site, a Hub session dies with
// the bridge that opened it, the proxy check never counts anything but a Hub session,
// and framing is opened for exactly the configured Hub.
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createHash, createHmac } from 'node:crypto';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';

const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'webobsidian-hub-sso-'));
const HUB = 'https://hub.example.test:5526';
const SECRET = 'unit-test-hub-secret-' + '0123456789abcdef'.repeat(2);
const PROXY_SECRET = 'hub-test-proxy-secret';

process.env.VAULT_PATH = path.join(testRoot, 'vault');
process.env.DATA_DIR = path.join(testRoot, 'data');
process.env.WEBOBSIDIAN_HUB_URL = HUB;
process.env.WEBOBSIDIAN_HUB_EMBED_SECRET = SECRET;
process.env.WEBOBSIDIAN_TRUSTED_PROXY_SECRET = PROXY_SECRET;
process.env.WEBOBSIDIAN_TRUSTED_PROXY_ADDRESS = '127.0.0.1';

const { config } = await import('../src/config.js');
const { loadSettings } = await import('../src/services/settings.js');
const { issueToken } = await import('../src/services/auth.js');
const hubsso = await import('../src/services/hubsso.js');
const { hubRouter } = await import('../src/routes/hub.js');
const { authRouter } = await import('../src/routes/auth.js');
const { requireAuth } = await import('../src/middleware/auth.js');
const { securityHeaders } = await import('../src/middleware/headers.js');
const { errorHandler } = await import('../src/middleware/error.js');

let server: http.Server;
let base = '';

function buildApp() {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());
  app.use(cookieParser());
  app.use((_req, res, next) => {
    res.locals.cspNonce = 'test-nonce';
    next();
  });
  app.use(securityHeaders());
  app.use('/auth/hub', hubRouter);
  app.use('/auth', authRouter);
  app.get('/api/ping', requireAuth, (_req, res) => res.json({ ok: true }));
  app.get('/', (_req, res) => res.type('html').send('<!doctype html><title>app</title>'));
  app.use(errorHandler);
  return app;
}

async function listen(app: express.Express): Promise<{ server: http.Server; base: string }> {
  const s = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => resolve());
  });
  const address = s.address();
  assert(address && typeof address !== 'string');
  return { server: s, base: `http://127.0.0.1:${address.port}` };
}

function ticket(overrides: Partial<Parameters<typeof hubsso.signHubTicket>[0]> = {}): string {
  return hubsso.signHubTicket({ issuer: HUB, audience: base, secret: SECRET, ...overrides });
}

function sso(fields: Record<string, string>, origin: string | null = HUB): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
  if (origin !== null) headers.origin = origin;
  return fetch(`${base}/auth/hub/sso`, {
    method: 'POST',
    headers,
    body: new URLSearchParams(fields).toString(),
    redirect: 'manual',
  });
}

function sessionCookie(res: Response): string | undefined {
  const raw = res.headers.getSetCookie().find((c) => c.startsWith('webobsidian_token='));
  return raw?.split(';')[0];
}

async function signIn(to = '/'): Promise<string> {
  const res = await sso({ ticket: ticket(), to });
  assert.equal(res.status, 303);
  const cookie = sessionCookie(res);
  assert(cookie);
  return cookie;
}

before(async () => {
  await fs.mkdir(process.env.VAULT_PATH!, { recursive: true });
  await loadSettings();
  ({ server, base } = await listen(buildApp()));
});

beforeEach(() => {
  config.hubUrl = HUB;
  config.hubEmbedSecret = SECRET;
  config.hubSessionTtlSeconds = undefined;
  hubsso.resetHubState();
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await fs.rm(testRoot, { recursive: true, force: true });
});

// --- the ticket format is the Hub's, byte for byte --------------------------------

test('a ticket signed the way the Hub documents it verifies (independent re-implementation)', async () => {
  const exp = Math.floor(Date.now() / 1000) + 60;
  const b64 = (s: string) => Buffer.from(s).toString('base64url');
  const message = ['v2', 'vault', String(exp), 'N'.repeat(24), b64(HUB), b64(base)].join('.');
  const key = createHash('sha256').update(`hub-vault-admin|${SECRET}`).digest();
  const handMade = `${message}.${createHmac('sha256', key).update(message).digest('hex')}`;
  const res = await sso({ ticket: handMade });
  assert.equal(res.status, 303);
});

// --- signing in -------------------------------------------------------------------

test('a valid ticket from the Hub page opens a short, httpOnly, Lax session and lands on the path asked for', async () => {
  const res = await sso({ ticket: ticket(), to: '/note/Inbox/Today.md' });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('location'), '/note/Inbox/Today.md');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const raw = res.headers.getSetCookie().find((c) => c.startsWith('webobsidian_token='));
  assert(raw);
  assert.match(raw, /HttpOnly/i);
  assert.match(raw, /SameSite=Lax/i);
  assert.match(raw, /Max-Age=43200/);
  const cookie = raw.split(';')[0];

  assert.equal((await fetch(`${base}/api/ping`, { headers: { cookie } })).status, 200);
  assert.equal((await fetch(`${base}/auth/hub/check`, { headers: { cookie } })).status, 204);
  const me = await (await fetch(`${base}/auth/me`, { headers: { cookie } })).json();
  assert.equal(me.hub, true);
});

test('the session lifetime follows WEBOBSIDIAN_HUB_SESSION_TTL, clamped', async () => {
  config.hubSessionTtlSeconds = 3600;
  let res = await sso({ ticket: ticket() });
  assert.match(res.headers.getSetCookie().join(';'), /Max-Age=3600/);
  config.hubSessionTtlSeconds = 5;
  res = await sso({ ticket: ticket() });
  assert.match(res.headers.getSetCookie().join(';'), /Max-Age=300/);
});

test('a ticket works exactly once', async () => {
  const t = ticket();
  assert.equal((await sso({ ticket: t })).status, 303);
  const again = await sso({ ticket: t });
  assert.equal(again.status, 401);
  assert.equal(sessionCookie(again), undefined);
  assert.match(await again.text(), /reason: replayed/);
});

test('only a page served by the Hub may post the ticket (Origin), and a refused post does not burn it', async () => {
  const t = ticket();
  for (const origin of [null, 'null', 'https://evil.example', base, 'https://hub.example.test:5527']) {
    const res = await sso({ ticket: t }, origin);
    assert.equal(res.status, 403, String(origin));
    assert.equal(sessionCookie(res), undefined);
  }
  assert.equal((await sso({ ticket: t })).status, 303);
});

test('every way a ticket can be wrong is refused without a session', async () => {
  const cases: Array<[string, string]> = [
    ['missing', ''],
    ['malformed', 'v2.vault.1.2.3'],
    ['signature', ticket({ secret: 'another-secret-' + 'x'.repeat(32) })],
    ['purpose', ticket({ purpose: 'chat' })],
    ['expired', ticket({ nowMs: Date.now() - 120_000 })],
    ['ttl', ticket({ ttlSeconds: 3600 })],
    ['issuer', ticket({ issuer: 'https://other-hub.example' })],
    ['audience', ticket({ audience: 'https://host.example.test:3003' })],
  ];
  for (const [reason, t] of cases) {
    const res = await sso(t ? { ticket: t } : {});
    assert.notEqual(res.status, 303, reason);
    assert.equal(sessionCookie(res), undefined, reason);
    const body = await res.text();
    assert.match(body, new RegExp(`reason: ${reason}`), reason);
    if (t) assert(!body.includes(t), `${reason}: the ticket must not be echoed`);
  }
});

test("a ticket signed with the Hub's HaloWebUI key never verifies here", async () => {
  // Same secret, other bridge: HaloWebUI tickets are keyed with "hub-chat-admin|".
  const exp = Math.floor(Date.now() / 1000) + 60;
  const b64 = (s: string) => Buffer.from(s).toString('base64url');
  const message = ['v2', 'vault', String(exp), 'M'.repeat(24), b64(HUB), b64(base)].join('.');
  const chatKey = createHash('sha256').update(`hub-chat-admin|${SECRET}`).digest();
  const res = await sso({ ticket: `${message}.${createHmac('sha256', chatKey).update(message).digest('hex')}` });
  assert.equal(res.status, 401);
  assert.match(await res.text(), /reason: signature/);
});

test('the landing path can only be a page on this site', async () => {
  for (const to of ['//evil.example/x', 'https://evil.example/', '/\\evil.example', 'javascript:alert(1)', '/api/keys', '/auth/logout', '']) {
    const res = await sso({ ticket: ticket(), to });
    assert.equal(res.status, 303, to);
    assert.equal(res.headers.get('location'), '/', to);
  }
});

test('with the bridge switched off nothing can be traded, and existing Hub sessions die', async () => {
  const cookie = await signIn();
  config.hubEmbedSecret = undefined;
  const res = await sso({ ticket: ticket() });
  assert.equal(res.status, 404);
  assert.equal(sessionCookie(res), undefined);
  assert.equal((await fetch(`${base}/api/ping`, { headers: { cookie } })).status, 401);
  assert.equal((await fetch(`${base}/auth/hub/check`, { headers: { cookie } })).status, 401);
});

test('a secret shorter than 32 characters counts as unset', async () => {
  config.hubEmbedSecret = 'short-secret';
  const res = await sso({ ticket: ticket({ secret: 'short-secret' }) });
  assert.equal(res.status, 404);
});

test('rotating the secret or re-pointing the Hub revokes Hub sessions', async () => {
  let cookie = await signIn();
  config.hubEmbedSecret = 'rotated-hub-secret-' + 'z'.repeat(32);
  assert.equal((await fetch(`${base}/api/ping`, { headers: { cookie } })).status, 401);

  config.hubEmbedSecret = SECRET;
  cookie = await signIn();
  config.hubUrl = 'https://another-hub.example.test';
  assert.equal((await fetch(`${base}/api/ping`, { headers: { cookie } })).status, 401);
});

// --- the reverse-proxy check ------------------------------------------------------

test('the proxy check accepts a Hub session and nothing else', async () => {
  const hubCookie = await signIn();
  const passwordCookie = `webobsidian_token=${await issueToken()}`;
  const check = (headers: Record<string, string>) => fetch(`${base}/auth/hub/check`, { headers });
  assert.equal((await check({ cookie: hubCookie })).status, 204);
  // A password session is a real owner session…
  assert.equal((await fetch(`${base}/api/ping`, { headers: { cookie: passwordCookie } })).status, 200);
  // …but it is not a Hub session: the proxy keeps asking for its own login.
  assert.equal((await check({ cookie: passwordCookie })).status, 401);
  // The trusted-proxy header means "the proxy already logged this user in" everywhere else; not here.
  assert.equal((await check({ 'x-webobsidian-proxy-auth': PROXY_SECRET })).status, 401);
  assert.equal((await check({ authorization: `Bearer ${hubCookie.split('=')[1]}` })).status, 401);
  assert.equal((await check({})).status, 401);
  assert.equal((await check({ cookie: 'webobsidian_token=garbage' })).status, 401);
});

// --- signing out ------------------------------------------------------------------

test('the Hub can end a Hub session in this browser, and only the Hub or this site may ask', async () => {
  const cookie = await signIn();
  const logout = (origin: string | null, c = cookie) =>
    fetch(`${base}/auth/hub/logout`, {
      method: 'POST',
      headers: { ...(origin ? { origin } : {}), cookie: c },
    });

  for (const origin of [null, 'https://evil.example']) {
    const res = await logout(origin);
    assert.equal(res.status, 403, String(origin));
    assert.equal(res.headers.getSetCookie().length, 0);
  }
  const res = await logout(HUB);
  assert.equal(res.status, 204);
  assert.match(res.headers.getSetCookie().join(';'), /webobsidian_token=;.*Expires=Thu, 01 Jan 1970/);

  // A password session sharing the cookie is left alone.
  const passwordCookie = `webobsidian_token=${await issueToken()}`;
  const kept = await logout(HUB, passwordCookie);
  assert.equal(kept.status, 204);
  assert.equal(kept.headers.getSetCookie().length, 0);
});

// --- framing and status -----------------------------------------------------------

test('framing is opened for exactly the configured Hub', async () => {
  const res = await fetch(`${base}/`);
  const csp = res.headers.get('content-security-policy') ?? '';
  assert.match(csp, new RegExp(`frame-ancestors ${HUB.replace(/[.]/g, '\\.')}(;|$)`));
  assert(!csp.includes('*'));
  assert.equal(res.headers.get('x-frame-options'), null);
});

test('without a Hub, nobody may frame the app (as before)', async () => {
  config.hubUrl = undefined;
  const other = await listen(buildApp());
  try {
    const res = await fetch(`${other.base}/`);
    assert.match(res.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
  } finally {
    await new Promise<void>((resolve) => other.server.close(() => resolve()));
  }
});

test('a Hub URL that is not a plain origin disables embedding instead of widening it', async () => {
  for (const bad of ['https://*.example.test', 'https://hub.example.test/path', 'http://hub.example.test', 'hub.example.test']) {
    config.hubUrl = bad;
    assert.equal(hubsso.hubOrigin(), undefined, bad);
  }
  config.hubUrl = 'HTTPS://Hub.Example.Test:5526/';
  assert.equal(hubsso.hubOrigin(), 'https://hub.example.test:5526');
});

test('/auth/status names the Hub (public: it is in the CSP anyway) and says whether sign-in works', async () => {
  let status = await (await fetch(`${base}/auth/status`)).json();
  assert.deepEqual(status.hub, { url: HUB, sso: true });
  config.hubEmbedSecret = undefined;
  status = await (await fetch(`${base}/auth/status`)).json();
  assert.deepEqual(status.hub, { url: HUB, sso: false });
  config.hubUrl = undefined;
  status = await (await fetch(`${base}/auth/status`)).json();
  assert.equal(status.hub, null);
});

import express, { Router, type Response } from 'express';
import { asyncHandler } from '../middleware/error.js';
import { COOKIE_NAME } from '../middleware/auth.js';
import { cookieOpts } from './auth.js';
import { issueHubToken, looksLikeHubToken, verifyHubSessionToken } from '../services/auth.js';
import {
  consumeHubTicket,
  hubOrigin,
  hubSessionTtlSeconds,
  hubSsoEnabled,
  normalizeOrigin,
  requestOrigin,
  safeReturnPath,
  type HubTicketFailure,
} from '../services/hubsso.js';

/**
 * Bookmark Hub sign-in bridge (see services/hubsso.ts). Mounted at /auth/hub.
 *
 *   POST /auth/hub/sso     form post from the Hub's own page: ticket → session cookie → 303 to `to`
 *   GET  /auth/hub/check   204 when this browser holds a Hub session, else 401 (reverse-proxy auth_request)
 *   POST /auth/hub/logout  the Hub was locked: end the Hub session in this browser
 *
 * None of them looks at the trusted-proxy header: they are meant to sit outside the
 * proxy's own login, and must never turn that header into a session.
 */
export const hubRouter = Router();

type HubErrorReason = HubTicketFailure | 'origin';

const REASONS: Record<HubErrorReason, string> = {
  disabled: '这台 WebObsidian 没有开启 Bookmark Hub 登录（WEBOBSIDIAN_HUB_URL / WEBOBSIDIAN_HUB_EMBED_SECRET）。',
  origin: '这个请求不是从配置的 Bookmark Hub 页面发出的。',
  missing: '没有收到登录票据。',
  malformed: '登录票据格式不对。',
  signature: '登录票据签名不对：两边的密钥（HUB_VAULT_EMBED_SECRET / WEBOBSIDIAN_HUB_EMBED_SECRET）不一致。',
  purpose: '这张票据不是用来登录笔记的。',
  expired: '登录票据已过期（页面停留太久，或两台机器的时钟相差太多）。',
  ttl: '登录票据的有效期长得不正常。',
  issuer: '票据不是配置的 Bookmark Hub 签发的（WEBOBSIDIAN_HUB_URL 与 Hub 的实际地址不一致）。',
  audience: '票据不是签给这个地址的（Hub 的 HUB_VAULT_URL 与本站的实际地址不一致，或反代没有转发 Host / X-Forwarded-Proto）。',
  replayed: '这张票据已经用过了。',
  busy: '暂时处理不过来，请稍后再试。',
};

const STATUS: Record<HubErrorReason, number> = {
  disabled: 404,
  origin: 403,
  missing: 400,
  malformed: 400,
  signature: 401,
  purpose: 401,
  expired: 401,
  ttl: 401,
  issuer: 401,
  audience: 401,
  replayed: 401,
  busy: 503,
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** A readable page instead of a JSON blob: it is shown inside the Hub's frame. */
function sendHubError(res: Response, reason: HubErrorReason): void {
  const hint =
    reason === 'expired' || reason === 'replayed' || reason === 'busy'
      ? '回到 Bookmark Hub，点「重新载入」再试一次。'
      : '检查两边的配置后，回到 Bookmark Hub 点「重新载入」。';
  res
    .status(STATUS[reason])
    .type('html')
    .send(
      `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">` +
        `<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">` +
        `<title>无法通过 Bookmark Hub 登录</title>` +
        `<style>body{font:14px/1.6 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;` +
        `color:#333;background:#fafafa}main{max-width:32rem;padding:24px}h1{font-size:17px;margin:0 0 8px}` +
        `code{font-size:12px;color:#888}@media (prefers-color-scheme:dark){body{color:#ddd;background:#1e1e1e}}</style>` +
        `</head><body><main><h1>无法通过 Bookmark Hub 登录笔记</h1>` +
        `<p>${escapeHtml(REASONS[reason])}</p><p>${escapeHtml(hint)}</p>` +
        `<p><code>reason: ${escapeHtml(reason)}</code></p></main></body></html>`,
    );
}

hubRouter.post(
  '/sso',
  express.urlencoded({ extended: false, limit: '8kb', parameterLimit: 8 }),
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const hub = hubOrigin();
    if (!hub || !hubSsoEnabled()) {
      sendHubError(res, 'disabled');
      return;
    }
    // Only a page served by the Hub can submit this form: the browser, not the page,
    // writes the Origin header. It also keeps other sites from logging a visitor in
    // with a ticket they somehow obtained.
    if (normalizeOrigin(req.headers.origin) !== hub) {
      sendHubError(res, 'origin');
      return;
    }
    const result = consumeHubTicket(req.body?.ticket, requestOrigin(req));
    if (!result.ok) {
      console.warn(`[hub] sign-in refused: ${result.reason}`);
      sendHubError(res, result.reason);
      return;
    }
    const ttl = hubSessionTtlSeconds();
    res.cookie(COOKIE_NAME, await issueHubToken(ttl), cookieOpts(req, ttl * 1000));
    res.redirect(303, safeReturnPath(req.body?.to));
  }),
);

hubRouter.get(
  '/check',
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    // Cookie only. A reverse proxy calls this (auth_request) to let a Hub session past
    // its own login; a password session or the trusted-proxy header does not count.
    const token = req.cookies?.[COOKIE_NAME];
    res.status(typeof token === 'string' && (await verifyHubSessionToken(token)) ? 204 : 401).end();
  }),
);

hubRouter.post('/logout', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const hub = hubOrigin();
  const origin = normalizeOrigin(req.headers.origin);
  // The Hub calls this when it is locked (a no-cors fetch from its page); this app's
  // own pages may call it too. Nobody else gets to sign the owner out.
  if (!hub || !origin || (origin !== hub && origin !== requestOrigin(req))) {
    res.status(403).end();
    return;
  }
  const token = req.cookies?.[COOKIE_NAME];
  // Only a Hub session ends here; a password session sharing the cookie stays.
  if (typeof token === 'string' && looksLikeHubToken(token)) {
    res.clearCookie(COOKIE_NAME, { path: '/' });
  }
  res.status(204).end();
});

# Embedding WebObsidian in the Bookmark Hub (single sign-on)

The Bookmark Hub ([AceDylan/AICheckIn](https://github.com/AceDylan/AICheckIn)) can show this
app in an iframe on its **笔记** tab. When the Hub is unlocked, WebObsidian opens without a
second login; locking the Hub signs the embedded session out again.

Direction: the Hub is the outer page, WebObsidian is framed. One way only: the Hub signs its
administrator in here, never the reverse.

## How it works

```
Hub page (unlocked)                 Hub backend               WebObsidian (behind nginx)
  iframe src=/vault/open  ───────▶  GET /vault/open
                                    · admin session? password good? secret set?
                                    · signs a 60 s single-use ticket
                        ◀───────    HTML: <form method=post action=<vault>/auth/hub/sso>
                                          <input type=hidden name=ticket …>  (auto-submits)
  form POST (in the frame)  ───────────────────────────────▶  POST /auth/hub/sso
                                                              · Origin == WEBOBSIDIAN_HUB_URL
                                                              · HMAC, purpose, expiry ≤ 120 s,
                                                                issuer, audience, nonce unused
                        ◀───────────────────────────────────  Set-Cookie webobsidian_token
                                                              (httpOnly, SameSite=Lax, 12 h)
                                                              303 → /  (or the ?to= page)
  every later request carries the cookie; nginx lets it past Basic Auth via auth_request
```

- **The ticket never travels in a URL** and is never handed to page scripts: it only exists in
  the body of the Hub's `/vault/open` response and in the POST body. Format:
  `v2.vault.<expiry>.<nonce>.<b64url issuer>.<b64url audience>.<hex HMAC-SHA256>`, key
  `sha256("hub-vault-admin|" + secret)`. The Hub's HaloWebUI bridge uses another key prefix, so a
  chat ticket never verifies here even if someone reused one secret.
- **Only the Hub's own page can post it**: the browser writes the `Origin` header. (The Hub
  serves `/vault/open` with `Referrer-Policy: strict-origin`; with `no-referrer` browsers send
  `Origin: null` on cross-origin form posts.)
- **The session is WebObsidian's ordinary cookie** with `amr: 'hub'`, the Hub origin and a
  fingerprint of the bridge key. It lives `WEBOBSIDIAN_HUB_SESSION_TTL` seconds (default
  43200 = 12 h, clamped to 5 min … 30 days). Turning the bridge off, changing
  `WEBOBSIDIAN_HUB_URL` or rotating the secret revokes every such session at once.
- **Sign-out**: the Hub's lock button sends a no-cors `POST /auth/hub/logout`; WebObsidian only
  accepts it from the Hub's origin and only clears a Hub session (a password session stays).
- **Session runs out inside the frame**: the SPA sees a 401 and goes back through the Hub
  (`/vault/open?to=<current page>`), at most once a minute; the Hub refuses if it is locked.
- **Framing**: with `WEBOBSIDIAN_HUB_URL` set every response carries
  `Content-Security-Policy: frame-ancestors <hub origin>` (exactly one origin) and no
  `X-Frame-Options`. Unset: `frame-ancestors 'none'` + `X-Frame-Options: SAMEORIGIN` as before.

Endpoints (all under `/auth/hub`, none of them honours the trusted-proxy header):

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/auth/hub/sso` | form post from the Hub: ticket → session cookie → `303` to `to` (a path on this site) |
| GET | `/auth/hub/check` | `204` if the cookie is a valid Hub session, else `401` — for nginx `auth_request` |
| POST | `/auth/hub/logout` | end the Hub session in this browser (Origin must be the Hub) |

`GET /auth/status` additionally returns `hub: { url, sso } | null`; `GET /auth/me` returns
`hub: true` for a Hub session.

## Configuration

Generate one secret, at deploy time, and put it in **both** `.env` files (never in git):

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

WebObsidian (`.env` next to `docker-compose.yml`):

```bash
WEBOBSIDIAN_HUB_URL=https://best.acedylan.us:5526     # the Hub's exact origin
WEBOBSIDIAN_HUB_EMBED_SECRET=<the secret>             # >= 32 chars; shorter = ignored
# WEBOBSIDIAN_HUB_SESSION_TTL=43200                   # optional, seconds
```

Bookmark Hub (`.env`):

```bash
HUB_VAULT_URL=https://host.acedylan.us:3003           # already there for the Agent API
HUB_VAULT_EMBED_SECRET=<the secret>                   # same value; not the HaloWebUI one
```

The Hub never signs a ticket while its admin password is unset, shorter than 12 characters or
one that was published in its repository history; the frame then only explains why.

`TRUST_PROXY` must stay on (default `true`) behind a TLS proxy, and the proxy must pass `Host`
and `X-Forwarded-Proto`: the ticket's audience is compared with the origin the browser used.

## nginx in front of WebObsidian

A cross-origin frame cannot show a Basic Auth dialog, so a proxy that protects the whole site
with Basic Auth must also admit a Hub session. `docs/nginx/webobsidian-hub-embed.conf` is the
complete server block (changes marked `[hub]`):

1. `location /`: `satisfy any;` + `auth_request /_webobsidian_hub_session;` — Basic Auth **or**
   a Hub session cookie. The internal location proxies to `/auth/hub/check` with the
   trusted-proxy header and `Authorization` cleared and `proxy_method GET`.
2. `location = /auth/hub/sso` and `location = /auth/hub/logout`: `auth_basic off`, POST only,
   and **without** the trusted-proxy header (that header means "already logged in").
3. No `add_header X-Frame-Options` at server level any more — the app's `frame-ancestors`
   decides.
4. `auth_basic $obsidian_basic_realm;` with a `map` that turns the challenge off for
   credential-less `fetch`/XHR, so an expired session inside the frame is a plain 401 the app
   handles, not a browser login dialog. The access decision is unchanged.

Keep any existing `location ^~ /api/v1/ { … }` (Agent API) exactly as it is.

## Deploy (order matters)

1. Wait for the GitHub Actions image, then on the WebObsidian host: add the two variables to
   `.env`, `git pull` the compose file, `docker compose pull && docker compose up -d`.
   Check: `curl -s http://127.0.0.1:<HTTP_PORT>/healthz` and the container log line
   `[hub] https://… may frame this app; sign-in through the Hub is on`.
2. Back up and edit the nginx site (see above), then `nginx -t && systemctl reload nginx`.
3. Hub: add `HUB_VAULT_EMBED_SECRET`, pull the new code and rebuild/restart it.

Verification (from any machine):

```bash
V=https://host.acedylan.us:3003
curl -s -o /dev/null -w '%{http_code}\n' $V/                      # 401 (Basic Auth, as before)
curl -sI -u user:pass $V/ | grep -i -E 'frame-ancestors|x-frame'  # frame-ancestors <hub>, no X-Frame-Options
curl -s -o /dev/null -w '%{http_code}\n' $V/auth/hub/sso          # 403 (POST only)
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Origin: https://evil.example' $V/auth/hub/sso  # 403
curl -s -o /dev/null -w '%{http_code}\n' -H 'Sec-Fetch-Mode: cors' $V/api/files   # 401 without WWW-Authenticate
```

Then in a browser: Hub locked → no 笔记 tab; unlock → 笔记 opens the vault without any login;
reload the Hub → still signed in; 新标签页打开 → WebObsidian signed in; lock → tab gone and
`https://host.acedylan.us:3003/` asks for Basic Auth again.

## Rollback

- Hub: remove `HUB_VAULT_EMBED_SECRET` (tab disappears) or roll back the code.
- WebObsidian: remove the two variables and recreate the container — every Hub session is
  revoked immediately and `frame-ancestors 'none'` is back. Or pin the previous image.
- nginx: restore the backed-up site file, `nginx -t && systemctl reload nginx`.

## Limits

- Reloading **only the frame** (browser "Reload frame") after the 12 h session has expired
  hits nginx's Basic Auth challenge; use the Hub's 重新载入 button instead.
- Nonces are kept in process memory: exact for this single-process server; a restart forgets
  them, but tickets expire within 60 s anyway.
- A Hub session is an owner session — the holder of the Hub's admin password plus this secret
  can read and write the whole vault. Keep the secret at the same level as that password and
  rotate both sides together if in doubt.

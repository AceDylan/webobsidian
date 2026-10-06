# PRD — WebObsidian

> Product Requirements Document
> Phiên bản: 2.2 · Cập nhật: 2026-10-07 · Trạng thái: Draft
> Changelog 2.2 (theo yêu cầu người dùng — "更加具有科幻感和电影感，动效可以更夸张些"): FR-16 cinematic layer on top of Neural (and Halo dark): title-card boot sequence, hologram materialize when the active note/view changes, projector-style overlays, a still nebula behind glass chrome, light sweeps, galaxy warp-in and selection shockwaves. New persisted `ui.effects = cinematic | calm` (default cinematic). Reading text itself never moves: only the pane wrapper animates once (≤600ms) and input is never blocked. Reduced motion, `calm`, light/Obsidian themes and hidden tabs → no effects. Relaxes FR-15's "no new animated backgrounds" for chrome only.
> Changelog 2.1 (theo yêu cầu người dùng — Neural theme + graph homepage): `neural` becomes the new-install default and is enabled on this deployment; neutral black, glass chrome, restrained gold, mono micro-labels and bilingual section headings. Sidebar, tabs, dialogs and empty launcher share the palette. Note editor/reading surfaces remain opaque and static. Root URL opens Graph view after restoring tabs; explicit note/graph links win. Existing explicit theme choices stay supported.
> Changelog 2.0 (theo yêu cầu người dùng — muốn graph giống phong cách "Neural Vault": hiện đại, khoa học viễn tưởng): tab graph có hai chế độ 「星图 / 关系图」, mặc định 星图. 星图 là cảnh Canvas 2D tự viết (không dùng lại mã của Neural Vault — giấy phép PolyForm Noncommercial không hợp với repo MIT công khai; chỉ tham khảo thị giác): lõi cầu lưới xoay, mỗi thư mục gốc là một "sứa" phát sáng có thẻ kính, cung Bézier có hạt chảy theo màu thư mục, chọn thư mục ⇒ danh sách note với sợi quạt nối tới từng dòng + bảng chi tiết (kích thước, số chữ, liên kết, ngày sửa, tóm tắt). 关系图 giữ nguyên graph Pixi hiện có. Chỉ đọc `/api/graph` và cây file đã có; không đổi API, dữ liệu hay auth.
> Changelog 1.9 (theo yêu cầu người dùng — "科幻感、电影感、炫酷"): graph thêm lớp sci-fi — nền sao chuyển động (canvas riêng), xung sáng chạy dọc các liên kết, vòng HUD quay quanh lõi vault, khung ngắm quanh note đang hover/chọn; theme Halo thêm viền neon cho tab/overlay. Tắt hoàn toàn khi reduced-motion hoặc tab ẩn; điện thoại giới hạn 50 xung. Không đổi dữ liệu, API hay auth.
> Changelog 1.8 (theo yêu cầu người dùng — Halo cinematic): thêm Halo System/Dark/Light, giữ Obsidian; trong Hub, system dùng Halo. Motion tokens dùng chung với HaloWebUI/Hub; thao tác thường ≤240ms, camera ≤560ms, reduced-motion và tab ẩn tắt chuyển động. Graph luôn là cảnh đêm: dữ liệu note/link thật, đường Bézier, thư mục gom/mở, camera spring, thông tin note và backlinks; mobile không glow/star/parallax. Không thay nội dung vault hay API auth.
> Changelog 1.7 (trải nghiệm khi nhúng trong Bookmark Hub, theo yêu cầu người dùng): `ui.theme` thêm giá trị
> `system` (mặc định mới) — theo sáng/tối của thiết bị; trong iframe của Hub thì theo sáng/tối **của Hub** (Hub gửi
> `#hub_theme=` khi mở khung và gửi message khi đổi — `color-scheme` của khung không truyền sang trang khác origin); trang
> trước khi app tải cũng theo (`<meta name="color-scheme" content="light dark">`). Workspace trống không còn là
> ngõ cụt: hiện note mở gần đây, nút mở note chủ (`00-主页.md`/`Home.md`… ở gốc vault) và trên điện thoại nút mở
> danh sách file. Giao diện có lớp dịch tối thiểu (`web/src/lib/i18n.ts`, khoá = chuỗi tiếng Anh, thiếu thì giữ
> tiếng Anh, ngôn ngữ theo trình duyệt) — chuyển dần từng màn hình. Link ngoài trong Reading view mở tab mới.
> Gợi ý phím tắt hiện theo bàn phím (⌘ trên máy Apple, Ctrl+ nơi khác); status bar chỉ hiện trạng thái git khi
> đồng bộ git của chính WebObsidian đang bật. Khi nằm trong frame của Hub, đổi note chỉ thay địa chỉ (không thêm
> entry lịch sử): nút Back của trình duyệt thuộc về Hub; đi lại giữa các note dùng ← → ở đầu note. Frame đã đăng
> nhập báo `ready` cho Hub; từ đó Hub mở note ngay trong frame (message `open-note`, trả lời `ok`) thay vì tạo frame
> mới và đăng nhập lại — không trả lời thì Hub vẫn làm cách cũ. Trên điện thoại, Hub báo phần frame bị bàn phím che
> (message `keyboard`) để thanh định dạng vẫn nằm trên bàn phím.
> Changelog 1.6 (FR-3 — nhúng vào Bookmark Hub + đăng nhập một lần, theo yêu cầu người dùng): cho phép
> **đúng một** origin Bookmark Hub (`WEBOBSIDIAN_HUB_URL`) nhúng app bằng iframe (`frame-ancestors <hub>`,
> mặc định vẫn `'none'`). Hub đã mở khoá thì vault không hỏi đăng nhập lần hai: trang riêng của Hub
> (`/vault/open`) POST một **ticket HMAC dùng một lần, 60 giây** (không bao giờ nằm trong URL) tới
> `POST /auth/hub/sso`; server kiểm Origin = Hub, chữ ký (`WEBOBSIDIAN_HUB_EMBED_SECRET`), mục đích, hạn,
> issuer/audience, nonce rồi cấp cookie phiên owner `amr: 'hub'` ngắn hơn (mặc định 12 giờ). Tắt cầu nối,
> đổi Hub hoặc xoay secret ⇒ mọi phiên kiểu này mất hiệu lực ngay. Khoá Hub ⇒ `POST /auth/hub/logout`.
> `GET /auth/hub/check` cho reverse proxy (`auth_request`) chỉ chấp nhận phiên Hub. Chi tiết: `docs/HUB_EMBED.md`.
> Changelog 1.5 (FR-13 — Desktop app Electron đa nền tảng, theo yêu cầu người dùng): bổ sung **FR-13** —
> đóng gói WebObsidian thành **app cài đặt** macOS/Windows/Linux (arm64/x64/ia32). Workspace mới `desktop/`
> là **Electron shell** spawn đúng server Express hiện có như tiến trình con (qua `ELECTRON_RUN_AS_NODE`,
> bind `127.0.0.1` + cổng ngẫu nhiên) và load SPA trong `BrowserWindow`. Server được esbuild bundle thành
> **1 file `.mjs`** (không native module runtime nên cross-arch chỉ là đổi Electron binary). Lần đầu **chọn
> vault**, dữ liệu vào `userData`, **auto-login** bằng mật khẩu ngẫu nhiên/máy (không bắt đổi pass). Đóng gói
> bằng **electron-builder** (dmg/zip · nsis/portable · AppImage/deb); CI mới `release.yml` build matrix
> macOS/Windows/Ubuntu khi push tag `v*` và publish **GitHub Release**. Không đổi server/web code.
> Changelog 1.4 (FR-2 — Audio/Video embed: phát được như Obsidian, theo yêu cầu người dùng): embed
> `![[clip.mp4]]` / `![[song.mp3]]` giờ render **trình phát HTML5 thật** (`<video controls>` / `<audio
> controls>`) ở **cả** Live Preview, Reading view và trang public share — trước đây chỉ hiện link xanh.
> Mở thẳng file media từ file tree cũng hiện player (như ảnh). Hỗ trợ video: `mp4/webm/ogv/mov/mkv`,
> audio: `mp3/wav/m4a/3gp/flac/ogg/oga/opus` (khớp bộ extension của Obsidian). Size param `![[clip.mp4|W]]`
> đặt chiều rộng video. **Quan trọng:** route serve binary (`GET /api/files/content`, raw share) nay
> **stream + hỗ trợ HTTP Range** (206 Partial Content) nên thanh tua/seek video hoạt động và Safari phát
> được — thay vì đọc cả file vào RAM. MIME map + bộ extension gom về `server/services/mime.ts` &
> `web/lib/media.ts`. Không thêm API mới.
> Changelog 1.3 (FR-1 — File explorer header toolbar parity Obsidian, theo yêu cầu người dùng): header sidebar
> **Files** bổ sung đủ nút như Obsidian: **New note**, **New canvas**, **New folder**, **Change sort order**
> (dropdown 6 kiểu: File name A→Z/Z→A, Modified time new↔old, Created time new↔old), **Auto reveal current
> file** (toggle: tự mở folder cha + cuộn tới file đang xem), **Collapse all / Expand all**. Sort theo thời gian
> nhanh nhờ **stat cache trong RAM** ở server (`listTree` fill 1 lần, watcher invalidate file đổi → 0 syscall
> ở steady-state); `TreeNode` thêm `ctime`. Không thêm API mới (tree cũ nay kèm `mtime`/`ctime`). Canvas (FR-12):
> fix Android Chrome double-tap edit không lưu được text (commit qua doc-level pointerdown + double-tap detect).
> Changelog 1.2 (FR-2 — Ảnh: resize + zoom, theo yêu cầu người dùng): ảnh nhúng trong note giờ **kéo để
> resize** (2 thanh handle trái/phải hiện khi hover trong Live Preview) — ghi lại kích thước vào source dưới
> dạng size param Obsidian: `![[img|W]]` cho wikilink embed, `![alt|W](url)` cho ảnh markdown chuẩn (giữ tỉ lệ,
> height auto). Size param `|300` / `|300x200` nay áp dụng **cả** ảnh markdown `![](…)` (trước chỉ `![[…]]`),
> ở cả Live lẫn Reading. **Click ảnh → lightbox toàn màn hình** (cả 2 mode): cuộn chuột/pinch để zoom (theo
> con trỏ/tâm 2 ngón), kéo/1-ngón để pan, double-click reset, Esc hoặc click nền để đóng. Không thêm API mới.
> Changelog 1.1 (FR-1 — Trash UI + chế độ xoá, theo yêu cầu người dùng): bổ sung **giao diện Trash** để xem,
> **khôi phục (Restore)** và **xoá vĩnh viễn** từng file đã xoá, cùng nút **Empty trash**. Mở Trash từ nút 🗑
> trên header sidebar Files hoặc command palette ("Open trash"). Thêm setting `vault.deleteMode`
> (`trash` = chuyển vào `.trash` khôi phục được [mặc định] · `permanent` = xoá vĩnh viễn ngay) trong
> Settings → Vault & Files. API mới: `GET /api/files/trash`, `POST /api/files/trash/restore`,
> `DELETE /api/files/trash/item`, `DELETE /api/files/trash`. Restore tự né trùng tên (suffix `.restored-<ts>`)
> và dọn thư mục rỗng trong `.trash`; mọi thao tác trash đều guard path traversal (chỉ tác động trong `.trash`).
> Changelog 1.0 (FR-12 — Canvas, theo yêu cầu người dùng): clone tính năng **Canvas** của Obsidian. Khung vẽ
> vô hạn (pan/zoom) chứa các node (text markdown, file embed/link tới note hoặc ảnh, link URL, group) và các
> edge nối cạnh node có mũi tên + nhãn. Đọc/ghi đúng định dạng mở **JSON Canvas** (`.canvas`, tương thích
> Obsidian). Tạo/di chuyển/resize/đổi màu/xóa node, nối edge bằng kéo từ chấm cạnh, multi-select + marquee,
> double-click nền tạo text node, double-click text node để sửa. Autosave debounce như editor (qua store
> `content`/`save`). Tạo canvas mới: context menu file tree + command palette. Không thêm API mới (dùng
> `/api/files/content`).
> Changelog 0.9 (FR-1 — Copy/Cut/Paste trong context menu file tree theo yêu cầu người dùng): menu chuột phải
> file/folder bổ sung **Copy**, **Cut**, **Paste** (clipboard session-local, không persist/broadcast). Cut dùng
> `rename` (move) cho cả file lẫn folder; Copy dùng endpoint mới **POST `/api/files/copy`** copy đệ quy file/folder
> (qua `fs.cp` recursive, reindex các `.md` mới). Paste vào folder đích (folder được click hoặc thư mục cha của file):
> tự đặt tên không trùng (`… copy`/`… copy N`), chặn dán folder vào chính nó/thư mục con, dán Cut vào đúng chỗ cũ là
> no-op; row bị Cut làm mờ chờ dán; mục **Paste** chỉ hiện khi clipboard có dữ liệu. Right-click vùng trống
> file tree cũng ra context menu của app (New note / New folder / Paste vào vault root) thay vì menu native trình duyệt.
> Changelog 0.8 (FR-2/FR-4 — menu ⋯ parity Obsidian theo yêu cầu người dùng): menu **More options (⋯)**
> dựng lại theo cấu trúc Obsidian Desktop và bổ sung: **Backlinks in document** + **Open linked view**
> (Backlinks/Outgoing links/Outline → mở right panel); **Open in new window** (mở deep-link `/note/<path>`
> ở tab mới); **Add file property** (chèn property rỗng vào frontmatter YAML); **Find…** trong note
> (`@codemirror/search`, ⌘F/⌘⇧F/⌘G); **Export to PDF…** (Reading view + `window.print()` qua CSS
> `@media print`); **Reveal file in navigation** (mở folder tổ tiên + scroll/flash row trong file tree);
> **Open version history** (FR-4): `git log`/`git show` cho từng file qua `/api/git/log|/show`, modal liệt
> kê commit + preview + Restore version. Bỏ "Reveal in Finder"/"Open in default app" (desktop-only).
> Changelog 0.7 (FR-10 UX theo phản hồi): menu "Copy public link" → "Share…" mở **Share dialog**
> per-note (tạo link, copy URL, toggle bật/tắt, đặt/đổi password, xoá link) ở cả context menu file
> tree lẫn menu ⋯ của pane; note đang share public có **icon globe** (màu accent) cạnh tên trong
> file tree; danh sách share cache trong store (đồng bộ giữa dialog, Settings → Sharing và badge).
> Changelog 0.6 (FR-9 deploy hardening cho open-source self-host): tham số deploy chuyển hết sang `.env`
> (`VAULT_HOST_PATH`/`HTTP_BIND`/`HTTP_PORT`/`WEBOBSIDIAN_WATCH`) nên `docker-compose.yml` không bị clobber
> khi redeploy; file watcher tự fallback polling khi đụng inotify limit; healthcheck `start_period=90s`.
> Changelog 0.5: Graph (FR-2) thêm tìm node theo keywords — ô search nổi trên Graph view, gõ keywords
> hiện danh sách note/tag khả dĩ (match label/path, tag luôn xếp trước, sau đó prefix > label > path + degree), click
> (hoặc Enter = kết quả đầu) bay camera (fly animation pan+zoom mượt) tới node và highlight node đó
> (node sáng màu accent, phần không liên kết mờ đi) tới khi di chuột; Esc đóng danh sách.
> Changelog 0.4: thêm FR-11 (Mobile / responsive UI cho smartphone màn hình cảm ứng) — sidebar trái/phải
> thành drawer overlay trượt (hamburger + edge-swipe + backdrop), workspace full-width, mobile editing
> toolbar trên bàn phím (bold/italic/heading/list/checkbox/link/…), touch target ≥44px, safe-area insets.
> Tham chiếu UX Obsidian Mobile app. Cập nhật NFR khả dụng.
> Changelog 0.3: mở rộng FR-2 theo phản hồi người dùng — (a) menu "More options" (⋯) trên header mỗi pane
> (Split right/Split down, Copy screenshot cho Graph, Bookmark, Copy public link, Make a copy, Rename/Move/
> Copy path/Delete, Close tab/Close others) giống Obsidian; (b) Right sidebar đại tu thành tab strip icon
> (Backlinks · Outgoing links · Tags · Outline) với Linked mentions + **Unlinked mentions** và **Outgoing
> links** (resolved/unresolved) — trước đó chỉ có 2 panel cố định.
> Changelog 0.2: thêm FR-10 (deep-link URL `/note/...` + public share link readonly + trang quản lý share tập trung), API `/api/shares` + `/public/shares`, data model `data/shares.json`.

---

## 1. Tổng quan

**WebObsidian** là một web app self-hosted clone toàn diện chức năng của [Obsidian](https://obsidian.md), chạy trên server (Docker), thao tác trực tiếp trên một thư mục Vault chứa các file Markdown. Mục tiêu là cho phép truy cập và chỉnh sửa "second brain" của người dùng từ bất kỳ trình duyệt nào, đồng thời mở API cho AI Agent tương tác.

### 1.1 Mục tiêu (Goals)
- Trải nghiệm soạn thảo/đọc Markdown tương đương Obsidian desktop (editor, live preview, wikilinks, graph, backlinks).
- Vault là một thư mục thực trên server — tương thích 100% với vault Obsidian hiện có (kể cả `.obsidian/`).
- Sync 2 chiều bằng **GitHub repo native** (git), hỗ trợ **Git LFS** cho file lớn (ảnh, pdf, audio…).
- **Login gate** đơn giản: một mật khẩu duy nhất bảo vệ toàn bộ app.
- Cấu hình lưu trong **file `.json` thuần** (không cần DB engine).
- **API Gate** với API key để AI Agent đọc/ghi/tìm kiếm vault qua REST.
- **QMD search engine** tích hợp sẵn: full-text + fielded search nhanh trên toàn vault.
- Hỗ trợ cài **Obsidian community plugins** giống app chuẩn (qua plugin loader + Obsidian API shim).
- Đóng gói **Docker stack** chạy 1 lệnh.

### 1.2 Ngoài phạm vi (Non-goals — v1)
- Realtime multi-user collaborative editing (CRDT). v1 là single-user (1 password).
- Obsidian Sync/Publish độc quyền (thay bằng Git sync).
- Mobile native app (chỉ responsive web).
- 100% tương thích mọi plugin dùng Electron/Node API nội bộ (chỉ hỗ trợ subset Obsidian API phổ biến).

### 1.3 Người dùng mục tiêu
- Cá nhân tự host knowledge base, muốn truy cập từ mọi thiết bị qua web.
- Người dùng muốn AI Agent đọc/ghi vault qua API an toàn.

---

## 2. Kiến trúc hệ thống

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (SPA)                          │
│   React + CodeMirror 6 · Live Preview · File Tree · Graph     │
└───────────────▲───────────────────────────┬──────────────────┘
                │ REST + WebSocket           │ static assets
┌───────────────┴───────────────────────────▼──────────────────┐
│                   Server (Node + Express + TS)                │
│  Auth gate │ Vault FS │ QMD Search │ Git Sync │ API Gate │     │
│            │          │            │          │ Plugins  │     │
└───┬─────────────┬──────────┬────────────┬──────────────┬──────┘
    │             │          │            │              │
 settings.json   Vault dir  Search index  GitHub repo   plugins dir
 (JSON db)       (.md+attach) (in-mem/disk) (git+LFS)    (.obsidian/plugins)
```

### 2.1 Tech stack
| Layer | Lựa chọn | Lý do |
|-------|----------|-------|
| Backend | Node 20+, Express, TypeScript | Đồng nhất ngôn ngữ, hệ sinh thái git/markdown phong phú |
| Frontend | React + Vite + TypeScript | Build nhanh, SPA |
| Editor | CodeMirror 6 | Engine soạn thảo của chính Obsidian |
| Markdown | unified/remark + rehype | Render an toàn, hỗ trợ plugin |
| Search | QMD (module nội bộ trên nền MiniSearch) | Full-text + fielded, in-process, không cần service ngoài |
| Sync | simple-git + git-lfs | Native git, hỗ trợ file lớn |
| Auth | Mật khẩu hash (scrypt) + JWT cookie | Đơn giản, không cần DB |
| Storage cfg | `data/settings.json` | Yêu cầu "JSON thuần" |
| Container | Docker + docker-compose | Deploy 1 lệnh |

### 2.2 Layout thư mục dự án
```
webobsidian/
├── server/           # API backend
│   └── src/
│       ├── routes/       # auth, files, search, sync, api(agent), plugins
│       ├── services/     # vault, search(QMD), git, settings, auth, plugins
│       ├── middleware/   # auth guard, apikey guard, error handler
│       └── plugins/      # Obsidian API shim + loader
├── web/              # React SPA
│   └── src/
│       ├── components/   # FileTree, Editor, Preview, SearchPanel, Settings…
│       ├── lib/          # api client, store, markdown
│       └── styles/
├── data/             # runtime: settings.json, apikeys, sessions (gitignored)
├── docs/
├── docker-compose.yml
└── Dockerfile
```

---

## 3. Yêu cầu chức năng (Functional Requirements)

### FR-1 · Vault management
- Chọn/đổi thư mục Vault qua Settings (đường dẫn server-side, có folder browser an toàn trong allowed roots).
- CRUD file & folder: tạo, đọc, ghi, đổi tên, di chuyển, xoá. Chế độ xoá cấu hình qua
  `vault.deleteMode`: `trash` (→ `.trash`, khôi phục được — mặc định) hoặc `permanent` (xoá hẳn).
- **Trash**: giao diện xem các file đã xoá, **Restore** về vị trí gốc, **xoá vĩnh viễn** từng file, **Empty
  trash**. Trash ẩn khỏi file tree (dotfile) và khỏi watcher; mở qua nút 🗑 header Files hoặc command palette.
- **Copy/Cut/Paste** trên context menu file tree (file & folder): clipboard session-local; Cut = move (`rename`),
  Copy = copy đệ quy (`POST /api/files/copy`, `fs.cp` recursive); Paste vào folder đích, tự né trùng tên, chặn dán
  folder vào chính nó/thư mục con.
- Hỗ trợ attachments (ảnh/pdf/…); upload từ web. Thư mục đích upload resolve **case-insensitive** với folder
  sẵn có (`vault.resolveDirCaseInsensitive`) — tránh tạo thư mục trùng khác hoa-thường (vd `attachments` cạnh
  `Attachments` có sẵn) trên filesystem phân biệt hoa-thường (Linux).
- Watch filesystem (chokidar) để phản ánh thay đổi ngoài (git pull, sửa trực tiếp).
- Tương thích cấu trúc `.obsidian/` (config, plugins, themes).

### FR-2 · Editor & rendering
- CodeMirror 6: syntax highlight Markdown, keybindings cơ bản.
- Live preview / Reading view chuyển đổi.
- Wikilinks `[[note]]`, embeds `![[file]]`, tags `#tag`, callouts, tasks `- [ ]`.
- **Ảnh nhúng — resize & zoom**: kéo handle 2 cạnh (trái/phải) trên ảnh trong Live Preview để đổi rộng,
  ghi lại vào source dạng size param Obsidian `![[img|W]]` / `![alt|W](url)` (giữ tỉ lệ, height auto).
  Size param `|W` / `|WxH` áp dụng cho **cả** `![[…]]` và ảnh markdown `![](…)`, ở Live lẫn Reading.
  Click ảnh → **lightbox toàn màn hình**: wheel/pinch zoom (theo con trỏ/tâm), kéo/1-ngón pan,
  double-click reset, Esc/click nền đóng (xem §22 mobile: pinch-zoom ảnh trong reading).
- **Audio/Video nhúng**: `![[clip.mp4]]` → `<video controls>`, `![[song.mp3]]` → `<audio controls>`
  (Live Preview, Reading, public share). Video: `mp4/webm/ogv/mov/mkv`; audio: `mp3/wav/m4a/3gp/flac/ogg/
  oga/opus`. `![[clip.mp4|W]]` đặt chiều rộng video. Mở thẳng file media từ file tree → hiện player.
  Binary serve qua HTTP Range (206) để seek/Safari hoạt động; MIME + extension: `services/mime.ts` /
  `lib/media.ts`.
- Backlinks panel, outline, tag pane.
- Right sidebar dạng **tab strip icon** (giống Obsidian): Backlinks · Outgoing links · Tags · Outline.
  - Backlinks: "Linked mentions" (đếm + danh sách) **và** "Unlinked mentions" (note nhắc tên note hiện tại
    bằng plain text mà chưa link — tìm qua QMD search, loại trừ note đã link).
  - Outgoing links: mọi wikilink trong note hiện tại, phân biệt resolved/unresolved, click để mở/tạo.
- Menu **More options (⋯)** trên header mỗi pane (note lẫn Graph view), dựng theo cấu trúc Obsidian Desktop:
  - Note: Backlinks in document, Split right / Split down, Open in new window, Rename / Move file to / Make a
    copy, Bookmark, Add file property, Export to PDF…, Find…, Copy path, Open version history, Open linked view
    (Backlinks / Outgoing links / Outline), Reveal file in navigation, Share…, Close tab / Close other tabs, Delete.
  - Graph view: Copy screenshot (PNG vào clipboard), Close tab.
  - Split pane hỗ trợ 2 hướng: right (cạnh phải) và down (bên dưới); hướng split persist trong uistate.
  - **Find/Replace trong note**: tích hợp `@codemirror/search` (panel top, ⌘F mở Find, ⌘⇧F Replace, ⌘G next).
  - **Reveal file in navigation**: mở rộng folder tổ tiên + cuộn/nháy sáng row trong file tree.
  - **Add file property**: chèn property rỗng vào frontmatter YAML (tạo block nếu chưa có) → render trong Properties widget.
  - **Export to PDF**: chuyển Reading view rồi dùng print dialog của trình duyệt (CSS `@media print` chỉ in nội dung note).
  - **Open in new window**: mở deep-link `/note/<path>` ở tab/cửa sổ trình duyệt mới.
  - Lưu ý: "Reveal in Finder" / "Open in default app" của Obsidian Desktop không áp dụng cho web app nên không có.
- Graph view (lực đẩy, từ wikilinks).
  - Tìm node trên graph: ô search nổi (góc trên-trái), gõ keywords → danh sách node khả dĩ
    (note/tag/attachment đang hiển thị trên graph); click hoặc Enter → camera bay (pan+zoom mượt)
    tới node, node được highlight kiểu hover (accent + dim phần không liên kết) tới khi di chuột.

### FR-3 · Login gate
- **Mật khẩu mặc định khi cài đặt: `123456`** — không cần bước setup, đăng nhập ngay được
  bằng pass mặc định. settings.json mặc định **không** chứa mật khẩu nào.
- Người dùng đổi mật khẩu trong Settings → Account (nhập pass hiện tại + pass mới). Hash mới
  lưu ở `auth.userPasswordHash`. Khi field này rỗng nghĩa là đang dùng pass mặc định `123456`.
- **Mật khẩu override (khôi phục khi quên pass):** `auth.passwordHash` trong `data/settings.json`
  (sửa tay, dạng scrypt hash) **hoặc** biến môi trường `WEBOBSIDIAN_PASSWORD` (plaintext). Login
  chấp nhận pass override **bất kể** người dùng đã đổi pass hay chưa. Mặc định không có override.
- Đăng nhập 1 password → JWT trong httpOnly cookie.
- Mọi route web & file API yêu cầu auth (trừ `/login`, healthcheck).
- **Nhúng vào Bookmark Hub + SSO (tuỳ chọn, 1.6):** `WEBOBSIDIAN_HUB_URL` = origin duy nhất được nhúng
  app; `WEBOBSIDIAN_HUB_EMBED_SECRET` (≥ 32 ký tự, cùng giá trị với `HUB_VAULT_EMBED_SECRET` bên Hub) bật
  đăng nhập qua Hub: ticket `v2.vault.<exp>.<nonce>.<issuer>.<audience>.<HMAC-SHA256>` (key
  `sha256("hub-vault-admin|"+secret)`), chỉ đi trong body của form POST từ trang của Hub, dùng 1 lần.
  Phiên cấp ra là cookie owner thường nhưng mang `amr:'hub'`, origin Hub và fingerprint của key; sống
  `WEBOBSIDIAN_HUB_SESSION_TTL` giây (mặc định 43200). Trong iframe, hết phiên ⇒ SPA tự quay lại qua Hub
  (tối đa 1 lần/phút). Không bao giờ dùng header trusted-proxy cho các route `/auth/hub/*`.

### FR-4 · GitHub sync
- Cấu hình: repo URL, branch, token (PAT) hoặc deploy key, tên/email commit.
- Thao tác: init/clone, pull, commit-all, push; hiển thị status (ahead/behind/dirty).
- Auto-sync tuỳ chọn theo interval + on-save debounce.
- Git LFS: cấu hình `.gitattributes` cho pattern lớn; track/push LFS.
- **Version history per-file**: `git log` (commit chạm file, newest first) + `git show <hash>:<path>` qua
  `GET /api/git/log` & `/api/git/show`; UI modal liệt kê version, preview nội dung, "Restore this version"
  (ghi đè + reload). Rỗng khi vault chưa là git repo / chưa bật Git Sync.
- Conflict: phát hiện, báo người dùng, chiến lược merge cơ bản (ưu tiên hỏi).

### FR-5 · Settings (JSON db)
- Toàn bộ cấu hình trong `data/settings.json` (atomic write, có backup).
- Nhóm: vault, auth, git, search, api, ui, plugins.
- UI Settings để xem/sửa; validate bằng schema (zod).

### FR-6 · API Gate (AI Agent)
- Quản lý nhiều **API key** (tạo/thu hồi, scope: read / write / search).
- REST endpoints `/api/v1/*` xác thực bằng header `Authorization: Bearer <key>` hoặc `X-API-Key`.
- Năng lực: list notes, read note, create/update/delete note, search, get backlinks, append.
- Rate limit + audit log mỗi key.

### FR-7 · QMD Search engine
- Index toàn bộ `.md`: nội dung, tiêu đề, headings, tags, path, frontmatter.
- Truy vấn: full-text, prefix, fuzzy, fielded (`tag:`, `path:`, `title:`), boolean.
- Cập nhật incremental khi file thay đổi (qua watcher).
- Index lưu/khôi phục trên disk (`data/qmd-index.json`) để khởi động nhanh.

### FR-8 · Community plugins
- Đọc danh sách plugin từ `.obsidian/plugins/*` (manifest.json, main.js).
- Plugin loader nạp `main.js` trong sandbox với **Obsidian API shim** (App, Vault, Workspace, Plugin, Notice, Setting…).
- Browse & cài plugin từ community list (qua GitHub releases) — tải về thư mục plugins.
- Bật/tắt plugin; lưu trạng thái trong settings.

### FR-9 · Docker
- `Dockerfile` multi-stage (build web + server → image gọn).
- `docker-compose.yml`: mount vault volume, data volume, env cho password/secret.
- Healthcheck (`start_period` đủ dài cho index vault lớn lần đầu), restart policy.
- **Self-deploy không sửa file tracked**: mọi tham số deploy đặt qua `.env` (git-ignored) —
  `VAULT_HOST_PATH` (host vault → `/vault`), `HTTP_BIND`/`HTTP_PORT` (publish), `WEBOBSIDIAN_PASSWORD`,
  `WEBOBSIDIAN_WATCH`, `TRUST_PROXY` (mặc định `true` — tin hop kề để `X-Forwarded-Proto` hoạt động khi
  đứng sau reverse proxy; đặt `false` khi phơi trực tiếp không proxy, hoặc danh sách subnet/số hop để siết).
  `docker-compose.yml` chỉ tham chiếu `${VAR:-default}` nên `git pull`/redeploy
  không clobber cấu hình của người tự host. `cp .env.example .env && docker compose up -d --build`.
- **File watcher chịu lỗi inotify**: VPS sạch thường có `fs.inotify.max_user_watches` thấp →
  native watch lỗi `ENOSPC/EMFILE`. Watcher tự degrade sang **polling** (`WEBOBSIDIAN_WATCH=auto`),
  log hướng dẫn nâng `sysctl` để giữ native (CPU thấp hơn).

### FR-10 · Deep-link URL & Public share
- **Deep-link**: URL trình duyệt phản ánh note đang mở — `/note/<vault-relative-path>`
  (URL-encode từng segment); Graph view = `/graph`. Mở URL trực tiếp (sau login) sẽ mở đúng
  note; back/forward của trình duyệt hoạt động (popstate ↔ history stack của app).
- **Public share (readonly, không cần login)**:
  - Tạo share link cho một note `.md` **hoặc canvas `.canvas`** → token ngẫu nhiên (16 bytes, base64url),
    URL dạng `/share/<token>`.
  - **Canvas share**: `.canvas` được server render thành **HTML tĩnh** (snapshot): node đặt tuyệt đối theo
    toạ độ, edges vẽ SSR bằng SVG Bézier (cùng hình học với editor), text/embedded-note render qua pipeline
    markdown; trang full-width (bỏ cột markdown hẹp). Allowlist file public lấy từ ảnh trong file-node canvas
    (`rendercanvas.canvasEmbedTargets`). Non-interactive (không pan/zoom) ở v1.
  - Trang public render Reading view (markdown → HTML sanitize), **không** sidebar/editor,
    không yêu cầu auth. Wikilink trong note hiển thị như text tĩnh (không điều hướng).
  - **SEO / SSR**: `GET /share/{id}` được **server render thành HTML hoàn chỉnh** (không cần JS
    để đọc nội dung → Google indexable). Head gồm: `<title>` (tên note), meta description
    (~160 ký tự đầu của body, đã strip markdown), canonical, Open Graph
    (`og:title/description/type=article/url/site_name/image` — ảnh đầu tiên note nhúng hoặc URL
    ảnh web đầu tiên), Twitter card (`summary_large_image`/`summary`), `robots: index,follow`.
    Share có password → SSR trang nhập password (**noindex**, không kèm nội dung note, form unlock
    bằng inline JS); share disabled/không tồn tại → 404 (noindex). Render markdown phía server
    dùng cùng pipeline unified/remark/rehype + sanitize (port từ web, kèm CSS inline từ bundle).
  - File nhúng (ảnh/pdf/video) trong note được serve qua endpoint public **giới hạn đúng các
    file mà note đó nhúng** (`![[...]]` / `![](...)`) — không cho đọc tuỳ ý vault. Không serve
    file `.md` qua endpoint này (không transclusion ở trang public).
  - Share record: `{ id, path, enabled, createdAt, passwordHash? }` lưu ở `data/shares.json`
    (JSON, atomic write). Mỗi note tối đa 1 share record (tạo lại → trả record cũ + enable).
  - Disable (giữ token, có thể bật lại) hoặc xoá hẳn. Token bị disable/xoá → trang public trả 404.
  - **Password tuỳ chọn cho từng share**: đặt/xoá ở trang quản lý (hash scrypt, không bao giờ trả
    hash về client — chỉ `hasPassword`). Khi share có password: endpoint public trả 401
    `{passwordRequired: true}`; khách nhập password → `POST /public/shares/{id}/unlock` → JWT
    (ký bằng `jwtSecret`, TTL 12h, payload gắn share id) đặt trong httpOnly cookie scope đúng
    `/public/shares/{id}` — ảnh nhúng tự gửi cookie. Đổi/xoá password không vô hiệu cookie đã cấp
    (TTL ngắn chấp nhận được cho v1).
- **Share dialog per-note**: menu "Share…" (context menu file tree + menu ⋯ của pane, cho note `.md`
  **và canvas `.canvas`**) mở popup cài đặt share của note đó: tạo public link, ô URL + nút Copy, toggle
  bật/tắt link, đặt/đổi/xoá password, xoá link vĩnh viễn.
- **Badge nhận biết**: note đang share public (enabled) hiện **icon globe** màu accent cạnh tên
  trong file tree. Danh sách share cache trong store, load sau login và refresh sau mỗi thao tác
  (dialog lẫn Settings dùng chung) nên badge luôn đúng.
- **Quản lý tập trung**: Settings → tab "Sharing" liệt kê toàn bộ note đã share, có ô search
  lọc theo path, toggle enable/disable nhanh, copy link, xoá.

---

### FR-11 · Mobile / responsive UI (smartphone cảm ứng)
Mục tiêu: trải nghiệm **đọc note** và **soạn thảo note** thuận tiện trên điện thoại màn hình cảm ứng,
tham chiếu UX Obsidian Mobile. Kích hoạt theo breakpoint (`max-width: 768px`) — không phải app riêng,
cùng một codebase React.
- **Layout drawer**: ribbon + sidebar trái và right sidebar trở thành **drawer overlay** trượt đè lên
  nội dung (không đẩy layout). Mặc định đóng → editor chiếm trọn màn hình. Mở bằng: nút hamburger (☰)
  trên thanh tab, **vuốt từ mép trái/phải** (edge-swipe), hoặc các nút toggle panel. Có **backdrop** mờ;
  chạm backdrop hoặc chọn note → drawer tự đóng. Drawer trái gồm strip ribbon (chuyển panel Files/Search/
  Graph/Bookmarks/Tags/Settings) + panel nội dung.
- **Trạng thái drawer là cục bộ thiết bị** (không persist, không broadcast qua WebSocket) → mở/đóng drawer
  trên điện thoại không ảnh hưởng trạng thái sidebar của desktop đang đồng bộ chung `uistate`.
- **Touch targets**: hàng cây thư mục, nút công cụ, tab ≥ 44px; tăng padding chạm; bỏ hover-only affordance
  (nút close tab luôn hiện trên mobile).
- **Format toolbar**: thanh công cụ định dạng khi soạn thảo (Live/Source): bold, italic, heading, list,
  checklist, quote, link, internal link `[[`, code, tag, indent/outdent, undo/redo. Mỗi nút thao tác trực
  tiếp lên editor đang active. **Mobile**: nổi phía trên bàn phím (neo qua visualViewport) như Obsidian
  Mobile. **Desktop**: thanh in-flow ngay dưới view-header (theo yêu cầu người dùng).
- **Viewport & safe-area**: `viewport-fit=cover`; chừa `env(safe-area-inset-*)` cho notch/home-indicator;
  không cho double-tap zoom (app-like) nhưng giữ pinch-zoom ảnh trong reading.

### FR-12 · Canvas (khung vẽ vô hạn — JSON Canvas)
Mục tiêu: clone tính năng **Canvas** của Obsidian — một mặt phẳng vô hạn để sắp xếp card/note/ảnh/link và nối
chúng bằng đường có mũi tên, dùng cho brainstorm, moodboard, sơ đồ. Tham chiếu UX Obsidian Canvas.

- **Định dạng file `.canvas`**: tuân thủ chuẩn mở **JSON Canvas** (jsoncanvas.org) để tương thích hai chiều với
  Obsidian. File là JSON `{ "nodes": [...], "edges": [...] }`.
  - **Node** (chung): `id`, `type`, `x`, `y`, `width`, `height`, `color?`. `color` là preset `"1".."6"`
    (đỏ/cam/vàng/lục/lam/tím) hoặc hex `"#RRGGBB"`.
    - `type:"text"` → `text` (markdown).
    - `type:"file"` → `file` (đường dẫn vault-relative), `subpath?` (heading/block).
    - `type:"link"` → `url`.
    - `type:"group"` → `label?`, `background?`, `backgroundStyle?`.
  - **Edge**: `id`, `fromNode`, `fromSide?`(top/right/bottom/left), `fromEnd?`(none/arrow), `toNode`,
    `toSide?`, `toEnd?`(none/arrow, mặc định arrow), `color?`, `label?`.
- **Tương tác canvas**: **kéo chuột trái trên nền = pan**; **Shift+kéo = marquee chọn nhiều node**; pan cũng
  qua Space+kéo và kéo nút giữa/phải; cảm ứng 1 ngón pan. Zoom bằng cuộn chuột (con trỏ làm tâm), nút
  zoom in/out/fit/100%. Lưới chấm nền.
- **Node**: double-click nền → tạo **text node** và vào chế độ sửa ngay; double-click vào text node để sửa
  (textarea), Esc/blur để thoát. Kéo node để di chuyển; 8 handle để resize. Drop file note/ảnh từ cây (hoặc
  nút) → tạo **file node** render embed (note = preview markdown, ảnh = `<img>`). Đổi màu qua palette 6 màu +
  mặc định. Xóa (Delete/Backspace).
- **Edge**: hover node hiện 4 chấm cạnh; kéo từ một chấm sang node/cạnh khác → tạo edge. Edge vẽ bằng đường
  cong Bézier theo hướng cạnh, có mũi tên ở đầu `to`. Double-click giữa edge để thêm/sửa **label**. Chọn edge
  để đổi màu/xóa.
- **Select**: click chọn 1 node/edge; kéo marquee trên nền để chọn nhiều; Shift+click thêm/bớt; di chuyển/xóa
  theo nhóm. Thanh công cụ ngữ cảnh nổi khi có lựa chọn (đổi màu, xóa).
- **Alignment snap (đường gióng)**: khi kéo node, các cạnh/tâm node tự gióng vào cạnh/tâm các node khác và
  hiện **đường gióng** (port thuật toán `getSnapping/O3/P3` từ Obsidian: điểm snap = 4 góc + tâm, ngưỡng
  `ceil(15/scale)` đơn vị canvas). Giữ **Alt** (⌃ trên macOS) để kéo tự do (tắt snap); giữ **Shift** để khoá trục.
- **Format trong text card**: phím tắt như editor chính (`obsidianKeymap`) — ⌘B đậm, ⌘I nghiêng, ⌘K thêm link,
  ⌘L task, `⌘/` comment (toggle marker); menu chuột phải mở **đúng tại con trỏ** và tự dịch vào trong màn hình.
- **Căn lề text** (mở rộng ngoài JSON Canvas spec): `TextNode.textAlign` = `left|center|right`, chọn qua nút trong
  selection menu (khi chọn text node) hoặc submenu "Align" menu chuột phải; áp cho cả textarea lẫn nội dung render.
  *Lưu ý: Obsidian thật bỏ qua field này khi mở lại.*
- **Lưu**: autosave debounce (~900ms) như editor, ghi qua `PUT /api/files/content` (store `content`/`save`,
  `.canvas` đã nằm trong `TEXT_RE`). Không thêm endpoint mới.
- **Tạo canvas mới**: context menu cây thư mục ("New canvas") + command palette; tên `Untitled.canvas` không
  trùng, nội dung khởi tạo `{"nodes":[],"edges":[]}`.
- **Phạm vi v1 (non-goals)**: không có realtime collaborative cursor; không group auto-resize theo thành viên;
  không portal/embed canvas-trong-canvas; không liên kết backlink graph từ node file (giữ đơn giản).

### FR-13 · Desktop app (Electron, multi-platform)
Mục tiêu: đóng gói WebObsidian thành **app cài đặt trên máy** (macOS/Windows/Linux) để người dùng tải về dùng
như app native, không cần tự dựng server hay Docker. Bản chất là một **Electron shell** bọc quanh đúng server
Express + SPA hiện có (không fork code, không đổi kiến trúc) — nên mọi tính năng web đều chạy y hệt.

- **Kiến trúc**: Electron `main` **spawn server hiện có như tiến trình con** qua `ELECTRON_RUN_AS_NODE`
  (dùng luôn Node nhúng trong Electron, không cần Node cài sẵn trên máy), bind **`127.0.0.1` + cổng trống
  ngẫu nhiên** (localhost-only, không mở ra mạng), rồi `BrowserWindow` load `http://127.0.0.1:<port>`.
  Server được **bundle thành 1 file `.mjs` duy nhất** bằng esbuild (toàn bộ deps inline; `fsevents` để
  external vì optional). SPA build (`server/public`) đi kèm trong `resources/server/public`.
- **Dữ liệu & vault**: lần chạy đầu hiện hộp thoại **chọn thư mục vault** (mặc định `~/Documents/WebObsidianVault`
  nếu bỏ qua). `DATA_DIR` (settings.json, index) nằm trong thư mục `userData` per-user của Electron. Menu
  **File → Switch Vault…** đổi vault (relaunch để re-index), **Open Vault/Data Folder**, **Open Logs**.
- **Đăng nhập liền mạch**: app tự sinh **mật khẩu ngẫu nhiên/máy** lưu trong `userData`, truyền qua
  `WEBOBSIDIAN_PASSWORD` (override) → **auto-login** (seed cookie JWT vào session của cửa sổ) và tự đặt
  password tuỳ chỉnh để **không bắt đổi mật khẩu** lần đầu. Người dùng không phải gõ password; vẫn có thể
  đổi trong Settings.
- **Đa nền tảng / đa kiến trúc**: vì server **không có native module runtime**, cross-arch chỉ là đóng gói
  Electron binary tương ứng. Đóng gói bằng **electron-builder**: macOS `dmg`+`zip` (arm64/x64), Windows
  `nsis`(installer)+`portable` (x64/arm64/ia32), Linux `AppImage`+`deb` (x64/arm64).
- **Phát hành**: GitHub Actions workflow `release.yml` chạy khi push tag `v*` — matrix macOS/Windows/Ubuntu,
  mỗi runner build native cho HĐH của nó rồi **publish lên GitHub Release** (draft) để người dùng tải.
- **Phụ thuộc ngoài**: tính năng Git sync cần `git` có trên máy (PATH được bổ sung các vị trí phổ biến); thiếu
  git thì app vẫn chạy bình thường cho sửa note cục bộ, chỉ tắt sync. App **chưa code-sign/notarize** (sẽ có
  cảnh báo Gatekeeper/SmartScreen — chấp nhận cho self-hosted free).
- **Phạm vi (non-goals)**: chưa auto-update (người dùng tải bản mới thủ công); chưa ký số; không nhúng git
  portable; không chạy nhiều cửa sổ/vault song song trong 1 instance (single-instance lock).

---

## 4. Yêu cầu phi chức năng (NFR)
- **Bảo mật**: password hash scrypt, JWT secret tự sinh, API key hash khi lưu, path traversal guard
  (chặn `..`, segment `.git`, symlink thoát vault), CORS hạn chế, rate limiting (cả `/auth/login`:
  10 lần/15 phút — **khóa theo địa chỉ socket TCP thật, không theo `req.ip`/`X-Forwarded-For`** nên
  không thể bypass bằng cách xoay vòng XFF, **bất kể cấu hình `trust proxy`**; vì vậy `trust proxy` để
  mặc định bật (`true`, qua `TRUST_PROXY`) cho `X-Forwarded-Proto`/Secure-cookie hoạt động sau proxy). Bắt buộc đổi mật khẩu mặc định (`123456`) ngay sau lần đăng nhập đầu
  (`mustChangePassword`). Security headers qua `helmet` + CSP (script-src 'self'+nonce; không ép HTTPS
  để giữ self-host HTTP; `frame-ancestors 'none'`, hoặc đúng origin Bookmark Hub khi cấu hình FR-3 1.6). Token git/PAT được redact khỏi mọi thông báo lỗi trả client + log. WebSocket
  `/ws` yêu cầu phiên đăng nhập hợp lệ. Plugin `id` được validate trước khi thành path segment; đổi
  `vault.path` qua API bị giới hạn trong `allowedRoots`.
- **Hiệu năng**: search < 100ms cho vault ~10k notes; lazy load file tree lớn.
- **Tin cậy**: atomic writes cho settings & notes; backup trước ghi đè; git ops không mất dữ liệu.
- **Khả chuyển**: chạy được trên Linux/macOS, ARM & x86.
- **Khả dụng**: responsive (desktop/tablet/mobile), dark/light theme.

---

## 5. API surface (tóm tắt)

### Web/session API (cookie auth)
```
POST   /auth/setup            # (legacy) set password lần đầu — vô hiệu khi đã có pass mặc định
POST   /auth/login            # login → cookie
POST   /auth/logout
POST   /auth/change-password  # đổi pass: { currentPassword, newPassword } (yêu cầu auth)
GET    /auth/me               # + hub: true khi phiên được mở qua Bookmark Hub
GET    /auth/status           # + hub: { url, sso } | null
POST   /auth/hub/sso          # form POST từ trang của Hub: ticket → cookie phiên → 303 tới `to` (path nội bộ)
GET    /auth/hub/check        # 204 nếu cookie là phiên Hub hợp lệ, ngược lại 401 (cho nginx auth_request)
POST   /auth/hub/logout       # Hub bị khoá: kết thúc phiên Hub trong trình duyệt này (Origin phải là Hub)
GET    /api/files            # cây thư mục
GET    /api/files/*path      # đọc file (md/binary)
PUT    /api/files/*path      # ghi
POST   /api/files/*path      # tạo / upload
PATCH  /api/files            # rename/move
POST   /api/files/copy       # copy đệ quy file/folder {from,to} (Paste sau Copy)
DELETE /api/files/*path      # xoá → .trash hoặc xoá hẳn (theo vault.deleteMode)
GET    /api/files/trash      # liệt kê file trong .trash
POST   /api/files/trash/restore   # khôi phục {path} về vị trí gốc
DELETE /api/files/trash/item # xoá vĩnh viễn 1 item trong trash
DELETE /api/files/trash      # empty trash (xoá hẳn toàn bộ)
GET    /api/search?q=...
GET    /api/backlinks?path=...
GET    /api/git/status | POST /api/git/{pull,commit,push,sync}
GET/PUT /api/settings
GET/POST/DELETE /api/keys     # quản lý API key
GET    /api/plugins | POST /api/plugins/install | PATCH enable
GET    /api/shares            # list share (quản lý)
POST   /api/shares            # tạo share cho 1 note {path} → {id,...}
PATCH  /api/shares/{id}       # enable/disable {enabled}
DELETE /api/shares/{id}       # xoá share
```

### Public share (không auth) — `/public` & `/share`
```
GET    /public/shares/{id}        # nội dung note đã share {title, content} (404 nếu disabled,
                                  # 401 {passwordRequired} nếu có password & chưa unlock)
POST   /public/shares/{id}/unlock # {password} → set httpOnly cookie unlock (JWT 12h)
GET    /public/shares/{id}/file?path=  # file nhúng trong note (chỉ file note đó tham chiếu)
GET    /share/{id}                # trang HTML public — SERVER-RENDERED (SEO meta + OG + nội dung
                                  # note trong HTML; locked → form password noindex)
```

### Agent API (API-key auth) — `/api/v1`
```
GET    /api/v1/notes                 # list (paginate)
GET    /api/v1/notes/{path}          # read
PUT    /api/v1/notes/{path}          # create/update
PATCH  /api/v1/notes/{path}/append   # append content
DELETE /api/v1/notes/{path}
GET    /api/v1/search?q=...&limit=
GET    /api/v1/backlinks?path=
GET    /api/v1/tags
```

---

## 6. Data model — `settings.json`
```jsonc
{
  "version": 1,
  "auth":   { "userPasswordHash": "scrypt$... (pass đã đổi; rỗng = dùng mặc định 123456)",
              "passwordHash": "scrypt$... (override khôi phục; rỗng = không có)",
              "jwtSecret": "..." },
  "vault":  { "path": "/vault", "allowedRoots": ["/vault"], "trash": ".trash", "deleteMode": "trash" },
  "git":    { "enabled": false, "remote": "", "branch": "main",
              "token": "", "authorName": "", "authorEmail": "",
              "autoSync": false, "intervalSec": 300,
              "lfsPatterns": ["*.png","*.jpg","*.pdf","*.mp4"] },
  "search": { "fuzzy": 0.2, "indexFrontmatter": true },
  "api":    { "keys": [ { "id": "...", "name": "agent1",
                          "hash": "...", "scopes": ["read","search"],
                          "createdAt": "...", "lastUsed": "..." } ],
              "rateLimitPerMin": 120 },
  "ui":     { "theme": "neural", "defaultView": "live" },   // theme: system | obsidian-dark | obsidian-light
  "plugins":{ "enabled": ["dataview"], "installed": [] }
}
```

### `data/shares.json` (public share links — FR-10)
```jsonc
[
  { "id": "base64url-16-bytes", "path": "Folder/Note.md",
    "enabled": true, "createdAt": "2026-06-10T00:00:00.000Z",
    "passwordHash": "scrypt$...salt...$...hash..." } // optional — share không password thì bỏ field
]
```

---

## 7. Rủi ro & quyết định
- **Tương thích plugin**: nhiều plugin dùng API/DOM Electron riêng → chỉ đảm bảo subset. Quyết định: shim API phổ biến, fail mềm với API thiếu, log cảnh báo.
- **Bảo mật token git/API key**: lưu trong settings.json server-side (chmod 600), khuyến nghị mount qua secret/volume riêng.
- **File lớn**: bắt buộc Git LFS; cảnh báo khi commit file > ngưỡng mà chưa track LFS.
- **Đồng bộ xung đột**: v1 ưu tiên thông báo + manual resolve, không auto-merge phá dữ liệu.

---

## 8. Tiêu chí hoàn thành (Definition of Done) cho v1
1. Đăng nhập 1 password, mở vault, xem cây thư mục.
2. Mở/sửa/tạo/xoá note với editor + live preview + wikilinks/backlinks.
3. Search trả kết quả từ QMD < 100ms trên vault mẫu.
4. Cấu hình git, sync (pull/commit/push) thành công kể cả file LFS.
5. Tạo API key, AI Agent gọi `/api/v1` đọc/ghi/search thành công.
6. Cài & bật ít nhất 1 community plugin đơn giản.
7. `docker compose up` chạy toàn bộ stack.

## FR-14 — Halo cinematic interface (2026-10-05)

- Theme: `halo-system`, `halo-dark`, `halo-light`; `system` preserves Obsidian standalone and uses Halo in Hub. Existing explicit Obsidian choices remain. Mona Sans is self-hosted. No runtime settings migration.
- Daily motion: menus/dialogs and tab indicator only; never animate live editor text or streaming responses. Shared spring tokens, reduced-motion fade, no rendering in hidden tabs.
- Graph: always ink night; actual backlinks rendered as thin Bézier curves. Vault core and folder satellites show real counts; selecting a folder expands its notes. Selection opens an opaque accessible detail card with summary, tags and backlinks; opening requires the Open button. Search flies to the result within 560ms and manual input interrupts. Mobile uses nodes/curves only; decorations are bounded and desktop only.

- Sci-fi layer (1.9): graph draws a drifting starfield behind the scene, light pulses along links (≤140 desktop, ≤50 phone, golden-ratio staggered), three counter-rotating HUD rings round the vault core and a lock-on reticle round the hovered/selected note; Halo theme adds a neon tab indicator and cold-lit overlays. Reduced motion → one still frame, no pulses/rings; hidden tab → nothing drawn.

- Galaxy mode (2.0): the graph tab has a 「星图 / 关系图」 switch (persisted as `graphMode`, default `galaxy`). Galaxy is a self-written Canvas 2D scene (visual reference: Neural Vault; no code reused): rotating wireframe core, one glowing jellyfish hub per top-level folder (empty folders included, more than 18 folders merge the smallest into 「其他」), Bézier arcs with folder-coloured particles, note specks along each arc and real wikilinks as faint curves (mutual in gold). Selecting a folder moves the scene left and fans fibres out to a DOM note list; selecting a note shows size, character count, links in/out, modified date, tags and summary, with an explicit Open button. Folder cards and note rows are real buttons; the canvas is decorative (`aria-hidden`). Phone (≤768px): compact chips, bottom sheets, no fibres, fewer particles. Reduced motion → one still frame; hidden tab → nothing drawn.

## FR-15 — Neural theme and graph homepage (2026-10-06)

- Add persisted `ui.theme = neural`; dark regardless of device/Hub theme. Keep existing Obsidian/Halo/system choices. Ribbon light toggle is temporary; toggling back restores Neural.
- Neutral black opaque writing surfaces; translucent neutral chrome, fine borders and gold focus/active accents. Mono labels and bilingual headings in both sidebars, graph header and empty launcher. No new animated backgrounds, particles or typography in editor/reading. Existing graph animation remains scoped to the graph.
- After authentication, root URL lands on Graph view (persisted galaxy/links mode retained), preserving restored note tabs. Explicit `/note/...` and `/graph` deep links take precedence. Closing all tabs reveals a static glass launcher with Graph, recent notes and the existing home-note/file-list actions.
- Update production theme through authenticated settings API; preserve other settings and vault content. Deploy via GitHub Actions image, keep the preceding image as rollback.

## FR-16 — Cinematic layer (2026-10-07)

- Setting `ui.effects`: `cinematic` (default) | `calm`; Appearance → 「电影特效 / Cinematic effects」. Active only for Neural and Halo dark, never with `prefers-reduced-motion`, and paused in hidden tabs.
- Boot title card (≤2s, at most once per 6 hours per browser, not inside the Hub frame — the Hub plays its own intro): shutter light line, decoding `NEURAL · VAULT` title, real vault telemetry (notes / folders), iris reveal. Purely visual (`pointer-events: none`, `aria-hidden`); any key or pointer skips it. Hub `enter` → short warp flash instead.
- Active note/view change: the pane wrapper "materializes" once (scan beam, clip reveal, chromatic text fringe, ≤600ms). Editor/preview descendants are never animated; typing and saving are never delayed.
- Overlays (palette, settings, dialogs, context menu): projector entrance (light line → panel), scanline sheen and HUD corner brackets; palette rows stagger in (first 10 rows).
- Chrome: a nebula + grid that lights up once and then holds still behind translucent sidebars/tab bar (a moving layer under blurred glass would re-blur every frame; editor stays opaque), ribbon energy rail, tab and active-tree-row light sweeps, glowing active indicators, status-bar link pulse.
- Galaxy: warp-in on first entry (hubs fly out of the core with star streaks and a core flash), shockwave rings when a folder is selected.
- Phone (≤768px): one-shot effects only (boot, materialize, overlays, warp); no looping chrome animation; drawers stay near-opaque over the note.


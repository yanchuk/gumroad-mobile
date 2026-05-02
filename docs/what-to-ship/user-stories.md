# Quick Update — user stories & acceptance criteria

**Summary.** The product spec for the mobile email composer. User stories, acceptance criteria, and the request/response flow from a creator's phone to a subscriber's lock screen.

**What it's about.** Two actors. A creator opens the mobile app, taps compose, writes a title and body (optionally attaches a photo), picks an audience, taps Publish — the email goes out through Gumroad's existing pipeline. A subscriber gets the push, taps it, and lands in the existing post viewer. The doc covers v1 boundaries (no scheduling, no drafts, no CTA block) and the architecture diagram for the end-to-end loop.

**Why this exists.** This is the single source of truth for what counts as shipped. It draws the explicit line between v1 (the lightweight mobile capture path) and v1.5 (audience filters, channel toggles, scheduling), so implementation doesn't drift. It also says plainly that no explicit user demand was found in research — the case is workflow-gap-based.

**What shaped it.**
- Audit of `EmailForm.tsx` to identify which fields exist and which web defaults mobile v1 hard-codes.
- Verification that the `Installment` pipeline already handles email dispatch, push notifications, and profile-post rendering — no new infra.
- The naming choice: "email" everywhere (per Gumroad help #169), not "post" or "update."
- CTA/upsell block deferred — needs a TenTap extension bridge that doesn't exist on mobile yet.

---

**Feature:** mobile authoring of short-form **email updates** (title + rich-text body + optional photo + audience picker) that publish through Gumroad's existing `Installment` pipeline. Rich-text body uses `@10play/tentap-editor` — Tiptap-on-RN, same engine as web's `EmailForm.tsx`. CTA deferred to v1.5 (web uses Tiptap UpsellCard extension inside `message` HTML; mobile editor lacks the UpsellCard bridge in v1).

**Scope honesty:** v1 is **not full web parity** — it's a lightweight mobile capture/send path for simple email updates. The web composer (`EmailForm.tsx`) has rich text, audience picker (everyone/followers/customers/affiliates + filters), channel toggles (Post to profile / email-only), scheduling, drafts, and file attachments. Mobile v1 hardcodes web's defaults for all of those. v1.5 exposes the most-asked-for fields once we have usage data. Verified public demand for mobile email composition was not found in our research pass; the case is workflow-gap-based, not demand-driven.

**Naming convention** — the artifact is an **email** everywhere in this plan (per help #169 *"Send email updates"*). The optional public-page rendering at `/p/<slug>` (mobile route `/post/[id]`) is the **profile-post channel** of an email — toggleable via `shown_on_profile`. Use "profile post" only when distinguishing the channel; otherwise everything is an email. Code paths kept as-is: `EmailsController` (web compose), `PostsController#show` (Rails public viewer), `app/post/[id].tsx` (mobile viewer). Internal Rails model: `Installment`.

**Audiences:**
- **Creator** — primary actor; authors the email on a phone.
- **Subscriber / Buyer / Follower** — secondary actor; receives the push, reads the email in the existing mobile viewer (`app/post/[id].tsx`). Already supported by today's app — minimal new work.

---

## Architecture diagram (the loop we're closing)

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              CREATOR'S PHONE                               │
│                                                                            │
│   Dashboard tab ──► [+]  ──►  Compose screen                               │
│                                  │                                         │
│                                  │   Title:   "Behind the scenes"          │
│                                  │   Body:    "Working on chapter 2 …"     │
│                                  │   Photo:   📷  (optional)               │
│                                  │   (no CTA in v1 — see S3 deferred)      │
│                                  │                                         │
│                                  ▼                                         │
│                            [ Publish ]                                     │
└─────────────────────────────────┬──────────────────────────────────────────┘
                                  │  POST /api/mobile/emails        🆕
                                  │  multipart/form-data
                                  │  Authorization: Bearer <token>
                                  ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                                RAILS BACKEND                               │
│                                                                            │
│   Api::Mobile::EmailsController#create   🆕                          │
│       │                                                                    │
│       │  validates: title, body length                                     │
│       │  audienceType: "everyone" → installment_type: "audience"           │
│       │  (matches web default — fixed in v1; v1.5 exposes picker)           │
│       │  channel: "email_and_profile"                                      │
│       │  published_at: Time.current  (publish immediately)                 │
│       ▼                                                                    │
│   Installment.create!  ──────────►  ContentModerationStrategy              │
│       │                              ↳ blocks if disallowed                │
│       │                                                                    │
│       │  on success                                                        │
│       ▼                                                                    │
│   PostResendApi.process     ──┐                                            │
│   PostSendgridApi.process     ├──►  email blast to followers/subscribers   │
│       │                       │                                            │
│       └─►  PushNotificationWorker.perform_bulk                             │
│                │                                                           │
│                ├─► PushNotificationService::Ios       (APNs)               │
│                └─► PushNotificationService::Android   (FCM)                │
│                              │                                             │
│                              │  payload includes installment_id            │
│                              ▼                                             │
└────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                            SUBSCRIBER'S PHONE                              │
│                                                                            │
│   Lock screen ──►  push: "Sarah → Behind the scenes"                       │
│                                  │                                         │
│                                  ▼                                         │
│   use-push-notifications.ts  ──►  router.push("/post/<installment_id>")    │
│                                  │                                         │
│                                  ▼                                         │
│   app/post/[id].tsx  ──►  renders title, body, photo                       │
│                                  │                                         │
│                                  │  (no CTA in v1; deferred to v1.5)       │
│                                  ▼                                         │
│   buyer reads the email                                                    │
└────────────────────────────────────────────────────────────────────────────┘

Legend:  🆕 = new in this PR.  Everything else already shipped.
```

---

## Stories

### MUST-HAVE (v1, in this PR)

#### Creator stories

**S1 — Compose a text update**
> *As a creator, I want to write a short email update on my phone, so I can share with my followers without switching to a desk.*

**Acceptance criteria:**
- The Dashboard has a Floating Action Button (FAB, accent color, 56pt) labeled (accessibility) *"New email"*. Tapping it opens the composer with empty title/body/photo state within 500ms; if auth is still loading, show a skeleton then open the composer.
- If AsyncStorage contains a previously-saved draft (see S9), the composer shows a non-modal restore banner: *"Continue your draft from <relative time>?"* with *Continue* and *Discard*.
- The screen shows: title field (single line), rich-text body via `@10play/tentap-editor` (`<RichText editor={editor} />` + `<Toolbar editor={editor} />`), optional photo picker.
- Both **title** and **body** are required. Body emptiness is determined server-side by `Installment#scrubbed_message` (`installment.rb:868-872`); client-side check is `(await editor.getText()).trim().length > 0`. The Publish button is disabled until both pass.
- Title accepts up to 255 chars. Body has no client char cap (HTML overhead makes 10k character cap noisy); server validation enforces final limits.
- **Editor configuration:**
  - `useEditorBridge({ avoidIosKeyboard: true, autofocus: false, initialContent, bridgeExtensions: [...TenTapStartKit, PlaceholderBridge.configureExtension({ placeholder: "Write a personalized message..." }), LinkBridge.configureExtension({ openOnClick: false }) ] })` — placeholder is verbatim from web (`EmailForm.tsx:1181`).
  - Toolbar mirrors web's set: bold / italic / underline / strike / blockquote / link / image / headers / bulleted list / numbered list. Drop unused `code`/`taskList`/`color`/`highlight` from the default `<Toolbar>` items.
  - Dark-mode support: `useEffect` injects `editor.injectCSS(...)` with the current Uniwind theme's `--color-foreground`, `--color-background`, `--color-muted` vars.
- **Keyboard ergonomics:** TenTap handles its own keyboard avoidance via `avoidIosKeyboard: true` — **do NOT wrap `<RichText>` in `<KeyboardAvoidingView>`** (causes double-avoidance / broken layout). The title `<TextInput>` sits above the editor and only gets pushed up by the TenTap-managed avoidance. *Return* on title focuses the editor (`editor.focus("end")`).
- Tapping back/✕ **does not show a discard alert** (web has no equivalent). Compose state is autosaved via S9 on every editor `onChange`; tapping ✕ just dismisses. The single decision point is the restore banner on next open.

**S2 — Pick an audience**
> *As a creator, I want to send my email only to followers (or customers, or affiliates) — not everyone — so the message is targeted.*

**Acceptance criteria:**
- The compose screen shows an Audience row near the top (above Title), reading e.g. *"Audience · Everyone (437)"*. Tapping opens a bottom sheet with radio options.
- On composer mount, mobile fetches `GET /api/mobile/emails/audience_options?mobile_token=...` (Bearer token auth). Response shape: `{ options: [{ type: "audience", label: "Everyone", count: 437 }, { type: "seller", label: "Customers", count: 12 }, ...] }`.
- **Only segments with `count > 0` are listed**, matching web's behavior in screenshot 1 (a fresh seller sees only "Everyone"; once they have followers/customers/affiliates, those appear). "Everyone" is always shown regardless of count.
- Default selection is `"audience"` (Everyone). Selection persists with the AsyncStorage draft (S9).
- The chosen `installment_type` is sent in the publish payload (S4): `audience` | `seller` | `follower` | `affiliate`.
- If the API call fails, the picker falls back to `"audience"` (Everyone) hardcoded — same as v1.0; the row still renders but shows just "Everyone" with no count.
- Counts are rendered to the right of each label, dim-text-muted style. They're not real-time — fetched once at mount, cached for the session.

**S3 — Attach a photo (camera or library, inserted into rich-text body)**
> *As a creator, I want to take a photo of what I'm working on right now, or pick one from my library, so I can share a real visual moment inline in the email body.*

**Acceptance criteria:**
- Tapping the toolbar's image button (or a separate Photo button in the footer) opens an iOS-native action sheet: *Take photo* (default, top), *Choose from library*, *Cancel*.
- *Take photo* launches the camera via `expo-image-picker`'s `launchCameraAsync()` — primary path for the "behind the scenes" demo narrative.
- *Choose from library* uses `launchImageLibraryAsync()` with limited-photo-access scope (no full library permission asked).
- Supported formats: `jpg`, `jpeg`, `png`, `heic`, `webp`. Max 10 MB pre-resize. Mobile resizes to ≤2048px on the longest edge before upload.
- **Upload pipeline (Path A — ActiveStorage direct-upload, mirrors web `EmailForm.tsx:312, 326`):**
  1. Mobile → `POST /api/mobile/direct_uploads?mobile_token=...` with `Authorization: Bearer <oauth>` + body `{ blob: { filename, byte_size, checksum, content_type } }`.
  2. Rails (thin wrapper around `ActiveStorage::DirectUploadsController#create`) → returns `{ id, key, signed_id, direct_upload: { url, headers } }`. A Blob row is now created.
  3. Mobile → `PUT direct_upload.url` (S3) with binary photo bytes + the `direct_upload.headers`. Rails not in the byte path. ~5-30s on cell.
  4. Mobile → `GET /api/mobile/s3_utility/cdn_url_for_blob?key=<blob.key>` → `{ url: "<stable cdn url>" }`. CDN URLs do not expire (vs presigned PUT URLs which expire in 900s).
  5. Mobile calls `editor.setImage(cdn_url)` — TenTap inserts `<img src="<cdn_url>">` at cursor position in the rich-text body.
  6. On Publish, the same `cdn_url` is included in the `installment.files[]` array of the publish payload (S4). `SaveFilesService` (`save_files_service.rb`) attaches the file. `ProductFile#valid_url?` (`product_file.rb:80-86`) passes because `cdn_url` starts with `S3_BASE_URL`. **Why this matters:** raw presigned PUT URLs would 404 in `<img src>` after 900s — buyers would see a broken image. The CDN-URL detour is what web does for the same reason.
- During upload, a small overlay or progress indicator on the cursor position shows status: `resizing → uploading → uploaded → failed`. **Publish is disabled while resizing or uploading.** If upload fails, show *Retry* and *Remove*. Publish becomes enabled only after success or removal.
- First-launch permissions: `app.config.ts` declares both `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription` for iOS, plus `android.permission.CAMERA` for Android. Permission prompts fire on first use of each path.

**Note — Call-to-action button (DEFERRED to v1.5)**

Web sets CTAs via the **`UpsellCard` Tiptap extension** inside the rich-text editor (`EmailForm.tsx:39, 1185`). The legacy `call_to_action_text` / `call_to_action_url` fields exist on the `Installment` model but are **not set by the modern web composer** (`SaveInstallmentService.installment_attrs` permits only `[:name, :message, :shown_on_profile, :allow_comments]`).

Mobile v1 has plain-text body, no rich-text editor, no UpsellCard. **Adding CTA via legacy fields would diverge from web's data path.** Per the "replicate web" rule, CTA is deferred to v1.5 — to be implemented when mobile gains a rich-text editor (or a sanctioned mobile-CTA path is added to the Rails service).

**v1 demo flow:** title + body (plain text + auto-link) + optional photo + audience picker. No CTA. URLs in body become clickable via `auto_link` server-side.

**S4 — Publish and confirm**
> *As a creator, I want to know my email is live and being delivered, so I trust the feature.*

**Acceptance criteria:**
- Tapping Publish disables the button, shows a spinner, and POSTs to `POST /api/mobile/emails`. **Transport (matches `SaveInstallmentService`'s real contract — verified at `save_installment_service.rb:151`):**
  - **Step 1 (photo upload, if present):** the photo is uploaded to S3 via Rails ActiveStorage direct-upload (the pattern `SaveFilesService` already uses for installment files). The response gives a blob `signed_id`, used to obtain a public S3 URL for the file.
  - **Step 2 (publish):** POST JSON to the mobile create endpoint with body shape:
    ```json
    {
      "installment": {
        "name": "...",
        "message": "<p>...</p>",
        "installment_type": "audience",
        "shown_on_profile": true,
        "send_emails": true,
        "allow_comments": true,
        "files": [{ "external_id": null, "position": 0, "url": "<s3-url>", "stream_only": false }]
      },
      "publish": true,
      "idempotency_key": "<uuid-v4>"
    }
    ```
  - **Body format = HTML.** Server expects HTML in `message` (matches web — Tiptap emits HTML). Mobile body is plain text; at submit time it's wrapped via `toMessageHtml(plainText)`:
    - Split by `\n\n+` → paragraphs
    - HTML-escape each paragraph (`<` → `&lt;`, `&` → `&amp;`, etc.)
    - Single `\n` inside paragraph → `<br>`
    - Wrap each in `<p>...</p>`
    - **No URL processing client-side** — server's `Rinku.auto_link` (`post_email.html.erb:23`) auto-links plain URLs at render time.
    - **No Markdown.** No converter on server, no gem in Gemfile, would diverge from web's data path. v1.5 swaps the body input for a rich-text editor that emits HTML directly (e.g. `@10play/tentap-editor`); server contract doesn't change.
  - `installment_type` value comes from the audience picker (S2): `audience` | `seller` | `follower` | `affiliate`. Defaults to `audience` if picker fetch failed.
  - **Note:** no `call_to_action_*` fields. `SaveInstallmentService.installment_attrs` (`save_installment_service.rb:143`) permits only `[:name, :message, :shown_on_profile, :allow_comments]`. Web sets CTAs via Tiptap UpsellCard inline in `message`. Mobile v1 has no editor → no CTA. Deferred to v1.5 (S3).
  - **Idempotency-key handling is new Rails work** — see S13.
- On 2xx, the screen dismisses and returns to the Dashboard. **No toast** — web has no toast either; web redirects to `/emails`. Mobile lacks an emails-list view in v1, so it returns to the Dashboard. Verification of delivery is via the buyer-side push notification.
- On 4xx (validation), inline errors render against the offending field; the Publish button re-enables.
- On 5xx or network failure, **stay on the composer**, persist title/body/photo to AsyncStorage (see S9), show a persistent banner with *Retry*, and enforce an idempotency key (see S13) so a successful Retry cannot create a duplicate `Installment`.
- A `POST /api/mobile/emails` round-trip from a healthy network completes in ≤3 seconds (excluding photo upload).
- Sentry breadcrumbs are captured at Publish-tap (event: `installment.publish.attempt`), success (`installment.publish.success`), and failure (`installment.publish.failure`). Payloads include `title_length`, `body_length`, `has_photo`. **No PII** (no body text, no title, no email).
- Server-side delivery tracking fires automatically via the existing `update_delivery_statistics` flow in `post_resend_api.rb:54` — no new wiring needed.

**S5 — See errors I can act on**
> *As a creator, when something goes wrong, I want a useful error message, so I'm not stuck.*

**Acceptance criteria:**
- Server validation errors map 1:1 to fields (title, body). Inline error rendering mirrors web's `Fieldset state="danger"` pattern (`EmailForm.tsx:1148`).
- Content moderation rejection surfaces as: *"Update needs editing — see guidelines"* with a link to the moderation rules page in WebView.
- Unauthorized (401) → silent token refresh attempted; on failure → log out (existing `useAPIRequest` behavior).
- All non-actionable errors are reported to Sentry with the email payload (sanitized) attached.

#### Subscriber stories (already shipped, listed for completeness + sanity testing)

**S6 — Receive the push (verified shipped)**
> *As a follower of a creator, I want a push when they send an email, so I don't miss the update.*

**Acceptance criteria (verify, do not rebuild):**
- A device registered with `app_type: "consumer"` receives the push within 60 seconds of `Installment#publish` (`use-push-notifications.ts:29`).
- Push fan-out is triggered by `post_resend_api.rb:54` → `send_push_notifications` → `PushNotificationWorker.perform_bulk` → `PushNotificationService::Ios` / `Android`.
- For our v1 (`installment_type: AUDIENCE_TYPE`), recipients = the seller's full audience: customers + followers + affiliates.
- The push title is the email's `subject`. **The body is NOT the email message — it is hardcoded as `"By #{seller.name}"`** (`post_resend_api.rb:215-216`). Acceptance test must match this exact string, not "first 100 chars."
- Tapping the push opens `/post/<installment_id>` — the mobile email viewer route (`use-push-notifications.ts:65-78`).

**S7 — Read the email in the app**
> *As a follower, I want to read the email in the app, so I don't need to switch to my mailbox.*

**Acceptance criteria (verify):**
- The mobile email viewer (`app/post/[id].tsx`) renders the title, message HTML, and attached photo from a v1 Quick Update correctly. **This is the regression check; if a Quick Update does not render here, v1 is broken.**

**S8 — ~~Tap the CTA → buy~~ DEFERRED (v1 has no CTA — see S3)**
> v1 emails have no CTA. The buyer reads the email in the viewer; URLs in body text are auto-linked server-side and clickable. CTA-button-driven repurchase is v1.5+ when mobile gains a rich-text editor.

---

### Stories added after Codex review (must-have v1)

**S9 — Don't lose my work if the app dies** [BLOCKER]
> *As a creator typing an email, I want my unfinished work preserved if the app is killed, backgrounded for too long, or my battery dies, so I never lose 200 words mid-thought.*

**Acceptance criteria:**
- Composer state (title, body, photo selection metadata — *not* the photo bytes) is persisted to `AsyncStorage` (key: `email-compose-draft-v1`) on every text-input change, debounced to 500ms idle.
- On composer mount, if a draft exists and was saved within the last 7 days, show the restore banner from S1.
- Draft is cleared from AsyncStorage on (a) successful publish (`installment.publish.success`), (b) explicit *Discard* from the back-out alert or restore banner.
- Photo bytes are NOT persisted across kills; on restore, the photo slot shows *"Photo lost — re-attach?"* with the picker re-launchable.
- Storage size cap: 100 KB. If exceeded (extreme body length), drop the oldest field-level history and keep current state only.

**S10 — Resilient publish across backgrounding** [BLOCKER]
> *As a creator who tapped Publish then immediately switched apps, I want the publish to either complete or be retryable, never silently fail.*

**Acceptance criteria:**
- The Publish HTTP request runs via the existing `request()` helper (`lib/request.ts`) — **not** background URLSession. (No background-upload claims in the doc.)
- If the app backgrounds while the request is in flight, the request continues until the OS reclaims the process (typically 30s). On foreground:
  - If the response was received: dismiss to Dashboard on success, or show the failure banner on error (matches web — no toast).
  - If the request was cancelled: show the failure banner with *Retry*. The idempotency key (S14) ensures Retry cannot duplicate.
- If the photo upload was in flight when backgrounded: pause the visible progress; on foreground, verify upload state and offer *Retry*. Do not assume background completion.

**S11 — Permission denial / limited photo recovery** [MAJOR]
> *As a creator who's denied photo access (or who picked Limited Access on iOS 14+), I want a clear path forward, not a dead end.*

**Acceptance criteria:**
- If `expo-image-picker` returns `denied`: show inline action sheet *Open Settings* (deep-links to `app-settings:`), *Choose Another Photo* (re-prompts limited library), *Continue Without Photo* (closes the photo flow).
- If `limited` access and the desired photo isn't in the user's selected set: show *"Want to share a different photo?"* with the same options.
- Camera unavailable (simulator / no rear camera / permission denied): the *Take photo* row in the action sheet is hidden, not greyed-out.

**S12 — Email eligibility (proactive + server-side gate)** [MAJOR]
> *As a creator whose account doesn't yet meet the email-sending requirements ($100 in earnings + completed payout), I want to know upfront — not after typing a long email — and I want a clear path to fix it.*

**Acceptance criteria — proactive (preferred):**
- On composer mount, mobile fetches `GET /api/mobile/emails/audience_options` (S2). The response includes an `eligibility` object: `{ can_send_emails: bool, reason: string|null, learn_more_url: string|null }`.
- The eligibility check on the server runs `seller.eligible_to_send_emails?` (`user.rb:974-980`). Gates: not suspended + `sales_cents_total >= 10_000` cents (`Installment::MINIMUM_SALES_CENTS_VALUE`) + `has_completed_payouts?`. Team members bypass.
- When `can_send_emails: false`:
  - A persistent banner renders at the top of the composer: *"You need $100 in total earnings and a completed payout before you can send emails."* + *[Learn more →]* (link opens `https://gumroad.com/help/article/269-balance-page` in `safeOpenURL`).
  - The Publish button is disabled (greyed) regardless of title/body content.
  - The creator can still type, attach photos, pick audience — useful once server-side drafts arrive in v1.5. (For v1, AsyncStorage drafts cover this.)
- When `can_send_emails: true`: no banner, normal flow.

**Acceptance criteria — server-side safety net (race condition):**
- `SaveInstallmentService` independently enforces `seller.eligible_to_send_emails?` at `save_installment_service.rb:115`. If the seller's eligibility changes between composer mount and Publish (e.g., they get suspended mid-compose), the create endpoint returns `422` with the eligibility error.
- Mobile renders the same banner pattern as the proactive case, with the server-supplied reason. Composer state remains; user can act on the link and try later.

**Soft cap (`installment.rb:897`):** If `audience_members_count > SENDING_LIMIT (100)` AND `sales_cents_total < $100`, the model adds an inline error: *"Sorry, you cannot send out more than 100 emails until you have $100 in total earnings."* Mobile maps this to the same banner.

**S13 — Idempotency** [MAJOR — new Rails work]
> *As a creator who tapped Retry after a network blip, I want to never send the same email twice.*

**Acceptance criteria:**
- The composer generates a UUIDv4 `idempotency_key` on first Publish-attempt; the same key is reused for every Retry of the *same* compose session.
- The key is sent as `idempotency_key` JSON param (alongside `installment` and `publish`) on `POST /api/mobile/emails`.
- Rails accepts the param and, if it matches an `Installment` already created within the last 60 minutes for this seller, returns the original 2xx response (no new Installment created).
- The key is regenerated only when the composer is cleared (publish success, explicit discard, or fresh-open with no draft).
- If the seller force-quits and re-opens with the draft restored, the same key is restored from AsyncStorage — preventing a duplicate even across app launches.

**Implementation note (Rails — net-new, F5-revised after devil-advocate review):** Idempotency is not currently supported for `Installment`. Only `User::CreateAdminCommentService` has it (`create_admin_comment_service.rb:15,25`).

**Naive SETNX-after-success has TWO race conditions:**
1. **Service succeeds, cache write fails (Redis blip):** retry runs the service again → duplicate Installment + duplicate `SendPostBlastEmailsJob` enqueue.
2. **Service raises mid-transaction:** cache holds a key with no installment_id; retry hits "key exists" but has no id to return → ambiguous state.

**Use a 3-state Redis key instead:**
- Key: `idempotency:installment:#{seller_id}:#{idempotency_key}`, TTL 3600 seconds.
- On controller entry: `SETNX key "in_flight" EX 3600` (atomic).
  - If key already exists with value `"in_flight"` → another request is in flight → return **409 Conflict** with `{ retry_after: 5 }`. Mobile shows banner *"Publish in progress…"*, retries after 5s.
  - If key already exists with a numeric installment_id (cache hit from a prior success) → look up `Installment.find(id)`, return its serialized 2xx response.
  - Otherwise (cache miss): proceed.
- After successful `SaveInstallmentService.perform`: `SET key <new_installment_id> EX 3600` (overwrites the `"in_flight"` sentinel).
- On `SaveInstallmentService` failure: `DEL key` so the user can retry without 409.
- Wrap in begin/rescue/ensure in the controller. ~50 LOC Rails (vs ~30 LOC naive). Specs for both race scenarios.

**S14 — Empty-state for first-time creator** [MINOR]
> *As a creator on the Dashboard with no sales yet, I want to know I can send an email even before I've sold anything.*

**Acceptance criteria:**
- The compose entry point (`[+]` icon on Dashboard header) is visible regardless of `sales_count`.
- If a creator with `audience_count == 0` (no customers, no followers) opens the composer and taps Publish, the publish succeeds and dismisses to Dashboard like the regular flow. **No special copy or affordance** — matches web (web also publishes silently to a 0-recipient audience). The email is still publicly readable as a profile post at `<creator>.gumroad.com/p/<slug>` if the creator wants to share the link manually.
- Server-side: `Installment` publish succeeds even with zero recipients. Email/push fan-out is a no-op.

**S15 — Accessibility baseline** [MINOR]
> *As a creator using VoiceOver or Dynamic Type, I want the composer to remain fully usable.*

**Acceptance criteria:**
- All icon-only controls (FAB entry, photo picker, photo *Remove*, photo *Replace*) have `accessibilityLabel` strings.
- Errors are announced via `AccessibilityInfo.announceForAccessibility` when rendered.
- All inputs and buttons support Dynamic Type up to `xxxLarge` without text clipping or overflow.
- Hit targets are ≥44pt.
- Focus order: title → body → photo button → publish.

---

## Drafts — verdict and v1.5 contract

**Web has drafts.** Verified:
- `Installment::DRAFT = "draft"` (`installment.rb:16-18`); `display_type` returns `draft` when `published_at` is blank and `ready_to_publish?` is false (`:600-603`)
- Web routes: `GET/POST /emails/drafts` etc. (`config/routes.rb:889-895`)
- `EmailsController#drafts` renders draft lists via `PaginatedInstallmentsPresenter` (`emails_controller.rb:54-70`)
- `SaveInstallmentService` saves without publishing when `publish:` param is absent (`save_installment_service.rb:93-100`); publishes when `save_action_name=save_and_publish` / `publish: true`

**Mobile has zero authoring routes** — only `mobile/installments#show` for buyer reads. No `mobile/emails` create/update/list/publish at all today.

**v1 plan:** Local-only draft preservation via AsyncStorage (S9). Ships in 3 days.

**v1.5 plan (after the demo lands):** Add server-side drafts to the mobile API, mirroring web's `SaveInstallmentService` semantics. **Note:** web exposes drafts via `resources :emails do collection { get :drafts } end` (`config/routes.rb:894`), not via separate draft routes. Mobile can either follow that pattern (`installments` collection action) or add a list endpoint:

```
GET    /api/mobile/emails?status=draft            # list seller's drafts (paginated)
POST   /api/mobile/emails                         # create (Api::Mobile::EmailsController#create)
                                                  #   - body { installment: {...}, publish: false } → draft
                                                  #   - body { installment: {...}, publish: true }  → publish
PUT    /api/mobile/emails/:id                     # update existing draft (only if not yet published)
POST   /api/mobile/emails/:id/publish             # publish an existing draft
DELETE /api/mobile/emails/:id                     # delete a draft (only if unpublished)
# (existing) GET /api/mobile/installments/:id stays — buyer-side read of a published installment
```

All endpoints route through `SaveInstallmentService.perform` (`save_installment_service.rb:96-104`) — no second draft model. The body must follow the actual permitted-params shape (`save_installment_service.rb:130-151`):

```json
{
  "installment": {
    "name": "...",
    "message": "<p>...</p>",
    "installment_type": "audience",
    "shown_on_profile": true,
    "send_emails": true,
    "allow_comments": true,
    "files": [{ "external_id": null, "position": 0, "url": "<s3-url>", "stream_only": false }]
  },
  "publish": false
}
```

No permit-list extension needed — v1 only sends fields already permitted by `SaveInstallmentService` (`name`, `message`, `shown_on_profile`, `allow_comments`, `files`).

---

### NICE-TO-HAVE (v2, NOT in this PR)

| Story | Why deferred |
|---|---|
| Audio email (record 30-90s, transcribe to body) | AI transcription quality risk; ~1 extra day; ships separately as v2 |
| Video email (30s clip) | File-size + transcoding; ships v3 |
| AI-suggested email title from body | Low value; creators want their own voice |
| Audience picker (everyone / followers / customers / affiliates + filters) | UX surface area; v1 hardcodes `audienceType: "everyone"` (matches web default). Picker = ~30 LOC mobile if added; deferred unless we re-scope. |
| Channel toggle (email-only / profile-post-only) | v1 hardcodes both ON (matches web default). Toggle = ~20 LOC; deferred. |
| Schedule-for-later | Adds date picker complexity; creators already have it on web |
| Edit / unpublish from mobile | Reading published emails on mobile is shipped; edit deferred |
| Server-side drafts (cross-device, web↔mobile) | v1.5 — see "Drafts — verdict and v1.5 contract" above. Local AsyncStorage drafts ship in v1 (S9). |
| Multiple photos | One photo only in v1 |
| Recipient count preview ("This will reach 437 people") | Wants a round-trip to `installment_audience_count`; defer to v2 |
| **Subscriber commenting from mobile** (S9 placeholder) | Web has full comments CRUD (`comments_controller.rb`, `/posts/:post_id/comments`). Mobile API has zero `comments` routes. Mobile email viewer (`app/post/[id].tsx`) is **mostly native** — only the body HTML uses an inline WebView (lines 266-284); title/avatar/CTA/files are all native. Comments would need a fully-native compose UX + new mobile endpoints. Separate scope (Reply-Inbox-shaped). |

---

### OUT OF SCOPE (explicit non-goals)

- Apple Pay / mobile checkout — see `proposal.md` for scope analysis (not 3 days)
- Customer list / Refunds (`#62`/`#63` planning issues) — separate roadmap item
- Communities on mobile — dropped per working agreement
- Android push parity — Android consumer push exists; creator-side push has gaps (`push_notification_service/android.rb:16-20`); demo records on iOS

---

## Edge cases & failure modes

| Scenario | Expected behavior |
|---|---|
| Creator has 0 followers/customers | Publish succeeds, dismisses to Dashboard. No special copy (matches web — web also publishes silently to 0-recipient audience). |
| Photo upload fails mid-publish | **Reconciles with S2:** while upload is in-flight or marked `failed`, Publish is *disabled*. The user must either Retry until upload succeeds OR explicitly Remove the photo. Once removed, Publish re-enables and the email is sent without the photo. **No silent proceed.** |
| Content moderation rejects the email | Compose screen re-opens with banner: *"Email needs editing — see guidelines."* All fields preserved. |
| Token expired during publish | Existing refresh-token flow runs (`auth-context.tsx`). On success, retry publish once. On failure, log out. |
| Network offline at Publish | Stay on composer. Persistent banner: *"You're offline. We'll keep this here until you reconnect."* AsyncStorage draft (S9) preserves state. *Retry* surfaced when network returns. |
| App backgrounded mid-upload | Visible progress pauses. On foreground, verify upload state via the file id; offer *Retry* or *Remove*. **No background-URLSession claim** — the existing `request()` helper is foreground-only. |
| Multiple Publish taps | Button disabled on first tap. Server-side `Idempotency-Key` (S13) prevents duplicate Installment creation across retries within 60 min. |
| App killed mid-compose | AsyncStorage draft (S9) restored on next composer open via the restore banner in S1. |
| Photo permission denied | Action sheet with *Open Settings*, *Choose another photo*, *Continue without photo* (S11). |
| Seller email-eligibility blocked server-side | 422 from create endpoint, banner with reason and *Learn more* link (S12). |

---

## Demo data plan (for the recording)

**A dedicated mobile-app test seed already exists:** `db/seeds/030_development/mobile_app_test_data.rb` creates the seller↔customer relationship we need for the demo:

| Email | Role | Already has |
|---|---|---|
| `mobile_seller1_do_not_edit@gumroad.com` (`mobileseller1`) | Seller | "Mobile Test Product 1" ($5) + 1 customer (the buyer below) |
| `mobile_seller2_do_not_edit@gumroad.com` (`mobileseller2`) | Seller | "Mobile Test Product 2" ($10) + 2 customers |
| `mobile_buyer_do_not_edit@gumroad.com` (`mobilebuyer`) | Buyer | Owns both products above |

All passwords are `password`. **No seed changes needed.**

⚠️ The seed file header says: *"Used by the mobile app e2e test framework. Logging in as these users may break the test expectations."* So if Maestro E2E tests run against these accounts in CI, our demo authoring may leave residual Installments. **Mitigation:** re-seed (`rails db:seed`) before/after the recording, or use a throwaway forked seed.

**For the recording specifically:**
- **Creator sim:** logged in as `mobile_seller1_do_not_edit@gumroad.com`. Author a Quick Update email with title + body + photo. URLs in body are auto-linked server-side.
- **Subscriber sim:** logged in as `mobile_buyer_do_not_edit@gumroad.com`. Push lands. Tap → email viewer renders title + body + photo natively.

**Note on the previously-discussed candidates:**
- `seller@gumroad.com` (the OAuth-app owner) has only 1 product (`Beautiful widget`) and 0 customers — push won't fan out.
- `hi@gumroad.com` (Codex's earlier suggestion) has Installments seeded (`gumroad_posts.rb`) but **no audience** — push won't fan out either.
- Only `mobile_seller1_do_not_edit@…` has the seller→customer chain we need.

---

## Test plan summary

**RSpec (Rails):**
- `spec/requests/api/mobile/emails_create_spec.rb`
  - Happy path with title + body
  - Happy path with title + body + photo
  - Missing title / missing body → 422
  - Empty body → 422 (server-side `message_must_be_provided`)
  - Unauthorized (no token) → 401
  - Wrong scope (consumer-only token without creator scope) → 403
  - Audience defaults applied
  - Triggers `PushNotificationWorker` (mock)

**Mobile (Jest + RTL):**
- `app/email-compose.test.tsx`
  - Publish disabled until both fields filled
  - Photo attach → thumbnail render
  - Photo upload state transitions: resizing → uploading → uploaded → failed → retry
  - Server error mapping to fields
  - Tap-back autosaves and dismisses (no alert) — restore banner on next open

**E2E:** out of scope for the demo PR. Maestro happy path can come post-merge.

---

## State matrix (every state both ends must handle)

A response to *"do we have and implemented all states? errors? no connection? etc., in both API and UI"*. This is the single source of truth for failure handling — every row maps to an acceptance criterion above and a UI state in `ui-plan.md`.

### API response states

| Code | Cause | Server source | Mobile UX | Spec |
|---|---|---|---|---|
| **200** | Publish succeeded | `SaveInstallmentService.perform → :success` | Dismiss modal, return to Dashboard. Clear AsyncStorage draft + idempotency key. | S4 |
| **200 (idempotent replay)** | Same `idempotency_key` already published | F5 — cache hit returns original installment_id's serialized response | Identical to first 200 — dismiss + clear. | S13 |
| **400** | Malformed JSON, missing required params | Rails default | Sentry-only; treated as a generic 5xx by user. | S5 |
| **401** | Token expired / invalid | Doorkeeper | Silent token refresh via existing `useAPIRequest`. On second 401, log out (existing `auth-context.tsx` flow). | S5 |
| **403** | OAuth scope mismatch (token missing `creator_api`) OR Pundit `authorize Installment` failure (team-member without admin/marketing role) | F3 + F4 | Banner: *"This account can't compose emails. Contact account owner."* + Learn more. No retry. | S5 (extended below) |
| **409** | F5 — concurrent publish in flight (idempotency `"in_flight"` sentinel) | New idempotency cache | Banner: *"Publish in progress, retrying in 5s…"* — auto-retries after 5s. Publish button stays disabled. | S13 |
| **422 — title/body validation** | `Installment` model validation (e.g. `message_must_be_provided`, `name` length) | `installment.rb:863` | Inline field error under the offending input. Title/body preserved. Publish re-enables. | S5 |
| **422 — eligibility** | `seller.eligible_to_send_emails? == false` at publish time (race vs proactive check) | `save_installment_service.rb:115` | Sticky banner with reason from server; Publish disabled. | S12 |
| **422 — soft 100-cap** | `audience > 100 && sales < $100` | `installment.rb:892-900` | Same banner pattern as eligibility. Reactive only — proactive check costs an extra round-trip; deferred to v1.5. | S12 |
| **422 — content moderation** | Disallowed content from moderation strategy | `installment.rb:860-911` | Banner: *"Email needs editing — see guidelines."* + link. State preserved. | S5 |
| **429** | Rack::Attack throttle (F12 — 5 req/min/IP) | New initializer rule | Banner: *"Too many publish attempts. Try again in a minute."* Publish disabled for 60s. | S10 |
| **500 / 502 / 503 / 504** | Server crash / gateway / Sidekiq down | Various | Sticky error banner: *"Couldn't publish. Tap to retry."* Idempotency key reused on retry (S13). State preserved. Sentry breadcrumb captured. | S4, S10 |
| **Network timeout (no response)** | iOS reachability/timeout | OS-level | Banner: *"No response from Gumroad. Tap to retry."* AsyncStorage draft (S9) preserves state. | S4, edge cases table |
| **Network offline** | `NetInfo.fetch().isConnected === false` before request | OS-level | Banner: *"You're offline. We'll keep this here until you reconnect."* No retry attempted. Auto-retry when network returns. | S10, edge cases table |

### Photo upload states (each step in the 6-step Path A pipeline)

| State | Trigger | Mobile UX |
|---|---|---|
| **`idle`** | Photo button not tapped | Photo button visible in toolbar |
| **`picking`** | `expo-image-picker` action sheet open | Sheet rendered (S3 mockup) |
| **`permission_denied`** | iOS denied camera/photos | S11 alert (Open Settings / Choose another / Continue without) |
| **`resizing`** | mobile resizing to ≤2048px | Inline indicator in editor at cursor; Publish disabled |
| **`requesting_blob`** | POST `/api/mobile/direct_uploads` in flight | Same indicator |
| **`uploading_to_s3`** | PUT to `direct_upload.url` | Indicator with progress %; Publish disabled |
| **`uploading_failed`** | S3 PUT 4xx/5xx/timeout | Indicator turns red; Retry / Remove buttons; Publish stays disabled |
| **`requesting_cdn_url`** | GET `/api/mobile/s3_utility/cdn_url_for_blob` | Indicator |
| **`inserted`** | `editor.setImage(cdn_url)` succeeded | `<img>` visible in editor; Publish enables |
| **`tap_remove`** | User tapped X on image | Image removed from editor body via Tiptap deleteSelection. Blob orphaned in S3 (acceptable — Blob purge on app cleanup is v2). |

### Audience options endpoint states (S2 fetch on composer mount)

| State | Trigger | Mobile UX |
|---|---|---|
| **`loading`** | request in flight | Audience row shows "…" placeholder; composer is otherwise interactive |
| **`success`** | 2xx with options + eligibility | Audience row populated; eligibility banner if needed |
| **`failure_500`** | server error on options endpoint | Fallback: hardcode `audience: "Everyone"`, hide segment options. Eligibility check skipped — server-side 422 at publish remains the safety net. Sentry warning. |
| **`failure_offline`** | no network | Same as 500 fallback. Audience = "Everyone" only. |
| **`stale`** | session has cached response > 30 min old | Refetch on next composer mount |

### Composer / editor states

| State | Trigger | Mobile UX |
|---|---|---|
| **`mounting`** | screen pushed | Skeleton 200ms; `useEditorBridge` initializes |
| **`editor_loading`** | TenTap WebView booting | Editor shows blank with subtle pulse; toolbar disabled |
| **`editor_ready`** | TenTap fired `onLoad` | Toolbar enabled; placeholder visible |
| **`editor_load_failed`** | WebView crashed / network failed loading editor HTML | **Fallback to vanilla `<TextInput multiline>`**. We lose toolbar but keep ship. `Sentry.captureException`. Cover note can mention the editor was attempted; demo-day fallback preserved. |
| **`typing`** | `editor.onChange` fires | Debounced AsyncStorage save (S9) every 500ms |
| **`title_focus`** / **`body_focus`** | input focus | Standard (S15 focus order) |
| **`publishing`** | Publish tapped | Spinner in Publish button; all inputs disabled |
| **`success_dismissing`** | 2xx received | Modal dismisses; brief Dashboard re-render reflecting new email |
| **`ineligible`** | `audience_options.eligibility.can_send_emails === false` | Banner sticky at top; Publish disabled (S12) |
| **`error_recoverable`** | 4xx/5xx | Banner with Retry; state preserved (S5/S10) |
| **`error_offline`** | network offline | Banner with offline copy; state preserved |
| **`draft_restorable`** | AsyncStorage has draft from prior session | Restore banner (S1) |
| **`backgrounded_during_publish`** | app went to background mid-request | On foreground: verify request status; if cancelled, show retry banner; idempotency key prevents duplicate (S10) |

### Subscriber-side states (already shipped, listed for completeness)

| State | Trigger | Mobile UX |
|---|---|---|
| **`push_received`** | APNs/FCM | Lock screen shows title + "By {seller}" |
| **`push_tap`** | tap | `router.push("/post/<installment_id>")` |
| **`viewer_loading`** | mobile email viewer mounting | Skeleton |
| **`viewer_failed`** | API 404/500 fetching `/api/mobile/installments/:id` | Existing error UI in `app/post/[id].tsx` |
| **`viewer_no_upsell_card_render`** | message HTML contains `<upsell-card>` element (web-authored emails) | F8 — pre-existing bug; renders as invisible. Documented; not fixed in v1. |

### State-coverage gaps to acknowledge in cover note

- **F6 — soft cap not proactive.** Reactive 422 only. Proactive surface deferred to v1.5.
- **F8 — UpsellCard rendering.** Mobile viewer can't render Tiptap UpsellCards. Pre-existing.
- **F9 — `shown_on_profile: true` without sections.** Post lives at `/p/<slug>` but not on profile homepage.
- **No retry budget.** Mobile retries 5xx once (next user tap). No exponential backoff. Acceptable for v1.

---

## Definition of done

### Rails
- [ ] `Api::Mobile::EmailsController#create` routing through `SaveInstallmentService.perform`, with passing RSpec covering the matrix above
- [ ] `Api::Mobile::EmailsController#audience_options` returns options + eligibility object
- [ ] `Api::Mobile::DirectUploadsController#create` wraps ActiveStorage direct-upload (F2)
- [ ] `Api::Mobile::S3UtilityController#cdn_url_for_blob` returns stable CDN URL (F2)
- [ ] All 4 mobile controllers declare `before_action { doorkeeper_authorize! :creator_api, :mobile_api }` (F3)
- [ ] `Api::Mobile::EmailsController#create` declares `authorize Installment` (Pundit) — F4
- [ ] `seller` assignment uses `current_api_user`, NOT `current_resource_owner`, to disable team-member impersonation by default (F4)
- [ ] Idempotency cache uses 3-state pattern (`"in_flight"` sentinel + 409 retry + final installment_id) — F5
- [ ] Rack::Attack rule: `/api/mobile/emails` 5 req/min/IP — F12
- [ ] **Demo seed patched** (F1): `mobile_seller1.sales_cents_total >= 10_000` cents + completed `Payment` row → `seller.eligible_to_send_emails? == true`. Verified in console pre-recording.

### Mobile
- [ ] Composer screen + TenTap RichText + customized Toolbar + Dashboard FAB entry (44pt, accessibilityLabel)
- [ ] AsyncStorage draft (S9) — debounced save, restore banner, clear-on-publish, stores HTML
- [ ] Audience picker sheet (S2) with counts + eligibility banner state
- [ ] Photo upload via ActiveStorage direct-upload + CDN URL resolve (F2 — 6-step pipeline)
- [ ] Editor load-failed fallback to vanilla `<TextInput>` (state matrix `editor_load_failed`)
- [ ] Idempotency key generation + persistence with the draft + 409 handling
- [ ] Eligibility banner (S12) — proactive on mount + reactive on 422
- [ ] Keyboard avoidance + focus order (S15)
- [ ] `lib/auth-context.tsx:208` reverted (remove `isCreator: true,` dev hack)
- [ ] `package.json` adds `@10play/tentap-editor`, `react-native-webview`, `expo-image-picker`, `@react-native-async-storage/async-storage`, `expo-crypto`
- [ ] `app.config.ts` declares `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `android.permission.CAMERA`

### Verification
- [ ] End-to-end on two simulators: publish from creator → push lands on subscriber → email renders title + body + photo natively
- [ ] Force-quit-mid-compose test: draft restored on reopen
- [ ] Tap-Retry-after-fail test: idempotency prevents duplicate (no second `SendPostBlastEmailsJob` enqueue)
- [ ] Concurrent publish test: 409 returned, retry succeeds (F5)
- [ ] Ineligible seller: banner shown, Publish disabled, then becomes eligible mid-session → banner clears, Publish enables
- [ ] Photo `<img>` URL resolves correctly 1+ hour after publish (CDN URL not expired) — F2 verification
- [ ] Editor-load-failed fallback test: throttle WebView load, confirm `<TextInput>` fallback renders
- [ ] All state-matrix rows hand-verified or covered by automated test

### Documentation + delivery
- [ ] 60-second demo video recorded
- [ ] Cover note finalized — includes the F1 seed patch, the F2 ActiveStorage decision, the F8/F9 acknowledged regressions
- [ ] PR opened on `antiwork/gumroad` (Rails) and a branch on `antiwork/gumroad-mobile` (Mobile), cross-linked

# Wave 7 — Mobile Email Composer Parity with Web

> **Continues:** [`2026-05-01-quick-update-mobile.md`](./2026-05-01-quick-update-mobile.md) (Waves 1-6 — composer foundation, photo upload, toolbar — all shipped).
>
> **Linked:** [`2026-05-02-wave-8-email-inbox.md`](./2026-05-02-wave-8-email-inbox.md) — email list/inbox + sheet + WebView post viewer (depends on this wave's `update`/`preview` endpoints).
>
> **For agentic workers:** Use `superpowers:executing-plans` to drive this task-by-task.

## Goal

Bring the mobile **New email** composer to feature parity with `gumroad.dev/emails/new`. **Match web behavior unless mobile constraints force a justified divergence.** The backend already accepts every field; the gap is purely on the mobile client.

---

## Sprint Plan (token + time budget aware)

Three sprints. **Sprint 1 ships the demo cut.** Sprints 2 + 3 fill in parity and polish if time allows.

## Final 2-sprint plan (Wave 7 = demo cut)

> **Total: ~3 days.** Wave 7 is the demo-shippable cut. Everything else moves to **Wave 8** — Schedule, Save-as-draft, Attachments, Preview, in-app WebView, commenting, Edit/Duplicate/Delete, simplify backlog.

### Sprint 1 — Stability + Settings (~1.5 days) [demo-critical]

JTBD covered:
- **S1.1 Settings consolidate into one sheet** — "When I'm composing on a tiny screen, I want all email settings in one tap-away overlay so the editor body fills the screen."
- **S1.2 Channel rule + profile-sections empty-state banner** — Hide "Post to profile" when audience ≠ Everyone (Codex BLOCKER #6). Show informational banner (no tap action) when audience=Everyone + Post-to-profile checked + seller has no sections.
- **S1.3 Allow comments toggle** — "When my update is sensitive, I want comments off." Default ON for new emails.
- **S1.4 RSpec HTML round-trip + persistence + send-job enqueue** — `installment.message`, `send_emails`, `shown_on_profile`, `allow_comments` all asserted byte/value-exact for each audience type. PLUS when `send_emails: true`: assert `PostEmailBlast.find_by(post: installment)` exists AND `expect(SendPostBlastEmailsJob).to have_been_enqueued.with(blast_id)` — proves the send pipeline was triggered. **(Verified at `save_installment_service.rb:99-103` — class is `SendPostBlastEmailsJob` not the previously-mistaken `SendInstallmentEmailJob`.)**
- **S1.5 Maestro publish flow** — regression guard. Adds `utils/login-creator.yaml`, requires testIDs on FAB + subject + settings-chip. **Sprint 2 extends this flow** to navigate to the Emails tab post-publish and assert the new row's subject is visible — closes compose→DB→list loop.
- **S1.6 Idempotency-key rotation on stale draft restore** — Backend Redis TTL is 1h (`installment_idempotency_service.rb:4`); local draft TTL is 7d (`use-email-draft.ts:5`). On draft restore, if `Date.now() - new Date(savedAt).getTime() > 60 * 60 * 1000`, generate a fresh `Crypto.randomUUID()` instead of preserving `restoreCandidate.idempotencyKey`. Prevents lost-idempotency double-publish on stale-draft resume. Add 1-line conditional in `app/email-compose.tsx:156`.
- **S1.7 Backend: add `has_profile_sections` to audience-options** — `EmailAudiencePresenter#as_json` (`email_audience_presenter.rb:18`) returns only `{options, eligibility}`. Add a third key `has_profile_sections: seller.seller_profile_sections.exists?`. The S1.2 banner becomes truly conditional. Cheap one-line addition + spec update.
- **S1.8 Error message normalization** — `lib/request.ts:38-41` exposes raw response text on failure; `app/email-compose.tsx:124-126` renders directly. Update `request.ts` rejection path to attempt `JSON.parse(text)?.message ?? text` so 422/409 responses surface the server's `{message}` instead of raw payload. Prevents demo-time "ugly error" moments.

Visual styling locked:
- Summary chip: plain text, single `<Pressable>` row, muted color, format `Everyone · Email + Post · ☑ Comments`.
- Section dividers in Settings sheet: hairline `border-t border-border` between Audience/Channel/Engagement.
- Channel "Post to profile" auto-restores to ON when user switches audience back to Everyone (matches web — no memory of explicit uncheck across audience switches).
- Profile-sections empty-state banner copy: "You currently have no sections in your profile. To post to a section, set one up on web first." — **informational only, no tap action in Sprint 1** (upgraded in Sprint 4 backlog).

Backend: 0 new endpoints. Mobile: ~3 files. Risk: lowest.

### Sprint 2 — Email list + attachments management (~2 days) [biggest demo payoff per day]

JTBD covered:
- **S2.1 Published list** — "After I publish from mobile, I want to see it landed in the app — without bouncing to the web." Bottom nav becomes Dashboard / **Emails** / Analytics / Library. FAB removed from Dashboard; iOS-native top-right "+" button on Emails tab. Row format (Option B): subject + `date · sent · X% opened` (conditional on email type — post-only shows `views` instead of `sent/opened`).
- **S2.2 Stats sheet** — "Tap a row, see open/click/view counts so I know if anyone's reading." All 5 stat rows always visible with `--` placeholders (web parity). Label always "Sent". Conditional "View post" button when `full_url` is present.
- **S2.3 View post (system browser)** — `safeOpenURL(installment.full_url)` opens Safari. Wave 8 upgrades this to in-app authed WebView (same screen handles section-edit banner from S1.2).
- **S2.4 First-page only — NO infinite pagination in Wave 7** — `useEmailsList` uses `useQuery` (not `useInfiniteQuery`) for Wave 7. Loads 25 rows max. Wave 8 adds `useInfiniteQuery` + `getNextPageParam` + scroll-end loader. Cuts Sprint 2 scope per codex finding #17.
- **S2.5 Query invalidation on publish** — `usePublishEmail.onSuccess` must call `queryClient.invalidateQueries({ queryKey: ['emails'] })` so the Emails tab list refreshes immediately after publish. Without this, the demo flow ends with stale list. Codex BLOCKER.
- **S2.6 Attachments management screen** — "Manage downloadable files (PDFs + images-as-downloads) without crowding the editor." Compose screen shows a `📎 Attachments (N)` chip/row below the editor that pushes to a new full-screen `app/email-attachments.tsx`. Screen contains the file rows (category icon + filename + size + extension badge + delete) and an `+ Attach files` button (`expo-document-picker` with `type: ['image/*', 'application/pdf']`). Reuses ActiveStorage 3-step direct-upload (rename `use-photo-upload.ts` → `use-file-upload.ts` and generalize the asset shape). Per-file 50 MB hard / 10 MB soft warning; no total cap, no count cap (web parity). State (file list) is held by composer screen and threaded via expo-router params or a shared Zustand-like context — TBD when implementing. Inline editor image upload (Wave 6.5) stays untouched: two paths, web parity.

Follower-only / email-only posts: no in-app preview path in Sprint 2. Creator relies on the published email landing in their own inbox if Resend creds work in prod.

Bottom-nav justification: Emails tab now has a real first-paint screen (Published list with seeded "Behind the scenes 1-3"). Drafts / Scheduled tabs are placeholders until Sprint 3 fills them.

Backend: + `GET /mobile/emails?type=published` (paginated 25/page).
Mobile: `app/(tabs)/emails.tsx` + `EmailRow` + `EmailDetailSheet` + `useEmailsList` hook.

### ~~Sprint 3~~ — MOVED TO WAVE 8

The content below is preserved as reference for Wave 8 planning, but is OUT OF WAVE 7 SCOPE.

#### ~~Sprint 3~~ — Schedule + Save-as-draft (~2 days) [top mobile-native use cases]

JTBD covered:
- **S3.1 Schedule** — "Write at 11pm, send at 9am." Mobile creators write at odd hours; this is *the* mobile use case.
- **S3.2 Save as draft (server)** — "Walk into a meeting, finish later anywhere." Phone interruption is the canonical mobile failure mode.

Visible payoff: Drafts and Scheduled tabs in the Sprint 2 list now populate.

Backend: + `update` action (PATCH `/mobile/emails/:id`).
Mobile: `PublishPopover` (datetime picker) + Save header button + extends list with Drafts/Scheduled tab filters.

#### ~~Sprint 4~~ — MOVED TO WAVE 8 — Polish + simplify + backlog upgrades (~1.5 days)

**Backlog upgrades from earlier sprints:**
- Make Sprint 1's profile-sections empty-state banner tappable → opens in-app WebView at the seller's profile editor URL.
- Sprint 2's "View post" upgrades from `safeOpenURL` (system browser) to in-app WebView (read-only — Wave 8 adds commenting on top).
- New screen `app/web-view.tsx` accepts `?url=...` param. Reuses existing `BaseWebView` from `app/post/[id].tsx`. Auth via `?access_token=` query string — matches `app/purchase/[token].tsx:71` pattern.

**Other Sprint 4 items (continued):**



JTBD covered:
- **S4.1 Attachments via doc-picker** — "Attach a PDF or image as a download — without crowding the editor." Image + PDF only; video → TODO.
- **S4.2 Preview** (email + post popover) — Web parity.

Internal items folded in:
- Pass `File` directly to S3 PUT (drops dual-read; fixes potential iOS RCTImageLoader race)
- Extract `useKeyboardHeight` to `lib/use-keyboard-height.ts` (DRY w/ `page-indicator.tsx`)
- `babel-plugin-transform-remove-console` (strip prod logs)
- Backend: route `EmailAudiencePresenter` through `User#eligible_to_send_emails?` (drops `seller.send(:private)` smell)
- Backend: move `pundit_user` + `authorize_creator!` to `Api::Mobile::BaseController`
- Backend: atomic Redis `SET NX GET` in `InstallmentIdempotencyService#reserve` (TOCTOU close)
- Backend: `ErrorNotifier.notify(e)` in emails controller rescue
- Maestro flows for schedule + save-draft + list

Backend: + `preview` action.
Mobile: `AttachmentsSection` (chip + sheet, 50/10 MB caps, image+PDF only) + `PreviewPopover`.

### Permanent TODO (out of Wave 7 entirely)

- **Filters** (Bought / Not-bought / After / Before, customer-only price/country) — desktop segmentation task; creators don't filter on mobile.
- Recipient count live-refresh (filter-dependent, low value alone).
- **Video attachments** (transcoding via MediaConvert, subtitle uploads, stream-only switch).
- External video embeds (YouTube/Vimeo via iframely).
- Profile sections sub-toggles (no seed data).
- Inline video in editor body (web doesn't support either).

### Sprint sizing summary (Wave 7 LOCKED)

| Sprint | Days | New mobile components | New backend | Demo payoff |
|---|---|---|---|---|
| 1 | 1.5 | SettingsSheet | 0 | Stable foundation, channel safety rule |
| 2 | 1.5 | EmailList + EmailRow + DetailSheet | 1 endpoint | **Proves publish round-trip in-app**; justifies bottom tab |
| **Total Wave 7** | **3** | | | |

Wave 8 absorbs everything else — see [`2026-05-02-wave-8-email-inbox.md`](./2026-05-02-wave-8-email-inbox.md).

### What moved to Wave 8

- In-app WebView post viewer (replaces Sprint 2's system-browser fallback)
- In-app commenting on a post
- Edit / Duplicate / Delete actions on emails
- Search / pagination beyond first page

---

## Foundations verified (4 parallel sonnet agents, file:line cited)

### Sprint 1
- **Bottom-sheet primitive:** `components/ui/sheet.tsx` (Modal + `animationType="slide"` + `presentationStyle="pageSheet"`). Reuse for SettingsSheet.
- **Channel rule enforcement:** backend permits `send_emails`/`shown_on_profile` (`save_installment_service.rb:133`) but does **NOT** enforce "no profile post when audience ≠ Everyone" — that's frontend-only on web (`EmailForm.tsx:902-918`). **Mobile must enforce client-side.**
- **Allow comments:** backend permits + `post_presenter.rb:97` hides comment form when `allow_comments?` is false. Existing `emails_create_spec.rb` does NOT assert persistence — add that in Sprint 1.
- **Settings summary chip:** use `components/ui/badge.tsx` in a `flex-row`. No dedicated chip component.
- **Maestro:** convention is `appId: ${APP_ID}` + `runFlow utils/launch.yaml` first.

### Sprint 2
- **`PaginatedInstallmentsPresenter`** returns `{ installments, pagination: { count, next }, has_posts }` (line 47). PER_PAGE=25.
- **`Api::Mobile::EmailsController`** has NO `index` action yet — must add. Routes line 253: extend `only: [:create]` to include `:index`.
- **Bottom tab pattern:** `app/(tabs)/_layout.tsx` `<Tabs.Screen name="..." options={{ title, tabBarIcon, href }}>`.
- **List perf:** vanilla `FlatList` is project standard (no FlashList).
- **Pull-to-refresh:** custom scroll-offset approach in `library.tsx:125-135` (no RefreshControl).
- **TanStack `useInfiniteQuery` pattern:** `components/library/use-purchases.ts` — query key `["purchases", filters]`, `getNextPageParam: lastPage.meta.pagination.next ?? undefined`.
- **Detail sheet:** copy `components/email-compose/audience-sheet.tsx` shape.
- **"View post":** use `safeOpenURL(url)` from `lib/open-url.ts` (already wraps `Linking.openURL`).
- **GAP:** no mobile `formatStatNumber` utility. Need a one-liner in `lib/format-stat.ts`.

### Sprint 3
- **Schedule backend:** `SaveInstallmentService` already handles `params[:to_be_published_at]` (line 31, lines 79-93 — creates `installment_rule`, enqueues `PublishScheduledPostJob`).
- **`SaveInstallmentService` does NOT read `installment_external_id`** — accepts an `installment:` keyword arg. The `update` controller action must look up `current_api_user.installments.find_by_external_id(params[:id])` itself and pass it.
- **Save vs Publish:** `publish: false` (or omitted) skips the publish path — already supported by existing create. So Sprint 3's Save-as-draft works via PATCH only.
- **DATE PICKER CORRECTION:** use `@expo/ui` `DateTimePicker` (already installed at v55.0.6) — **NOT** `@react-native-community/datetimepicker`. SDK 55 + iOS 26 native pick.
- **Action sheet for Publish▼:** no existing pattern. Use `ActionSheetIOS` (iOS-native, zero dep) + `Alert.alert` Android fallback.
- **Toast for "Scheduled for ...":** no existing utility. Either build a simple animated `View` or install `react-native-toast-message`. Recommend: build inline (one component, zero deps).
- **Countdown timer (5-second):** new component, no existing pattern.
- **Draft schema bump:** keep v1 key, add optional fields `scheduledAt?: string | null`, `allowComments?: boolean`. No migration needed.

### Sprint 4
- **`expo-document-picker`:** `npx expo install expo-document-picker` (~55.0.13).
- **ActiveStorage upload reuse:** backend `direct_uploads` accepts ANY content_type (no MIME restriction at line 24). Just rename `use-photo-upload.ts` → `use-file-upload.ts`, generalize input type from `ImagePicker.ImagePickerAsset` to a generic `{ uri, fileName, fileSize, mimeType }`.
- **EMAIL SERVICE CORRECTION:** project uses **Resend**, NOT SendGrid. Update all references. `Installment#send_preview_email` rescues `ResendApiResponseError` only (line 401) — generic SMTP failures in dev leak past rescue → 500. Mobile must handle 5xx gracefully.
- **`User#eligible_to_send_emails?`** exists (`user.rb:974-980`), wraps all 3 conditions PLUS team-member bypass. Use this directly — drop the `seller.send(:has_completed_payouts?)` workaround.
- **`Api::Mobile::BaseController`** exists at `base_controller.rb`. Currently has `check_mobile_token`, `fetch_error`, helpers. Room to hoist `pundit_user` + `authorize_creator!`.
- **Atomic Redis SET NX GET:** Redis gem 5.x + Redis 7.4+ supports it. Current 2-call pattern has TOCTOU window. Sprint 4 fix: use Lua script OR Redis 7 atomic primitive.
- **`File` implements `Blob`:** `expo-file-system/build/FileSystem.d.ts:42` — can pass directly as fetch body. Drops dual file-read.
- **`useKeyboardHeight` extraction:** project uses `lib/` (no `hooks/` dir). Path: `lib/use-keyboard-height.ts`.
- **`babel.config.js`:** does NOT exist at root. Create with `babel-plugin-transform-remove-console` (production only).

### Net new utilities required (across all sprints)

| Utility | Sprint | Reason |
|---|---|---|
| `lib/format-stat.ts` (`formatStatNumber`) | 2 | List sheet stats display |
| `components/email-compose/publish-action-sheet.tsx` | 3 | ActionSheetIOS + Android Alert wrapper |
| `components/ui/toast.tsx` (or install `react-native-toast-message`) | 3 | "Scheduled for ..." confirmation |
| `components/email-compose/countdown-banner.tsx` | 3 | 5-second publish-undo |
| `lib/use-keyboard-height.ts` | 4 | Extract from page-indicator (DRY) |
| `babel.config.js` | 4 | First time creating one in this project |

### Plan corrections from verification

1. **Date picker:** `@expo/ui` `DateTimePicker` (already installed). Drop `@react-native-community/datetimepicker` from Sprint 3 dependency list.
2. **Email service naming:** Resend (not SendGrid) throughout. Mobile must handle 5xx in dev (no Resend creds).
3. **Sprint 1 client-side channel rule:** confirmed must be enforced in mobile — backend doesn't validate the audience-vs-channel matrix.
4. **Sprint 1 spec gap:** existing `emails_create_spec.rb` doesn't assert persistence of `allow_comments` or `shown_on_profile`. Sprint 1 RSpec must add these assertions.
5. **Sprint 3 PATCH lookup:** controller looks up by external_id and ownership-scopes to `current_api_user.installments`. 404 on miss doubles as ownership check.

---

## Detailed sprint backlog (deprecated — superseded by the 4-sprint plan above)

### Sprint 1 — Stability + minimum viable parity

**Bias:** make today's compose flow rock-solid for the hiring demo. Add the SMALLEST set of new features that brings the form closer to web (channel toggle + allow_comments). No filters, no attachments-via-document-picker, no schedule UI, no save-as-draft. Inline-image editor already works.

**What already works (Wave 6.5 — keep, don't touch):**
- Compose modal opens via FAB
- Subject input
- Audience picker (Everyone/Followers/Customers/Affiliates)
- TenTap editor + toolbar (after our fix)
- Inline image upload (multi-select, ActiveStorage)
- Cancel confirmation sheet
- Publish (idempotent)

**Sprint 1 NEW user stories** (only 3):
- US-3 (Settings sheet shell — replaces the bare audience-sheet)
- US-6 (Channel checkboxes inside Settings)
- US-8 (Allow comments inside Settings)

**Sprint 1 stability work** — equally important:
- T-Stability-1 Maestro `compose-publish.yaml`: login → compose → fill → publish → assertVisible success snackbar back on Dashboard. Captures regression risk.
- T-Stability-2 RSpec request spec asserting POST `/mobile/emails` with `<p>Body with <strong>bold</strong></p>` persists `installment.message` byte-exact (HTML round-trip).
- T-Stability-3 Manual cross-system e2e: type → publish → open `mobileseller1.gumroad.dev/p/<slug>` → confirm body matches typed.
- M-Simplify-H2 (folded in): switch S3 PUT body from `fetch(uri).blob()` to passing `expo-file-system` `File` directly. Drops the dual file-read AND the iOS RCTImageLoader re-encode race that could cause MD5 mismatches. Real bug fix.
- M-Simplify-H1 (folded in): extract `useKeyboardHeight` to `lib/use-keyboard-height.ts` (shared with `page-indicator.tsx`). Code-health win.

**Backend (Sprint 1):**
- R-Stability-1 RSpec for the existing `Api::Mobile::EmailsController#create` covering: HTML round-trip, channel toggle (`send_emails: false`), `allow_comments: false`. **No new endpoints in Sprint 1.**
- R-Simplify-1 Drop the `seller_has_completed_payouts?` wrapper and route `EmailAudiencePresenter#ineligibility_reason` through `User#eligible_to_send_emails?` (existing public method). Removes the `.send(:private)` smell. Specs untouched.

**Demo flow (record for hiring):**
1. Open app → Dashboard → tap + FAB
2. Compose: subject + body with bold/italic
3. Tap Settings chip → toggle "Post to profile" off → Done (chip updates)
4. Tap Publish → 5-second haptic → modal dismisses
5. Quick cut: web `mobileseller1.gumroad.dev/p/<slug>` showing the rendered post

If a reviewer pokes Cancel → the existing Wave 6.5 confirmation sheet works.

### Sprint 2 — Web-parity expansion (after Sprint 1 ships)

- **Save as draft** (server-side): backend `update` + `preview` actions; mobile Save button.
- **Schedule** UI: PublishPopover with datetime picker + Schedule button.
- **Filters** (Bought / Not bought / After / Before): backend products endpoint + mobile tag inputs + date pickers.
- **Attachments behind a sheet** (images + PDF only — see TODO for video): document picker, 50 MB hard / 10 MB soft / 100 MB total / 4 file caps, ActiveStorage upload reuse.
- Recipient count debounced refresh.

### Sprint 3 — Polish + remaining simplify

- Maestro: schedule + save-draft flows (T2/T3).
- `babel-plugin-transform-remove-console` to strip step logs in production.
- Backend: move `pundit_user` + `authorize_creator!` to `Api::Mobile::BaseController`.
- Backend: atomic Redis SET-NX-GET in `InstallmentIdempotencyService#reserve` (TOCTOU close).
- Backend: `ErrorNotifier.notify(e)` in emails controller rescue.
- Codex review on each repo per Wave protocol.

### TODO (deferred from Wave 7 entirely)

- **Video attachments** — out of all sprints. Web's video flow involves async MediaConvert transcoding + subtitle uploads + stream-only toggle, none of which are scoped here. Document picker stays scoped to `image/*` + `application/pdf`. Re-evaluate in a future wave once we know transcoding state is needed in mobile.
- **External video embeds** (YouTube/Vimeo via iframely) — separate problem; needs in-app oEmbed fetch + iframe rendering. Future wave.
- **Customers-only filters** (`paid_more/less_than_cents`, `bought_from`) — niche audience type; defer.
- **Profile sections sub-toggles** — no seed data; defer.
- **Inline video in editor body** — web doesn't support it either; out of scope.

### Estimated effort (revised)

| Sprint | Days | Notes |
|---|---|---|
| Sprint 1 | 1-2 | Stability + Settings sheet only; no new endpoints; folds in 2 simplify HIGHs |
| Sprint 2 | 3-4 | Save / Schedule / Filters / Attachments — biggest sprint |
| Sprint 3 | 1-2 | Backend simplify + remaining Maestro flows |

Total: 5-8 days. **Sprint 1 alone ships a more-stable demo than today** — even without any new feature visible, the Maestro flow + HTML round-trip spec close the largest verification gap.

---

## Web Parity Audit

Before any code, every UX decision was verified against the web codebase. Source citations live in [`/Users/yanchuk/.claude/plans/adaptive-coalescing-anchor.md`](../../../.claude/plans/adaptive-coalescing-anchor.md). Summary:

### Decisions that must match web exactly

| Element | Web behavior | File:line |
|---|---|---|
| Cancel label | word "Cancel" — link styled as button | `EmailForm.tsx:724-732` |
| Cancel target | `display_type` tab → `from_tab` → drafts | `EmailForm.tsx:680-682` |
| Save button | **separate** accent button, always visible | `EmailForm.tsx:806-808` |
| Save result | stays on edit page, "Changes saved!" toast | `EmailsController:139-141` |
| Publish▼ contents | `Publish now` + datetime + `Schedule` ONLY (no Save, no Preview inside) | `EmailForm.tsx:733-805` |
| Preview button | **separate** from Publish — popover when both channels active, plain button otherwise | `EmailForm.tsx:691-723` |
| Send vs Publish label | `channel.profile ? "Publish" : "Send"` | `EmailForm.tsx:737` |
| 5-second countdown | "Publishing in N…" + X cancel button | `EmailForm.tsx:177, 745-762` |
| Schedule date default | `startOfHour(addHours(now, 1))` | `EmailForm.tsx:296` |
| Timezone label | `"00:00 {context.timezone}"` (server-provided string) | `EmailForm.tsx:1086, 1103` |
| Section header: Audience | `"Audience"` | `EmailForm.tsx:820` |
| Section header: Channel | `"Channel"` (NOT "Delivery") | `EmailForm.tsx:885` |
| Section header: Filters | **does not exist** — filters are flat sub-fields | — |
| Section header: Engagement | `"Engagement"` | `EmailForm.tsx:1132` |
| Audience radios | `Everyone`, `Followers only`, `Customers only`, `Affiliates only` | `EmailForm.tsx:832-867` |
| Recipient count | `"12 / 12"` (with spaces) inside Audience header right-aligned | `EmailForm.tsx:827` |
| Has-not-bought max tags | 1 | `EmailForm.tsx:1007` |
| Bought max tags | unlimited | `EmailForm.tsx:984-990` |
| Defaults for new email | `channel.email = hasAudience`, `channel.profile = true` | `EmailForm.tsx:217-218` |
| Send-email disabled when | `installment.has_been_blasted` only | `EmailForm.tsx:894` |
| Other filters disabled when | `isPublished` | various |
| Disabled buttons rule | only `isBusy`; validation shows error on tap, doesn't pre-disable | `EmailForm.tsx:674-678` |
| Attachments display | always-inline file rows (no collapse, no sheet) | `EmailAttachments.tsx:209` |
| Attachment row contents | category icon + filename + size + extension badge + delete | `FileRowContent.tsx:35-44` |
| Drag-reorder attachments | **No** | `EmailAttachments.tsx:210` |
| Per-file caption | **No** editable field | — |
| Stream-only toggle | single switch shown only when ≥1 video attached | `EmailAttachments.tsx:231-243` |
| File-type thumbnails | **No** pixel preview — generic category icon | `FileRowContent.tsx:35-44` |
| Inline images vs attachments | **two separate upload paths** | see below |
| Per-file size cap (v2 API) | 20 GB | `api/v2/files_controller.rb:17` |
| Server file count cap | **none enforced** | — |
| Server MIME filter | **none enforced** | — |

### Mobile divergences with justification

| Element | Web | Mobile | Why diverge |
|---|---|---|---|
| Settings layout | inline left column | single bottom sheet + summary chip | mobile screen 390pt wide; 2-column doesn't fit |
| Cancel confirmation | none on web | action sheet (Save / Discard / Keep editing) — Wave 6.5 | data loss on touch is more painful; Wave 6.5 already shipped |
| Per-file size enforcement | server v2 API has 20 GB; mobile direct-upload path has **none** | block client-side at 20 GB | match web's effective limit until backend adds it |
| Attach upload mechanism | Evaporate (browser-only) | ActiveStorage direct-upload (existing 3-step flow) | Evaporate cannot run in RN |

---

## User Stories

Each story has acceptance criteria + an ASCII wireframe of the relevant screen state.

### US-1 — Compose layout: Title + Editor + Attachments, with Settings chip

**As a creator** I want a compose screen that gives the **editor most of the screen**, with all metadata (Audience, Channel, filters, Engagement) consolidated behind one tap.

**Acceptance criteria:**
- Compose screen body shows three things: Subject input → Settings summary chip → TenTap editor (flex-1) → Attachments rows + "Attach files" button.
- The summary chip is a tappable single-line text: `"Everyone · Email + Post · Comments on"`. Updates as Settings sheet is dismissed.
- Tapping the chip opens the Settings bottom sheet (US-3).
- Header right shows three buttons: **Preview**, **Save**, **Publish▼** (or **Send▼** when only `channel.email`).
- Header left shows the word **Cancel** (taps invoke the existing Wave 6.5 confirmation sheet when the form has content).

```
┌──────────────────────────────────┐
│ Cancel  New email   Preview Save │
│                          Publish▼│
├──────────────────────────────────┤
│ Subject__________________________│
├──────────────────────────────────┤
│ Everyone · Email + Post · ☑ Comm.│ ← summary chip
├──────────────────────────────────┤
│                                  │
│                                  │
│  TenTap editor (flex-1)          │
│                                  │
│                                  │
│                                  │
├──────────────────────────────────┤
│ 📷 brand-photo.jpg   1.2 MB    ✕ │ ← attachment rows
│ 📄 readme.pdf        234 KB    ✕ │
│ ┌──────────────────────────────┐ │
│ │      📎 Attach files          │ │
│ └──────────────────────────────┘ │
├──────────────────────────────────┤
│ [B] [I] [U] [🔗] [📷] [</>]      │ ← editor toolbar (kbd up)
└──────────────────────────────────┘
```

### US-2 — Header buttons match web, separate Save / Preview / Publish

**As a creator** I want clearly separated controls for previewing, saving as draft, and publishing.

**Acceptance criteria:**
- **Cancel** (left, word) — taps the Wave 6.5 confirmation sheet (Save as draft / Discard / Keep editing) when form has content; instant dismiss when empty.
- **Preview** (right):
  - Both channels active → tapping opens a popover with **Preview email** + **Preview post**.
  - One channel only → direct action.
- **Save** (right) — POSTs `mobile/emails` with `publish: false` (or PATCH if `installment_external_id` is set). Stays on screen, shows toast "Saved" or "Changes saved" matching web.
- **Publish▼** (right) — opens a popover containing:
  - "Publish now" / "Send now" — large accent button. Tapping starts a 5-second countdown ("Publishing in N…") with X to cancel. Label flips per `channel.profile ? "Publish now" : "Send now"`.
  - `OR` separator.
  - Date+time field defaulted to `startOfHour(addHours(now, 1))`. Below it: **Schedule** button. Disabled when already published.
- Buttons disabled only when `isBusy` (publishing, image uploading, file uploading). Validation shows error toast on tap, does **not** pre-disable.

```
                    [Preview] [Save] [Publish ▼]
                                          │
                                          ▼
                ┌────────────────────────────┐
                │  Publish now               │
                │  ─── OR ───                │
                │  03 May 2026  09:00        │
                │  [    Schedule    ]        │
                └────────────────────────────┘

Both channels active → Preview popover:
                ┌────────────────────────────┐
                │  Preview post              │
                │  Preview email             │
                └────────────────────────────┘
```

### US-3 — Settings consolidated into one bottom sheet (mobile divergence, justified)

**As a creator** I want all email metadata in one place so the editor body uses the full screen.

**Acceptance criteria:**
- A single Settings bottom sheet contains **all** of: Audience radios, Channel checkboxes, applicable filters (driven by audience type), Engagement (Allow comments) checkbox.
- Section headers and labels match web exactly (no rename): `"Audience"`, `"Channel"`, `"Engagement"`. No `"Filters"` header — filter sub-fields are flat.
- Audience header right-aligns recipient count: `"12 / 12"` (with spaces around `/`). Refresh debounced 500ms after any filter change.
- "Save" / "Done" button at the bottom of the sheet dismisses it. Settings persist as state changes happen (no separate Save inside sheet).

```
Tap chip →
┌──────────────────────────────────┐
│ Settings                      ✕  │
├──────────────────────────────────┤
│ Audience                  12 / 12│
│ ◉ Everyone                       │
│ ○ Followers only                 │
│ ○ Customers only                 │
│ ○ Affiliates only                │
│ ─────────────────────────────────│
│ Channel                          │
│ ☑ Send email                     │
│ ☑ Post to profile                │
│ ─────────────────────────────────│
│ Bought                           │
│ [+ Add product________________]  │
│                                  │
│ Has not yet bought               │
│ [+ Add product________________]  │
│                                  │
│ After                            │
│ [01.04.2026          📅] 00:00…  │
│                                  │
│ Before                           │
│ [02.05.2026          📅] 11:59…  │
│ ─────────────────────────────────│
│ Engagement                       │
│ ☑ Allow comments                 │
└──────────────────────────────────┘
              [   Done   ]
```

### US-4 — Audience-driven section visibility (match web exactly)

**As a creator** I want the right filter fields to appear depending on which audience I picked.

**Acceptance criteria** (per web `EmailForm.tsx:879-1129`):
- `Everyone`: Channel shows both checkboxes; Bought + Not-bought + After + Before all visible. Profile sections sub-toggles when `channel.profile = true`.
- `Followers only`: Channel hides "Post to profile" (followers never post). Bought + Not-bought + After + Before visible.
- `Customers only`: shows extra `Paid more than` / `Paid less than` price inputs and `From` country dropdown. Hides "Post to profile" in Channel.
- `Affiliates only`: shows `Affiliated products` field. Hides Bought/Not-bought.

### US-5 — Audience radios + recipient count

**As a creator** I want to pick an audience and see exactly how many people will receive what I'm about to publish.

**Acceptance criteria:**
- Four radios: `Everyone`, `Followers only`, `Customers only`, `Affiliates only`. Hide any with zero count (except `Everyone` always shown).
- Recipient count "X / Y" updates 500ms-debounced after filter changes.
- Disabled when `isPublished`.

### US-6 — Channel: Send email + Post to profile

**Acceptance criteria** (matches web):
- Two checkboxes inside `Channel` section.
- Defaults: `Send email = hasAudience`, `Post to profile = true`.
- "Send email" disabled when `installment.has_been_blasted` (i.e., already sent — to prevent double-blast).
- Cannot uncheck both — Publish stays disabled until at least one is on.
- "Post to profile" hidden when audienceType ≠ `Everyone` (web parity).
- When both `Everyone + channel.profile`: profile-section toggles render below, one Switch per `context.profile_sections` entry. If 0 sections, show info alert "You currently have no sections in your profile..." (mobile uses `Banner` instead of web's `Alert`).

### US-7 — Filters (Bought / Has not yet bought / After / Before / customer-extras)

**Acceptance criteria:**
- `Bought` and `Has not yet bought` open nested bottom sheets (audience-sheet pattern) listing the seller's products with checkboxes. `Has not yet bought` accepts max 1 selection (web parity); `Bought` unlimited.
- Products fetched from new `GET /mobile/products` endpoint.
- `After` / `Before` use iOS native `DateTimePicker` (Android: separate date+time pickers).
- Date inputs show `"00:00 {context.timezone}"` / `"11:59 {context.timezone}"` description text below (web parity — server provides timezone string).
- Customers-only extras: `Paid more than` / `Paid less than` + `From` country dropdown (defer real implementation to Wave 9 unless trivially supported).
- All filter fields disabled when `isPublished`.

### US-8 — Engagement: Allow comments

**Acceptance criteria:**
- Single `Allow comments` checkbox in `Engagement` section.
- Default ON for new emails.
- When OFF, the published post (`/p/<slug>`) hides the comment form.

### US-9 — Attachments behind a sheet (mobile divergence, justified — images + PDF only)

**As a creator** I want to manage attachments without crowding the editor on a small screen.

**Acceptance criteria:**
- Below the editor: a single chip row showing attachment count: `📎 2 files` (or `📎 Attach files` when zero) tappable to open the Attachments bottom sheet.
- The Attachments sheet contains: file rows (category icon + filename + size + extension badge + delete ✕) + `+ Attach files` button.
- "Attach files" opens system document picker (`expo-document-picker`) with **`type: ['image/*', 'application/pdf']`** — **VIDEO IS DEFERRED** (see TODO below).
- **No stream-only switch in Wave 7** — only relevant for video, which is deferred.
- **No drag-reorder, no caption, no thumbnail** (web parity).
- Per-file size cap: **50 MB hard block** + **10 MB soft warning** (mobile divergence, justified by cellular bandwidth — see PD-4). Smaller caps because no video.
- Per-email total cap: **100 MB hard block**.
- File-count cap: **4** (web has none; mobile reasonable for chip + sheet UX).
- Failed upload row: `⚠ Upload failed — Retry / Remove` actions.
- Upload uses existing 3-step ActiveStorage flow (`use-file-upload.ts` rewrite).

```
Compose screen (compact attachments chip):
┌──────────────────────────────────┐
│  TenTap editor (flex-1)          │
├──────────────────────────────────┤
│ 📎 2 files                     > │ ← chip → opens sheet
└──────────────────────────────────┘

Tap chip → Attachments sheet:
┌──────────────────────────────────┐
│ Attachments (2)               ✕  │
├──────────────────────────────────┤
│ 📷 brand-photo.jpg   1.2 MB   ✕  │
│ 📄 readme.pdf       234 KB    ✕  │
│ ─────────────────────────────────│
│ ☑ Disable file downloads         │ ← only when video attached
│   (stream only)                  │
├──────────────────────────────────┤
│      [+ Attach files]            │
└──────────────────────────────────┘
```

### US-10 — Inline images via editor toolbar (separate path)

**Acceptance criteria** (matches web's two-path model):
- Editor toolbar's 📷 button continues to insert inline images (existing flow): `expo-image-picker` → ActiveStorage direct upload → `editor.setImage(url)` embeds `<img>` in HTML.
- Inline image extensions limited to `jpg/jpeg/png/gif/webp` (web parity — `ALLOWED_EXTENSIONS` in `file.ts:5`).
- Inline images do NOT create `ProductFile` records. They go in `installment.message` HTML only.
- Document-picker attach flow (US-9) creates `ProductFile` records and goes through `files: [...]` payload.

### US-11 — Schedule for later

**Acceptance criteria:**
- Inside Publish▼ popover (US-2): `OR` separator + date+time picker + Schedule button.
- Date+time defaults to `startOfHour(addHours(now, 1))`.
- Display server-provided timezone string (no client-side detection).
- Tapping Schedule POSTs with `to_be_published_at: <iso>`. On success: dismisses modal, shows toast "Scheduled for ...", navigates to Scheduled tab in inbox (Wave 8).
- Schedule button disabled if already published (`isPublished`).

### US-12 — Save as draft (separate Save button)

**Acceptance criteria:**
- "Save" button in header right (matches web).
- Tapping POSTs `mobile/emails` with `publish: false` and no `to_be_published_at`. PATCH if `installment_external_id` exists.
- Stays on compose screen. Shows toast: `"Email created!"` (new) or `"Changes saved!"` (existing).
- Reopening on web or another device pre-fills all fields (server draft).
- Existing Wave 6 local AsyncStorage draft remains as a <1s fallback.

### US-13 — Cancel safely (Wave 6.5 — keep)

**Acceptance criteria:**
- Already shipped. Empty form → instant dismiss. Has content → action sheet (Save as draft / Discard / Keep editing).
- Note: web does NOT have this confirmation. Mobile keeps it because data loss on touch is more painful; navigating to a tab on web is recoverable, leaving a modal on mobile is not.

---

## Product Decisions

### PD-1: Web parity is the default

Default to web's labels, ordering, defaults, and behavior. Divergences require an explicit mobile constraint.

### PD-2: Settings consolidate into one bottom sheet (justified divergence)

Web's 2-column layout (settings left, editor right) doesn't fit a 390pt phone. Mobile uses a single Settings bottom sheet + summary chip on the compose screen. Section content/labels/order match web exactly.

### PD-3: Cancel confirmation kept (justified divergence — Wave 6.5 already shipped)

Web has no confirmation prompt on Cancel; user navigates back via browser. On mobile, accidental dismiss is harder to undo. Wave 6.5's action sheet (Save as draft / Discard / Keep editing) stays.

### PD-4: Attachment size caps (mobile-cellular divergence, NOT email-channel)

**Verified facts** (via mailer audit):
- Gumroad installment emails contain **download LINKS, not MIME-embedded bytes** — `PostSendgridApi#build_mail` renders `{{download_url}}` button only.
- SendGrid 20 MB total-message cap therefore does NOT apply to attached `ProductFile` size.
- Web caps file uploads at 20 GB via Evaporate (`useConfigureEvaporate.ts:8`) regardless of `channel.email`.
- Backend has no enforced cap on the mobile direct-upload path.

**Mobile divergence (justified by cellular UX, not email limits):**

| Limit | Value | Toast copy |
|---|---|---|
| Per-file hard | 200 MB | "This file is too large. Maximum size per file is 200 MB." |
| Per-file soft warning | 50 MB | "Large file. Uploading on cellular may be slow." |
| Per-email total | 500 MB | "Total attachments exceed 500 MB. Remove a file to continue." |
| File-count cap | 4 | "You can attach up to 4 files per post." |

Rationale: cellular plans throttle above ~50 MB per transfer; iPhone 4K video is ~350 MB/min, so 200 MB covers ~30 sec; total 500 MB caps runaway data costs and S3 spend. **None of these limits relate to whether the email channel is enabled** — they're purely mobile-bandwidth ergonomics.

### PD-4b: Attachments behind a sheet (mobile divergence, justified)

Web shows attachments inline below the editor in the right column. Mobile screen too narrow vertically — chip-row + sheet pattern matches Settings (PD-2). Without drag-reorder + without captions, this is purely a presentation wrapper; behavior matches web.

### PD-5: Inline images vs attachments — two paths

Match web's separation:
- Inline editor images: ActiveStorage direct-upload, image-only, embedded in HTML.
- Document-picker attachments: ActiveStorage direct-upload, any MIME, becomes `ProductFile`.

### PD-6: Editor body stays in the same screen

Reject "separate big screen for body". Web is single-page; keyboard-up state already gives the editor the floor on mobile (~480pt usable). Defer optional fullscreen toggle to Wave 9.

### PD-7: Country and price filters out of scope

`bought_from` country and `paid_more/less_than_cents` apply to `Customers only` audience. Defer to Wave 9 (mobile rarely targets customers-only via mobile composer).

### PD-8: Profile sections sub-UI deferred

When audience=Everyone + channel.profile=true, web shows per-section switches. Our seed data has no profile sections; mobile sends `shown_in_profile_sections: []` (default to all). Defer real UI to Wave 9.

### PD-9: Customer-only filters tag-input via nested bottom sheet

Match web's tag-input semantics (max-tags, product-list source) but render as a nested bottom sheet (mobile pattern), not the inline TagInput component web uses.

### PD-10: Drop drag-reorder, captions, progressive disclosure

Web has none of these for attachments. Don't invent.

---

## Technical Details

### Verified package choices for SDK 55

| Concern | Plan choice | Source verified |
|---|---|---|
| Multi-file picker (PDF/image/video) | **`expo-document-picker@~55.0.13`** — install. Supports `multiple: true`, returns `uri`/`name`/`mimeType`/`size`. | [VERIFIED: expo.dev llms-sdk.txt SDK 55] |
| Inline editor image picker | Keep `expo-image-picker@~17.0.8` for media library access. | [VERIFIED: package.json] |
| Date + time picker | **`@react-native-community/datetimepicker@~9.1.0`** — install. Use `display="compact"` on iOS 14+. | [VERIFIED: ctx7 docs] |
| S3 PUT body | Switch to `import { fetch } from 'expo/fetch'` + `File` body (eliminates dual-read). | [VERIFIED: expo.dev/versions/latest/sdk/filesystem] |
| TanStack Query pagination | TanStack v5: use `placeholderData: keepPreviousData` (helper imported) — `keepPreviousData: true` was renamed. | [VERIFIED: TanStack v5 migration guide] |
| Modal presentation | `presentation: 'fullScreenModal'` for compose (was `'modal'`). | [VERIFIED: docs.expo.dev/router/advanced/modals] |
| Action sheet | `Alert.alert` for confirms; `@expo/ui` `BottomSheet` (already installed) for Settings/Publish▼/Preview popovers. | [VERIFIED: package.json] |

### Backend changes (`gumroad-quick-update`)

#### `Api::Mobile::EmailsController` — extend with two actions

- `update` — PATCH `/mobile/emails/:id`. Reuses `SaveInstallmentService.new(seller:, params:, preview_email_recipient: nil)`. Same Doorkeeper/Pundit gates as `create`.
- `preview` — POST `/mobile/emails/:id/preview`. Wraps `installment.send_preview_email(impersonating_user || current_api_user)`. 422 on `PreviewEmailError`.

#### `Api::Mobile::ProductsController` — new

`GET /mobile/products` returning `[{ id, name, variants: [{ id, name }], permalink }]` for Bought/Not-bought tag inputs.

#### Routes (`config/routes.rb`)

```ruby
resources :emails, only: [:create, :update] do
  collection { get :audience_options }
  member { post :preview }
end
resources :products, only: [:index]
```

#### Throttles (`config/initializers/rack_attack.rb`)

- `update`: 10/60s
- `preview`: 5/60s
- `products#index`: 30/60s

### Mobile components

| Path | Mirrors web at | Purpose |
|---|---|---|
| `components/email-compose/types.ts` | — | Shared `Channel`, `Filters`, `ComposePayload`, `UploadedFile` types |
| `components/email-compose/settings-sheet.tsx` | (mobile divergence) | Single overlay containing Audience + Channel + filters + Engagement |
| `components/email-compose/audience-section.tsx` | `EmailForm.tsx:822-877` | Inside settings-sheet — radios + count `"X / Y"` |
| `components/email-compose/channel-section.tsx` | `EmailForm.tsx:879-949` | Send-email + Post-to-profile checkboxes (no rename to "Delivery") |
| `components/email-compose/filters-section.tsx` | `EmailForm.tsx:978-1106` | Bought/Not-bought tag-inputs (open nested sheets) + date pickers; flat (no "Filters" header) |
| `components/email-compose/engagement-section.tsx` | `EmailForm.tsx:1131-1142` | Allow-comments checkbox |
| `components/email-compose/settings-summary.tsx` | (mobile divergence) | Single chip row above editor |
| `components/email-compose/attachments-section.tsx` | `EmailAttachments.tsx:182-246` | Inline file rows (no drag, no caption, no collapse) + Stream-only switch |
| `components/email-compose/publish-popover.tsx` | `EmailForm.tsx:733-805` | Publish now + datetime + Schedule (no Save, no Preview) |
| `components/email-compose/preview-popover.tsx` | `EmailForm.tsx:691-723` | Conditional: Preview post + Preview email when both channels |
| `components/email-compose/use-file-upload.ts` | rename of `use-photo-upload.ts` | Generic file upload via ActiveStorage; uses `expo/fetch` + `File` body; **client-side 20 GB block** |
| `components/email-compose/use-edit-email.ts` | new | PATCH mutation |
| `components/email-compose/use-preview-email.ts` | new | POST preview mutation |
| `components/email-compose/use-product-options.ts` | new | TanStack Query for product list |
| `components/email-compose/use-recipient-count.ts` | new | 500ms-debounced query for live count |
| `components/email-compose/use-publish-email.ts` | extend | Add channel/filters/allowComments/files/schedule/publish/save params |
| `components/email-compose/use-email-draft.ts` | extend | Bump v2 schema |

### Composer state (`app/email-compose.tsx`)

```ts
const [channel, setChannel] = useState({ email: true, profile: true });
const [filters, setFilters] = useState<Filters>({ ... });
const [allowComments, setAllowComments] = useState(true);
const [attachments, setAttachments] = useState<UploadedFile[]>([]);
const [streamOnly, setStreamOnly] = useState(false);
const [scheduleDate, setScheduleDate] = useState<Date | null>(null);
const [savedInstallmentId, setSavedInstallmentId] = useState<string | null>(null);
const [settingsSheetOpen, setSettingsSheetOpen] = useState(false);
```

JSX top to bottom inside Screen:
1. `<Stack.Screen options>` — header: `Cancel | Preview Save Publish▼`
2. Subject input (single line)
3. SettingsSummary chip (tap → settings-sheet)
4. TenTap editor (flex-1)
5. AttachmentsSection (inline rows + stream-only switch when video)
6. Toolbar (existing — appears above keyboard)
7. Sheets: SettingsSheet, PublishPopover, PreviewPopover (when both channels)

`<Stack.Screen presentation="fullScreenModal">` in `app/_layout.tsx`.

### Tasks

#### Backend (Rails)

- [ ] **R1** Add `update` action + spec
- [ ] **R2** Add `preview` action + spec
- [ ] **R3** Filter/channel/schedule/save/HTML-round-trip request specs (assert `installment.message` byte-exact)
- [ ] **R4** Add `Api::Mobile::ProductsController#index` + spec
- [ ] **R5** Routes + Rack::Attack throttles
- [ ] **R6** Track future task: add server-side enforcement of file count + per-file size on direct-uploads + ProductFile (currently absent)
- [ ] **R7** `/codex review` on `gumroad-quick-update`

#### Mobile

- [ ] **M1** Refactor `usePhotoUpload` → `useFileUpload`. Switch to `expo/fetch` + `File` body. Add 20 GB per-file client-side block.
- [ ] **M2** Build SettingsSheet shell + summary chip
- [ ] **M3** AudienceSection inside SettingsSheet (move existing audience-sheet logic, add count `"X / Y"`)
- [ ] **M4** ChannelSection (`"Channel"` header, NOT "Delivery")
- [ ] **M5** FiltersSection (flat, no "Filters" header) — tag-input via nested bottom sheets + date pickers
- [ ] **M6** EngagementSection
- [ ] **M7** AttachmentsSection: always-inline rows, no drag, no caption, no collapse. `expo-document-picker` with `type: ['*/*']`, `multiple: true`.
- [ ] **M8** Stream-only switch (visible when ≥1 video attached)
- [ ] **M9** Header buttons: Cancel (word) + Preview + Save + Publish▼ (separate components)
- [ ] **M10** PublishPopover (Publish now + datetime + Schedule). 5-second countdown with X cancel.
- [ ] **M11** PreviewPopover (conditional, when both channels)
- [ ] **M12** Wire `useEditEmail`, `usePreviewEmail`, `useProductOptions`, `useRecipientCount`
- [ ] **M13** Bump draft schema to v2; drop v1 silently
- [ ] **M14** Update `app/_layout.tsx` to `presentation: "fullScreenModal"` for compose
- [ ] **M15** Replace existing "Add photo" body button — keep editor's inline-image toolbar button untouched
- [ ] **M16** `/codex review` on `gumroad-mobile`

#### Testing — Maestro flows + RSpec request specs

Maestro is **already configured**: `package.json` has `e2e:ios` / `e2e:android` scripts; `.maestro/login-screen.yaml` is the reference flow; CLI installed at `~/.maestro/bin/maestro`.

- [ ] **T1** Maestro `compose-publish.yaml` — login → compose → fill subject + body + audience filter → Publish → assertVisible success toast + back to inbox (Wave 8 dep)
- [ ] **T2** Maestro `compose-schedule.yaml` — schedule for +1h → verify Scheduled tab (Wave 8 dep)
- [ ] **T3** Maestro `compose-save-draft.yaml` — Save → reopen drafts → fields restored (Wave 8 dep)
- [ ] **T4** RSpec request spec asserting POST `/mobile/emails` with `<p>Body with <strong>bold</strong></p>` persists `installment.message` byte-exact (R3 above) — answers "is HTML actually delivered?"
- [ ] **T5** Manual end-to-end: after Maestro publishes, fetch `mobileseller1.gumroad.dev/p/<slug>` and verify HTML body matches typed (including inline image, no duplicate attachments)

#### "Does email actually send?" verification

SendGrid is broken in dev. Two options:
- **Mailpit** local SMTP catcher (~30 min setup) — assert email arrives via HTTP API.
- **Job queue assertion** — `expect(SendInstallmentEmailJob).to have_been_enqueued.with(installment.id)`. Lower fidelity; no new dependency.

Default: queue assertion is sufficient for ship gate (R3).

### Verification (V)

- [ ] **V1** Open compose → Settings chip shows "Everyone · Email + Post · ☑ Comments". Tap → sheet opens.
- [ ] **V2** Switch audience to Customers only → Bought / Not-bought / Paid more/less / From appear; Post to profile hides.
- [ ] **V3** Audience count "12 / 12" updates live as filter changes (debounced 500ms).
- [ ] **V4** Post-only (`send_emails: false`) creates published post without email.
- [ ] **V5** `allow_comments: false` hides comment form on web.
- [ ] **V6** Schedule 5 min ahead → Sidekiq fires → installment becomes published.
- [ ] **V7** Pick a 25 GB file → block with toast "File too large — 20 GB max per file". Pick a 1 GB file → uploads successfully.
- [ ] **V8** Add 2 attachments → 2 `ProductFile` records (Rails console). Inline editor image is in HTML, NOT in attachments.
- [ ] **V9** Save draft → reopen → fields restored → Publish hits `update` not `create`.
- [ ] **V10** Preview email — UI shows result (success or SendGrid error surfaced).
- [ ] **V11** Preview post — opens `installment.full_url` in browser (Wave 8 will replace with WebView).
- [ ] **V12** Add a video attachment → Stream-only switch appears.
- [ ] **V13** Compare Wave 7 mobile compose JSON payload against web compose payload for the same configuration — should match field-for-field (use Rails request log).

---

## Risks

- **Tag input** — no existing implementation. Build via existing audience-sheet bottom-sheet pattern (cheap; ~2 hours).
- **Settings sheet detents** — large content may need adjustable detents (medium → large). Use `@expo/ui` `BottomSheet` with `detents: ['medium', 'large']`.
- **Date picker iOS 26** — not yet tested on real device; verify before V6.
- **`expo/fetch` with File body** — switching from blob to File is a behavior change in step-2 PUT. Re-run V8 to ensure SignatureDoesNotMatch doesn't return.
- **Preview email** in dev SendGrid is broken — surface error to UI rather than silently failing.
- **Backend file count + size NOT enforced** — track follow-up task to add server-side validation. Until then, mobile is the only enforcement boundary.

---

## Known limitations (accepted for Wave 7, addressed later)

These gaps are documented and accepted for the demo cut. Each has a planned remedy in Wave 8 or Wave 9.

- **Drafts are device-local** — `AsyncStorage` key `email-compose-draft-v1`. Not synced to web, not visible on other devices, lost on uninstall. **Remedy:** Wave 8 `PATCH /mobile/emails/:id` ships server-side drafts as `Installment` rows with `published_at = nil`.
- **Network-aware upload UX is absent** — the soft "Large file" warning fires by size only (no cellular vs Wi-Fi distinction). Mobile has no API for connection type without an extra dep. **Remedy:** Wave 9 — wire `@react-native-community/netinfo` and gate the warning on `connection.type === "cellular"`.
- **Discarded attachments rely on server cron for cleanup** — when the user taps Discard or leaves a draft to expire, the already-uploaded ActiveStorage blobs sit unattached in S3 until Rails' `purge_unattached` job sweeps them (default ~24h). No mobile-side `DELETE /direct_uploads/:signed_id` call. **Remedy:** Wave 9 — add the endpoint + fire on Discard for proactive cleanup.
- **Restored draft attachments may 404** — local draft TTL is 7d; server `purge_unattached` window is shorter. A draft restored after the purge window will reference dead URLs; Publish will then fail with 422 from the backend. Mobile shows the row optimistically and only learns the URL is dead at Publish time. **Remedy:** Wave 8 — server-side drafts skip the issue entirely (blobs become attached `ProductFile` records on save). Optional Wave 9 mitigation: HEAD-validate URLs on draft restore and mark dead rows ⚠ "File expired".
- **No size cap on attachments** — picked file at any size will start uploading after the soft warn. **Remedy:** Wave 9 — add a hard cap once we have resumable uploads + connection-type gating.
- **In-flight uploads are lost on app kill** — pending uploads aren't persisted; only completed CDN URLs land in the draft. If the app dies (memory pressure, swipe-up, crash) at 80% of a 30 MB upload, the user re-picks on resume. **Remedy:** Wave 9 — multipart S3 uploads with persistent upload state and resume negotiation, once backend supports it.

---

## Estimated effort

5-7 days for one engineer. Backend (R1-R7) parallelizable with Mobile UI (M2-M9).

---

## Files to change (summary)

**Backend** (`gumroad-quick-update`):
| Path | Change |
|---|---|
| `app/controllers/api/mobile/emails_controller.rb` | + `update`, `preview` |
| `app/controllers/api/mobile/products_controller.rb` | new |
| `config/routes.rb:253-257` | extend |
| `config/initializers/rack_attack.rb` | + 3 throttles |
| `spec/requests/api/mobile/emails_spec.rb` | + filter/schedule/save/update/preview/HTML-round-trip specs |
| `spec/requests/api/mobile/products_spec.rb` | new |

**Mobile** (`gumroad-mobile`):
| Path | Change |
|---|---|
| `app/email-compose.tsx` | restructure JSX to chip-summary pattern; separate Save/Preview/Publish header |
| `app/_layout.tsx` | `presentation: "fullScreenModal"` for `email-compose` |
| `components/email-compose/types.ts` | new |
| `components/email-compose/settings-sheet.tsx` | new |
| `components/email-compose/settings-summary.tsx` | new |
| `components/email-compose/audience-section.tsx` | new |
| `components/email-compose/channel-section.tsx` | new |
| `components/email-compose/filters-section.tsx` | new |
| `components/email-compose/engagement-section.tsx` | new |
| `components/email-compose/attachments-section.tsx` | new (always-inline rows) |
| `components/email-compose/publish-popover.tsx` | new |
| `components/email-compose/preview-popover.tsx` | new |
| `components/email-compose/use-file-upload.ts` | rename + 20 GB block + expo/fetch + File body |
| `components/email-compose/use-edit-email.ts` | new |
| `components/email-compose/use-preview-email.ts` | new |
| `components/email-compose/use-product-options.ts` | new |
| `components/email-compose/use-recipient-count.ts` | new |
| `components/email-compose/use-publish-email.ts` | extend |
| `components/email-compose/use-email-draft.ts` | bump v2 |
| `package.json` | + `expo-document-picker`, `@react-native-community/datetimepicker` |
| `.maestro/compose-publish.yaml` | new |
| `.maestro/compose-schedule.yaml` | new |
| `.maestro/compose-save-draft.yaml` | new |

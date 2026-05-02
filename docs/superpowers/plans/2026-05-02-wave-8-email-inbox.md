# Wave 8 — Mobile Email Inbox: Drafts, Scheduled, In-app WebView, Edit/Duplicate/Delete

**Summary.** The follow-up plan after Wave 7. Wave 7 shipped the Published list + detail sheet + View post (system browser). Wave 8 fills in the rest: Drafts and Scheduled tabs, the in-app authed WebView upgrade for View post, edit/duplicate/delete actions, search, infinite pagination, server-side drafts, and the preview endpoint.

**What it's about.** Two sub-tabs (Drafts, Scheduled) added next to the existing Published tab. An in-app authed WebView replaces the system-browser fallback for "View post." A bottom-sheet action row gains Edit, Duplicate, and Delete. New endpoints land on the Rails side (`PATCH /mobile/emails/:id` for save-as-draft, `POST /mobile/emails/:id/preview`, `GET /mobile/emails/:id` for compose pre-fill, `DELETE /mobile/emails/:id` for soft-delete). The published list gains infinite pagination via `useInfiniteQuery` + scroll-end loader.

**Why this exists.** Wave 7 closed the publish loop end-to-end but only on the Published surface. Drafts and Scheduled status both exist on the backend yet have no mobile presentation; the system-browser View post breaks the in-app illusion the rest of the feature established; and edit/duplicate/delete are how a creator actually maintains a post-history over time. This plan specs each piece in enough detail for an agent to implement it without ambiguity and documents what's intentionally out of scope (true in-place edit beyond pre-fill, the Subscribers tab).

**What shaped it.**
- Wave 7 shipped scope (Emails tab + Published list + detail sheet + View post via `safeOpenURL`) — Wave 8 builds on top, doesn't re-do.
- Web reference: `Published.tsx`, `Drafts.tsx`, `Scheduled.tsx`, `Layout.tsx`, and `EmailSheetActions` in the Rails Inertia frontend — verified file:line before speccing the mobile equivalent.
- `InstallmentPresenter#props` shape mirrors what Wave 7's index already returns; Wave 8 reuses the same row presenter for Drafts and Scheduled.
- The decision to collapse web's three controller actions into one mobile endpoint with a `type=` filter — already implemented in Wave 7's index, Wave 8 just adds the `drafts` and `scheduled` types to the existing handler.
- Comments already render inline on `/p/<slug>` via `PostPresenter`, so the WebView path doesn't need extra work for "comment from mobile."
- Explicit deferrals: true in-place edit (Edit pre-fills compose, same as Duplicate), and the Subscribers tab.

---

> **Continues:** [`2026-05-02-wave-7-compose-parity.md`](./2026-05-02-wave-7-compose-parity.md) (Wave 7 — already shipped: Emails tab, Published list, detail sheet, system-browser View post).
>
> **Adds (not depends on):** the `update` (PATCH), `show` (GET single), `destroy` (DELETE), and `preview` endpoints. Wave 7 only shipped `index` and `create`.
>
> **For agentic workers:** Use `superpowers:executing-plans` to drive this task-by-task.

## Goal

Round out the mobile equivalent of `gumroad.dev/emails` on top of what Wave 7 already shipped. Wave 7 has the Emails tab, the Published sub-tab, the detail sheet, and a system-browser "View post." Wave 8 adds the remaining two sub-tabs (Drafts, Scheduled), upgrades View post to an in-app authed WebView, and ships the edit/duplicate/delete actions in the row sheet. The published list also gains infinite pagination so a creator with hundreds of posts can scroll past the first 25.

The WebView post viewer (Task #27 from the original Wave 8 stub) is folded in here — when the user taps **View post** on a list row, we open `installment.full_url` in a `react-native-webview` so they can read + comment without leaving the app. This replaces Wave 7's `safeOpenURL` fallback.

## Out of scope

- **Subscribers / Followers** tab (web has it, but it's a different page with different data model — `/followers`, not `/emails/followers`).
- **Edit existing email** UI flow — Wave 7 added the PATCH endpoint and Save-as-draft creates an editable installment, but a separate "Edit" entry from the inbox row sheet is deferred. **Edit** action in Wave 8 just navigates back to the compose modal pre-filled with `copy_from`-style props — same code path as Duplicate. (True in-place edit is Wave 9.)
- **Search** box. Web has ES-backed search; mobile defers to client-side filter on the loaded page.
- **Pagination** beyond first page. Load 25 at a time, infinite scroll later.

## Web reference (verified file:line)

- `app/javascript/pages/Emails/Published.tsx` — list table + side sheet
- `app/javascript/pages/Emails/Drafts.tsx`, `Emails/Scheduled.tsx` — same pattern, different scope
- `app/javascript/components/EmailsPage/Layout.tsx:21` — tabs (Published / Scheduled / Drafts / Subscribers)
- `app/javascript/components/EmailsPage/shared.tsx:102` — `EmailSheetActions` (View email, View post, Duplicate, Edit, Delete)
- `app/controllers/emails_controller.rb:18` (published), `:42` (scheduled), `:54` (drafts) — share `PaginatedInstallmentsPresenter`
- `app/presenters/installment_presenter.rb:16` — props shape (`sent_count`, `open_count`/`open_rate`, `click_count`/`click_rate`, `view_count`)

## Architecture choices

**Single mobile endpoint, type-filtered.** Web has three controller actions. Mobile collapses into one:
```
GET /mobile/emails?type=published|drafts|scheduled&page=1
```
Returns `PaginatedInstallmentsPresenter#props` shape minus the search branch (we skip ES). Implementation is a single mobile controller action.

**No web-style React Inertia.** Mobile renders a native `FlatList` with rows backed by TanStack Query. The query key is `["emails", type, page]`.

**Sheet on row tap** — uses existing `@rn-primitives/portal` + custom bottom sheet (or copy `audience-sheet.tsx` pattern). Stats grid + actions row.

**WebView for "View post"**:
- Render `<WebView source={{ uri: installment.full_url }} />` inside a new screen `app/post-webview.tsx`.
- Reuse the existing `BaseWebView` from `app/post/[id].tsx:20` (already wired with scroll-height messaging).
- For private posts (require purchase), this won't apply — installments don't gate on purchase. For followers-only posts the public URL still works for the seller themselves; for unauthenticated viewers they'd hit `/p/<slug>` and see the eligibility check.

**Comments inside WebView**: comments are rendered inline on `/p/<slug>` by `PostPresenter` — no extra work needed. The user can tap to write a comment and the WebView's iOS keyboard rises naturally. We'll inject a small CSS override to hide chrome (top nav, footer) so it feels in-app.

**Duplicate** — navigate to `/email-compose?copy_from=<external_id>`. Compose screen reads the param, calls a new `GET /mobile/emails/:id` endpoint to fetch the original, pre-fills state.

**Delete** — DELETE `/mobile/emails/:id` calls `installment.update(deleted_at: Time.current)`. UI: confirmation `Alert` (Sheet → Delete → "Are you sure?" → soft-delete → optimistic removal from list).

## Backend changes required

> Wave 7 already shipped `create` + `index` (Published only). Wave 8 extends the same controller.

1. **`Api::Mobile::EmailsController`** — add:
   - **Extend `index`** (GET `/mobile/emails`) to accept `type=drafts` and `type=scheduled` in addition to the Wave 7 `type=published` default.
   - `show` (GET `/mobile/emails/:id`) — returns single `InstallmentPresenter#props` for compose pre-fill (Duplicate + Edit).
   - `update` (PATCH `/mobile/emails/:id`) — server-side Save-as-draft. Body matches `create`. Returns the updated installment.
   - `preview` (POST `/mobile/emails/:id/preview`) — wraps `installment.send_preview_email`.
   - `destroy` (DELETE `/mobile/emails/:id`) — soft-delete via `update(deleted_at: ...)`.

2. **Routes** — extend `resources :emails`:
   ```ruby
   resources :emails, only: [:create, :index, :show, :update, :destroy] do
     collection { get :audience_options }
     member { post :preview }
   end
   ```

3. **Specs** — request specs for index (with each type), show, destroy. Include `404` for cross-seller access (Pundit guard via existing `authorize_creator!`).

## Mobile changes required

### Tab + screen (mostly extending what shipped)

> Wave 7 already shipped the Emails tab between Dashboard and Analytics, the top-right `+` button, the `FlatList` of rows, the row component, and the detail sheet on row tap. Wave 8 extends.

- **`app/(tabs)/emails.tsx`** — extend with:
  - Top tab bar (Published / Drafts / Scheduled) — three pills above the existing list. Published is the default. Swipe between is preferred but tap-only is acceptable.
  - `useInfiniteQuery` replaces the Wave 7 `useQuery` so the list scrolls past the first 25 rows.
  - Pull-to-refresh (already shipped).

- **`components/emails/email-detail-sheet.tsx`** — extend the existing sheet with the actions row: Duplicate, Edit, Delete. View post upgrades from `safeOpenURL` (system browser) to a `router.push("/post-webview?url=...")` (in-app authed WebView).

- **`components/emails/email-row.tsx`** — already shipped. No change.
- **`components/emails/use-emails-list.ts`** — TanStack Query hook for the index endpoint. Keyed by type.
- **`components/emails/use-delete-email.ts`** — mutation, optimistic removal.

### WebView screen

- **`app/post-webview.tsx`** — accepts `?url=...` param. Renders WebView. Header with Back button (X) and Share. Inject CSS to hide site chrome.

### Compose screen integration (Wave 7 dep)

- The compose modal already accepts a `copy_from` param. Wave 7 wires that to GET `/mobile/emails/:id`. Wave 8 just adds the navigation: Duplicate / Edit → `router.push(\`/email-compose?copy_from=\${id}\`)`.

## Tasks

### Backend (Rails)

- [ ] **R1**: Add `index`, `show`, `destroy` actions to `Api::Mobile::EmailsController`. Reuse `PaginatedInstallmentsPresenter` (with `query: nil`) and `InstallmentPresenter`.
- [ ] **R2**: Routes extension.
- [ ] **R3**: Request specs for all three actions, asserting cross-seller 404, soft-delete behavior, and that the index response shape matches mobile expectations.
- [ ] **R4**: Verify `InstallmentPresenter#props` doesn't leak any seller-private fields when consumed by the mobile client (`stripe_pk`, etc. — should already be safe, just audit).

### Mobile

- [ ] **M1**: Add Emails tab to `app/(tabs)/_layout.tsx`, scaffold `app/(tabs)/emails.tsx`.
- [ ] **M2**: Build top sub-tabs (Published / Drafts / Scheduled) — local state, single FlatList re-keyed on switch.
- [ ] **M3**: Build `EmailRow` and `EmailDetailSheet` components.
- [ ] **M4**: Build `useEmailsList` and `useDeleteEmail` hooks.
- [ ] **M5**: Wire row tap → open sheet; sheet actions: View post, Duplicate, Edit, Delete.
- [ ] **M6**: Build `app/post-webview.tsx` reusing `BaseWebView`. Wire "View post" → `router.push(\`/post-webview?url=\${full_url}\`)`.
- [ ] **M7**: Wire Duplicate + Edit → `router.push(\`/email-compose?copy_from=\${id}\`)`. Compose screen needs to handle this param — load original via GET, prefill all fields. (Coordinate with Wave 7's compose-state design.)
- [ ] **M8**: Wire Delete → `Alert.alert` confirm → mutation → optimistic remove.
- [ ] **M9**: Empty state: "You haven't sent any emails yet. **Compose your first** →"

### Verification

- [ ] **V1**: Open Emails tab → Published list shows the 3 seeded "Behind the scenes" emails + any from Wave 7 publishes.
- [ ] **V2**: Tap a row → sheet opens with stats + 5 actions.
- [ ] **V3**: View post → WebView loads `/p/behind-the-scenes-1` with comments visible. Type a comment, submit, see it appear.
- [ ] **V4**: Duplicate → compose modal opens pre-filled with title, body, audience.
- [ ] **V5**: Delete → confirmation → row disappears from list. Verify in Rails console: `Installment#deleted_at` set.
- [ ] **V6**: Switch to Drafts tab → see the draft you saved in Wave 7's V6.
- [ ] **V7**: Switch to Scheduled tab → see the scheduled email from Wave 7's V4.

### Testing

- [ ] **T1**: RSpec request specs (R3).
- [ ] **T2**: Maestro flow: open Emails tab → tap row → tap View post → WebView loads → close.
- [ ] **T3**: Maestro flow: open Emails tab → tap row → Duplicate → compose modal pre-filled.
- [ ] **T4**: Maestro flow: Delete → confirm → row removed.

### Codex review

- [ ] **C1**: After R1-R4 commits → `/codex review` on `gumroad-quick-update`.
- [ ] **C2**: After M1-M9 commits → `/codex review` on `gumroad-mobile`.

## Files to change (summary)

**Backend** (`gumroad-quick-update`):
| Path | Change |
|---|---|
| `app/controllers/api/mobile/emails_controller.rb` | + `index`, `show`, `destroy` |
| `config/routes.rb` | extend resources |
| `spec/requests/api/mobile/emails_spec.rb` | + index/show/destroy specs |

**Mobile** (`gumroad-mobile`):
| Path | Change |
|---|---|
| `app/(tabs)/_layout.tsx` | + Emails tab |
| `app/(tabs)/emails.tsx` | new |
| `app/post-webview.tsx` | new |
| `app/email-compose.tsx` | accept `copy_from` param, prefill via show endpoint |
| `components/emails/email-row.tsx` | new |
| `components/emails/email-detail-sheet.tsx` | new |
| `components/emails/use-emails-list.ts` | new |
| `components/emails/use-delete-email.ts` | new |
| `components/emails/use-email-detail.ts` | new (for show endpoint) |
| `.maestro/email-inbox.yaml` | new |

## Risks

- **WebView authentication**: the public `/p/<slug>` URL requires no session. Comments DO require login. We need to either (a) pass the seller's session cookie into the WebView, or (b) accept that View post is read-only and link to a compose-comment flow inside the app (heavier). Default to (a): inject `document.cookie` via `injectedJavaScriptBeforeContentLoaded` using the existing OAuth access token to derive a session.
- **Top tab UX**: native iOS apps usually use segmented controls, not pills. Use `SegmentedControl` (`@react-native-segmented-control/segmented-control`).
- **Stats accuracy**: `view_count` is `nil` for installments where `shown_on_profile=false` (per `InstallmentPresenter#props`). Render as "n/a" same as web.
- **Followers-only posts** in WebView: a follower-only post viewed by an unauthenticated browser shows an eligibility check page. The seller (logged in via session) should see the post. If we don't pass a session cookie, sellers can't preview their own followers-only posts via the WebView — flag to user.

## Cost extension (per user question)

Adding **Drafts + Scheduled** tabs on top of Published-only is roughly **+20%** of total wave effort because:
- Backend: 1 extra controller action (`index` is already type-filtered)
- Mobile: 1 segmented control + tab state, identical row/sheet UI
- The data shape is the same; the only difference is the type param

Skipping **Subscribers/Followers** is correct — it's a different page with totally different data (`Follower` model, not `Installment`). Wave 9 if ever.

## Estimated effort

3-5 days for one engineer. Slightly less than Wave 7 because most components are simpler (read-only mostly, single CRUD endpoint).

---

## E2E + Maestro setup (cross-cuts both Wave 7 and Wave 8)

This is the answer to "how do we check email sending actually works and HTML is properly passed?"

### Three-layer testing strategy

1. **Unit / request specs (RSpec, fast)** — Wave 7 R3 covers HTML round-trip. Test:
   ```ruby
   post "/mobile/emails", params: { installment: { name: "Hi", message: "<p>Body with <strong>bold</strong></p>", ... }, publish: true, idempotency_key: SecureRandom.uuid }
   expect(installment.message).to eq("<p>Body with <strong>bold</strong></p>")
   ```
   Asserts the exact HTML the mobile client sends arrives at the model unchanged.

2. **Maestro UI flow (medium)** — Wave 7 T2/T3 introduce Maestro. Each flow is a YAML file:
   ```yaml
   appId: com.antiwork.gumroadmobile
   ---
   - launchApp
   - tapOn: "+"
   - tapOn: { id: "Email title" }
   - inputText: "Maestro test #${MAESTRO_RUN_ID}"
   - tapOn: { id: "Editor" }
   - inputText: "Hello from automated test"
   - tapOn: "Publish"
   - tapOn: "Publish now"
   - assertVisible: "Email published"
   ```
   Run: `maestro test .maestro/compose-publish.yaml`. Captures screenshots + video on failure.

3. **End-to-end via real backend + post viewer** — Wave 8 V3 (View post in WebView). Compose+publish via Maestro → wait 3s → open Emails tab → tap published row → tap View post → assertVisible the title text + first 50 chars of the body. This proves the HTML actually travels mobile → Rails → ActiveRecord → public post page.

### "Does email actually send?" testing

In dev, **SendGrid is broken** (no creds). Two options for verification:

- **Mailpit** (recommended) — local SMTP catcher. Replace SendGrid in dev with a Mailpit adapter:
  ```ruby
  # config/environments/development.rb
  config.action_mailer.delivery_method = :smtp
  config.action_mailer.smtp_settings = { address: 'localhost', port: 1025 }
  ```
  Run `mailpit` → emails sent in dev appear in `localhost:8025`. Maestro tests assert the email arrives in Mailpit (HTTP API).

- **Skip and assert on the job queue** — `expect(SendInstallmentEmailJob).to have_been_enqueued.with(installment.id)` in RSpec. Gives confidence the send-path was triggered without actually delivering. Lower fidelity but no Mailpit dependency.

Pick Mailpit if we're willing to spend ~30 min on dev setup. Otherwise the queue assertion is enough for the ship gate.

### Maestro setup (one-time)

- [ ] Install: `curl -Ls "https://get.maestro.mobile.dev" | bash`
- [ ] Add `.maestro/config.yaml` with appId
- [ ] Document in `CONTRIBUTING.md`
- [ ] Add a CI step? Probably overkill for this sprint — manual local runs only for now.

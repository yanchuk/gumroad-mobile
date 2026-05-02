# Wave 8 — Mobile Email Inbox + WebView Post Viewer

> **Continues:** [`2026-05-02-wave-7-compose-parity.md`](./2026-05-02-wave-7-compose-parity.md) (composer parity).
>
> **Depends on:** Wave 7's `update` and `preview` endpoints, plus the new attachments and channel state already on each installment.
>
> **For agentic workers:** Use `superpowers:executing-plans` to drive this task-by-task.

## Goal

Build the mobile equivalent of `gumroad.dev/emails` — a list of the seller's emails grouped by status (Published / Drafts / Scheduled), with per-row stats sheet, View post in WebView, edit/delete/duplicate actions. This is the "see what I sent" half of the parity story; Wave 7 was the "compose" half.

The WebView post viewer (Task #27 from the original Wave 8 stub) is folded in here — when the user taps **View post** on a list row, we open `installment.full_url` in a `react-native-webview` so they can read + comment without leaving the app.

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

1. **`Api::Mobile::EmailsController`** — extend with:
   - `index` (GET `/mobile/emails`) — accepts `type` (`published`/`drafts`/`scheduled`), `page`. Returns paginated installments via `PaginatedInstallmentsPresenter` with `query: nil` (skip ES).
   - `show` (GET `/mobile/emails/:id`) — returns single `InstallmentPresenter#props` for compose pre-fill (Duplicate + Edit).
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

### New tab + screen

- **`app/(tabs)/_layout.tsx`** — add new tab "Emails" between Dashboard and Library. Total tabs: Dashboard / Analytics / **Emails** / Library.
  - Wave 6 delivered Dashboard FAB → email compose. Keep that, but ALSO offer Compose from this new tab via top-right header button.

- **`app/(tabs)/emails.tsx`** — new screen with:
  - Top tab bar (Published / Drafts / Scheduled) — three pills, swipeable preferred but acceptable to be tap-only (faster to ship).
  - `FlatList` of installment rows showing: Subject, Date, Stats (Emailed/Opened/Clicks/Views inline as small text).
  - Empty state with placeholder text + Compose CTA.
  - Pull-to-refresh.

- **`components/emails/email-row.tsx`** — single row of the list.
- **`components/emails/email-detail-sheet.tsx`** — bottom sheet shown on row tap; header with subject + close, stats grid, actions row (View post, Duplicate, Edit, Delete).
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

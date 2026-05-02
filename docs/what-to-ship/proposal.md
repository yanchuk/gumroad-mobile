# Proposal — what to ship in gumroad-mobile (v4, LOCKED)

**Status:** locked after multiple Codex reviews. Ship by Mon 2026-05-04.

## The pick

**Quick Update** — mobile authoring of email updates. Title + rich-text body (via `@10play/tentap-editor`, same Tiptap engine as web) + optional photo. No CTA, no audio/video, no scheduling.

> **Naming convention** — the artifact is an **email** everywhere in this plan (per help #169 *"Send email updates"*, web `EmailsController`, button "New email"). The mobile route `/post/[id]` and public URL `/p/<slug>` are the **profile-post channel rendering** of an email (toggleable via `shown_on_profile`). Code paths kept as-is: `EmailsController` (web compose), `PostsController#show` (Rails public viewer), `app/post/[id].tsx` (mobile viewer), `post_resend_api.rb` (delivery). Internal Rails model: `Installment`.

The 60-second demo: a creator publishes an email from their phone in 30 seconds → cut to a buyer's phone receiving the push that's *already wired up* → buyer taps → opens the email in the existing mobile viewer → buyer reads it.

It closes a loop that today is half-built: the email-delivery pipeline already pushes to consumers (`post_resend_api.rb:200-220`), the mobile app already routes those pushes to `/post/[id]` (`use-push-notifications.ts:65-78`), and the Rails `Installment` model + `SaveInstallmentService` already exist. **The only missing piece is the mobile authoring surface.** That's what we ship.

## Why this pick won

Codex review ruled out Apple Pay one-tap repurchase as a 3-day feature: no Stripe RN dependency, no native merchant entitlement, dense Order/Charge/Purchase service flow → ~2 weeks honest scope.

Codex also corrected an overclaim: full audio/video transcription is out of scope for 3 days. **Plain-text scope** (title + body + photo) is realistic and ships the same strategic story.

The strategic story:
- Mobile is Sahil's #1 named 2026 lever (`summary.md:29-32, 87-91`)
- Creator activation is the bottleneck (Sahil's theory-of-mind admission)
- Email is *"Gumroad's highest-value distribution channel"* (`meeting/06-ai-hot-takes-and-closing.md`)
- Mobile is good for short-form authoring; long-form essays are sit-down work
- Substack/Patreon/Twitter mobile own short-form authoring; Gumroad mobile doesn't have it

## What's verified shipped vs missing

**Already shipped (the loop's other half):**
- `post_resend_api.rb` and `post_sendgrid_api.rb` — email + push delivery on `Installment#publish`
- `PushNotificationWorker` with iOS / Android services
- Mobile push registers as `app_type: "consumer"` (`use-push-notifications.ts:29`)
- Mobile push handler deep-links by `installment_id` → `/post/[id]` (`use-push-notifications.ts:65-78`)
- Mobile email viewer (`app/post/[id].tsx`) — mostly native, inline WebView only for the HTML body
- Rails `Installment` + `SaveInstallmentService.perform` (`save_installment_service.rb:96-104`)

**What we add:**
- New Rails route + controller: `POST /api/mobile/emails` → `Api::Mobile::EmailsController#create` (mirrors web `EmailsController#create`) + `GET /api/mobile/emails/audience_options` (powers the audience picker)
- New Rails route + controller: `POST /api/mobile/direct_uploads` + `GET /api/mobile/s3_utility/cdn_url_for_blob` — thin mobile wrappers around web's existing pattern (`@rails/activestorage` `DirectUpload` + `s3_utility/cdn_url_for_blob`, see `EmailForm.tsx:312, 326`). Mobile asks `/api/mobile/direct_uploads` → returns ActiveStorage blob `signed_id` + S3 `direct_upload_url` + headers. Mobile PUTs bytes to S3. Mobile asks `/api/mobile/s3_utility/cdn_url_for_blob?key=<blob.key>` → returns stable CDN URL. Mobile uses CDN URL in `editor.setImage(...)` and `installment.files[].url`. **Reverted from earlier "Path 2" presigned-URL plan after devil-advocate review (F2):** raw presigned PUT URLs expire in 900s — embedding them in `<img src>` would 404 for buyers post-expiry, and `ProductFile#valid_url?` (`product_file.rb:80-86`) requires `S3_BASE_URL` prefix, which the CDN URL satisfies but raw S3 PUT URLs don't reliably match.
- New mobile screen: `app/email-compose.tsx` (creator compose modal: title + rich-text body + optional photo + audience picker)
- New mobile entry point: a Floating Action Button (FAB) on the Dashboard
- Photo upload via `expo-image-picker` → ActiveStorage direct-upload (mirrors web `EmailForm.tsx:312`): mobile asks `/api/mobile/direct_uploads` for blob + signed PUT URL → mobile PUTs bytes directly to S3 (Rails not in the byte path) → mobile asks `/api/mobile/s3_utility/cdn_url_for_blob?key=…` for the stable CDN URL → `editor.setImage(cdn_url)` inserts `<img>` into the rich-text body at cursor position. On publish, the same `cdn_url` is sent in `installment.files[].url` — `SaveFilesService` (`save_files_service.rb`) attaches the file. CDN URLs do not expire, so the buyer renders the photo correctly forever.
- AsyncStorage local draft persistence + restore banner (stores HTML directly via `editor.getHTML()` / `editor.setContent()`)
- **Rich-text body via `@10play/tentap-editor`** (Tiptap-on-RN — same engine as web's `EmailForm.tsx`). `editor.getHTML()` produces server-ready HTML; no client-side wrap/escape needed. Toolbar mirrors web's set: bold / italic / underline / strike / quote / link / image / headers / bulleted list / numbered list. **No Markdown** — both web and mobile send HTML. URLs in plain text still auto-link at render via server-side `Rinku.auto_link` (`post_email.html.erb:23`).

**What we expose in v1:**
- **Audience picker** — segments with `count > 0` shown as radio options (Everyone / Customers / Followers / Affiliates). Matches web's sidebar (screenshot). Defaults to `"audience"` (Everyone). Backed by new `GET /api/mobile/emails/audience_options` endpoint that wraps `Installment#audience_members_count` per segment.

**What we hardcode (matches web defaults — exposed as toggles in v1.5):**
- `send_emails: true`
- `shown_on_profile: true` (web's "Post to profile" toggle, ON by default)
- `allow_comments: true`
- Schedule (web has `Publish now` / `Schedule` split — v1 = publish now only; `to_be_published_at` already supported server-side, mobile date picker is a Sunday-morning stretch)

## Tech compatibility (Expo SDK 55, verified against `package.json` + `app.config.ts`)

The project ships on Expo SDK 55, RN 0.83.5, React 19.2.0. **Most of our deps are already installed** — net new is small.

| Already installed (reuse, no work) | Net new (`npx expo install`) |
|---|---|
| `react-native-webview 13.16.0` (TenTap dep — satisfied) | `@10play/tentap-editor` |
| `expo-dev-client ~55.0.19` (project ships custom builds — TenTap fits the pipeline; no Expo Go gymnastics) | `expo-image-picker` |
| `expo-crypto ~55.0.10` (UUID for idempotency key) | `@react-native-async-storage/async-storage` |
| `expo-haptics ~55.0.9` (FAB tap + publish success/error) | |
| `expo-image ~55.0.6` (any non-editor image rendering) | |
| `@tanstack/react-query 5.90.16` (v5 — `isPending` for mutations, `useMutation` for publish, `useQuery` via `useAPIRequest`) | |
| `react-native-safe-area-context ~5.6.0` (existing pattern) | |
| `expo-secure-store ~55.0.9` (token storage; used by auth context) | |
| `experiments.reactCompiler: true` (skip unnecessary `useCallback`/`useMemo`) | |
| `experiments.typedRoutes: true` (typed `router.push("/email-compose")`) | |

**Existing primitives to reuse (NOT reinvent):**
- `request<T>` / `requestAPI<T>` helpers (`lib/request.ts:15-78`) — handle 401, 403, 404, AbortController, 30s timeout, Sentry breadcrumbs, `mobile_token` + Bearer auth automatically
- `useAPIRequest<T>({ url, queryKey })` hook (`lib/request.ts:80-96`) — wraps `useQuery` with auto-logout on 401. **`useAudienceOptions()` is a one-liner using this hook.**
- `<Stack.Screen>` modal registration in `app/_layout.tsx:61-78` — add `<Stack.Screen name="email-compose" options={{ presentation: "modal", title: "New email" }} />` and the route is wired
- `<Screen>` wrapper component (used throughout, e.g. `app/post/[id].tsx:7`)
- `useCSSVariable(["--color-foreground", "--color-body-bg", "--font-sans"])` (`app/post/[id].tsx:112`) — feeds Uniwind theme tokens to TenTap's `editor.injectCSS()` for dark mode
- `Sentry.captureException` + breadcrumbs everywhere (existing pattern across `auth-context.tsx`, `[id].tsx`, etc.)
- `safeOpenURL` (`lib/open-url.ts`, used in `app/post/[id].tsx:229, 233`) for "Learn more" links

**Best-practice corrections to v1 plan from this audit:**
1. **Don't wrap TenTap `<RichText>` in `<KeyboardAvoidingView>`** — TenTap's `avoidIosKeyboard: true` config handles it. Only the title `<TextInput>` needs manual avoidance.
2. **Use TanStack Query v5 idioms.** Mutations: `isPending`, not `isLoading`. Queries: `isLoading` is still correct.
3. **Add `expo-haptics` triggers:** FAB tap (`Medium impact`), publish success (`Success notification`), 422 error (`Error notification`).
4. **Use `process.env.EXPO_OS`** not `Platform.OS` for any platform branch (Expo SDK 55 pattern).
5. **`<Text selectable>` on error banners** — error reasons may need to be quoted in support tickets.
6. **`expo-image` for any thumbnail rendering** outside the editor; `<img>` is forbidden (rendered only inside the editor's internal WebView).
7. **`{ borderCurve: 'continuous' }` for rounded corners** (FAB, banners). Native iOS rounding curve.
8. **`boxShadow` style prop**, NOT legacy `shadow*` props.

## Implementation alignment matrix

Every major decision in this plan, mapped to the best practice it follows + the file:line in the existing codebase that proves the idiom is already in use.

### Mobile-side decisions

| Decision | Best practice / pattern | Reference (existing in repo) |
|---|---|---|
| **Composer at `app/email-compose.tsx`, presented as Stack modal** | Expo Router modal preset (`presentation: "modal"`); registered in root `_layout.tsx` Stack | `app/_layout.tsx:61-78` (existing Stack.Screen entries: `purchase/[token]`, `post/[id]`, `pdf-viewer`) |
| **TenTap `useEditorBridge` + `<RichText>` + customized `<Toolbar>`** | TenTap official integration (`avoidIosKeyboard: true`, `bridgeExtensions: [...TenTapStartKit, PlaceholderBridge, LinkBridge]`) | TenTap docs verified via ctx7; `react-native-webview 13.16.0` already in repo (`package.json:92`) |
| **Toolbar items pinned (B / I / U / strike / quote / link / image / headers / bulleted / numbered)** | Drop unused bridges from default `<Toolbar>` (no Code/TaskList/Color/Highlight) — match web `EmailForm.tsx` exactly | Web toolbar evidence: screenshot 3 (Text dropdown shows: Text/Header/Title/Subtitle/Bulleted/Numbered/Code) |
| **Dark-mode CSS injection: `editor.injectCSS(...)` with Uniwind tokens** | Inject Uniwind `--color-*` vars into the editor's internal WebView, mirroring how `app/post/[id].tsx:112-127` does font-injection | `app/post/[id].tsx:112` uses `useCSSVariable(["--color-foreground", "--color-body-bg", "--font-sans"])` for the same purpose |
| **Audience picker as bottom-sheet** | Reuse existing `<Sheet>` + `<SheetHeader>` + `<SheetTitle>` + `<SheetContent>` | `components/ui/sheet.tsx` (existing primitive) — same pattern as Settings sheet |
| **Photo flow = ActiveStorage direct-upload (Path A, F2 fix)** | Mirror web `EmailForm.tsx:312` (`new DirectUpload(file, Routes.rails_direct_uploads_path())`) + `EmailForm.tsx:326` (`Routes.s3_utility_cdn_url_for_blob_path({ key })`) — wrapped in mobile namespace endpoints | Web reference verified at `gumroad/app/javascript/components/EmailsPage/EmailForm.tsx:3, 312, 326` |
| **Image picking via `expo-image-picker`** | `npx expo install expo-image-picker` (SDK 55 picks compat version); `launchCameraAsync` / `launchImageLibraryAsync` | Expo skill confirms native API; `app.config.ts:38-134` is where the plugin entry goes |
| **Audience options fetch via `useAPIRequest({ url, queryKey })`** | Reuse the project's existing query hook — handles 401 auto-logout, 403/404 throwing, `mobile_token` + Bearer auth, Sentry, AbortController, 30s timeout | `lib/request.ts:80-96` — one-line: `useAPIRequest({ url: "/mobile/emails/audience_options", queryKey: ["audience_options"] })` |
| **Publish via `useMutation` from TanStack Query v5** | v5 idiom: `mutation.isPending` (not `isLoading`); `mutation.mutate(payload)`; `onSuccess`/`onError` callbacks; `queryClient.invalidateQueries({ queryKey: ["audience_options"] })` after publish (audience may have changed) | `package.json:48` confirms `@tanstack/react-query 5.90.16`. Project doesn't have a mutation example yet — this PR introduces the first canonical mutation pattern |
| **AsyncStorage drafts via `@react-native-async-storage/async-storage`** | Community package (RN core's `AsyncStorage` is removed); SDK 55-compatible version via `npx expo install`. Stored as `JSON.stringify({ html, title, photoMeta, idempotencyKey, savedAt })` | Expo skill: "Never use modules removed from React Native such as AsyncStorage". Community package is the SDK 55-compliant replacement. |
| **Idempotency key via `expo-crypto.randomUUID()`** | Already-installed dep (`package.json:56`) — no new install | `expo-crypto ~55.0.10` |
| **Restore draft banner = `<Card>` with Continue/Discard buttons** | Reuse `<Card>` from `components/ui/card` + `<Button>` variants `default` + `ghost` | Existing primitives |
| **Dashboard FAB** | `<Pressable>` positioned `absolute bottom-24 right-4`, 56pt circle, `bg-accent`, `borderCurve: 'continuous'`, `boxShadow`, `expo-haptics.impactAsync(Medium)` on press | Skill guidelines: `borderCurve`, `boxShadow`, haptics. CLAUDE.md: use `bg-accent` (named color, not `bg-pink-500`) |
| **Eligibility banner — proactive on mount + reactive on 422** | New `<Banner variant="error">` component (~50 LOC). `<Text selectable>` on the reason copy. "Learn more" link via `safeOpenURL` | `lib/open-url.ts` (existing safeOpenURL) — same pattern as `app/post/[id].tsx:229` |
| **Sentry breadcrumbs at every async path** | `Sentry.addBreadcrumb({ category: "installment", message: "publish.attempt", data: { title_length, body_length, has_photo } })` + `Sentry.captureException(error)` on failure | Existing pattern across `auth-context.tsx:53, 99, 132, 142, 174, 198`, `app/post/[id].tsx:126, 159, 191` |
| **Haptics: FAB tap, publish success, publish error** | `expo-haptics.impactAsync(Medium)` for FAB; `notificationAsync(Success)` for 2xx; `notificationAsync(Error)` for 422 | `expo-haptics ~55.0.9` already installed (`package.json:60`) — net new code is 3 one-liners |
| **`<Text selectable>` on error banners** | Skill guideline: "Add the `selectable` prop to every `<Text/>` element displaying important data or error messages" | Skill: building-native-ui §Text Styling |
| **Typed routes: `router.push("/email-compose")`** | Project has `experiments.typedRoutes: true` (`app.config.ts:136`) — typed route paths get autocomplete + compile-time check | `app.config.ts:135-138` |
| **React Compiler: skip manual `useCallback`/`useMemo` for most handlers** | `experiments.reactCompiler: true` (`app.config.ts:137`) — only manually memoize callbacks that cross context boundaries (like `auth-context.tsx` does for context value) | `app.config.ts:137` |

### Rails-side decisions

| Decision | Best practice / pattern | Reference |
|---|---|---|
| **`Api::Mobile::EmailsController` inherits `Api::Mobile::BaseController`** | Inherits dual auth (`check_mobile_token` + `current_resource_owner`) automatically | `app/controllers/api/mobile/base_controller.rb:1-22` |
| **`before_action { doorkeeper_authorize! :creator_api, :mobile_api }`** (F3) | Every existing mobile controller declares this explicitly | `purchases_controller.rb:4` (`doorkeeper_authorize! :mobile_api`); `devices_controller.rb:4`; `sales_controller.rb:5` |
| **`before_action { authorize Installment }`** (F4 — Pundit) | Web's `EmailsController#create` uses `authorize Installment` (`emails_controller.rb:93-96`); we mirror it via Pundit's role check (`InstallmentPolicy#create?` requires `role_admin_for?` or `role_marketing_for?`) | `gumroad/app/policies/installment_policy.rb:13-16` |
| **`seller = current_api_user`** (NOT `current_resource_owner`) | F4 — disable team-member impersonation by default for v1; matches web `EmailsController#save_installment` defaulting to `current_seller` | `gumroad/app/controllers/sellers/base_controller.rb` (Sellers::BaseController defines `current_seller`) |
| **Idempotency: 3-state Redis pattern (in-flight sentinel + final id + 409 retry)** (F5) | New pattern not in any existing service; closest precedent is `User::CreateAdminCommentService:15, 25` | New code, ~50 LOC |
| **Rack::Attack throttle: 5 req/min/IP for `/api/mobile/emails`** (F12) | Mirror existing pattern in `config/initializers/rack_attack.rb:132-133` (purchases/index throttle) | New rule, ~5 LOC |
| **ActiveStorage direct-uploads wrapper at `Api::Mobile::DirectUploadsController`** (F2) | Wrap `ActiveStorage::DirectUploadsController#create` with mobile auth — same pattern as how web uses `Routes.rails_direct_uploads_path()` | `gumroad/app/javascript/components/EmailsPage/EmailForm.tsx:312` confirms web uses this exact path |
| **CDN URL helper wrapper at `Api::Mobile::S3UtilityController#cdn_url_for_blob`** (F2) | Wrap `S3UtilityController#cdn_url_for_blob` (`app/controllers/s3_utility_controller.rb:22-29`) with mobile auth | `gumroad/app/controllers/s3_utility_controller.rb:22-29` |
| **`SaveInstallmentService.perform` (reuse, not fork)** | Single source of truth for installment publish — content moderation, eligibility check, scheduling, audience filters all built in | `gumroad/app/services/save_installment_service.rb` |
| **`audience_options` returns `eligibility` object** (S12 + F6) | Computes `seller.eligible_to_send_emails?` once at composer mount; eligibility reason strings come from server (not client) | `gumroad/app/models/user.rb:974-980` |
| **Demo seed patch (F1)** | Bump `mobile_seller1.sales_cents_total >= 10_000` cents + create `Payment` record so `has_completed_payouts? == true` | `gumroad/db/seeds/030_development/mobile_app_test_data.rb:62-99` |

### What we're explicitly NOT doing (would diverge from best practice)

- ~~Custom AsyncStorage abstraction~~ — use community package directly with simple `getItem`/`setItem`
- ~~Custom WebView for the editor~~ — use TenTap's `<RichText>`, don't reinvent
- ~~Custom mutation hook abstraction~~ — `useMutation` directly with `requestAPI` as the `mutationFn`
- ~~Manual token refresh logic~~ — `useAPIRequest` already handles 401 → auto-logout (existing pattern)
- ~~Custom date picker for schedule~~ — schedule deferred to v1.5
- ~~Custom modal component~~ — `presentation: "modal"` on Stack.Screen (Expo Router primitive)
- ~~Custom action sheet for photo source~~ — `Alert.alert` (native iOS pattern, already used in repo)
- ~~Custom image renderer~~ — `expo-image` for any out-of-editor thumbnails
- ~~Custom keyboard avoidance for the editor~~ — TenTap's `avoidIosKeyboard: true`

## Honest scope (3 days + 1 polish day)

| Day | Deliverable |
|---|---|
| **Thu 2026-05-01** | Rails: `Api::Mobile::EmailsController#create` wraps `SaveInstallmentService.perform`; idempotency-key cache; ActiveStorage direct-upload endpoint verification; RSpec coverage. |
| **Fri 2026-05-02** | Mobile: `app/email-compose.tsx` composer + photo picker → S3 → publish JSON. AsyncStorage drafts. Dashboard FAB entry. End-to-end on simulator: type email → publish → push lands → buyer opens email viewer. |
| **Sat 2026-05-03** | Polish — empty states, error banners (5xx + content moderation), inline field errors, Maestro E2E happy path. Demo data already exists (`mobile_seller1_do_not_edit@gumroad.com` + `mobile_buyer_do_not_edit@gumroad.com` per `db/seeds/030_development/mobile_app_test_data.rb`). Capture footage. |
| **Sun 2026-05-04** | Edit 60s video. Write cover note. Open Rails PR + mobile branch, cross-linked. Send by morning. |

## File-level plan

### Rails (`gumroad`)

```
config/routes.rb                                  # add (inside mobile scope):
                                                  #   resources :emails, only: [:create] do
                                                  #     collection { get :audience_options }
                                                  #   end
                                                  #   post "direct_uploads", to: "direct_uploads#create"
                                                  #   get  "s3_utility/cdn_url_for_blob",
                                                  #        to: "s3_utility#cdn_url_for_blob"
app/controllers/api/mobile/emails_controller.rb   # NEW — #create wraps SaveInstallmentService.perform
                                                  #       #audience_options returns segments + counts + eligibility
                                                  #   - before_action { doorkeeper_authorize! :creator_api, :mobile_api }   (F3)
                                                  #   - before_action { authorize Installment }                              (F4)
                                                  #   - seller assignment uses current_api_user (NOT current_resource_owner) (F4)
app/controllers/api/mobile/direct_uploads_controller.rb # NEW — wraps ActiveStorage::DirectUploadsController#create
                                                        #   with mobile_token + OAuth Bearer auth (~20 LOC)
app/controllers/api/mobile/s3_utility_controller.rb     # NEW — wraps S3UtilityController#cdn_url_for_blob
                                                        #   for the mobile namespace (~15 LOC)
spec/requests/api/mobile/emails_create_spec.rb    # RSpec for #create
spec/requests/api/mobile/emails_audience_options_spec.rb  # RSpec for #audience_options
spec/requests/api/mobile/direct_uploads_create_spec.rb    # RSpec for direct_uploads#create
spec/requests/api/mobile/s3_utility_cdn_url_spec.rb       # RSpec for s3_utility#cdn_url_for_blob
db/seeds/030_development/mobile_app_test_data.rb  # PATCH: bump mobile_seller1 to ≥$100 in sales +
                                                  #   create one completed Payment so eligible_to_send_emails? = true (F1)
# (existing api/mobile/installments_controller.rb#show stays as-is for buyer reads)
```

The `create` action wraps `SaveInstallmentService.perform` with mobile-friendly defaults:
- Body shape: `{ installment: { name, message, installment_type: <picker_value>, shown_on_profile: true, send_emails: true, allow_comments: true, files: [{ external_id, position, url, stream_only: false }] }, publish: true, idempotency_key: <uuid> }`
- `installment_type` is sent by the mobile picker; valid values: `audience` / `seller` / `follower` / `affiliate` (mirrors web's `audienceType`)
- No `call_to_action_*` fields — `SaveInstallmentService.installment_attrs` permits only `[:name, :message, :shown_on_profile, :allow_comments]`. Web's modern composer also doesn't set these (uses Tiptap UpsellCard inside `message`). Mobile defers CTA to v1.5.
- Idempotency key cached in Redis 60min: `idempotency:installment:#{seller_id}:#{key}` → installment_id

The `audience_options` action returns the picker's data + the seller's eligibility status (one round-trip):
- Iterates `[audience, seller, follower, affiliate]`, calling `Installment#audience_members_count` for each (using a stub installment with that `installment_type`)
- Filters out segments with `count == 0` (except Everyone, always shown — mirrors web behavior in screenshot 1: only "Everyone" visible when seller has no segmented audience)
- Calls `seller.eligible_to_send_emails?` (`user.rb:974-980`) — gates: not suspended + `sales_cents_total >= $100` (`MINIMUM_SALES_CENTS_VALUE`) + `has_completed_payouts?`
- Response shape:
  ```json
  {
    "options": [{ "type": "audience", "label": "Everyone", "count": 437 }, ...],
    "eligibility": {
      "can_send_emails": true,
      "reason": null,
      "learn_more_url": null
    }
  }
  ```
- When ineligible, mobile composer opens normally but shows a sticky banner with the reason + Learn-more link, and disables the Publish button. Creator can still compose/edit (useful once server-side drafts arrive in v1.5). Server-side check at publish (S12) remains the safety net for race conditions.

### Mobile (`gumroad-mobile`)

```
app/email-compose.tsx                             # NEW — composer screen (creator-side, modal)
app/(tabs)/dashboard.tsx                          # add FAB entry-point
components/email-compose/                         # NEW — composer components, photo picker, hooks
components/email-compose/rich-text-body.tsx       # NEW — TenTap RichText + Toolbar wrapper, dark-mode CSS injection
components/email-compose/audience-sheet.tsx      # NEW — bottom-sheet audience picker
components/email-compose/use-publish-email.ts     # NEW — react-query mutation w/ idempotency
components/email-compose/use-photo-upload.ts      # NEW — ActiveStorage direct-upload to S3 → editor.setImage
components/email-compose/use-email-draft.ts       # NEW — AsyncStorage draft persistence (stores HTML)
components/email-compose/use-audience-options.ts  # NEW — react-query for GET /api/mobile/emails/audience_options
components/ui/banner.tsx                          # NEW — error banner (mirrors web Fieldset state="danger")
package.json                                      # add: @10play/tentap-editor, react-native-webview, expo-image-picker, @react-native-async-storage/async-storage, expo-crypto
app.config.ts                                     # add: expo-image-picker plugin (camera + photo permissions)
lib/auth-context.tsx                              # REVERT the dev hack at line 208 (`isCreator: true,`) before PR
```

### Tests

- Rails: `RSpec` for controller create — happy, missing fields, unauthorized, audience defaults, idempotency hit/miss, content-moderation rejection, eligibility 422
- Mobile: lightweight RTL test of composer (validation states + submit + draft restore)
- Maestro E2E: happy-path quick-update (`.maestro/quick-update-happy-path.yaml`)

## Demo (60-second video script)

```
0-5s    Black screen, voice: "70% of Gumroad traffic is mobile.
        Under 50% of GMV is. Today the mobile app reads;
        it doesn't create."
5-15s   Creator's phone, walking. Open Gumroad. Tap FAB.
        Type "Behind the scenes of next week's drop".
        Snap a photo.
        Tap Publish.
15-25s  Cut to subscriber's phone. Push lands:
        "Behind the scenes of next week's drop — By Mobile Seller 1"
        Tap. Email opens in mobile viewer. Photo. Body.
25-40s  Voiceover: "Email is Gumroad's highest-value
        distribution channel — Sahil's words. The push
        pipeline was already wired. The email viewer was
        already shipped. The Installment model existed.
        The only missing piece was a 60-second email
        composer on the phone. So I shipped it."
40-50s  Cut to GitHub diff: ~150 LOC Rails (1 controller +
        1 spec) + ~700 LOC mobile (1 screen + 4 hooks).
50-60s  PR + branch + deploy URLs on screen.
```

## Cover note

> Email is Gumroad's highest-value distribution channel — Sahil himself said so. The web has a full composer (`EmailsController` / "New email" / Tiptap rich-text + audience picker + scheduling + drafts). The mobile app is a 4.7★ buyer library plus a read-only sales dashboard — based on repo evidence, no creator-authoring endpoint exists. This PR adds the first credible mobile slice: a deliberately small title + plain-text body + photo composer that publishes through the existing `SaveInstallmentService`, fires the push pipeline that was already wired, and lands in the email viewer that was already shipped. **It does not replace the web workflow** — the full composer's audience targeting, scheduling, rich text, and drafts stay on web. It exercises the missing creator-authoring path on mobile so Sahil's stated #1 mobile lever (creator activation) has a credible starting point. — [PR · branch · video]

> **Honest framing note:** I did not find public creator requests for mobile email composition specifically (the search wasn't exhaustive). The case for shipping is workflow-gap-based, not demand-driven: the email channel is Gumroad's most valuable, the mobile app has zero creator authoring today, and the smallest credible slice is title + body + photo via the existing pipeline. If creators actually want this on mobile, they get it; if they don't, the slice is small enough not to bloat the codebase. v1.5 (rich text, scheduling, audience picker) waits until usage data justifies it.

## Hidden risks (accepted) — updated post devil-advocate review

| Risk | Mitigation |
|---|---|
| `isCreator: true` dev hack in `lib/auth-context.tsx:208` | **REVERT before PR.** Tracked as DoD checklist item. |
| **F1 BLOCKER — Demo seller currently INELIGIBLE.** `mobile_seller1` has only one $5 sale in seed (`mobile_app_test_data.rb:96`). `eligible_to_send_emails?` requires `sales_cents_total >= $100` AND `has_completed_payouts?`. Without fix, the demo cannot publish. | **Patch the seed Day 1.** Add ~20 more $5 purchases from synthetic buyers (or one $100+ purchase) to bring `mobile_seller1.sales_cents_total >= 10_000` cents. Add a successful `Payment` record for `mobile_seller1` so `has_completed_payouts?` returns true. Verify `seller.eligible_to_send_emails? == true` in console before recording. |
| Demo needs a seller with a customer so push fires | After F1 patch: `mobile_seller1` (eligible) + `mobile_buyer` (subscriber) — already wired by seed. ⚠️ Seed file warns *"Logging in as these users may break test expectations"* — re-seed before/after demo or use throwaway clones. |
| **F7 — Flagged-but-not-suspended sellers can publish via mobile.** `eligible_to_send_emails?` (`user.rb:974-980`) only checks `suspended?` (i.e. `suspended_for_fraud` / `suspended_for_tos_violation`). It does NOT block `flagged_for_fraud`, `flagged_for_tos_violation`, `on_probation`, or `not_reviewed`. | **Inherited web behavior**, not introduced by mobile. If T&S wants flagged accounts blocked, that's a separate Rails change to `eligible_to_send_emails?` affecting both surfaces. Documented; not fixed in this PR. |
| **F8 — Mobile email viewer doesn't render Tiptap UpsellCards.** `app/post/[id].tsx:266-284` injects raw HTML into a WebView; `<upsell-card>` custom elements render as invisible. Web-authored emails containing UpsellCards will have an empty space where the CTA should be. | **Pre-existing mobile bug**, not a Quick Update regression. v1 mobile composer doesn't insert UpsellCards. Document as out of scope; fix in v1.5 alongside server-side drafts and editor parity. |
| **F9 — `shown_on_profile: true` without sections.** Mobile hardcodes `shown_on_profile: true` but never sends `shown_in_profile_sections`. Result: post is published "as profile post" but appears at `/p/<slug>` only — NOT on the creator's profile homepage (no section assignment). Web warns about this; mobile suppresses the warning. | Accepted for v1: the demo path uses push + tap → email viewer (renders by id, not via profile homepage). Document in `ui-plan.md` hardcoded values table. v1.5 fetches `seller.seller_profile_posts_sections` via `audience_options` and auto-includes the first section. |
| APNs production cert | Demo uses Expo dev push or a real provisioned device. Sandbox push works on simulator. |
| `Installment` validation surface is dense (`installment.rb:81-85, 860-911`) | Mobile composer pre-validates: title length (≤255), body required. Server returns 422; mobile renders inline field errors (mirrors web `Fieldset state="danger"`). |
| Content moderation on publish (`installment.rb:860-911`) | Honor it — render banner on rejection, preserve compose state. Demo content is benign. |
| Photo upload pipeline | ActiveStorage direct-upload — same path web uses for installment files. Verify endpoint signature on Day 1. |
| **F5 — Idempotency design with TOCTOU race.** Naive SETNX-after-success has two failure modes: (a) cache write fails after publish → retry creates a duplicate Installment + duplicate push fan-out; (b) service raises mid-flow → cache holds an empty key. | **Use in-flight sentinel + 409 retry.** On entry: `SETNX idempotency:installment:{seller_id}:{key} "in_flight" EX 3600`. If it already exists with `"in_flight"`, return **409 Conflict** (publish in progress, please wait). After successful `SaveInstallmentService.perform`: `SET` the key to the new `installment_id` with the same TTL. On retry of an existing `installment_id` cache hit: return the original 2xx response. ~50 LOC including spec for the race scenarios. |
| **F12 — No rate limit on `/api/mobile/emails`.** `config/initializers/rack_attack.rb` only throttles `/api/mobile/purchases/index`. A malicious client with distinct idempotency keys could flood `SaveInstallmentService.perform`, each enqueuing `SendPostBlastEmailsJob`. | Add a Rack::Attack rule mirroring the purchases pattern: throttle `/api/mobile/emails` to 5 requests / 60 seconds per IP. ~5 LOC initializer change. |
| Android push asymmetry (`push_notification_service/android.rb:16-20`) | Demo on iOS only. Note Android parity as v1.5 follow-up in cover note. |
| Stripe RN dependency, Apple Pay, AI | **Not in scope** for v1. |
| `@10play/tentap-editor` is WebView-based (Tiptap inside RN-WebView) — bundle adds ~1-2 MB; keyboard / paste / focus edge cases possible | Mitigated by `avoidIosKeyboard: true` config, `autofocus`, and stable lib (High reputation, 215 ctx7 snippets). Day-2 buffer absorbs WebView quirks. Fallback to plain `<TextInput>` if editor breaks demo recording — `editor.getHTML()` swap is one function call. |

## Day-1 decision gate

End of Thursday, verify:
1. Does the Rails `create` action succeed end-to-end with a mocked photo URL?
2. Does the resulting `Installment#publish` fire push to a registered consumer device?
3. Does the existing mobile email viewer render the resulting email correctly?

If all 3 = yes, full speed Friday on the composer UI. If any = no, narrow further (drop photo first, then drop draft persistence). The smallest shippable version is text-only-no-photo — still tells the same story.

## What we're explicitly NOT doing

- Audio / video upload + transcription (deferred to v2)
- AI-generated titles or summarization (deferred to v2)
- ~~Rich text body / formatting~~ → **moved to v1** (`@10play/tentap-editor`, Tiptap-on-RN — same engine as web)
- CTA button (web uses Tiptap UpsellCard inside `message`; mobile editor lacks the UpsellCard extension → defer to v1.5)
- ~~Audience picker UI~~ → **moved to v1** (sheet w/ radio + counts; mirrors web sidebar from screenshot 1)
- Channel toggles ("Post to profile" / Email-only) — hardcoded both ON (sends as email + profile post)
- Allow comments toggle — hardcoded ON
- Schedule for later — hardcoded publish-now (server already supports `to_be_published_at`)
- Audience filters (bought / not-bought, paid more/less, date range, country) — hidden
- Editing existing installments — creation only
- Subscriber commenting from mobile — separate feature (Reply Inbox shape)
- Apple Pay, Stripe RN, mobile checkout — separate feature
- Customer list / Refunds parity (#62/#63) — separate roadmap items

## What I'm asking from you

1. **Confirm the lock.** Quick Update is the pick. ✅ / ✗
2. **Approve the dev hack revert** in `lib/auth-context.tsx:207` before the PR opens.
3. **Cover-note voice:** the draft above is honest to web's reality. Want it tightened, more personal, more aligned with how you actually talk?

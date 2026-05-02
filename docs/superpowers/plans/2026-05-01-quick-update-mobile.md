# Quick Update — Mobile Email Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a mobile email-update composer for `gumroad-mobile` (title + rich-text body + photo + audience picker) that publishes through Gumroad's existing `Installment` pipeline. Deadline Mon 2026-05-04 (hiring submission to Antiwork).

**Architecture:** Thin Rails wrappers around existing services (`SaveInstallmentService`, `ActiveStorage`, `S3UtilityController#cdn_url_for_blob`) inside the `/api/mobile/*` namespace, gated by `mobile_token` + Doorkeeper Bearer + Pundit. Mobile composer uses `@10play/tentap-editor` (Tiptap-on-RN — same engine as web) inside an Expo Router modal screen, fetches audience options + eligibility on mount via the existing `useAPIRequest` hook, publishes via `useMutation` with Redis-backed idempotency.

**Tech Stack:**
- **Rails:** Ruby on Rails (existing app), `SaveInstallmentService`, `ActiveStorage`, Doorkeeper, Pundit, Rack::Attack, Redis, RSpec
- **Mobile:** Expo SDK 55, RN 0.83.5, React 19.2.0, expo-router 55 (modal Stack screen), TanStack Query v5, `@10play/tentap-editor`, `expo-image-picker`, `@react-native-async-storage/async-storage`, `expo-crypto`, `expo-haptics`, Uniwind/Tailwind, Sentry

**Source-of-truth specs:**
- `gumroad-mobile/docs/what-to-ship/proposal.md`
- `gumroad-mobile/docs/what-to-ship/user-stories.md`
- `gumroad-mobile/docs/what-to-ship/ui-plan.md`
- `gumroad-mobile/docs/what-to-ship/context.md`

**Devil-advocate findings folded in:** F1 (demo seed), F2 (ActiveStorage direct-upload, NOT presigned PUT), F3 (Doorkeeper scope), F4 (Pundit + no team-member impersonation), F5 (3-state idempotency cache + 409), F6 (soft cap reactive), F7 (flagged-but-not-suspended documented), F8/F9 (UpsellCard / profile sections — accepted), F10 (nil-name push), F12 (Rack::Attack).

---

## ⚠ Plan corrections (applied 2026-05-01 after Wave 2 grounding)

The plan was reviewed against the actual repo state by 4 parallel sonnet verifiers + 1 Wave 2 implementation pass. The corrections below are folded into the relevant task sections; this section is the audit log.

**Backend (Rails) — apply to every spec and any future task touching these surfaces:**

| # | Plan said | Reality | Applies to |
|---|---|---|---|
| B1 | `require "rails_helper"` | `require "spec_helper"` (no rails_helper.rb in repo) | All RSpec files |
| B2 | `create(:oauth_access_token, ...)` | `create("doorkeeper/access_token", ...)` (string factory name) | Tasks 3, 4, 5, 6, 7 |
| B3 | URL `/api/mobile/...` | URL `/mobile/...` (host-based API; `scope module: "api"` adds module only, not path) | Tasks 3, 4, 6, 7 specs |
| B4 | (no host setup) | Add `before { host! VALID_API_REQUEST_HOSTS.first }` so `ApiDomainConstraint` matches in test env | Tasks 3, 4, 5, 6, 7 specs |
| B5 | `GlobalConfig.get("MOBILE_TOKEN")` | `Api::Mobile::BaseController::MOBILE_TOKEN` (canonical, no DB/config round trip) | All mobile-API specs |
| B6 | `create(:user, :compliant)` | `create(:user, user_risk_state: "compliant")` (no `:compliant` trait on user factory) | Tasks 3, 4, 6, 7 |
| B7 | `doorkeeper_authorize! :creator_api, :mobile_api` | `doorkeeper_authorize! :mobile_api` only — Doorkeeper 5.7.1 scopes are **OR** semantics (`includes_scope?` uses `.any?`), so listing both is more permissive than intended. Use `:mobile_api` and let Pundit gate the creator role. | Task 7 emails create + audience_options controllers |
| B8 | `SaveInstallmentService.new(...).perform` returning `{success:, installment:}` | Method is `#process`, returns boolean; instance exposes `installment` attr | Task 7 controller |
| B9 | `Rack::Attack.throttle(...) do ... end` | Use the codebase's wrapper: `throttle_by_ip path: "/mobile/emails", requests: 5, period: 60.seconds` (see `config/initializers/rack_attack.rb` line 132 for existing `mobile/purchases` example) | Task 8 |
| B10 | Task 2 routes additions | Routes for `direct_uploads`, `s3_utility/cdn_url_for_blob`, and `emails`/`audience_options` are **already present** in `config/routes.rb` (lines 253-259). Verify and skip. | Task 2 |
| B11 | `installment.installment_mobile_json_data` | Method exists but indirectly calls `installment_url_redirect.mobile_product_file_json_data` — crashes (NoMethodError on nil) for installments with `alive_product_files` and no url_redirect. Audience-broadcast emails typically have no files so the audience_options + emails create paths are safe, but guard against this in code review. | Task 7 |
| B12 | `create(:payment, state: "completed")` | `:payment` factory `state: "completed"` may fail validation without `txn_id`. Use `:payment_completed` sub-factory: `create(:payment_completed, user: u)`. | Task 6 `:eligible_sender` trait |
| B13 | `create_list(:purchase, 25, seller: u, ...)` | Purchase factory derives `seller` from `link.user`. Pass `link: create(:product, user: u)` to ensure seller alignment. | Task 6 trait |
| B14 | DirectUploads response includes `blob_url: blob.url` | `blob.url` returns a presigned S3 URL whose default expiry is short (5 min). The `# C2 fix:` comment in `direct_uploads_controller.rb` notes this is for `files[].url` to pass `ProductFile#valid_url?` on the S3 prefix. **Wave 3 risk:** if Wave 3 stores this presigned URL in a long-lived attachment field, links go stale. When wiring `ProductFile#valid_url?`, prefer storing the canonical S3 path (`#{AWS_S3_ENDPOINT}/#{S3_BUCKET}/#{blob.key}`), or refresh the URL on read. Add a test that confirms attachment references survive past the presigned-URL TTL. | Task 7+ Wave 3 (consumer of `blob_url`) |

**Mobile (Expo / RN) — apply before each mobile task:**

| # | Plan said | Reality | Applies to |
|---|---|---|---|
| M1 | `Record<BannerVariant, string>` for icon names | `LineIcon`'s `name` prop is `LineIconName` (a typed union from `basicGlyphMap`). Type as `Record<BannerVariant, LineIconName>`; verify `"error"`, `"info-circle"` are valid `LineIconName` values. | Task 11 Banner |
| M2 | `bg-muted` for info banner background | `--color-muted` resolves to `#8a8a8a` (a text/icon token, not a surface). **SUPERSEDED 2026-05-01 by Wave 4 Auditor:** the correct fix is `bg-muted/10` (10% opacity gray = subtle surface) — not `bg-card`/`bg-background` which equal the parent surface and render invisible. Implementation uses `bg-muted/10`. | Task 11 Banner ✅ DONE |
| M3 | `await import("expo-file-system")` then `FileSystem.File.from(uri).digest(...)` | `File.from(...).digest()` is in `expo-file-system/next`. Import `import { File } from "expo-file-system/next"`. | Task 14 photo upload |
| M4 | Mobile API path `/mobile/foo` (with leading slash) | Existing `useAPIRequest` callers use `mobile/foo` (no leading slash). `new URL(path, base)` is sensitive to leading-slash if base has a path. Match the existing convention. | Tasks 12-15 hooks |
| M5 | `<DashboardFAB />` at end of dashboard screen | Dashboard root is `<Screen>` (custom wrapper), not plain `<View>`. Verify the FAB renders above the tab bar / above scroll content; may need `<View style={StyleSheet.absoluteFill}>` wrapper. | Task 17 dashboard FAB |
| M6 | `@10play/tentap-editor` compatibility with React 19 + RN 0.83.5 + New Architecture | **Verified via ctx7 (`/10play/10tap-editor`, 2026-05-01):** New Architecture is explicitly supported (`RCT_NEW_ARCH_ENABLED=1` documented). Install command must include `react-native-webview` (peer dep): `npx expo install @10play/tentap-editor react-native-webview`. Requires Expo Dev Client (NOT Expo Go) because of native CocoaPods deps. React 19 / RN 0.83.5 not explicitly called out — proceed with `expo install` (picks SDK-compatible version) and test dev-client build immediately. Fallback if incompatible: `react-native-pell-rich-editor` or a custom WebView. | Task 9 install |

**Workflow correction:**
- Before each subsequent wave, dispatch 3-5 parallel **read-only sonnet verifiers** to ground the plan against the codebase (factories, requires, URLs, line numbers, library APIs). Patch the wave's tasks before writing any code. See `~/.claude/projects/.../memory/feedback_verify_plan_per_wave.md`.

---

## ⚠ Dev-client rebuild gate (MANDATORY before Task 17, recommended before runtime-testing Tasks 13-15)

Tasks 12-15 (hooks) are pure TypeScript and pass `npm run typecheck` without a rebuilt dev client — they're safe to author + commit. Runtime testing of Tasks 13 (`useEmailDraft` AsyncStorage), 14 (`usePhotoUpload` expo-image-picker), and 15 (`usePublishEmail` end-to-end) requires the new native deps to be linked. Task 17 (`<RichTextBody>`) hard-imports TenTap, so the rebuild becomes mandatory there.

**Required commands (in `gumroad-mobile-quick-update/`):**

**Required commands (in `gumroad-mobile-quick-update/`):**
```bash
npx expo prebuild --clean
npx expo run:ios --port 8082
```

**Pass criteria:** App boots on the iOS simulator without TenTap-related compile or runtime errors. Smoke-test by importing `RichText` from `@10play/tentap-editor` in a test screen.

**If TenTap fails to compile or run on RN 0.83.5 / React 19 / New Architecture:**
- Fallback option A — `react-native-pell-rich-editor` (battle-tested WebView-based RTE)
- Fallback option B — custom WebView hosting a stripped-down Tiptap build (parity with web is nice-to-have, not required)
- Time-box the TenTap debugging to 2 hours before switching. Update Tasks 17 (`<RichTextBody>`) accordingly.

**Status:** Deferred from Wave 4. Must run before Wave 5 implementation begins.

---

## File structure

### Rails (`~/Documents/GitHub/gumroad`)

| Path | Action | Responsibility |
|---|---|---|
| `db/seeds/030_development/mobile_app_test_data.rb` | **Modify** | Bump `mobile_seller1` to ≥$100 in sales + create successful `Payment` so `eligible_to_send_emails? == true` (F1) |
| `config/routes.rb` | **Modify** (lines 215-260, mobile scope) | Add `resources :emails`, `direct_uploads`, `s3_utility/cdn_url_for_blob` routes |
| `config/initializers/rack_attack.rb` | **Modify** (around line 132) | Add `/api/mobile/emails` throttle: 5 req/min/IP (F12) |
| `app/controllers/api/mobile/emails_controller.rb` | **Create** | `#create` (publish) + `#audience_options` (picker + eligibility piggyback) |
| `app/controllers/api/mobile/direct_uploads_controller.rb` | **Create** | Wrap `ActiveStorage::DirectUploadsController#create` with mobile auth |
| `app/controllers/api/mobile/s3_utility_controller.rb` | **Create** | Wrap `S3UtilityController#cdn_url_for_blob` with mobile auth |
| `app/services/installment_idempotency_service.rb` | **Create** | 3-state Redis pattern (`"in_flight"` sentinel + final id + 409) |
| `app/presenters/api/mobile/email_audience_presenter.rb` | **Create** | Format `{ options, eligibility }` response payload |
| `spec/requests/api/mobile/emails_create_spec.rb` | **Create** | RSpec for `#create` |
| `spec/requests/api/mobile/emails_audience_options_spec.rb` | **Create** | RSpec for `#audience_options` |
| `spec/requests/api/mobile/direct_uploads_create_spec.rb` | **Create** | RSpec for `direct_uploads#create` |
| `spec/requests/api/mobile/s3_utility_cdn_url_spec.rb` | **Create** | RSpec for `s3_utility#cdn_url_for_blob` |
| `spec/services/installment_idempotency_service_spec.rb` | **Create** | RSpec for the 3-state cache |

### Mobile (`~/Documents/GitHub/gumroad-mobile`)

| Path | Action | Responsibility |
|---|---|---|
| `package.json` | **Modify** | Add 3 deps via `npx expo install` |
| `app.config.ts` | **Modify** (line 38-134, plugins) | Add `expo-image-picker` plugin entry |
| `app/_layout.tsx` | **Modify** (lines 71-77, Stack screens) | Register `email-compose` modal screen |
| `lib/auth-context.tsx` | **Modify** (line 208) | **Revert dev hack `isCreator: true,` to `isCreator,`** |
| `app/email-compose.tsx` | **Create** | Composer screen (title + audience + body + photo) |
| `components/ui/banner.tsx` | **Create** | Persistent inline banner (variants: error / info / warning) |
| `components/email-compose/audience-sheet.tsx` | **Create** | Bottom-sheet picker (radios + counts) |
| `components/email-compose/rich-text-body.tsx` | **Create** | TenTap `<RichText>` + customized `<Toolbar>` + dark-mode CSS injection |
| `components/email-compose/photo-attachment.tsx` | **Create** | Inline photo upload status (resizing → uploading → uploaded → failed) |
| `components/email-compose/restore-draft-banner.tsx` | **Create** | Card with Continue/Discard |
| `components/email-compose/use-audience-options.ts` | **Create** | One-line wrapper around `useAPIRequest` |
| `components/email-compose/use-email-draft.ts` | **Create** | AsyncStorage debounced read/write |
| `components/email-compose/use-photo-upload.ts` | **Create** | 3-step pipeline: `direct_uploads` → S3 PUT → `cdn_url_for_blob` |
| `components/email-compose/use-publish-email.ts` | **Create** | `useMutation` wrapping `requestAPI` with idempotency + 409 retry |
| `components/dashboard/dashboard-fab.tsx` | **Create** | FAB (56pt, accent, haptic on press) |
| `app/(tabs)/dashboard.tsx` | **Modify** | Render `<DashboardFAB />` at end of screen |
| `tests/email-compose/use-email-draft.test.ts` | **Create** | Jest unit test for draft serialize/restore |
| `tests/email-compose/use-publish-email.test.ts` | **Create** | Jest unit test for idempotency state |
| `.maestro/quick-update-happy-path.yaml` | **Create** | E2E happy-path |

---

## Phases

- **Phase 1 (Sat morning):** Rails endpoints + seed + tests
- **Phase 2 (Sat afternoon):** Mobile foundations (deps, modal, primitives, hooks)
- **Phase 3 (Sun morning):** Mobile composer screen + integration
- **Phase 4 (Sun afternoon):** Polish, E2E, demo recording, PRs

---

# Phase 1: Rails

## Task 1: Patch demo seed (F1 unblock)

**Files:**
- Modify: `~/Documents/GitHub/gumroad/db/seeds/030_development/mobile_app_test_data.rb`
- Test (verify in console): no spec — verified manually pre-recording

- [ ] **Step 1: Open the seed file and inspect current state**

```bash
cd ~/Documents/GitHub/gumroad
sed -n '60,110p' db/seeds/030_development/mobile_app_test_data.rb
```

Expected: see `seller1` with one $5 product and one $5 sale to `buyer`.

- [ ] **Step 2: Add a helper to seed bulk purchases**

Add after the existing `create_mobile_purchase` helper (around line 60):

```ruby
def create_bulk_purchases(seller:, product:, count:)
  count.times do |i|
    buyer = User.find_or_create_by!(email: "mobile_synthetic_buyer_#{i}@gumroad.com") do |u|
      u.name = "Synthetic Buyer #{i}"
      u.username = "mobilesynthbuyer#{i}"
      u.password = SecureRandom.hex(24)
      u.user_risk_state = "compliant"
      u.confirmed_at = Time.current
    end
    Purchase.find_or_create_by!(link_id: product.id, purchaser_id: buyer.id, purchase_state: "successful") do |p|
      p.seller_id = seller.id
      p.price_cents = product.price_cents
      p.displayed_price_cents = product.price_cents
      p.tax_cents = 0
      p.gumroad_tax_cents = 0
      p.total_transaction_cents = product.price_cents
      p.email = buyer.email
      p.card_country = "US"
      p.ip_address = "199.241.200.176"
      p.send(:calculate_fees)
      p.succeeded_at = Time.current
    end
  end
end
```

- [ ] **Step 3: Add bulk seed call after existing seller1's lone purchase**

After the existing `create_mobile_purchase(seller: seller1, buyer: buyer, product: product1)` line, add:

```ruby
# Ensure mobile_seller1 is eligible to send emails (≥$100 sales + completed payout)
create_bulk_purchases(seller: seller1, product: product1, count: 25)  # 25 × $5 = $125

# Mark a completed payout
unless Payment.exists?(user_id: seller1.id, state: "completed")
  Payment.create!(
    user: seller1,
    amount_cents: 10_000,
    currency: "usd",
    state: "completed",
    processor: "PAYPAL",
    payout_period_end_date: 1.week.ago.to_date,
    correlation_id: "mobile-seed-payout-#{seller1.id}"
  )
end
```

- [ ] **Step 4: Run the seed and verify in console**

```bash
cd ~/Documents/GitHub/gumroad
bundle exec rails db:seed:030_development
bundle exec rails runner '
  s = User.find_by(email: "mobile_seller1_do_not_edit@gumroad.com")
  puts "sales_cents_total: #{s.sales_cents_total}"
  puts "has_completed_payouts?: #{s.has_completed_payouts?}"
  puts "eligible_to_send_emails?: #{s.eligible_to_send_emails?}"
'
```

Expected:
```
sales_cents_total: 13000
has_completed_payouts?: true
eligible_to_send_emails?: true
```

- [ ] **Step 5: Commit**

```bash
cd ~/Documents/GitHub/gumroad
git add db/seeds/030_development/mobile_app_test_data.rb
git commit -m "Seed mobile_seller1 with $100+ sales + completed payout

So mobile email-composition demo can publish.
Refs Quick Update Mobile (Antiwork hiring submission)."
```

---

## Task 2: Add routes for new mobile endpoints

**Files:**
- Modify: `~/Documents/GitHub/gumroad/config/routes.rb` (lines 215-260, mobile scope)

- [ ] **Step 1: Locate the mobile scope**

```bash
cd ~/Documents/GitHub/gumroad
grep -n 'scope "mobile"' config/routes.rb
```

Expected: line 215 — `scope "mobile", module: "mobile", as: "mobile" do`

- [ ] **Step 2: Add new routes inside the mobile scope (before the closing `end`)**

In `config/routes.rb`, find the line `resources :feature_flags, only: [:show], format: :json` (the last route inside the mobile scope) and add immediately after:

```ruby
        resources :emails, only: [:create] do
          collection { get :audience_options }
        end
        post "direct_uploads", to: "direct_uploads#create"
        get  "s3_utility/cdn_url_for_blob", to: "s3_utility#cdn_url_for_blob"
```

- [ ] **Step 3: Verify routes are registered**

```bash
cd ~/Documents/GitHub/gumroad
bundle exec rails routes | grep -E "api/mobile/(emails|direct_uploads|s3_utility)"
```

Expected: 4 routes shown — `POST /api/mobile/emails`, `GET /api/mobile/emails/audience_options`, `POST /api/mobile/direct_uploads`, `GET /api/mobile/s3_utility/cdn_url_for_blob`.

- [ ] **Step 4: Commit**

```bash
git add config/routes.rb
git commit -m "Add mobile-namespace routes: emails, direct_uploads, s3_utility cdn"
```

---

## Task 3: `Api::Mobile::DirectUploadsController` + spec (F2)

**Files:**
- Create: `~/Documents/GitHub/gumroad/app/controllers/api/mobile/direct_uploads_controller.rb`
- Create: `~/Documents/GitHub/gumroad/spec/requests/api/mobile/direct_uploads_create_spec.rb`

- [ ] **Step 1: Write the failing spec**

```ruby
# spec/requests/api/mobile/direct_uploads_create_spec.rb
require "rails_helper"

RSpec.describe "API::Mobile::DirectUploads", type: :request do
  let(:seller) { create(:user, :compliant) }
  let(:token) { create(:oauth_access_token, resource_owner_id: seller.id, scopes: "creator_api mobile_api") }
  let(:mobile_token) { GlobalConfig.get("MOBILE_TOKEN") }
  let(:auth_headers) { { "Authorization" => "Bearer #{token.token}" } }

  describe "POST /api/mobile/direct_uploads" do
    let(:blob_params) do
      { blob: { filename: "photo.jpg", byte_size: 1024, checksum: Digest::MD5.base64digest("fake"), content_type: "image/jpeg" } }
    end

    it "returns 200 with signed_id and direct_upload payload" do
      post "/api/mobile/direct_uploads", params: blob_params.merge(mobile_token:), headers: auth_headers
      expect(response).to have_http_status(:ok)
      json = response.parsed_body
      expect(json["signed_id"]).to be_present
      expect(json["key"]).to be_present
      expect(json["direct_upload"]["url"]).to start_with("http")
      expect(json["direct_upload"]["headers"]).to be_a(Hash)
    end

    it "returns 401 without OAuth bearer" do
      post "/api/mobile/direct_uploads", params: blob_params.merge(mobile_token:)
      expect(response).to have_http_status(:unauthorized)
    end

    it "returns 401 with wrong mobile_token" do
      post "/api/mobile/direct_uploads", params: blob_params.merge(mobile_token: "wrong"), headers: auth_headers
      expect(response).to have_http_status(:unauthorized)
    end
  end
end
```

- [ ] **Step 2: Run the spec to confirm failure**

```bash
cd ~/Documents/GitHub/gumroad
bundle exec rspec spec/requests/api/mobile/direct_uploads_create_spec.rb
```

Expected: FAIL — `uninitialized constant Api::Mobile::DirectUploadsController`.

- [ ] **Step 3: Create the controller**

```ruby
# app/controllers/api/mobile/direct_uploads_controller.rb
# frozen_string_literal: true

class Api::Mobile::DirectUploadsController < Api::Mobile::BaseController
  before_action { doorkeeper_authorize! :creator_api, :mobile_api }

  def create
    blob = ActiveStorage::Blob.create_before_direct_upload!(**blob_args)
    render json: direct_upload_json(blob)
  end

  private
    def blob_args
      params.require(:blob).permit(:filename, :byte_size, :checksum, :content_type, metadata: {}).to_h.symbolize_keys
    end

    def direct_upload_json(blob)
      {
        signed_id: blob.signed_id,
        key: blob.key,
        filename: blob.filename.to_s,
        content_type: blob.content_type,
        byte_size: blob.byte_size,
        direct_upload: {
          url: blob.service_url_for_direct_upload,
          headers: blob.service_headers_for_direct_upload
        }
      }
    end
end
```

- [ ] **Step 4: Run the spec to confirm pass**

```bash
bundle exec rspec spec/requests/api/mobile/direct_uploads_create_spec.rb
```

Expected: PASS — 3 examples, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add app/controllers/api/mobile/direct_uploads_controller.rb spec/requests/api/mobile/direct_uploads_create_spec.rb
git commit -m "Add Api::Mobile::DirectUploadsController for ActiveStorage direct-upload"
```

---

## Task 4: `Api::Mobile::S3UtilityController#cdn_url_for_blob` + spec

**Files:**
- Create: `~/Documents/GitHub/gumroad/app/controllers/api/mobile/s3_utility_controller.rb`
- Create: `~/Documents/GitHub/gumroad/spec/requests/api/mobile/s3_utility_cdn_url_spec.rb`

- [ ] **Step 1: Write the failing spec**

```ruby
# spec/requests/api/mobile/s3_utility_cdn_url_spec.rb
require "rails_helper"

RSpec.describe "API::Mobile::S3Utility", type: :request do
  let(:seller) { create(:user, :compliant) }
  let(:token) { create(:oauth_access_token, resource_owner_id: seller.id, scopes: "creator_api mobile_api") }
  let(:mobile_token) { GlobalConfig.get("MOBILE_TOKEN") }
  let(:auth_headers) { { "Authorization" => "Bearer #{token.token}" } }
  let(:blob) { ActiveStorage::Blob.create_before_direct_upload!(filename: "photo.jpg", byte_size: 1024, checksum: Digest::MD5.base64digest("x"), content_type: "image/jpeg") }

  describe "GET /api/mobile/s3_utility/cdn_url_for_blob" do
    it "returns 200 with stable url for existing blob" do
      get "/api/mobile/s3_utility/cdn_url_for_blob", params: { key: blob.key, mobile_token: }, headers: auth_headers
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["url"]).to be_present
    end

    it "returns 404 for non-existent key" do
      get "/api/mobile/s3_utility/cdn_url_for_blob", params: { key: "missing", mobile_token: }, headers: auth_headers
      expect(response).to have_http_status(:not_found)
    end

    it "returns 401 without OAuth bearer" do
      get "/api/mobile/s3_utility/cdn_url_for_blob", params: { key: blob.key, mobile_token: }
      expect(response).to have_http_status(:unauthorized)
    end
  end
end
```

- [ ] **Step 2: Run the spec — confirm failure**

```bash
bundle exec rspec spec/requests/api/mobile/s3_utility_cdn_url_spec.rb
```

Expected: FAIL — `uninitialized constant Api::Mobile::S3UtilityController`.

- [ ] **Step 3: Create the controller**

```ruby
# app/controllers/api/mobile/s3_utility_controller.rb
# frozen_string_literal: true

class Api::Mobile::S3UtilityController < Api::Mobile::BaseController
  include CdnUrlHelper

  before_action { doorkeeper_authorize! :creator_api, :mobile_api }

  def cdn_url_for_blob
    blob = ActiveStorage::Blob.find_by_key(params[:key])
    return render(json: { success: false, message: "Blob not found" }, status: :not_found) if blob.nil?
    render json: { url: cdn_url_for(blob.url) }
  end
end
```

- [ ] **Step 4: Run the spec — confirm pass**

```bash
bundle exec rspec spec/requests/api/mobile/s3_utility_cdn_url_spec.rb
```

Expected: PASS — 3 examples, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add app/controllers/api/mobile/s3_utility_controller.rb spec/requests/api/mobile/s3_utility_cdn_url_spec.rb
git commit -m "Add Api::Mobile::S3UtilityController#cdn_url_for_blob"
```

---

## Task 5: `InstallmentIdempotencyService` (F5 — 3-state Redis pattern)

**Files:**
- Create: `~/Documents/GitHub/gumroad/app/services/installment_idempotency_service.rb`
- Create: `~/Documents/GitHub/gumroad/spec/services/installment_idempotency_service_spec.rb`

- [ ] **Step 1: Write the failing spec**

```ruby
# spec/services/installment_idempotency_service_spec.rb
require "rails_helper"

RSpec.describe InstallmentIdempotencyService do
  let(:seller) { create(:user) }
  let(:key) { SecureRandom.uuid }
  let(:installment) { create(:installment, seller:) }

  before { $redis.del("idempotency:installment:#{seller.id}:#{key}") }

  describe ".reserve" do
    it "returns :reserved on first call" do
      expect(described_class.reserve(seller_id: seller.id, key:)).to eq(:reserved)
    end

    it "returns :in_flight on concurrent call before completion" do
      described_class.reserve(seller_id: seller.id, key:)
      expect(described_class.reserve(seller_id: seller.id, key:)).to eq(:in_flight)
    end

    it "returns the installment after completion" do
      described_class.reserve(seller_id: seller.id, key:)
      described_class.complete(seller_id: seller.id, key:, installment_id: installment.id)
      expect(described_class.reserve(seller_id: seller.id, key:)).to eq(installment)
    end
  end

  describe ".release" do
    it "deletes the in-flight sentinel" do
      described_class.reserve(seller_id: seller.id, key:)
      described_class.release(seller_id: seller.id, key:)
      expect(described_class.reserve(seller_id: seller.id, key:)).to eq(:reserved)
    end
  end
end
```

- [ ] **Step 2: Run spec — confirm failure**

```bash
bundle exec rspec spec/services/installment_idempotency_service_spec.rb
```

Expected: FAIL — `uninitialized constant InstallmentIdempotencyService`.

- [ ] **Step 3: Create the service**

```ruby
# app/services/installment_idempotency_service.rb
# frozen_string_literal: true

class InstallmentIdempotencyService
  TTL_SECONDS = 3600
  IN_FLIGHT_SENTINEL = "in_flight"

  def self.reserve(seller_id:, key:)
    redis_key = build_key(seller_id, key)
    if $redis.set(redis_key, IN_FLIGHT_SENTINEL, ex: TTL_SECONDS, nx: true)
      :reserved
    else
      existing = $redis.get(redis_key)
      return :in_flight if existing == IN_FLIGHT_SENTINEL
      Installment.find_by(id: existing.to_i) || :reserved
    end
  end

  def self.complete(seller_id:, key:, installment_id:)
    $redis.set(build_key(seller_id, key), installment_id.to_s, ex: TTL_SECONDS)
  end

  def self.release(seller_id:, key:)
    $redis.del(build_key(seller_id, key))
  end

  def self.build_key(seller_id, key)
    "idempotency:installment:#{seller_id}:#{key}"
  end
  private_class_method :build_key
end
```

- [ ] **Step 4: Run spec — confirm pass**

```bash
bundle exec rspec spec/services/installment_idempotency_service_spec.rb
```

Expected: PASS — 4 examples, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add app/services/installment_idempotency_service.rb spec/services/installment_idempotency_service_spec.rb
git commit -m "Add InstallmentIdempotencyService (3-state Redis pattern)"
```

---

## Task 6: `Api::Mobile::EmailsController#audience_options` + presenter + spec

**Files:**
- Create: `~/Documents/GitHub/gumroad/app/presenters/api/mobile/email_audience_presenter.rb`
- Create: `~/Documents/GitHub/gumroad/app/controllers/api/mobile/emails_controller.rb`
- Create: `~/Documents/GitHub/gumroad/spec/requests/api/mobile/emails_audience_options_spec.rb`

- [ ] **Step 1: Write the failing spec**

```ruby
# spec/requests/api/mobile/emails_audience_options_spec.rb
require "rails_helper"

RSpec.describe "API::Mobile::Emails audience_options", type: :request do
  let(:seller) { create(:user, :eligible_sender) }
  let(:token) { create(:oauth_access_token, resource_owner_id: seller.id, scopes: "creator_api mobile_api") }
  let(:mobile_token) { GlobalConfig.get("MOBILE_TOKEN") }
  let(:auth_headers) { { "Authorization" => "Bearer #{token.token}" } }

  describe "GET /api/mobile/emails/audience_options" do
    it "returns 200 with options + eligibility for an eligible seller" do
      get "/api/mobile/emails/audience_options", params: { mobile_token: }, headers: auth_headers
      expect(response).to have_http_status(:ok)
      json = response.parsed_body
      expect(json["options"]).to be_an(Array)
      expect(json["options"].first).to include("type", "label", "count")
      expect(json["eligibility"]["can_send_emails"]).to be true
      expect(json["eligibility"]["reason"]).to be_nil
    end

    it "returns can_send_emails: false with $0 sales" do
      poor_seller = create(:user, :compliant)
      poor_token = create(:oauth_access_token, resource_owner_id: poor_seller.id, scopes: "creator_api mobile_api")
      get "/api/mobile/emails/audience_options", params: { mobile_token: }, headers: { "Authorization" => "Bearer #{poor_token.token}" }
      json = response.parsed_body
      expect(json["eligibility"]["can_send_emails"]).to be false
      expect(json["eligibility"]["reason"]).to include("$100")
    end

    it "filters out segments with count 0 except 'audience'" do
      get "/api/mobile/emails/audience_options", params: { mobile_token: }, headers: auth_headers
      types = response.parsed_body["options"].map { |o| o["type"] }
      expect(types).to include("audience")
    end

    it "returns 401 without OAuth bearer" do
      get "/api/mobile/emails/audience_options", params: { mobile_token: }
      expect(response).to have_http_status(:unauthorized)
    end
  end
end
```

You'll need a factory trait `:eligible_sender` (in `spec/factories/users.rb`):

```ruby
# In spec/factories/users.rb, add to the user factory block:
trait :eligible_sender do
  user_risk_state { "compliant" }
  after(:create) do |u|
    create_list(:purchase, 25, seller: u, price_cents: 500, purchase_state: "successful")
    create(:payment, user: u, state: "completed")
  end
end
```

- [ ] **Step 2: Run spec — confirm failure**

```bash
bundle exec rspec spec/requests/api/mobile/emails_audience_options_spec.rb
```

Expected: FAIL — `uninitialized constant Api::Mobile::EmailsController`.

- [ ] **Step 3: Create the presenter**

```ruby
# app/presenters/api/mobile/email_audience_presenter.rb
# frozen_string_literal: true

class Api::Mobile::EmailAudiencePresenter
  AUDIENCE_TYPES = %w[audience seller follower affiliate].freeze
  LABELS = {
    "audience" => "Everyone",
    "seller" => "Customers",
    "follower" => "Followers",
    "affiliate" => "Affiliates"
  }.freeze
  HELP_URL = "https://gumroad.com/help/article/269-balance-page"

  def initialize(seller:)
    @seller = seller
  end

  def as_json(*)
    { options: build_options, eligibility: build_eligibility }
  end

  private
    attr_reader :seller

    def build_options
      AUDIENCE_TYPES.filter_map do |type|
        count = audience_count_for(type)
        next if count.zero? && type != "audience"
        { type:, label: LABELS[type], count: }
      end
    end

    def audience_count_for(type)
      stub = Installment.new(seller:, installment_type: type)
      stub.audience_members_count
    rescue StandardError
      0
    end

    def build_eligibility
      reason = ineligibility_reason
      { can_send_emails: reason.nil?, reason:, learn_more_url: reason ? HELP_URL : nil }
    end

    def ineligibility_reason
      return "Your account is currently suspended." if seller.suspended?
      return "You'll be able to send emails after you've earned $100 in total sales." if seller.sales_cents_total < Installment::MINIMUM_SALES_CENTS_VALUE
      return "You'll be able to send emails after your first payout completes." unless seller.has_completed_payouts?
      nil
    end
end
```

- [ ] **Step 4: Create the controller (audience_options action only — #create comes in Task 7)**

```ruby
# app/controllers/api/mobile/emails_controller.rb
# frozen_string_literal: true

class Api::Mobile::EmailsController < Api::Mobile::BaseController
  before_action { doorkeeper_authorize! :creator_api, :mobile_api }
  before_action :authorize_creator!

  def audience_options
    presenter = Api::Mobile::EmailAudiencePresenter.new(seller:)
    render json: presenter.as_json
  end

  private
    def seller
      @seller ||= current_api_user
    end

    def authorize_creator!
      authorize Installment
    rescue Pundit::NotAuthorizedError
      render json: { success: false, message: "This account can't compose emails." }, status: :forbidden
    end
end
```

- [ ] **Step 5: Run spec — confirm pass**

```bash
bundle exec rspec spec/requests/api/mobile/emails_audience_options_spec.rb
```

Expected: PASS — 4 examples, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add app/controllers/api/mobile/emails_controller.rb app/presenters/api/mobile/email_audience_presenter.rb spec/requests/api/mobile/emails_audience_options_spec.rb spec/factories/users.rb
git commit -m "Add Api::Mobile::EmailsController#audience_options with eligibility"
```

---

## Task 7: `Api::Mobile::EmailsController#create` (F3 + F4 + F5) + spec

**Files:**
- Modify: `~/Documents/GitHub/gumroad/app/controllers/api/mobile/emails_controller.rb`
- Create: `~/Documents/GitHub/gumroad/spec/requests/api/mobile/emails_create_spec.rb`

- [ ] **Step 1: Write the failing spec covering happy path + 4xx + idempotency**

```ruby
# spec/requests/api/mobile/emails_create_spec.rb
require "rails_helper"

RSpec.describe "API::Mobile::Emails create", type: :request do
  let(:seller) { create(:user, :eligible_sender) }
  let(:token) { create(:oauth_access_token, resource_owner_id: seller.id, scopes: "creator_api mobile_api") }
  let(:mobile_token) { GlobalConfig.get("MOBILE_TOKEN") }
  let(:auth_headers) { { "Authorization" => "Bearer #{token.token}" } }
  let(:idempotency_key) { SecureRandom.uuid }

  let(:base_payload) do
    {
      installment: {
        name: "Behind the scenes",
        message: "<p>Working on chapter 2.</p>",
        installment_type: "audience",
        shown_on_profile: true,
        send_emails: true,
        allow_comments: true
      },
      publish: true,
      idempotency_key:,
      mobile_token:
    }
  end

  describe "POST /api/mobile/emails" do
    it "creates a published installment and returns 200" do
      expect {
        post "/api/mobile/emails", params: base_payload, headers: auth_headers, as: :json
      }.to change(Installment, :count).by(1)
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["installment"]["external_id"]).to be_present
    end

    it "is idempotent on retry" do
      post "/api/mobile/emails", params: base_payload, headers: auth_headers, as: :json
      first_id = response.parsed_body["installment"]["external_id"]
      expect {
        post "/api/mobile/emails", params: base_payload, headers: auth_headers, as: :json
      }.not_to change(Installment, :count)
      expect(response.parsed_body["installment"]["external_id"]).to eq first_id
    end

    it "returns 422 for empty title" do
      payload = base_payload.deep_merge(installment: { name: "" })
      post "/api/mobile/emails", params: payload, headers: auth_headers, as: :json
      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "returns 422 for ineligible seller" do
      poor_seller = create(:user, :compliant)
      poor_token = create(:oauth_access_token, resource_owner_id: poor_seller.id, scopes: "creator_api mobile_api")
      post "/api/mobile/emails", params: base_payload, headers: { "Authorization" => "Bearer #{poor_token.token}" }, as: :json
      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "returns 401 without OAuth bearer" do
      post "/api/mobile/emails", params: base_payload, as: :json
      expect(response).to have_http_status(:unauthorized)
    end

    it "fires PushNotificationWorker once on publish" do
      expect(PushNotificationWorker).to receive(:perform_bulk).at_least(:once).and_call_original
      post "/api/mobile/emails", params: base_payload, headers: auth_headers, as: :json
    end
  end
end
```

- [ ] **Step 2: Run spec — confirm failure**

```bash
bundle exec rspec spec/requests/api/mobile/emails_create_spec.rb
```

Expected: FAIL — `AbstractController::ActionNotFound: The action 'create' could not be found`.

- [ ] **Step 3: Add the `#create` action to the controller**

Modify `app/controllers/api/mobile/emails_controller.rb`:

```ruby
# app/controllers/api/mobile/emails_controller.rb
# frozen_string_literal: true

class Api::Mobile::EmailsController < Api::Mobile::BaseController
  before_action { doorkeeper_authorize! :creator_api, :mobile_api }
  before_action :authorize_creator!

  def create
    return render(json: { success: false, message: "Missing idempotency_key" }, status: :bad_request) if idempotency_key.blank?

    reservation = InstallmentIdempotencyService.reserve(seller_id: seller.id, key: idempotency_key)
    case reservation
    when :in_flight
      return render(json: { success: false, message: "Publish in progress", retry_after: 5 }, status: :conflict)
    when Installment
      return render(json: { success: true, installment: reservation.installment_mobile_json_data })
    end

    result = SaveInstallmentService.new(
      seller:,
      params: service_params,
      preview_email_recipient: nil
    ).perform

    if result[:success]
      InstallmentIdempotencyService.complete(seller_id: seller.id, key: idempotency_key, installment_id: result[:installment].id)
      render json: { success: true, installment: result[:installment].installment_mobile_json_data }
    else
      InstallmentIdempotencyService.release(seller_id: seller.id, key: idempotency_key)
      render json: { success: false, message: result[:message] }, status: :unprocessable_entity
    end
  rescue StandardError => e
    InstallmentIdempotencyService.release(seller_id: seller.id, key: idempotency_key) if idempotency_key.present?
    raise e
  end

  def audience_options
    presenter = Api::Mobile::EmailAudiencePresenter.new(seller:)
    render json: presenter.as_json
  end

  private
    def seller
      @seller ||= current_api_user
    end

    def authorize_creator!
      authorize Installment
    rescue Pundit::NotAuthorizedError
      render json: { success: false, message: "This account can't compose emails." }, status: :forbidden
    end

    def idempotency_key
      params[:idempotency_key]
    end

    def service_params
      base = params.require(:installment).permit(:name, :message, :installment_type, :shown_on_profile, :send_emails, :allow_comments, files: [:url, :external_id, :position, :stream_only]).to_h
      { installment: base, publish: ActiveModel::Type::Boolean.new.cast(params[:publish]) }
    end
end
```

- [ ] **Step 4: Run spec — confirm pass**

```bash
bundle exec rspec spec/requests/api/mobile/emails_create_spec.rb
```

Expected: PASS — 6 examples, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add app/controllers/api/mobile/emails_controller.rb spec/requests/api/mobile/emails_create_spec.rb
git commit -m "Add Api::Mobile::EmailsController#create with idempotency, Pundit, Doorkeeper

- F3: doorkeeper_authorize! :creator_api, :mobile_api
- F4: authorize Installment (Pundit), seller = current_api_user
- F5: 3-state idempotency cache (in-flight sentinel, 409 retry, completion)"
```

---

## Task 8: Rate-limit `/api/mobile/emails` (F12)

**Files:**
- Modify: `~/Documents/GitHub/gumroad/config/initializers/rack_attack.rb`

- [ ] **Step 1: Locate the existing throttle**

```bash
grep -n 'mobile/purchases' config/initializers/rack_attack.rb
```

Expected: line ~132 — `Rack::Attack.throttle(...) ... /api/mobile/purchases/index ...`

- [ ] **Step 2: Add a new throttle below it**

In `config/initializers/rack_attack.rb`, add after the existing mobile-purchases throttle:

```ruby
Rack::Attack.throttle("api/mobile/emails:create:per_ip", limit: 5, period: 60.seconds) do |req|
  req.ip if req.path.start_with?("/api/mobile/emails") && req.post?
end
```

- [ ] **Step 3: Smoke-verify by sending 6 requests in 60s**

```bash
bundle exec rails runner '
  6.times do |i|
    res = `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/mobile/emails -H "Authorization: Bearer x" -d "mobile_token=x"`
    puts "#{i+1}: #{res}"
  end
'
```

Expected: requests 1-5 = 401 (auth fail, but not throttled); request 6 = 429.

- [ ] **Step 4: Commit**

```bash
git add config/initializers/rack_attack.rb
git commit -m "Throttle /api/mobile/emails to 5 req/min/IP (F12)"
```

---

# Phase 2: Mobile foundations

## Task 9: Install mobile dependencies + open worktree

**Files:**
- Modify: `~/Documents/GitHub/gumroad-mobile/package.json`
- Modify: `~/Documents/GitHub/gumroad-mobile/app.config.ts`

- [ ] **Step 1: Open a feature worktree on the mobile repo**

```bash
cd ~/Documents/GitHub/gumroad-mobile
git fetch origin
git worktree add -b feat/quick-update-mobile ../gumroad-mobile-quick-update origin/main
cd ../gumroad-mobile-quick-update
```

- [ ] **Step 2: Install the 3 new deps via `expo install`** (lets Expo SDK 55 pick compatible versions)

```bash
npx expo install @10play/tentap-editor expo-image-picker @react-native-async-storage/async-storage
```

Expected: 3 packages added; `expo-image-picker` may also auto-add an iOS plugin entry.

- [ ] **Step 3: Verify `react-native-webview` and `expo-crypto` are still pinned (TenTap deps)**

```bash
grep -E '(react-native-webview|expo-crypto|tentap-editor|expo-image-picker|async-storage)' package.json
```

Expected: all 5 present, with version ranges.

- [ ] **Step 4: Add `expo-image-picker` plugin to `app.config.ts`**

In `app.config.ts`, locate the `plugins:` array (line 38-134). After the existing `"expo-image"` entry (line 91), add:

```typescript
[
  "expo-image-picker",
  {
    photosPermission: "Gumroad needs access to your photos to attach them to emails.",
    cameraPermission: "Gumroad needs access to your camera to take photos for emails.",
  },
],
```

- [ ] **Step 5: Rebuild dev client**

```bash
npx expo prebuild --clean
npx expo run:ios --port 8082
```

Expected: app builds and launches on iOS simulator.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json app.config.ts ios/ android/
git commit -m "Install @10play/tentap-editor, expo-image-picker, async-storage

Per Quick Update mobile email composer plan."
```

---

## Task 10: Register modal screen + revert dev hack

**Files:**
- Modify: `~/Documents/GitHub/gumroad-mobile-quick-update/app/_layout.tsx`
- Modify: `~/Documents/GitHub/gumroad-mobile-quick-update/lib/auth-context.tsx`

- [ ] **Step 1: Register the modal screen in root layout**

In `app/_layout.tsx`, find the existing `<Stack.Screen name="post/[id]" .../>` line (line 75) and add right after it:

```tsx
<Stack.Screen name="email-compose" options={{ presentation: "modal", title: "New email" }} />
```

- [ ] **Step 2: Revert the dev hack at line 208**

In `lib/auth-context.tsx`, change:

```tsx
isCreator: true,
```

to:

```tsx
isCreator,
```

- [ ] **Step 3: Run typecheck and lint**

```bash
npm run typecheck
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/_layout.tsx lib/auth-context.tsx
git commit -m "Register email-compose modal + revert isCreator dev hack"
```

---

## Task 11: `<Banner>` UI primitive

**Files:**
- Create: `~/Documents/GitHub/gumroad-mobile-quick-update/components/ui/banner.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/ui/banner.tsx
import { LineIcon } from "@/components/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { Pressable, View } from "react-native";

type BannerVariant = "error" | "info" | "warning";

const variantClasses: Record<BannerVariant, string> = {
  error: "bg-destructive/10 border-destructive",
  info: "bg-muted border-border",
  warning: "bg-accent/10 border-accent",
};

const variantIcons: Record<BannerVariant, string> = {
  error: "error",
  info: "info-circle",
  warning: "info-circle",
};

export const Banner = ({
  variant = "info",
  message,
  actionLabel,
  onAction,
}: {
  variant?: BannerVariant;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) => (
  <View
    className={cn("mx-4 my-2 flex-row items-start gap-3 rounded border p-3", variantClasses[variant])}
    style={{ borderCurve: "continuous" }}
  >
    <LineIcon name={variantIcons[variant]} size={18} className="text-foreground" />
    <View className="flex-1">
      <Text selectable className="text-sm">
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} className="mt-2 self-start">
          <Text className="text-sm underline">{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  </View>
);
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ui/banner.tsx
git commit -m "Add <Banner> primitive (variants: error / info / warning)"
```

---

## Task 12: `useAudienceOptions` hook

**Files:**
- Create: `~/Documents/GitHub/gumroad-mobile-quick-update/components/email-compose/use-audience-options.ts`

- [ ] **Step 1: Create the hook**

```ts
// components/email-compose/use-audience-options.ts
import { useAPIRequest } from "@/lib/request";

export type AudienceType = "audience" | "seller" | "follower" | "affiliate";

export type AudienceOption = {
  type: AudienceType;
  label: string;
  count: number;
};

export type Eligibility = {
  can_send_emails: boolean;
  reason: string | null;
  learn_more_url: string | null;
};

export type AudienceOptionsResponse = {
  options: AudienceOption[];
  eligibility: Eligibility;
};

export const useAudienceOptions = () =>
  useAPIRequest<AudienceOptionsResponse>({
    url: "/mobile/emails/audience_options",
    queryKey: ["mobile", "emails", "audience_options"],
    staleTime: 5 * 60 * 1000,
  });
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/email-compose/use-audience-options.ts
git commit -m "Add useAudienceOptions hook"
```

---

## Task 13: `useEmailDraft` hook + unit test

**Files:**
- Create: `~/Documents/GitHub/gumroad-mobile-quick-update/components/email-compose/use-email-draft.ts`
- Create: `~/Documents/GitHub/gumroad-mobile-quick-update/tests/email-compose/use-email-draft.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/email-compose/use-email-draft.test.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useEmailDraft } from "@/components/email-compose/use-email-draft";

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

describe("useEmailDraft", () => {
  beforeEach(() => jest.clearAllMocks());

  it("loads no draft on mount when storage empty", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    const { result } = renderHook(() => useEmailDraft());
    await waitFor(() => expect(result.current.draft).toBeNull());
  });

  it("loads existing draft on mount", async () => {
    const stored = JSON.stringify({ title: "Hi", html: "<p>x</p>", savedAt: new Date().toISOString(), idempotencyKey: "abc" });
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(stored);
    const { result } = renderHook(() => useEmailDraft());
    await waitFor(() => expect(result.current.draft?.title).toBe("Hi"));
  });

  it("save() writes JSON to storage", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    const { result } = renderHook(() => useEmailDraft());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    await act(async () => {
      await result.current.save({ title: "T", html: "<p>b</p>", idempotencyKey: "k1", audienceType: "audience" });
    });
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("email-compose-draft-v1", expect.stringContaining('"title":"T"'));
  });

  it("clear() removes the key", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    const { result } = renderHook(() => useEmailDraft());
    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    await act(async () => result.current.clear());
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith("email-compose-draft-v1");
  });
});
```

- [ ] **Step 2: Run test — confirm failure**

```bash
npm test -- use-email-draft
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the hook**

```ts
// components/email-compose/use-email-draft.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "email-compose-draft-v1";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type Draft = {
  title: string;
  html: string;
  audienceType: string;
  idempotencyKey: string;
  photoCdnUrl?: string;
  savedAt: string;
};

export const useEmailDraft = () => {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Draft;
        const age = Date.now() - new Date(parsed.savedAt).getTime();
        if (age <= MAX_AGE_MS) setDraft(parsed);
      } catch {
        /* corrupted draft — ignore */
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  const save = useCallback(async (next: Omit<Draft, "savedAt">) => {
    const draftWithTimestamp = { ...next, savedAt: new Date().toISOString() };
    setDraft(draftWithTimestamp);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(draftWithTimestamp));
  }, []);

  const clear = useCallback(async () => {
    setDraft(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  return { draft, save, clear, isLoaded };
};
```

- [ ] **Step 4: Run test — confirm pass**

```bash
npm test -- use-email-draft
```

Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add components/email-compose/use-email-draft.ts tests/email-compose/use-email-draft.test.ts
git commit -m "Add useEmailDraft (AsyncStorage debounced)"
```

---

## Task 14: `usePhotoUpload` hook (3-step ActiveStorage pipeline)

**Files:**
- Create: `~/Documents/GitHub/gumroad-mobile-quick-update/components/email-compose/use-photo-upload.ts`

- [ ] **Step 1: Create the hook**

```ts
// components/email-compose/use-photo-upload.ts
import { useAuth } from "@/lib/auth-context";
import { request, requestAPI } from "@/lib/request";
import * as Sentry from "@sentry/react-native";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useState } from "react";

export type PhotoStatus = "idle" | "resizing" | "uploading_blob" | "uploading_s3" | "fetching_cdn_url" | "uploaded" | "failed";

type DirectUploadResponse = {
  signed_id: string;
  key: string;
  filename: string;
  byte_size: number;
  direct_upload: { url: string; headers: Record<string, string> };
};

type CdnUrlResponse = { url: string };

const md5Base64 = async (uri: string): Promise<string> => {
  const FileSystem = await import("expo-file-system");
  const digest = await FileSystem.File.from(uri).digest({ algorithm: "MD5", encoding: "base64" });
  return digest;
};

export const usePhotoUpload = () => {
  const { accessToken } = useAuth();
  const [status, setStatus] = useState<PhotoStatus>("idle");
  const [cdnUrl, setCdnUrl] = useState<string | null>(null);

  const upload = useCallback(
    async (asset: ImagePicker.ImagePickerAsset): Promise<string | null> => {
      if (!accessToken) return null;
      try {
        setStatus("uploading_blob");

        const filename = asset.fileName ?? `photo-${Date.now()}.jpg`;
        const byteSize = asset.fileSize ?? 0;
        const checksum = await md5Base64(asset.uri);
        const contentType = asset.mimeType ?? "image/jpeg";

        const blobResponse = await requestAPI<DirectUploadResponse>("/mobile/direct_uploads", {
          method: "POST",
          accessToken,
          data: { blob: { filename, byte_size: byteSize, checksum, content_type: contentType } },
        });

        setStatus("uploading_s3");
        const fileBlob = await (await fetch(asset.uri)).blob();
        await request(blobResponse.direct_upload.url, {
          method: "PUT",
          headers: blobResponse.direct_upload.headers,
          body: fileBlob,
          skipResponseBody: true,
        });

        setStatus("fetching_cdn_url");
        const cdnResponse = await requestAPI<CdnUrlResponse>(`/mobile/s3_utility/cdn_url_for_blob?key=${encodeURIComponent(blobResponse.key)}`, {
          method: "GET",
          accessToken,
        });

        setCdnUrl(cdnResponse.url);
        setStatus("uploaded");
        return cdnResponse.url;
      } catch (error) {
        Sentry.captureException(error);
        setStatus("failed");
        return null;
      }
    },
    [accessToken],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setCdnUrl(null);
  }, []);

  return { status, cdnUrl, upload, reset };
};
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/email-compose/use-photo-upload.ts
git commit -m "Add usePhotoUpload (ActiveStorage 3-step pipeline)"
```

---

## Task 15: `usePublishEmail` hook (TanStack v5 mutation + idempotency + 409)

**Files:**
- Create: `~/Documents/GitHub/gumroad-mobile-quick-update/components/email-compose/use-publish-email.ts`
- Create: `~/Documents/GitHub/gumroad-mobile-quick-update/tests/email-compose/use-publish-email.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/email-compose/use-publish-email.test.ts
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { usePublishEmail } from "@/components/email-compose/use-publish-email";
import * as request from "@/lib/request";

jest.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ accessToken: "tok" }),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

describe("usePublishEmail", () => {
  it("mutates with idempotency_key in payload", async () => {
    const spy = jest.spyOn(request, "requestAPI").mockResolvedValue({ success: true, installment: { external_id: "ext" } } as any);
    const { result } = renderHook(() => usePublishEmail(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        title: "T",
        html: "<p>b</p>",
        audienceType: "audience",
        photoCdnUrl: null,
        idempotencyKey: "key1",
      });
    });
    expect(spy).toHaveBeenCalledWith(
      "/mobile/emails",
      expect.objectContaining({
        method: "POST",
        accessToken: "tok",
        data: expect.objectContaining({ idempotency_key: "key1" }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run test — confirm failure**

```bash
npm test -- use-publish-email
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the hook**

```ts
// components/email-compose/use-publish-email.ts
import { useAuth } from "@/lib/auth-context";
import { requestAPI } from "@/lib/request";
import { useMutation } from "@tanstack/react-query";
import { assertDefined } from "@/lib/assert";

type PublishVars = {
  title: string;
  html: string;
  audienceType: string;
  photoCdnUrl: string | null;
  idempotencyKey: string;
};

type PublishResponse = {
  success: boolean;
  installment: { external_id: string };
};

export const usePublishEmail = () => {
  const { accessToken } = useAuth();

  return useMutation<PublishResponse, Error, PublishVars>({
    mutationFn: async ({ title, html, audienceType, photoCdnUrl, idempotencyKey }) =>
      requestAPI<PublishResponse>("/mobile/emails", {
        method: "POST",
        accessToken: assertDefined(accessToken),
        data: {
          installment: {
            name: title,
            message: html,
            installment_type: audienceType,
            shown_on_profile: true,
            send_emails: true,
            allow_comments: true,
            files: photoCdnUrl ? [{ url: photoCdnUrl, position: 0, stream_only: false }] : [],
          },
          publish: true,
          idempotency_key: idempotencyKey,
        },
      }),
  });
};
```

- [ ] **Step 4: Run test — confirm pass**

```bash
npm test -- use-publish-email
```

Expected: PASS — 1 test passing.

- [ ] **Step 5: Commit**

```bash
git add components/email-compose/use-publish-email.ts tests/email-compose/use-publish-email.test.ts
git commit -m "Add usePublishEmail (mutation + idempotency)"
```

---

# Phase 3: Mobile composer screen + components

## Task 16: `<RichTextBody>` component (TenTap wrapper)

**Files:**
- Create: `~/Documents/GitHub/gumroad-mobile-quick-update/components/email-compose/rich-text-body.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/email-compose/rich-text-body.tsx
import {
  CoreBridge,
  LinkBridge,
  PlaceholderBridge,
  RichText,
  TenTapStartKit,
  Toolbar,
  useEditorBridge,
  type EditorBridge,
} from "@10play/tentap-editor";
import { useEffect } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { useCSSVariable } from "uniwind";

export type EditorRef = EditorBridge;

export const useRichTextBody = ({ initialHtml, onChangeHtml }: { initialHtml: string; onChangeHtml: (html: string) => void }) => {
  const editor = useEditorBridge({
    avoidIosKeyboard: true,
    autofocus: false,
    initialContent: initialHtml,
    bridgeExtensions: [
      ...TenTapStartKit,
      PlaceholderBridge.configureExtension({ placeholder: "Write a personalized message..." }),
      LinkBridge.configureExtension({ openOnClick: false }),
    ],
  });

  useEffect(() => {
    const unsub = editor._subscribeToEditorStateUpdate(async () => {
      onChangeHtml(await editor.getHTML());
    });
    return () => unsub();
  }, [editor, onChangeHtml]);

  const [foreground, background, muted] = useCSSVariable(["--color-foreground", "--color-body-bg", "--color-muted"]);

  useEffect(() => {
    editor.injectCSS(
      `
        body { color: ${foreground}; background: ${background}; }
        .tiptap p.is-editor-empty:first-child::before { color: ${muted}; }
      `,
      "uniwind-theme",
    );
  }, [editor, foreground, background, muted]);

  return editor;
};

export const RichTextBody = ({ editor }: { editor: EditorBridge }) => (
  <View className="flex-1">
    <RichText editor={editor} />
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ position: "absolute", width: "100%", bottom: 0 }}
    >
      <Toolbar editor={editor} />
    </KeyboardAvoidingView>
  </View>
);
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/email-compose/rich-text-body.tsx
git commit -m "Add <RichTextBody> (TenTap + Uniwind dark-mode CSS injection)"
```

---

## Task 17: `<AudienceSheet>`, `<PhotoAttachment>`, `<RestoreDraftBanner>`

**Files:**
- Create: `~/Documents/GitHub/gumroad-mobile-quick-update/components/email-compose/audience-sheet.tsx`
- Create: `~/Documents/GitHub/gumroad-mobile-quick-update/components/email-compose/photo-attachment.tsx`
- Create: `~/Documents/GitHub/gumroad-mobile-quick-update/components/email-compose/restore-draft-banner.tsx`

- [ ] **Step 1: Create `<AudienceSheet>`**

```tsx
// components/email-compose/audience-sheet.tsx
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import { Pressable, View } from "react-native";
import type { AudienceOption } from "./use-audience-options";

export const AudienceSheet = ({
  open,
  onClose,
  options,
  selected,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  options: AudienceOption[];
  selected: string;
  onSelect: (type: string) => void;
}) => (
  <Sheet open={open} onOpenChange={onClose}>
    <SheetContent>
      <SheetHeader>
        <SheetTitle>Audience</SheetTitle>
      </SheetHeader>
      <View className="gap-2 px-4 py-3">
        {options.map((option) => (
          <Pressable
            key={option.type}
            className="flex-row items-center justify-between rounded border border-border p-3"
            style={{ borderCurve: "continuous" }}
            onPress={() => {
              onSelect(option.type);
              onClose();
            }}
          >
            <View className="flex-row items-center gap-3">
              <View className={`size-5 rounded-full border ${selected === option.type ? "border-accent bg-accent" : "border-border"}`} />
              <Text>{option.label}</Text>
            </View>
            <Text className="text-muted" style={{ fontVariant: ["tabular-nums"] }}>
              {option.count}
            </Text>
          </Pressable>
        ))}
        <Button variant="ghost" onPress={onClose}>
          <Text>Cancel</Text>
        </Button>
      </View>
    </SheetContent>
  </Sheet>
);
```

- [ ] **Step 2: Create `<PhotoAttachment>`**

```tsx
// components/email-compose/photo-attachment.tsx
import { LineIcon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Text } from "@/components/ui/text";
import { View } from "react-native";
import type { PhotoStatus } from "./use-photo-upload";

const labelFor: Record<PhotoStatus, string> = {
  idle: "",
  resizing: "Resizing…",
  uploading_blob: "Preparing upload…",
  uploading_s3: "Uploading…",
  fetching_cdn_url: "Finalizing…",
  uploaded: "Ready",
  failed: "Upload failed",
};

export const PhotoAttachment = ({
  status,
  onRetry,
  onRemove,
}: {
  status: PhotoStatus;
  onRetry?: () => void;
  onRemove: () => void;
}) => {
  if (status === "idle") return null;
  return (
    <View className="mx-4 my-2 flex-row items-center gap-3 rounded border border-border p-3" style={{ borderCurve: "continuous" }}>
      {status === "failed" ? (
        <LineIcon name="error" size={20} className="text-destructive" />
      ) : status === "uploaded" ? (
        <LineIcon name="check" size={20} className="text-foreground" />
      ) : (
        <LoadingSpinner size="small" />
      )}
      <Text selectable className="flex-1 text-sm">
        {labelFor[status]}
      </Text>
      {status === "failed" && onRetry ? (
        <Button size="sm" variant="ghost" onPress={onRetry}>
          <Text>Retry</Text>
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" onPress={onRemove}>
        <Text>Remove</Text>
      </Button>
    </View>
  );
};
```

- [ ] **Step 3: Create `<RestoreDraftBanner>`**

```tsx
// components/email-compose/restore-draft-banner.tsx
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { View } from "react-native";

const formatRelative = (iso: string): string => {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
};

export const RestoreDraftBanner = ({
  savedAt,
  onContinue,
  onDiscard,
}: {
  savedAt: string;
  onContinue: () => void;
  onDiscard: () => void;
}) => (
  <Card className="mx-4 mt-2 p-4" style={{ borderCurve: "continuous" }}>
    <Text>Continue your draft from {formatRelative(savedAt)}?</Text>
    <View className="mt-3 flex-row justify-end gap-2">
      <Button size="sm" variant="ghost" onPress={onDiscard}>
        <Text>Discard</Text>
      </Button>
      <Button size="sm" onPress={onContinue}>
        <Text>Continue</Text>
      </Button>
    </View>
  </Card>
);
```

- [ ] **Step 4: Run typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/email-compose/audience-sheet.tsx components/email-compose/photo-attachment.tsx components/email-compose/restore-draft-banner.tsx
git commit -m "Add audience sheet + photo-attachment indicator + restore-draft banner"
```

---

## Task 18: `<EmailComposeScreen>` — the screen itself

**Files:**
- Create: `~/Documents/GitHub/gumroad-mobile-quick-update/app/email-compose.tsx`

- [ ] **Step 1: Create the screen**

```tsx
// app/email-compose.tsx
import { Banner } from "@/components/ui/banner";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Screen } from "@/components/ui/screen";
import { Text } from "@/components/ui/text";
import { AudienceSheet } from "@/components/email-compose/audience-sheet";
import { PhotoAttachment } from "@/components/email-compose/photo-attachment";
import { RestoreDraftBanner } from "@/components/email-compose/restore-draft-banner";
import { RichTextBody, useRichTextBody } from "@/components/email-compose/rich-text-body";
import { useAudienceOptions, type AudienceType } from "@/components/email-compose/use-audience-options";
import { useEmailDraft } from "@/components/email-compose/use-email-draft";
import { usePhotoUpload } from "@/components/email-compose/use-photo-upload";
import { usePublishEmail } from "@/components/email-compose/use-publish-email";
import { safeOpenURL } from "@/lib/open-url";
import * as Sentry from "@sentry/react-native";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Stack, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, TextInput, View } from "react-native";

export default function EmailComposeScreen() {
  const router = useRouter();
  const audienceOptions = useAudienceOptions();
  const draft = useEmailDraft();
  const photo = usePhotoUpload();
  const publish = usePublishEmail();

  const [title, setTitle] = useState("");
  const [html, setHtml] = useState("");
  const [audienceType, setAudienceType] = useState<AudienceType>("audience");
  const [showAudienceSheet, setShowAudienceSheet] = useState(false);
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const idempotencyKeyRef = useRef<string>(Crypto.randomUUID());

  const editor = useRichTextBody({ initialHtml: html, onChangeHtml: setHtml });

  // Restore-draft banner on mount
  useEffect(() => {
    if (draft.isLoaded && draft.draft) setShowRestoreBanner(true);
  }, [draft.isLoaded, draft.draft]);

  // Debounced autosave
  useEffect(() => {
    if (!draft.isLoaded) return;
    const handle = setTimeout(() => {
      if (title || html) {
        draft.save({ title, html, audienceType, idempotencyKey: idempotencyKeyRef.current, photoCdnUrl: photo.cdnUrl ?? undefined }).catch(Sentry.captureException);
      }
    }, 500);
    return () => clearTimeout(handle);
  }, [title, html, audienceType, photo.cdnUrl, draft]);

  const handleContinueDraft = () => {
    if (!draft.draft) return;
    setTitle(draft.draft.title);
    setHtml(draft.draft.html);
    setAudienceType(draft.draft.audienceType as AudienceType);
    idempotencyKeyRef.current = draft.draft.idempotencyKey;
    if (draft.draft.html) editor.setContent(draft.draft.html);
    setShowRestoreBanner(false);
  };

  const handleDiscardDraft = async () => {
    await draft.clear();
    setShowRestoreBanner(false);
  };

  const handleAttachPhoto = () =>
    Alert.alert("Add photo", undefined, [
      { text: "Take photo", onPress: () => takePhoto() },
      { text: "Choose from library", onPress: () => pickPhoto() },
      { text: "Cancel", style: "cancel" },
    ]);

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== "granted") return permissionDeniedAlert();
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled) {
      const url = await photo.upload(result.assets[0]!);
      if (url) editor.setImage(url);
    }
  };

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") return permissionDeniedAlert();
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled) {
      const url = await photo.upload(result.assets[0]!);
      if (url) editor.setImage(url);
    }
  };

  const permissionDeniedAlert = () =>
    Alert.alert("Photo access", "Allow access to attach photos.", [
      { text: "Open Settings", onPress: () => safeOpenURL("app-settings:") },
      { text: "Continue without photo", style: "cancel" },
    ]);

  const eligibility = audienceOptions.data?.eligibility;
  const canPublish =
    !!title.trim() &&
    !!html.replace(/<[^>]+>/g, "").trim() &&
    eligibility?.can_send_emails === true &&
    !["resizing", "uploading_blob", "uploading_s3", "fetching_cdn_url"].includes(photo.status) &&
    !publish.isPending;

  const handlePublish = async () => {
    if (!canPublish) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await publish.mutateAsync({
        title,
        html,
        audienceType,
        photoCdnUrl: photo.cdnUrl ?? null,
        idempotencyKey: idempotencyKeyRef.current,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await draft.clear();
      router.dismiss();
    } catch (error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Sentry.captureException(error);
    }
  };

  const selectedOption = audienceOptions.data?.options.find((o) => o.type === audienceType);

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: "New email",
          headerRight: () => (
            <Button size="sm" disabled={!canPublish} onPress={handlePublish}>
              {publish.isPending ? <LoadingSpinner size="small" /> : <Text>Publish</Text>}
            </Button>
          ),
        }}
      />
      {showRestoreBanner && draft.draft ? (
        <RestoreDraftBanner savedAt={draft.draft.savedAt} onContinue={handleContinueDraft} onDiscard={handleDiscardDraft} />
      ) : null}
      {eligibility && !eligibility.can_send_emails ? (
        <Banner
          variant="error"
          message={eligibility.reason ?? "You can't send emails right now."}
          actionLabel={eligibility.learn_more_url ? "Learn more →" : undefined}
          onAction={() => eligibility.learn_more_url && safeOpenURL(eligibility.learn_more_url)}
        />
      ) : null}
      {publish.isError ? <Banner variant="error" message="Couldn't publish. Tap Publish to retry." /> : null}
      <Pressable className="mx-4 my-2 flex-row items-center justify-between" onPress={() => setShowAudienceSheet(true)}>
        <Text>Audience</Text>
        <Text className="text-muted">
          {selectedOption ? `${selectedOption.label} (${selectedOption.count})` : "Everyone"}
        </Text>
      </Pressable>
      <TextInput value={title} onChangeText={setTitle} placeholder="Title" className="text-2xl font-bold px-4 py-2" maxLength={255} />
      <RichTextBody editor={editor} />
      <PhotoAttachment status={photo.status} onRetry={photo.reset} onRemove={photo.reset} />
      <Button variant="ghost" onPress={handleAttachPhoto} className="m-4">
        <Text>📷 Photo</Text>
      </Button>
      <AudienceSheet
        open={showAudienceSheet}
        onClose={() => setShowAudienceSheet(false)}
        options={audienceOptions.data?.options ?? []}
        selected={audienceType}
        onSelect={(t) => setAudienceType(t as AudienceType)}
      />
    </Screen>
  );
}
```

- [ ] **Step 2: Run typecheck + lint**

```bash
npm run typecheck && npm run lint
```

Expected: no errors.

- [ ] **Step 3: Smoke-launch the screen**

```bash
npx expo start --port 8082
```

In the simulator: long-press anywhere → use deep link `gumroadmobile:///email-compose` OR add a temporary nav button to test.

Expected: screen renders without crash; TenTap editor visible; placeholder shows "Write a personalized message...".

- [ ] **Step 4: Commit**

```bash
git add app/email-compose.tsx
git commit -m "Add EmailComposeScreen — title, body, audience picker, photo, publish"
```

---

## Task 19: Dashboard FAB

**Files:**
- Create: `~/Documents/GitHub/gumroad-mobile-quick-update/components/dashboard/dashboard-fab.tsx`
- Modify: `~/Documents/GitHub/gumroad-mobile-quick-update/app/(tabs)/dashboard.tsx`

- [ ] **Step 1: Create the FAB**

```tsx
// components/dashboard/dashboard-fab.tsx
import { LineIcon } from "@/components/icon";
import { useAuth } from "@/lib/auth-context";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";

export const DashboardFAB = () => {
  const router = useRouter();
  const { isCreator } = useAuth();
  if (!isCreator) return null;
  return (
    <Pressable
      accessibilityLabel="New email"
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.push("/email-compose");
      }}
      className="absolute bottom-24 right-4 size-14 items-center justify-center rounded-full bg-accent"
      style={{ borderCurve: "continuous", boxShadow: "0 2px 6px rgba(0,0,0,0.15)" }}
    >
      <LineIcon name="plus" size={28} className="text-white" />
    </Pressable>
  );
};
```

- [ ] **Step 2: Render `<DashboardFAB />` at the end of `app/(tabs)/dashboard.tsx`**

Locate the existing return statement of the Dashboard screen and append `<DashboardFAB />` as the last child of the root view.

```tsx
import { DashboardFAB } from "@/components/dashboard/dashboard-fab";
// ... existing code ...
return (
  <Screen>
    {/* existing content */}
    <DashboardFAB />
  </Screen>
);
```

- [ ] **Step 3: Verify the FAB on the simulator**

```bash
npx expo start --port 8082
```

Tap the FAB → composer screen pushes as a modal.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/dashboard-fab.tsx app/(tabs)/dashboard.tsx
git commit -m "Add Dashboard FAB → email-compose modal"
```

---

# Phase 4: Polish, E2E, demo

## Task 20: End-to-end on two simulators

**Files:** none — verification only.

- [ ] **Step 1: Boot two iOS simulators**

```bash
xcrun simctl list devices available | grep -E "(iPhone 17 Pro|iPhone 16)"
xcrun simctl boot "iPhone 17 Pro"
xcrun simctl boot "iPhone 16"
```

- [ ] **Step 2: Install dev client on both**

```bash
npx expo run:ios --device "iPhone 17 Pro"
npx expo run:ios --device "iPhone 16"
```

- [ ] **Step 3: Sign in as `mobile_seller1_do_not_edit@gumroad.com` on simulator A**

Email + password (`password`).

- [ ] **Step 4: Sign in as `mobile_buyer_do_not_edit@gumroad.com` on simulator B**

Email + password (`password`).

- [ ] **Step 5: Verify creator path**

On simulator A:
1. Open Dashboard tab.
2. Tap FAB.
3. Verify audience reads "Everyone (1)" (1 customer = mobile_buyer + 25 synthetic buyers in seed).
4. Verify no eligibility banner (seller is now eligible after Task 1 seed patch).
5. Type title "Behind the scenes".
6. Type body "Working on chapter 2 of the watercolor course."
7. Tap Photo → Take photo or choose from library.
8. Wait for upload to complete.
9. Tap Publish.

Expected: modal dismisses. Sentry breadcrumbs in dev console.

- [ ] **Step 6: Verify subscriber path**

On simulator B:
1. Within ~60s of publish, push notification appears.
2. Tap push.
3. Email viewer renders title + body + photo.

Expected: email content matches what creator wrote. Photo loads (CDN URL works).

- [ ] **Step 7: Document outcome (no commit)**

Note any issues for Task 21 fixup.

---

## Task 21: Maestro happy-path E2E (optional, time permitting)

**Files:**
- Create: `~/Documents/GitHub/gumroad-mobile-quick-update/.maestro/quick-update-happy-path.yaml`

- [ ] **Step 1: Author the Maestro flow**

```yaml
# .maestro/quick-update-happy-path.yaml
appId: ${APP_ID}
---
- launchApp
- tapOn: "Dashboard"
- tapOn:
    id: "fab-new-email"
- inputText: "Maestro test email"
- tapOn:
    accessibilityText: "Body"
- inputText: "This is a test email body."
- tapOn: "Publish"
- assertVisible: "Dashboard"
```

- [ ] **Step 2: Add `testID="fab-new-email"` to the FAB**

In `components/dashboard/dashboard-fab.tsx`, add `testID="fab-new-email"` to the `<Pressable>`.

- [ ] **Step 3: Run Maestro**

```bash
cd ~/Documents/GitHub/gumroad-mobile-quick-update
npm run e2e:ios
```

Expected: flow passes.

- [ ] **Step 4: Commit**

```bash
git add .maestro/quick-update-happy-path.yaml components/dashboard/dashboard-fab.tsx
git commit -m "Add Maestro happy-path E2E"
```

---

## Task 22: Cover note + demo video + open PRs

**Files:** out of plan scope (manual delivery).

- [ ] **Step 1: Record 60s demo video**

Per the script in `proposal.md` lines 100-122. Two simulators side-by-side via QuickTime screen recording.

- [ ] **Step 2: Edit cover note**

Per `proposal.md` Cover note section. Include: F1 seed patch, F2 ActiveStorage decision, F8/F9 acknowledged regressions, eligibility-banner improvement over web.

- [ ] **Step 3: Push branches and open PRs**

```bash
# Rails PR
cd ~/Documents/GitHub/gumroad
git push -u origin feat/mobile-emails-create
gh pr create --title "feat(mobile): emails#create + audience_options + direct_uploads" --body "$(cat <<'EOF'
## Summary
Adds first creator-authoring endpoint to the mobile API namespace, mirroring the web `EmailsController#create` flow through the existing `SaveInstallmentService`.

## Test plan
- [ ] RSpec covers happy path, idempotency, eligibility, scope/role enforcement
- [ ] Demo seed patched so mobile_seller1 is eligible to send emails
- [ ] No new gem dependencies; no new OAuth scopes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

# Mobile branch
cd ~/Documents/GitHub/gumroad-mobile-quick-update
git push -u origin feat/quick-update-mobile
gh pr create --repo antiwork/gumroad-mobile --title "feat: Quick Update — mobile email composer" --body "..."
```

- [ ] **Step 4: Submit hiring application**

Email Gumclaw with PR + branch + video links by Mon morning 2026-05-04.

---

## Self-review checklist

- [ ] Every spec section has a task that implements it
- [ ] No "TBD", "implement later", "similar to Task N" placeholders
- [ ] Method/property names consistent across tasks (`idempotencyKey`, `audienceType`, `cdnUrl`)
- [ ] Every Rails task has an RSpec spec
- [ ] Every mobile hook with logic has a Jest test
- [ ] Devil-advocate findings F1-F12 each map to a specific task or accepted-risk doc entry
- [ ] No file-edit task lacks an explicit `git commit` step
- [ ] All dependencies installed via `npx expo install` (NOT npm install) per `CLAUDE.md`

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-01-quick-update-mobile.md`.**

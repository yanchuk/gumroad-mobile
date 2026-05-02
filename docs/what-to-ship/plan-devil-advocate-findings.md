# Devil-advocate review of implementation plan (2026-05-01)

Run by `/devil-advocate` against `implementation-plan.md`. Findings must be folded into v2 of the plan.

## BLOCKERS

### B1 — Factory trait `:compliant` does not exist
- **Fact:** `gumroad/spec/support/factories/users.rb` defines `factory :compliant_user` (sub-factory, line 93). NO `trait :compliant` exists. Codebase uses `create(:user, user_risk_state: "compliant")`.
- **Impact:** Plan calls `create(:user, :compliant)` in Tasks 3, 4, 6, 7. Every Rails request spec will raise `KeyError: Trait not registered: "compliant"` before reaching the controller.
- **Fix:** Replace `create(:user, :compliant)` → `create(:compliant_user)` (or `create(:user, user_risk_state: "compliant")`) across all spec snippets. The `:eligible_sender` trait must live INSIDE the `factory :user do ... end` block.

### B2 — Pundit explodes on mobile OAuth context
- **Fact:** `Api::Mobile::EmailsController` inherits via `Api::Mobile::BaseController < ApplicationController` which includes `PunditAuthorization`. `pundit_user` returns `SellerContext.new(user: logged_in_user, seller: current_seller)`. For OAuth-only mobile (no Devise web session), `logged_in_user` is nil → `ApplicationPolicy#initialize` raises `Pundit::NotAuthorizedError: "must be logged in"` BEFORE policy methods run.
- **Fix:** Override `pundit_user` in `Api::Mobile::EmailsController`:
  ```ruby
  def pundit_user
    SellerContext.new(user: current_api_user, seller: current_api_user)
  end
  ```
- Add a spec assertion that the policy actually runs. Current "returns 401" tests don't catch this because they never reach Pundit.

### B5 — Mobile dev client never told how to reach Rails
- **Fact:** Plan opens worktree at `~/Documents/GitHub/gumroad-mobile-quick-update`. Rails work on main checkout `~/Documents/GitHub/gumroad`. `.env` has `EXPO_PUBLIC_GUMROAD_URL=https://gumroad.dev`. Plan never instructs (a) start Rails server, (b) point mobile at local URL, (c) ensure `gumroad.dev` resolves locally.
- **Fix:** Add a Wave-0 "Boot Rails dev server + verify gumroad.dev hostname" task. Document `bundle exec rails server -p 3000`, verify `/etc/hosts` has `gumroad.dev → 127.0.0.1`, confirm `MOBILE_TOKEN` env on mobile side matches Rails.

## MAJOR

### M1 — `expo-file-system` `File.from(uri).digest(...)` API unverified for SDK 55
- Replace with `expo-crypto`'s `digestStringAsync` after reading file as base64. Or verify the SDK 55 typings explicitly. Add 5-min spike step.

### M2 — Idempotency `:reserved` fallback after deleted Installment causes duplicate
- `installment_idempotency_service.rb` line in `.reserve`: when redis has installment_id of a deleted record, `Installment.find_by(id: existing.to_i)` returns nil → falls through to `:reserved` → controller treats as fresh → republish.
- **Fix:** Return `:stale` instead of `:reserved` when find_by is nil. Controller treats `:stale` as `:in_flight` (return 409).

### M3 — Photo race: Publish before `editor.setImage` runs
- `photo.cdnUrl` is set before `editor.setImage` is awaited. State setter flushes synchronously but TenTap WebView bridge call is async — within a frame where `cdnUrl` set but `<img>` not in HTML body. Fast tappers can publish with `files[]` carrying photo but body lacks inline image.
- **Fix:** Guard `canPublish` with both `photo.status === "uploaded"` AND `photoInsertedIntoBody` flag set after `setImage(url)` resolves.

### M4 — Image-only body fails server-side `scrubbed_message` validation
- Server uses `Rails::HTML::TargetScrubber` with allowed tags `br, p` only (`installment.rb:868-872`). An image-only body `<p><img></p>` after scrub becomes `<p></p>` → `message_must_be_provided` fails → 422.
- **Fix:** Either include `photo.status === "uploaded"` as sufficient for `canPublish`, or fix server to treat installment with attached files as content-bearing.

### M5 — Time honesty: 22 tasks in 2 days unrealistic
- Realistic Phase 1 ≈ 8h (matches Sat morning + lunch). Phase 2 ≈ 6h (TenTap install + prebuild can be 1-2h on RN 0.83). Phase 3 ≈ 8h (TenTap-RN-Uniwind theme injection 3-5h alone, screen 3h). Phase 4 ≈ 4-6h. **Total: 26-30h vs ~16h budget.**
- **Fix:** Add explicit cut list: drop Maestro by Sat 18:00 if behind; drop dev-hack revert if necessary; ship publish-only without 409-retry by Sun 12:00 fallback.

### M6 — `:eligible_sender` trait may not produce `sales_cents_total >= 100_00`
- `User#sales_cents_total` may be a Stripe-aware aggregate that excludes purchases without `state: "successful"` + `succeeded_at`. The trait must set both, then verify with `expect(create(:user, :eligible_sender).sales_cents_total).to be >= 10_000` as a sanity check.

## MINOR
- m1 — verify `editor.injectCSS(css, key)` second-arg signature against installed TenTap source.
- m2 — Rack::Attack smoke pattern depends on middleware ordering (Rack::Attack runs before auth in default Rails — fine).
- m3 — Doorkeeper scope OR-semantics is intended (matches `devices_controller.rb:4`).
- m4 — Verified line numbers (line 71-77 _layout.tsx, line 208 auth-context.tsx, lib/request.ts:80-96).
- m5 — `ActiveStorage::Blob.create_before_direct_upload!` accepts `service_name` optional; plan's permit list is fine.

## What's solid (anti-fabrication)
- File-path sentinels verified.
- Doorkeeper scope syntax matches existing controllers.
- `audience_members_count`, `MINIMUM_SALES_CENTS_VALUE`, `eligible_to_send_emails?` exist as referenced.
- `current_api_user` exists at `base_controller.rb:16`.
- TDD task structure is well-formed.

## Top 3 must-fix before execution
1. **B1** — global find/replace `:compliant` → `compliant_user` factory (5 min).
2. **B2** — override `pundit_user` in mobile controllers (10 min) or every spec returns 500.
3. **B5** — document Rails server boot + URL config (15 min).

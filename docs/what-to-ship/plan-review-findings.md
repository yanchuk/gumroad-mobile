# Plan-review findings (v3 → v4)

Run by `/plan-review` against `implementation-plan.md` v3. Verdict: **GO WITH CONDITIONS**.

## CRITICAL — must fix before code

### PR-1 (Issue 2) — `installment_mobile_json_data` crashes with nil url_redirect
- **Fact:** `gumroad/app/models/installment.rb:274-303` — signature `(purchase: nil, subscription: nil, imported_customer: nil, follower: nil)`. With no args, `installment_url_redirect` resolves to nil → line 287 calls `nil.mobile_product_file_json_data(...)` → NoMethodError.
- **Fix:** In Task 7 controller, replace `service.installment.installment_mobile_json_data` with `{ external_id: service.installment.external_id }`. The mobile client only uses `external_id` for confirmation. Apply to both fresh-publish and idempotency-replay code paths.

### PR-2 (Issue 4) — `PhotoStatus` type missing `"resizing"` → typecheck fails
- **Fact:** Plan line 1601 — `PhotoStatus = "idle" | "uploading_blob" | "uploading_s3" | "fetching_cdn_url" | "uploaded" | "failed"`. Plan line 2017 — `Record<PhotoStatus, string>` with `resizing: "Resizing…"`. TypeScript will fail.
- **Fix:** Remove `resizing: "Resizing…"` from `labelFor`. Resizing was dropped; keep dropped.

### PR-3 (Issue 5) — `<Toolbar>` wrapped in `<KeyboardAvoidingView>` — contradicts the plan's own anti-pattern
- **Fact:** Plan lines 1913-1915 — `<Toolbar editor={editor} />` is wrapped in `<KeyboardAvoidingView>`. The plan explicitly says (Wave 5 audit + S1 acceptance criteria) "do NOT wrap `<RichText>` in `<KeyboardAvoidingView>` — TenTap handles keyboard via `avoidIosKeyboard: true`."
- **Fix:** Remove the `<KeyboardAvoidingView>` wrapper from `RichTextBody`. Render `<Toolbar>` as a sibling of `<RichText>` inside the parent `<View>`.

## IMPORTANT

### PR-4 (Issue 6) — `AudienceSheet` onSelect resets photo state on every audience change
- **Fact:** Plan lines 2319-2323 — `onSelect={(t) => { setAudienceType(t); photo.reset(); setPhotoInsertedIntoBody(false); }}`. Audience selection has no semantic relationship to the photo upload.
- **Fix:** Remove `photo.reset()` and `setPhotoInsertedIntoBody(false)` from `onSelect`. Keep them only on the explicit photo-remove handler.

### PR-5 (Issue 7) — usePublishEmail has no 409 retry logic; M17 mockup unimplemented
- **Fact:** `request()` throws generic Error on 409. `usePublishEmail` propagates the error. M17 mockup specifies "Publish in progress, retrying in 5s" countdown banner.
- **Fix:** In `usePublishEmail`, parse 409 from error message; expose `isConflict` flag + `retryAfter` value; in EmailComposeScreen, render the M17 info banner with countdown and auto-retry. Add Jest test that mocks 409→200 sequence.

### PR-6 (Issue 8) — emails_create_spec missing photo-with-files happy path
- **Fact:** Plan's Task 7 spec only covers no-photo payload. The PR-1 nil-crash would not be caught.
- **Fix:** Add a `"creates installment with photo file"` example sending `files: [{ url: "<S3_BASE_URL>/test.jpg", position: 0, stream_only: false }]`; assert 200.

### PR-7 (Issue 9) — `:eligible_sender` trait may not produce `sales_cents_total >= $100`
- **Fact:** Trait calls `create_list(:purchase, 25, ..., purchase_state: "successful")` but does NOT set `succeeded_at`. If `User#sales_cents_total` requires `succeeded_at IS NOT NULL` (likely), trait yields a user with sales_cents_total = 0.
- **Fix:** In the `:eligible_sender` trait, set `succeeded_at: Time.current` on each purchase. Add a CI-enforced spec example asserting `expect(create(:user, :eligible_sender).sales_cents_total).to be >= 10_000`.

## MINOR

### PR-8 (Issue 1) — CDN URL spec only asserts `be_present`, doesn't verify rewrite
- **Fix:** In Task 4 spec, stub `CDN_URL_MAP` with a known origin → cdn prefix; assert returned URL starts with the cdn prefix.

### PR-9 (Issue 3) — audience_count assertion missing
- **Fix:** In Task 6 spec, seed one purchase for `:eligible_sender`; assert `count` for `"seller"` returns >= 1.

### PR-10 (Issue 11) — staleTime not in DoD
- **Fix:** Add `staleTime: 5 * 60 * 1000` verification to Task 12 DoD.

## Anti-padding note
- Section 4 (Performance) — no issues, plan is solid.
- F1-F12 + B1-M6 + C1-M-rack from prior reviews are correctly applied; not re-flagged here.

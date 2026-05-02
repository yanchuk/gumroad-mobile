# Codex review of implementation plan v2 (2026-05-01)

Run by `/codex` against `implementation-plan.md` v2. Codex found 3 BLOCKERs that devil-advocate missed. All verified manually before applying.

## BLOCKERS — verified true

### C1 — `SaveInstallmentService.perform` does NOT exist (verified at `gumroad/app/services/save_installment_service.rb:13`)
- **Actual API:** `.process` (not `.perform`); returns boolean; result via `service.installment` and `service.error`
- **Plan calls:** `SaveInstallmentService.new(...).perform` and reads `result[:success]` / `result[:installment]` / `result[:message]` — all wrong
- **Existing reference:** `gumroad/app/controllers/emails_controller.rb:120-128` uses `service.process` then `service.installment` / `service.error`
- **Fix:** In Task 7 controller, replace:
  ```ruby
  result = SaveInstallmentService.new(...).perform
  if result[:success] ...
  ```
  with:
  ```ruby
  service = SaveInstallmentService.new(seller:, params: service_params, preview_email_recipient: nil)
  if service.process
    InstallmentIdempotencyService.complete(seller_id: seller.id, key: idempotency_key, installment_id: service.installment.id)
    render json: { success: true, installment: service.installment.installment_mobile_json_data }
  else
    InstallmentIdempotencyService.release(seller_id: seller.id, key: idempotency_key)
    render json: { success: false, message: service.error }, status: :unprocessable_entity
  end
  ```

### C2 — CDN URL fails `ProductFile#valid_url?` (verified at `gumroad/app/models/product_file.rb:72-86`)
- **Validation:** `has_cdn_url?` returns true only if `url&.starts_with?(S3_BASE_URL)` (where `S3_BASE_URL = "#{AWS_S3_ENDPOINT}/#{S3_BUCKET}/"`)
- **Plan flow:** mobile uses `cdn_url_for(blob.url)` → CDN-rewritten URL (e.g. `https://gumroad-staging-1.cdn.gumroad.com/...`) which does NOT start with `S3_BASE_URL` (the raw S3 prefix)
- **Result:** `files: [{ url: <cdn_url> }]` would fail validation with *"Please provide a valid file URL."*
- **Fix:** Mobile must send the raw S3 URL (`blob.url` from ActiveStorage) in `installment.files[].url`. CDN URL is only for display in the editor body (`<img src="<cdn_url>">`).
- **Implementation change:** `Api::Mobile::DirectUploadsController#create` response must include both `signed_id` AND `blob_url` (raw S3 URL). Mobile usePhotoUpload returns `{ rawUrl, cdnUrl }`. EmailComposeScreen passes `rawUrl` to `files[]` and `cdnUrl` to `editor.setImage`.

### C3 — Doorkeeper scope semantics are AND, not OR
- **Verified:** Doorkeeper's `acceptable?` uses `all?` not `any?` for multi-scope check
- **Existing controllers** use varying patterns:
  - `:mobile_api` alone (purchases, sessions, sales, media_locations, feature_flags, consumption_analytics)
  - `:creator_api, :mobile_api` together (devices)
  - `:creator_api` alone via lambda (analytics)
- **Token has** `mobile_api creator_api account` scopes (`auth-context.tsx:16`) so AND of both passes
- **Fix:** Plan claims "OR" semantics — wrong description. Functionally fine for our token, but be explicit. Use `:mobile_api` alone (matches most common existing pattern) OR keep AND-of-both with a corrected explanation.

## BUG D1 — MD5 of base64 string ≠ MD5 of binary content
- **Plan calls:** `Crypto.digestStringAsync(MD5, base64String, { encoding: BASE64 })`
- **Bug:** `digestStringAsync` hashes the BASE64-ENCODED TEXT (UTF-8 bytes of the base64 string), NOT the raw file bytes. ActiveStorage will reject the upload because S3 enforces the checksum on the binary bytes.
- **Fix path A:** Try the original `expo-file-system` `File.from(uri).digest({ algorithm: "MD5", encoding: "base64" })` API (devil-advocate avoided it as unverified, but it's the right shape). Add a 5-min derisking spike in Wave 4.
- **Fix path B:** If File.digest doesn't exist on SDK 55, install `react-native-quick-crypto` or `crypto-js` and compute binary MD5 from the file's bytes.
- **Fallback path C:** Skip ActiveStorage direct-upload entirely; proxy bytes through Rails (slower but reliable). New `POST /api/mobile/photo_upload` accepts multipart, Rails uploads to S3 with correct checksum.

## OTHER FINDINGS

### M-rack — Rack::Attack throttle pattern wrong
- **Plan uses:** `Rack::Attack.throttle("api/mobile/emails:create:per_ip", limit:, period:) do |req|`
- **Existing convention:** `throttle_by_ip path:, method:, requests:, period:` helper
- **Fix:** `throttle_by_ip path: "/api/mobile/emails", method: :post, requests: 5, period: 60.seconds`

### Cosmetic
- Plan's description of `SellerContext` as `Struct.new(:user, :seller)` is wrong. Actual class uses keyword initializer (`gumroad/app/policies/seller_context.rb:3,12`). Functionally `SellerContext.new(user: x, seller: y)` works either way.
- TenTap APIs (`_subscribeToEditorStateUpdate`, `setImage`, `injectCSS`, etc.) marked UNVERIFIED by Codex — the package is not installed yet. Verify after `npx expo install`.

## What's solid (verified by Codex)
- All file paths correct (`_layout.tsx:71`, `auth-context.tsx:208`, `lib/request.ts:80`, etc.)
- `Installment#audience_members_count` exists (`gumroad/app/models/installment.rb:779`)
- `seller.eligible_to_send_emails?` exists (`gumroad/app/models/user.rb:974`)
- `current_api_user` reachable from `Api::Mobile::BaseController`
- `CdnUrlHelper#cdn_url_for` is public
- `ActiveStorage::Blob.create_before_direct_upload!` accepts `filename:, byte_size:, checksum:, content_type:` on Rails 7.1.6
- `:eligible_sender` trait can be added inside existing `factory :user`
- `installment.publish!` chain (PostResendApi → PushNotificationWorker) works as planned
- All mobile UI primitives exist (`Screen`, `Sheet`, `Card`, `Button`, `Text`, `LineIcon`)

## Top 3 must-fix-before-execution
1. **C1** — replace every `.perform` with `.process` and use `service.installment` / `service.error`
2. **C2** — return raw `blob_url` from `direct_uploads`; mobile sends rawUrl to `files[].url`, cdnUrl to `editor.setImage`
3. **C3 + D1** — Doorkeeper `:mobile_api` alone; MD5 binary digest spike in Wave 4

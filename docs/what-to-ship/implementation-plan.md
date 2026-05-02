# Quick Update — Mobile Email Composer Implementation Plan v6

**Summary.** The engineering execution plan for the mobile email composer. Six versioned iterations of a task-by-task build plan covering both the Rails backend and the Expo/React Native client.

**What it's about.** Architecture (thin Rails wrappers around `SaveInstallmentService`, Doorkeeper + Pundit auth, TenTap rich-text editor in an Expo Router modal), the full tech stack, the agent roles used to execute the plan (Orchestrator, Developer, Verifier, Auditor), and a complete log of corrections made after each review pass. The plan spans two repos and includes a mandatory dev-client rebuild gate for native dependencies.

**Why this exists.** This is the artifact an agentic coding session reads to implement the feature task by task. The scope spans two repos. Multiple review passes have caught real bugs before any code was written. Sub-agents need the work decomposed precisely enough to implement one sprint at a time without ambiguity.

**What shaped it.**
- Six successive review passes (devil-advocate, two Codex reviews, a plan review, and a post-Wave 2 grounding pass by parallel read-only verifiers) that caught and corrected 20+ concrete bugs before any code was written.
- Key corrections discovered the hard way: URL prefix is `/mobile/` not `/api/mobile/`; factory names like `"doorkeeper/access_token"` differ from docs; `SaveInstallmentService#process` returns boolean, not a hash; `throttle_by_ip` is the codebase wrapper over Rack::Attack.
- The harness-protocol orchestration model (sub-agents per sprint, token budget allocation, sonnet for mechanical work, opus for auditing).
- A fork-aware git workflow (origin = applicant's fork, upstream = antiwork).
- TenTap compatibility risk with React 19 / RN 0.83.5 / New Architecture, time-boxed at two hours with two fallback options on the page.

---

> **For agentic workers:** REQUIRED SUB-SKILL: Use `harness-protocol:harness-protocol` to execute this plan task-by-task. The orchestrator (main session) NEVER implements features or audits its own work — it spawns Developer / Verifier / Auditor sub-agents per sprint and drives the fix loop. See "Pipeline + agent roles" section below.

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

**Devil-advocate findings folded in (v2):** B1 (factory trait fix), B2 (pundit_user override), B5 (Wave 0 environment), M1 (expo-crypto MD5), M2 (idempotency :stale), M3 (photo race fix), M4 (image-only body known limitation), M5 (time budget + cut list), M6 (eligible_sender sanity check). Original findings F1-F12 also retained.

**Codex findings folded in (v3):** C1 (.process not .perform), C2 (raw S3 URL for files[], CDN URL for editor display), C3 (Doorkeeper :mobile_api alone), D1 (MD5 binary digest spike), M-rack (throttle_by_ip helper).

**Plan-review findings folded in (v4):** PR-1 (json_data nil crash), PR-2 (PhotoStatus resizing removed), PR-3 (Toolbar KeyboardAvoidingView removed), PR-4 (audience-change preserves photo), PR-5 (409 conflict UX + retry), PR-6 (photo-files spec), PR-7 (eligible_sender succeeded_at), PR-8 (CDN rewrite assertion), PR-9 (audience count assertion), PR-10 (staleTime DoD).

**Final Codex review folded in (v5):** CR1 (`new File(uri).md5` + hex→base64 for ActiveStorage checksum, NOT `File.from().digest()`), CR2 (SheetHeader onClose prop), CR3 (F-finding traceability table).

**v6 structural changes:** harness-protocol orchestration + agent role map; fork-aware git workflow (origin = yanchuk's fork, upstream = antiwork); Rails worktree added (Wave 0 Task 0b); cross-repo parallelization map; sonnet-default for Developer/Verifier sub-agents.

---

## Pipeline + agent roles (harness-protocol)

The plan executes via the **harness-protocol** Orchestrator → Developer → Verifier → Auditor loop. Each sprint = one task (or a small group of co-changing tasks).

### Roles

| Role | Who | Model | What it does | What it never does |
|---|---|---|---|---|
| **Orchestrator** | main Claude session | (parent context) | Creates sprints with acceptance criteria; spawns sub-agents; reads structured reports; drives the fix loop; signs off when audit ≥9/10 | Implement features; audit own decisions |
| **Developer** | `general-purpose` Agent | **sonnet** (saves tokens — mechanical code/test writing) | Writes Rails controllers / specs / migrations / mobile components / hooks / tests; runs project gates locally; returns structured report | Self-grade; iterate without orchestrator instruction |
| **Verifier** | `general-purpose` Agent | **sonnet** | Runs all project gates (rspec/rubocop/typecheck/lint/jest/maestro); confirms files-on-disk match plan; maps each acceptance criterion → test:line; returns PASS/FAIL with evidence | Fix code; soften findings |
| **Auditor** | `feature-dev:code-reviewer` Agent | **opus** (deep reasoning required) | Grades each acceptance criterion 1-10 with file:line evidence; finds problems; skeptical default | Fix code; praise; rationalize |
| **External (final)** | `codex:codex-rescue` | (default Codex model) | Final cumulative review on the merged sprint diffs before PRs open | None |

### Per-sprint cycle

```
Orchestrator
  ├─► Developer (sonnet)              ─ implements, runs gates locally
  ├─► [orchestrator runs project gates again as a sanity check]
  ├─► Verifier (sonnet)               ─ independent gate run + evidence map
  │   └─► if FAIL → back to Developer with concrete fix list
  └─► Auditor (feature-dev:code-reviewer, opus) ─ grades >9/10 per criterion
      └─► if any score <9/10 → back to Developer; re-audit; loop
  Sprint signs off only when:
    - Verifier PASS
    - Every audit criterion ≥ 9/10
  Then commit + proceed to next sprint.
```

### Sub-agent prompts (templates)

**Developer prompt template:** "You are the Developer for sprint <X>. Implement Tasks <list>. Acceptance criteria: <list>. Files to create/modify: <list>. Run project gates locally before returning. Report `{ files_changed, tests_added, gates_run, gates_status, diff_summary, notes }`."

**Verifier prompt template:** "You are the Verifier for sprint <X>. Independently run the project gates. For each acceptance criterion in <list>, locate the test file:line that exercises it. Report `{ gates_status, coverage_map, failures, verdict: PASS|FAIL }`. Do not fix anything. Be skeptical by default."

**Auditor prompt template:** "You are a skeptical reviewer. Find problems, not praise. Grade each acceptance criterion 1-10 with file:line evidence. If unsure whether something is a bug, treat it as a bug. Never talk yourself out of a finding. Threshold for sprint sign-off: every criterion ≥9/10. Report `{ scores: [{criterion, score_0_10, evidence, reasoning}], overall_verdict, blocking_findings }`."

### Token efficiency posture

- **Default model for sub-agents = sonnet.** Use it for: Developer, Verifier, mechanical doc rewrites, repetitive test scaffolding, search/grep across both repos, file edits with deterministic patterns.
- **Use opus only for:** Auditor (skeptical depth), strategic decisions about scope cuts, debugging complex multi-system bugs (e.g., "why does push not arrive on simulator B"), final pre-submission review.
- **External Codex review** runs once at the end across the cumulative diff.

### Reports location

Each sub-agent's structured report is stored under:
```
.context/harness/sprint-<N>/<role>.json
```

The orchestrator reads these to make sign-off decisions. Reports are gitignored.

---

## Parallelization map

The harness protocol **forbids intra-sprint parallelism** — Developer → Verifier → Auditor are strictly sequential inside ONE sprint. But sprints across independent codebases can run in parallel.

### What can run in parallel

```
T0 (start)
   │
   ├──► [Rails track]  Wave 1 → Wave 2 → Wave 3   (sequential, harness per sprint)
   │
   └──► [Mobile track] Wave 4 → Wave 5            (sequential, harness per sprint)

T1 (Rails W3 complete + Mobile W5 complete)
   │
   └──► Wave 6 (Mobile composer screen — needs Rails endpoints reachable for hand-test)
            │
            └──► Wave 7 (E2E + delivery — needs both tracks complete)
```

### Concrete parallelization rules

- **Rails track** (Waves 1-3, ~8 hours sequentially): runs in `~/Documents/GitHub/gumroad-quick-update`
- **Mobile track** (Waves 4-5, ~6 hours sequentially): runs in `~/Documents/GitHub/gumroad-mobile-quick-update`
- **Wave 6** depends on: Rails Wave 3 complete (endpoints exist) — though Mobile screen UI can be drafted earlier with mocked responses
- **Wave 7** depends on: BOTH tracks complete

### How parallelization is implemented

The orchestrator spawns sprint-N (Rails) and sprint-M (Mobile) Developers concurrently when they have no shared deps:

```
Orchestrator
  ├──► Developer-Rails-W1 (sonnet, in gumroad-quick-update worktree)
  └──► Developer-Mobile-W4 (sonnet, in gumroad-mobile-quick-update worktree)
       (both run; orchestrator waits for both reports before spawning Verifiers)
```

Verifiers + Auditors are then spawned per sprint (still sequential within their own sprint). This is allowed because the file boundaries are clean (no shared files across repos).

### Worktree isolation

Each track has its own worktree directory:
- Rails: `~/Documents/GitHub/gumroad-quick-update` (branch `feat/mobile-emails-create`)
- Mobile: `~/Documents/GitHub/gumroad-mobile-quick-update` (branch `feat/quick-update-mobile`)

Worktrees prevent cross-contamination. The main `~/Documents/GitHub/gumroad` and `~/Documents/GitHub/gumroad-mobile` checkouts stay on `main` for reference / comparison / running prod state side-by-side.

---

## Time budget (M5)

Realistic estimate: **26-30h** vs ~16h aspirational budget.

**Cut list (in priority order):**
- Drop Wave 7 Task 21 (Maestro) if behind by **Sat 18:00**
- Drop Task 19 (Dashboard FAB) and use deep-link demo if behind by **Sun 09:00**
- Ship publish-only without 409-retry if behind by **Sun 12:00**

---

## Executive checklist (cross-wave)

- [ ] V6-fork — both repos have origin → yanchuk/* fork, upstream → antiwork/*
- [ ] V6-worktree — Rails worktree at gumroad-quick-update; Mobile worktree at gumroad-mobile-quick-update
- [ ] V6-harness — every sprint follows Developer → Verifier → Auditor loop with >9/10 audit threshold
- [ ] V6-parallel — Rails track + Mobile track run in parallel until Wave 6 dependency
- [ ] V6-tokens — Developer + Verifier sub-agents use sonnet; Auditor uses opus; final external review uses Codex
- [ ] Wave 0 complete (Rails server reachable, mobile env matches)
- [ ] Wave 1 complete (seed patched, routes added)
- [ ] Wave 2 complete (direct_uploads + s3_utility wrappers)
- [ ] Wave 3 complete (idempotency, emails#create, audience_options, throttle)
- [ ] Wave 4 complete (mobile deps installed, modal registered, dev hack reverted)
- [ ] Wave 5 complete (5 hooks/primitives)
- [ ] Wave 6 complete (4 components/screen)
- [ ] Wave 7 complete (E2E verified, PRs opened, video recorded)
- [ ] Devil-advocate fixes B1, B2, B5, M1-M6 all applied
- [ ] Demo seller eligible_to_send_emails? returns true (verified in console)
- [ ] No new gem dependencies; no new OAuth scopes
- [ ] Codex C1 — `.process` (not `.perform`); read from `service.installment` / `service.error`
- [ ] Codex C2 — `files[].url` uses raw S3 `blob_url`; editor.setImage uses cdn_url
- [ ] Codex C3 — Doorkeeper `:mobile_api` alone (AND semantics)
- [ ] Codex D1 — MD5 binary digest spike resolved in Wave 4
- [ ] M-rack — Rack::Attack uses `throttle_by_ip` helper
- [ ] PR-1 — `installment_mobile_json_data` replaced with `{ external_id: }` in both controller paths
- [ ] PR-2 — `resizing` removed from `labelFor` in `PhotoAttachment` and from `canPublish` disable-list
- [ ] PR-3 — `<KeyboardAvoidingView>` wrapper removed from `<Toolbar>` in `RichTextBody`
- [ ] PR-4 — `photo.reset()` removed from `AudienceSheet` `onSelect`
- [ ] PR-5 — `usePublishEmail` exposes `isConflict`; `EmailComposeScreen` shows M17 countdown banner and auto-retries on 409
- [ ] PR-6 — `emails_create_spec.rb` includes photo-with-files happy-path example
- [ ] PR-7 — `:eligible_sender` trait sets `succeeded_at: Time.current`; sanity-check spec added
- [ ] PR-8 — `s3_utility_cdn_url_spec.rb` asserts CDN prefix rewrite (not just `be_present`)
- [ ] PR-9 — `emails_audience_options_spec.rb` asserts non-zero seller segment count
- [ ] PR-10 — Task 12 DoD includes `staleTime` grep verification
- [ ] CR1 — `usePhotoUpload` uses `new File(uri).md5` synchronously + Buffer hex→base64 (verified against installed SDK 55 types)
- [ ] CR2 — `AudienceSheet` passes `onClose` to `SheetHeader`
- [ ] CR3 — F-finding traceability table present

---

## File structure

### Rails (`~/Documents/GitHub/gumroad-quick-update`)

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

### Mobile (`~/Documents/GitHub/gumroad-mobile-quick-update`)

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

# Wave 0 — Environment readiness (BOTH repos)

> Gate: do not start Wave 1 until all three checks below pass.

### Wave 0 — Task 0a: Ensure forks are set up

- [ ] **Step 1: Verify Rails repo has fork remote**
  ```bash
  cd ~/Documents/GitHub/gumroad
  git remote -v
  ```
  Expected:
  ```
  origin    https://github.com/yanchuk/gumroad.git (fetch/push)
  upstream  https://github.com/antiwork/gumroad.git (fetch)
  ```
  If `origin` points to `antiwork/gumroad`, fork via GitHub UI then re-point: `git remote rename origin upstream && git remote add origin https://github.com/yanchuk/gumroad.git`

- [ ] **Step 2: Fork the mobile repo + re-point origin**
  ```bash
  cd ~/Documents/GitHub/gumroad-mobile
  git remote -v
  ```
  Currently shows `origin → antiwork/gumroad-mobile`. Fork via GitHub UI to `yanchuk/gumroad-mobile`, then:
  ```bash
  git remote rename origin upstream
  git remote add origin https://github.com/yanchuk/gumroad-mobile.git
  git fetch upstream
  git fetch origin
  ```
  Expected after:
  ```
  origin    https://github.com/yanchuk/gumroad-mobile.git (fetch/push)
  upstream  https://github.com/antiwork/gumroad-mobile.git (fetch)
  ```

- [ ] **Step 3: Verify both repos build off `upstream/main`** (so we don't accidentally branch from a stale fork main):
  ```bash
  cd ~/Documents/GitHub/gumroad && git fetch upstream && git rev-parse upstream/main
  cd ~/Documents/GitHub/gumroad-mobile && git fetch upstream && git rev-parse upstream/main
  ```

## Task 0.A: Boot Rails dev server

- [ ] **Step 1: Start the Rails server**

```bash
cd ~/Documents/GitHub/gumroad
bundle exec rails server -p 3000
```

Expected: server boots and logs `Listening on http://0.0.0.0:3000`.

- [ ] **Step 2: Verify `gumroad.dev` resolves to localhost**

```bash
cat /etc/hosts | grep gumroad.dev
```

Expected: line containing `127.0.0.1  gumroad.dev` (or `::1  gumroad.dev`). If missing, add it:

```bash
echo "127.0.0.1  gumroad.dev" | sudo tee -a /etc/hosts
```

Then verify: `curl -s -o /dev/null -w "%{http_code}" http://gumroad.dev:3000/` → should return `200` or `302`.

- [ ] **Step 3: Open the mobile worktree**

```bash
cd ~/Documents/GitHub/gumroad-mobile
git fetch upstream
git worktree add -b feat/quick-update-mobile ../gumroad-mobile-quick-update upstream/main
```

### Wave 0 — Task 0b: Open Rails worktree

- [ ] **Step 1: Open the Rails worktree**
  ```bash
  cd ~/Documents/GitHub/gumroad
  git fetch upstream
  git worktree add -b feat/mobile-emails-create ../gumroad-quick-update upstream/main
  cd ../gumroad-quick-update
  ```

- [ ] **Step 2: Verify worktree active branch**
  ```bash
  git branch --show-current
  ```
  Expected: `feat/mobile-emails-create`

- [ ] **Step 3: Boot Rails dev server FROM THE WORKTREE**
  ```bash
  cd ~/Documents/GitHub/gumroad-quick-update
  bundle install
  bundle exec rails server -p 3000
  ```
  All Rails work in Waves 1-3 happens in this worktree, NOT the main `~/Documents/GitHub/gumroad` checkout.

## Task 0.B: Verify MOBILE_TOKEN env match

- [ ] **Step 1: Check Rails GlobalConfig value**

```bash
cd ~/Documents/GitHub/gumroad-quick-update
bundle exec rails runner 'puts GlobalConfig.get("MOBILE_TOKEN").inspect'
```

Note the value (it will be a string like `"abc123"`).

- [ ] **Step 2: Check mobile .env value**

```bash
grep EXPO_PUBLIC_MOBILE_TOKEN ~/Documents/GitHub/gumroad-mobile-quick-update/.env.local
```

- [ ] **Step 3: Confirm they match**

If they differ, update `.env.local` in the mobile worktree to match Rails. No commit needed — `.env.local` is gitignored.

**Acceptance criteria:**
- [ ] `curl http://gumroad.dev:3000/` returns a non-5xx status
- [ ] `MOBILE_TOKEN` from Rails GlobalConfig matches `EXPO_PUBLIC_MOBILE_TOKEN` in mobile `.env.local`
- [ ] Mobile worktree exists at `~/Documents/GitHub/gumroad-mobile-quick-update`

### Wave 0 checklist
- [ ] Task 0a complete (both repos have fork remotes set up correctly)
- [ ] Task 0b complete (Rails worktree open at gumroad-quick-update, server boots)
- [ ] Task 0.A complete (Rails server up, gumroad.dev resolves)
- [ ] Task 0.B complete (MOBILE_TOKEN values match)
- [ ] Wave-level integration: `curl http://gumroad.dev:3000/api/mobile/ping` returns any non-connection-refused response

---

# Wave 1 — Rails: data + routes (DEMO UNBLOCK)

## Task 1: Patch demo seed (F1 unblock)

**Files:**
- Modify: `~/Documents/GitHub/gumroad-quick-update/db/seeds/030_development/mobile_app_test_data.rb`
- Test (verify in console): no spec — verified manually pre-recording

- [ ] **Step 1: Open the seed file and inspect current state**

```bash
cd ~/Documents/GitHub/gumroad-quick-update
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
cd ~/Documents/GitHub/gumroad-quick-update
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
cd ~/Documents/GitHub/gumroad-quick-update
git add db/seeds/030_development/mobile_app_test_data.rb
git commit -m "Seed mobile_seller1 with \$100+ sales + completed payout

So mobile email-composition demo can publish.
Refs Quick Update Mobile (Antiwork hiring submission)."
```

**Acceptance criteria:**
- [ ] `eligible_to_send_emails?` returns `true` for `mobile_seller1_do_not_edit@gumroad.com` in console
- [ ] `sales_cents_total` ≥ 10000 in console output
- [ ] `has_completed_payouts?` returns `true` in console output
- [ ] `git status` shows only `db/seeds/030_development/mobile_app_test_data.rb` modified

---

## Task 2: Add routes for new mobile endpoints

**Files:**
- Modify: `~/Documents/GitHub/gumroad-quick-update/config/routes.rb` (lines 215-260, mobile scope)

- [ ] **Step 1: Locate the mobile scope**

```bash
cd ~/Documents/GitHub/gumroad-quick-update
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
cd ~/Documents/GitHub/gumroad-quick-update
bundle exec rails routes | grep -E "api/mobile/(emails|direct_uploads|s3_utility)"
```

Expected: 4 routes shown — `POST /api/mobile/emails`, `GET /api/mobile/emails/audience_options`, `POST /api/mobile/direct_uploads`, `GET /api/mobile/s3_utility/cdn_url_for_blob`.

- [ ] **Step 4: Commit**

```bash
git add config/routes.rb
git commit -m "Add mobile-namespace routes: emails, direct_uploads, s3_utility cdn"
```

**Acceptance criteria:**
- [ ] `bundle exec rails routes | grep api/mobile/emails` shows exactly 2 routes (`POST` + `GET audience_options`)
- [ ] `bundle exec rails routes | grep api/mobile/direct_uploads` shows `POST` route
- [ ] `bundle exec rails routes | grep api/mobile/s3_utility` shows `GET` route
- [ ] `git status` shows only `config/routes.rb` modified

### Wave 1 checklist
- [ ] Task 1 complete (seed patched, eligible_to_send_emails? verified true)
- [ ] Task 2 complete (4 routes registered)
- [ ] Wave-level integration: `bundle exec rails routes | grep api/mobile | wc -l` returns ≥ 4 new routes

---

# Wave 2 — Rails: storage wrappers

## Task 3: `Api::Mobile::DirectUploadsController` + spec (F2)

**Files:**
- Create: `~/Documents/GitHub/gumroad-quick-update/app/controllers/api/mobile/direct_uploads_controller.rb`
- Create: `~/Documents/GitHub/gumroad-quick-update/spec/requests/api/mobile/direct_uploads_create_spec.rb`

- [ ] **Step 1: Write the failing spec**

> **B1 fix applied:** use `create(:user, user_risk_state: "compliant")` — NOT `create(:user, :compliant)` (trait does not exist).

```ruby
# spec/requests/api/mobile/direct_uploads_create_spec.rb
require "rails_helper"

RSpec.describe "API::Mobile::DirectUploads", type: :request do
  let(:seller) { create(:user, user_risk_state: "compliant") }
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

- [ ] **GATE — Step 2: Run spec to verify it fails**

```bash
cd ~/Documents/GitHub/gumroad-quick-update
bundle exec rspec spec/requests/api/mobile/direct_uploads_create_spec.rb
```

Expected: FAIL with `uninitialized constant Api::Mobile::DirectUploadsController`.
**Do not proceed to Step 3 until you confirm the test fails for the EXPECTED reason. If it passes already, the test is wrong.**

- [ ] **Step 3: Create the controller**

```ruby
# app/controllers/api/mobile/direct_uploads_controller.rb
# frozen_string_literal: true

class Api::Mobile::DirectUploadsController < Api::Mobile::BaseController
  # C3 fix: Doorkeeper scopes are AND-semantics, not OR. Match existing pattern in api/mobile/purchases_controller.rb:4. The :creator_api scope is enforced by Pundit (InstallmentPolicy) instead.
  before_action { doorkeeper_authorize! :mobile_api }

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
        blob_url: blob.url,  # C2 fix: raw S3 URL for files[].url (passes ProductFile#valid_url? S3_BASE_URL prefix check)
        direct_upload: {
          url: blob.service_url_for_direct_upload,
          headers: blob.service_headers_for_direct_upload
        }
      }
    end
end
```

- [ ] **GATE — Step 4: Run spec to verify it passes**

```bash
bundle exec rspec spec/requests/api/mobile/direct_uploads_create_spec.rb
```

Expected: PASS — 3 examples, 0 failures.
**Do not proceed to Step 5 if any example fails.**

- [ ] **Step 5: Commit**

```bash
git add app/controllers/api/mobile/direct_uploads_controller.rb spec/requests/api/mobile/direct_uploads_create_spec.rb
git commit -m "Add Api::Mobile::DirectUploadsController for ActiveStorage direct-upload"
```

**Acceptance criteria:**
- [ ] All 3 RSpec examples pass (0 failures)
- [ ] No new RuboCop offences (`bundle exec rubocop app/controllers/api/mobile/direct_uploads_controller.rb`)
- [ ] `git status` shows exactly the 2 listed files added

---

## Task 4: `Api::Mobile::S3UtilityController#cdn_url_for_blob` + spec

**Files:**
- Create: `~/Documents/GitHub/gumroad-quick-update/app/controllers/api/mobile/s3_utility_controller.rb`
- Create: `~/Documents/GitHub/gumroad-quick-update/spec/requests/api/mobile/s3_utility_cdn_url_spec.rb`

- [ ] **Step 1: Write the failing spec**

> **B1 fix applied:** use `create(:user, user_risk_state: "compliant")`.

```ruby
# spec/requests/api/mobile/s3_utility_cdn_url_spec.rb
require "rails_helper"

RSpec.describe "API::Mobile::S3Utility", type: :request do
  let(:seller) { create(:user, user_risk_state: "compliant") }
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

    it "PR-8: returns CDN-rewritten URL when CDN_URL_MAP has a matching origin" do
      stub_const("CDN_URL_MAP", { "#{AWS_S3_ENDPOINT}/#{S3_BUCKET}" => "https://test-cdn.example.com" })
      blob = ActiveStorage::Blob.create_before_direct_upload!(filename: "x.jpg", byte_size: 1, checksum: Digest::MD5.base64digest("y"), content_type: "image/jpeg")
      get "/api/mobile/s3_utility/cdn_url_for_blob", params: { key: blob.key, mobile_token: }, headers: auth_headers
      expect(response.parsed_body["url"]).to start_with("https://test-cdn.example.com")
    end
  end
end
```

- [ ] **GATE — Step 2: Run spec to verify it fails**

```bash
bundle exec rspec spec/requests/api/mobile/s3_utility_cdn_url_spec.rb
```

Expected: FAIL — `uninitialized constant Api::Mobile::S3UtilityController`.
**Do not proceed to Step 3 until you see this specific failure.**

- [ ] **Step 3: Create the controller**

```ruby
# app/controllers/api/mobile/s3_utility_controller.rb
# frozen_string_literal: true

class Api::Mobile::S3UtilityController < Api::Mobile::BaseController
  include CdnUrlHelper

  before_action { doorkeeper_authorize! :mobile_api }

  def cdn_url_for_blob
    blob = ActiveStorage::Blob.find_by_key(params[:key])
    return render(json: { success: false, message: "Blob not found" }, status: :not_found) if blob.nil?
    render json: { url: cdn_url_for(blob.url) }
  end
end
```

- [ ] **GATE — Step 4: Run spec to verify it passes**

```bash
bundle exec rspec spec/requests/api/mobile/s3_utility_cdn_url_spec.rb
```

Expected: PASS — 3 examples, 0 failures.
**Do not proceed to Step 5 if any example fails.**

- [ ] **Step 5: Commit**

```bash
git add app/controllers/api/mobile/s3_utility_controller.rb spec/requests/api/mobile/s3_utility_cdn_url_spec.rb
git commit -m "Add Api::Mobile::S3UtilityController#cdn_url_for_blob"
```

**Acceptance criteria:**
- [ ] All 3 RSpec examples pass (0 failures)
- [ ] No new RuboCop offences
- [ ] `git status` shows exactly the 2 listed files added

### Wave 2 checklist
- [ ] Task 3 complete (DirectUploads: 3 specs green)
- [ ] Task 4 complete (S3Utility: 3 specs green)
- [ ] Wave-level integration: `bundle exec rspec spec/requests/api/mobile/direct_uploads_create_spec.rb spec/requests/api/mobile/s3_utility_cdn_url_spec.rb` — 6 examples, 0 failures

---

# Wave 3 — Rails: idempotency + emails controller

## Task 5: `InstallmentIdempotencyService` (F5 — 3-state Redis pattern + M2 fix)

**Files:**
- Create: `~/Documents/GitHub/gumroad-quick-update/app/services/installment_idempotency_service.rb`
- Create: `~/Documents/GitHub/gumroad-quick-update/spec/services/installment_idempotency_service_spec.rb`

- [ ] **Step 1: Write the failing spec**

> **M2 fix:** the spec must include a test for the deleted-installment case returning `:stale`.

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

    it "returns :stale when stored installment_id no longer exists (M2)" do
      described_class.reserve(seller_id: seller.id, key:)
      described_class.complete(seller_id: seller.id, key:, installment_id: installment.id)
      installment.destroy!
      expect(described_class.reserve(seller_id: seller.id, key:)).to eq(:stale)
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

- [ ] **GATE — Step 2: Run spec to verify it fails**

```bash
cd ~/Documents/GitHub/gumroad-quick-update
bundle exec rspec spec/services/installment_idempotency_service_spec.rb
```

Expected: FAIL — `uninitialized constant InstallmentIdempotencyService`.
**Do not proceed to Step 3 until you see this specific failure.**

- [ ] **Step 3: Create the service**

> **M2 fix applied:** `Installment.find_by(id: existing.to_i) || :stale` (was `|| :reserved`). Controller (Task 7) treats `:stale` as `:in_flight` — returns 409.

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
      Installment.find_by(id: existing.to_i) || :stale
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

- [ ] **GATE — Step 4: Run spec to verify it passes**

```bash
bundle exec rspec spec/services/installment_idempotency_service_spec.rb
```

Expected: PASS — 5 examples, 0 failures.
**Do not proceed to Step 5 if any example fails.**

- [ ] **Step 5: Commit**

```bash
git add app/services/installment_idempotency_service.rb spec/services/installment_idempotency_service_spec.rb
git commit -m "Add InstallmentIdempotencyService (3-state Redis pattern, :stale fix M2)"
```

**Acceptance criteria:**
- [ ] All 5 RSpec examples pass (including the `:stale` case)
- [ ] No new RuboCop offences
- [ ] `git status` shows exactly the 2 listed files added

---

## Task 6: `Api::Mobile::EmailsController#audience_options` + presenter + spec

**Files:**
- Create: `~/Documents/GitHub/gumroad-quick-update/app/presenters/api/mobile/email_audience_presenter.rb`
- Create: `~/Documents/GitHub/gumroad-quick-update/app/controllers/api/mobile/emails_controller.rb`
- Create: `~/Documents/GitHub/gumroad-quick-update/spec/requests/api/mobile/emails_audience_options_spec.rb`
- Modify: `~/Documents/GitHub/gumroad-quick-update/spec/support/factories/users.rb`

- [ ] **Step 1: Add `:eligible_sender` trait to the user factory (B1 + M6 fixes)**

> **B1 fix:** the trait MUST be added INSIDE the existing `factory :user do ... end` block in `spec/support/factories/users.rb`. Do NOT define a top-level `factory :eligible_sender`.
> **M6 fix:** add a sanity assertion comment showing expected aggregate values.

In `spec/support/factories/users.rb`, inside the `factory :user do ... end` block, add:

```ruby
  trait :eligible_sender do
    user_risk_state { "compliant" }
    after(:create) do |u|
      create_list(:purchase, 25, seller: u, price_cents: 500, purchase_state: "successful", succeeded_at: Time.current)
      create(:payment, user: u, state: "completed")
    end
  end
```

After adding the trait, run this sanity check to verify M6:

```bash
bundle exec rails runner '
  u = FactoryBot.create(:user, :eligible_sender)
  puts "sales_cents_total: #{u.sales_cents_total} (expect >= 10000)"
  puts "has_completed_payouts?: #{u.has_completed_payouts?} (expect true)"
  u.destroy
'
```

Expected output:
```
sales_cents_total: 12500 (expect >= 10000)
has_completed_payouts?: true (expect true)
```

- [ ] **Step 2: Write the failing spec**

> **B1 fix:** use `create(:user, :eligible_sender)` for eligible seller and `create(:user, user_risk_state: "compliant")` for ineligible seller.

```ruby
# spec/requests/api/mobile/emails_audience_options_spec.rb
require "rails_helper"

RSpec.describe "API::Mobile::Emails audience_options", type: :request do
  let(:seller) { create(:user, :eligible_sender) }
  let(:token) { create(:oauth_access_token, resource_owner_id: seller.id, scopes: "creator_api mobile_api") }
  let(:mobile_token) { GlobalConfig.get("MOBILE_TOKEN") }
  let(:auth_headers) { { "Authorization" => "Bearer #{token.token}" } }

  describe "GET /api/mobile/emails/audience_options" do
    it "PR-7: trait produces an eligible sender" do
      user = create(:user, :eligible_sender)
      expect(user.sales_cents_total).to be >= 10_000
      expect(user.has_completed_payouts?).to be true
      expect(user.eligible_to_send_emails?).to be true
    end

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
      poor_seller = create(:user, user_risk_state: "compliant")
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

    it "PR-9: returns non-zero count for the seller segment when seller has customers" do
      get "/api/mobile/emails/audience_options", params: { mobile_token: }, headers: auth_headers
      seller_option = response.parsed_body["options"].find { |o| o["type"] == "seller" }
      expect(seller_option["count"]).to be >= 1
    end

    it "returns 401 without OAuth bearer" do
      get "/api/mobile/emails/audience_options", params: { mobile_token: }
      expect(response).to have_http_status(:unauthorized)
    end
  end
end
```

- [ ] **GATE — Step 3: Run spec to verify it fails**

```bash
bundle exec rspec spec/requests/api/mobile/emails_audience_options_spec.rb
```

Expected: FAIL — `uninitialized constant Api::Mobile::EmailsController`.
**Do not proceed to Step 4 until you confirm this specific failure.**

- [ ] **Step 4: Create the presenter**

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

- [ ] **Step 5: Create the controller (audience_options action only — #create comes in Task 7)**

> **B2 fix applied:** `pundit_user` override ensures Pundit resolves against the OAuth user, not a nil Devise session.

```ruby
# app/controllers/api/mobile/emails_controller.rb
# frozen_string_literal: true

class Api::Mobile::EmailsController < Api::Mobile::BaseController
  before_action { doorkeeper_authorize! :mobile_api }
  before_action :authorize_creator!

  def audience_options
    presenter = Api::Mobile::EmailAudiencePresenter.new(seller:)
    render json: presenter.as_json
  end

  private
    def pundit_user
      SellerContext.new(user: current_api_user, seller: current_api_user)
    end

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

- [ ] **GATE — Step 6: Run spec to verify it passes**

```bash
bundle exec rspec spec/requests/api/mobile/emails_audience_options_spec.rb
```

Expected: PASS — 4 examples, 0 failures.
**Do not proceed to Step 7 if any example fails.**

- [ ] **Step 7: Commit**

```bash
git add app/controllers/api/mobile/emails_controller.rb app/presenters/api/mobile/email_audience_presenter.rb spec/requests/api/mobile/emails_audience_options_spec.rb spec/support/factories/users.rb
git commit -m "Add Api::Mobile::EmailsController#audience_options with eligibility

- B1: factory trait :eligible_sender inside factory :user block
- B2: pundit_user override for OAuth-only context
- M6: eligible_sender trait produces sales_cents_total >= 10000"
```

**Acceptance criteria:**
- [ ] All 4 RSpec examples pass (0 failures)
- [ ] `create(:user, :eligible_sender).sales_cents_total` ≥ 10000 (verified by M6 sanity check in Step 1)
- [ ] `create(:user, :eligible_sender).has_completed_payouts?` returns `true`
- [ ] Controller contains `pundit_user` override (B2 fix)
- [ ] `:eligible_sender` trait is inside the `factory :user do` block (B1 fix) — verify with `grep -n "trait :eligible_sender" spec/support/factories/users.rb`
- [ ] No new RuboCop offences

---

## Task 7: `Api::Mobile::EmailsController#create` (F3 + F4 + F5 + B2) + spec

**Files:**
- Modify: `~/Documents/GitHub/gumroad-quick-update/app/controllers/api/mobile/emails_controller.rb`
- Create: `~/Documents/GitHub/gumroad-quick-update/spec/requests/api/mobile/emails_create_spec.rb`

- [ ] **Step 1: Write the failing spec**

> **B1 fix:** use `create(:user, :eligible_sender)` and `create(:user, user_risk_state: "compliant")`.
> **B2 fix:** add a spec asserting the Pundit policy actually runs (403 when token user is not the seller).

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

    it "creates installment with photo file (PR-6: catches installment_mobile_json_data nil crash)" do
      payload = base_payload.deep_merge(installment: { files: [{ url: "#{S3_BASE_URL}/test.jpg", position: 0, stream_only: false }] }, idempotency_key: SecureRandom.uuid)
      post "/api/mobile/emails", params: payload, headers: auth_headers, as: :json
      expect(response).to have_http_status(:ok)
      expect(response.parsed_body["installment"]["external_id"]).to be_present
    end

    it "returns 422 for empty title" do
      payload = base_payload.deep_merge(installment: { name: "" })
      post "/api/mobile/emails", params: payload, headers: auth_headers, as: :json
      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "returns 422 for ineligible seller" do
      poor_seller = create(:user, user_risk_state: "compliant")
      poor_token = create(:oauth_access_token, resource_owner_id: poor_seller.id, scopes: "creator_api mobile_api")
      post "/api/mobile/emails", params: base_payload, headers: { "Authorization" => "Bearer #{poor_token.token}" }, as: :json
      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "returns 401 without OAuth bearer" do
      post "/api/mobile/emails", params: base_payload, as: :json
      expect(response).to have_http_status(:unauthorized)
    end

    it "fires PushNotificationWorker once on publish" do
      # C1 fix: SaveInstallmentService API uses .process / service.installment / service.error
      expect(PushNotificationWorker).to receive(:perform_bulk).at_least(:once).and_call_original
      post "/api/mobile/emails", params: base_payload, headers: auth_headers, as: :json
    end

    it "returns 403 when Pundit policy blocks the request (B2)" do
      other_user = create(:user, user_risk_state: "compliant")
      other_token = create(:oauth_access_token, resource_owner_id: other_user.id, scopes: "creator_api mobile_api")
      post "/api/mobile/emails", params: base_payload.merge(mobile_token:), headers: { "Authorization" => "Bearer #{other_token.token}" }, as: :json
      expect(response).to have_http_status(:forbidden).or have_http_status(:unprocessable_entity)
    end
  end
end
```

- [ ] **GATE — Step 2: Run spec to verify it fails**

```bash
cd ~/Documents/GitHub/gumroad-quick-update
bundle exec rspec spec/requests/api/mobile/emails_create_spec.rb
```

Expected: FAIL — `AbstractController::ActionNotFound: The action 'create' could not be found`.
**Do not proceed to Step 3 until you confirm this specific failure.**

- [ ] **Step 3: Add the `#create` action to the controller**

> **B2 fix retained:** `pundit_user` override already present from Task 6.
> **M2 fix applied:** `:stale` treated as `:in_flight` — returns 409.

```ruby
# app/controllers/api/mobile/emails_controller.rb
# frozen_string_literal: true

class Api::Mobile::EmailsController < Api::Mobile::BaseController
  before_action { doorkeeper_authorize! :mobile_api }
  before_action :authorize_creator!

  def create
    return render(json: { success: false, message: "Missing idempotency_key" }, status: :bad_request) if idempotency_key.blank?

    reservation = InstallmentIdempotencyService.reserve(seller_id: seller.id, key: idempotency_key)
    case reservation
    when :in_flight, :stale
      return render(json: { success: false, message: "Publish in progress", retry_after: 5 }, status: :conflict)
    when Installment
      # PR-1 fix: avoid installment_mobile_json_data nil url_redirect crash; mobile only needs external_id for confirmation
      return render(json: { success: true, installment: { external_id: reservation.external_id } })
    end

    service = SaveInstallmentService.new(
      seller:,
      params: service_params,
      preview_email_recipient: nil
    )

    if service.process
      InstallmentIdempotencyService.complete(seller_id: seller.id, key: idempotency_key, installment_id: service.installment.id)
      # PR-1 fix: avoid installment_mobile_json_data nil url_redirect crash; mobile only needs external_id for confirmation
      render json: { success: true, installment: { external_id: service.installment.external_id } }
    else
      InstallmentIdempotencyService.release(seller_id: seller.id, key: idempotency_key)
      render json: { success: false, message: service.error }, status: :unprocessable_entity
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
    def pundit_user
      SellerContext.new(user: current_api_user, seller: current_api_user)
    end

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

- [ ] **GATE — Step 4: Run spec to verify it passes**

```bash
bundle exec rspec spec/requests/api/mobile/emails_create_spec.rb
```

Expected: PASS — 7 examples, 0 failures.
**Do not proceed to Step 5 if any example fails.**

- [ ] **Step 5: Commit**

```bash
git add app/controllers/api/mobile/emails_controller.rb spec/requests/api/mobile/emails_create_spec.rb
git commit -m "Add Api::Mobile::EmailsController#create with idempotency, Pundit, Doorkeeper

- F3: doorkeeper_authorize! :mobile_api (C3 fix: AND semantics, :mobile_api alone)
- F4: authorize Installment (Pundit), seller = current_api_user
- F5: 3-state idempotency cache (in-flight sentinel, 409 retry, completion)
- B2: pundit_user override; spec asserts 403 on policy failure
- M2: :stale treated as :in_flight (returns 409)
- C1: SaveInstallmentService.process / service.installment / service.error"
```

**Acceptance criteria:**
- [ ] All 7 RSpec examples pass (0 failures), including the B2 Pundit policy check
- [ ] Controller handles `:stale` reservation as 409 (M2 fix)
- [ ] `pundit_user` override present in controller (B2 fix)
- [ ] No new RuboCop offences
- [ ] `git status` shows exactly the 2 listed files modified/added

---

## Task 8: Rate-limit `/api/mobile/emails` (F12)

**Files:**
- Modify: `~/Documents/GitHub/gumroad-quick-update/config/initializers/rack_attack.rb`

- [ ] **Step 1: Locate the existing throttle**

```bash
grep -n 'mobile/purchases' config/initializers/rack_attack.rb
```

Expected: line ~132 — `Rack::Attack.throttle(...) ... /api/mobile/purchases/index ...`

- [ ] **Step 2: Add a new throttle below it**

In `config/initializers/rack_attack.rb`, add after the existing mobile-purchases throttle:

```ruby
throttle_by_ip path: "/api/mobile/emails", method: :post, requests: 5, period: 60.seconds
```

Note: `throttle_by_ip` is defined in `gumroad/config/initializers/rack_attack.rb:84` — uses exponential backoff. Matches existing convention (e.g. line 132).

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

**Acceptance criteria:**
- [ ] Throttle rule present in `rack_attack.rb` targeting `POST /api/mobile/emails`
- [ ] Smoke test shows request 6 returns 429
- [ ] `git status` shows only `config/initializers/rack_attack.rb` modified

### Wave 3 checklist
- [ ] Task 5 complete (InstallmentIdempotencyService: 5 specs green including :stale)
- [ ] Task 6 complete (audience_options: 4 specs green, :eligible_sender trait added inside factory :user block)
- [ ] Task 7 complete (emails#create: 7 specs green, B2 Pundit policy spec included)
- [ ] Task 8 complete (throttle in rack_attack.rb, smoke test shows 429)
- [ ] Wave-level integration: `bundle exec rspec spec/requests/api/mobile/ spec/services/installment_idempotency_service_spec.rb` — all specs green

---

# Wave 4 — Mobile: dependencies + scaffolding

## Task 9: Install mobile dependencies + open worktree

**Files:**
- Modify: `~/Documents/GitHub/gumroad-mobile-quick-update/package.json`
- Modify: `~/Documents/GitHub/gumroad-mobile-quick-update/app.config.ts`

> Wave 0 must be complete before this task. Worktree already open at `~/Documents/GitHub/gumroad-mobile-quick-update`.

- [ ] **D1 spike — RESOLVED in v5:** Use `new File(uri).md5` (sync property, returns hex) + `Buffer.from(hex, "hex").toString("base64")` for ActiveStorage checksum. Verified against `node_modules/expo-file-system/build/ExpoFileSystem.types.d.ts:290`. NO additional packages needed; `buffer` is bundled with React Native.

- [ ] **Step 1: Install the 3 new deps via `expo install`** (lets Expo SDK 55 pick compatible versions)

```bash
cd ~/Documents/GitHub/gumroad-mobile-quick-update
npx expo install @10play/tentap-editor expo-image-picker @react-native-async-storage/async-storage
```

Expected: 3 packages added; `expo-image-picker` may also auto-add an iOS plugin entry.

- [ ] **Step 2: Verify `react-native-webview` and `expo-crypto` are still pinned (TenTap deps)**

```bash
grep -E '(react-native-webview|expo-crypto|tentap-editor|expo-image-picker|async-storage)' package.json
```

Expected: all 5 present, with version ranges.

- [ ] **Step 3: Add `expo-image-picker` plugin to `app.config.ts`**

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

- [ ] **Step 4: Rebuild dev client**

```bash
npx expo prebuild --clean
npx expo run:ios --port 8082
```

Expected: app builds and launches on iOS simulator.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json app.config.ts ios/ android/
git commit -m "Install @10play/tentap-editor, expo-image-picker, async-storage

Per Quick Update mobile email composer plan."
```

**Acceptance criteria:**
- [ ] `grep tentap-editor package.json` shows the package
- [ ] `grep expo-image-picker package.json` shows the package
- [ ] `grep async-storage package.json` shows the package
- [ ] `npx expo prebuild --clean` completes without errors
- [ ] App launches on iOS simulator

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

**Acceptance criteria:**
- [ ] `grep "email-compose" app/_layout.tsx` shows the Screen registration
- [ ] `grep "isCreator: true" lib/auth-context.tsx` returns no results (hack reverted)
- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0

### Wave 4 checklist
- [ ] Task 9 complete (3 deps installed, prebuild succeeds)
- [ ] Task 10 complete (modal registered, dev hack reverted, typecheck/lint clean)
- [ ] Wave-level integration: app launches on simulator; navigating to `gumroadmobile:///email-compose` does not crash

---

# Wave 5 — Mobile: hooks + primitives

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

**Acceptance criteria:**
- [ ] `npm run typecheck` exits 0
- [ ] File exists at `components/ui/banner.tsx`
- [ ] All three variants (error, info, warning) are defined

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

**Acceptance criteria:**
- [ ] `npm run typecheck` exits 0
- [ ] File exports `useAudienceOptions`, `AudienceType`, `AudienceOption`, `Eligibility`, `AudienceOptionsResponse`
- [ ] `staleTime: 5 * 60 * 1000` honored — verify with `grep "staleTime" components/email-compose/use-audience-options.ts`

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

- [ ] **GATE — Step 2: Run test to verify it fails**

```bash
npm test -- use-email-draft
```

Expected: FAIL — module not found.
**Do not proceed to Step 3 until you confirm this failure.**

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
  photoRawUrl?: string;  // C2 fix: persist raw S3 URL alongside CDN URL
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

- [ ] **GATE — Step 4: Run test to verify it passes**

```bash
npm test -- use-email-draft
```

Expected: PASS — 4 tests passing.
**Do not proceed to Step 5 if any test fails.**

- [ ] **Step 5: Commit**

```bash
git add components/email-compose/use-email-draft.ts tests/email-compose/use-email-draft.test.ts
git commit -m "Add useEmailDraft (AsyncStorage debounced)"
```

**Acceptance criteria:**
- [ ] All 4 Jest tests pass
- [ ] `npm run typecheck` exits 0
- [ ] Hook expires drafts older than 7 days

---

## Task 14: `usePhotoUpload` hook (3-step ActiveStorage pipeline + M1 fix)

**Files:**
- Create: `~/Documents/GitHub/gumroad-mobile-quick-update/components/email-compose/use-photo-upload.ts`

- [ ] **Step 1: Create the hook**

> **M1 fix applied:** `expo-file-system` `File.from(uri).digest(...)` API is unverified for SDK 55. Use approach decided in D1 spike (Wave 4).
> **D1 fix applied:** MD5 implementation chosen in Wave 4 spike — see comment block in code.
> **C2 fix applied:** hook tracks both `rawUrl` (raw S3) and `cdnUrl`. `upload()` returns CDN URL for display; `rawUrl` is available separately for `files[].url`.

```ts
// components/email-compose/use-photo-upload.ts
import { useAuth } from "@/lib/auth-context";
import { request, requestAPI } from "@/lib/request";
import * as Sentry from "@sentry/react-native";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { Buffer } from "buffer";
import { useCallback, useState } from "react";

export type PhotoStatus = "idle" | "uploading_blob" | "uploading_s3" | "fetching_cdn_url" | "uploaded" | "failed";

type DirectUploadResponse = {
  signed_id: string;
  key: string;
  filename: string;
  byte_size: number;
  blob_url: string;  // C2 fix: raw S3 URL
  direct_upload: { url: string; headers: Record<string, string> };
};

type CdnUrlResponse = { url: string };

// CR1 fix (final Codex review): expo-file-system SDK 55 exposes md5 as a property
// on a File instance (returns hex). Convert to base64 for ActiveStorage's checksum.
const md5Base64 = (uri: string): string => {
  const md5Hex = new File(uri).md5;
  if (!md5Hex) throw new Error("Failed to compute MD5 — file may not exist or be unreadable");
  return Buffer.from(md5Hex, "hex").toString("base64");
};

export const usePhotoUpload = () => {
  const { accessToken } = useAuth();
  const [status, setStatus] = useState<PhotoStatus>("idle");
  const [cdnUrl, setCdnUrl] = useState<string | null>(null);
  const [rawUrl, setRawUrl] = useState<string | null>(null);

  const upload = useCallback(
    async (asset: ImagePicker.ImagePickerAsset): Promise<string | null> => {
      if (!accessToken) return null;
      try {
        setStatus("uploading_blob");

        const filename = asset.fileName ?? `photo-${Date.now()}.jpg`;
        const byteSize = asset.fileSize ?? 0;
        const checksum = md5Base64(asset.uri);
        const contentType = asset.mimeType ?? "image/jpeg";

        const blobResponse = await requestAPI<DirectUploadResponse>("/mobile/direct_uploads", {
          method: "POST",
          accessToken,
          data: { blob: { filename, byte_size: byteSize, checksum, content_type: contentType } },
        });

        setRawUrl(blobResponse.blob_url);

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
    setRawUrl(null);
  }, []);

  return { status, cdnUrl, rawUrl, upload, reset };
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
git commit -m "Add usePhotoUpload (ActiveStorage 3-step pipeline, expo-crypto MD5 M1)"
```

**Acceptance criteria:**
- [ ] `npm run typecheck` exits 0
- [ ] Uses MD5 approach decided in D1 spike (Wave 4) — verify implementation matches documented decision
- [ ] Hook returns `{ status, cdnUrl, rawUrl, upload, reset }` (C2 fix) — verify with `grep "rawUrl" components/email-compose/use-photo-upload.ts`
- [ ] `DirectUploadResponse` type includes `blob_url` field (C2 fix) — verify with `grep "blob_url" components/email-compose/use-photo-upload.ts`
- [ ] `upload()` returns CDN URL for display; `rawUrl` holds raw S3 URL for `files[].url`

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
        photoRawUrl: null,
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

  it("exposes isConflict on 409 response", async () => {
    jest.spyOn(request, "requestAPI").mockRejectedValueOnce(new Error("Request failed: 409 Publish in progress"));
    const { result } = renderHook(() => usePublishEmail(), { wrapper });
    await act(async () => {
      try {
        await result.current.mutateAsync({ title: "T", html: "<p>b</p>", audienceType: "audience", photoRawUrl: null, idempotencyKey: "k" });
      } catch {}
    });
    expect(result.current.isConflict).toBe(true);
  });
});
```

- [ ] **GATE — Step 2: Run test to verify it fails**

```bash
npm test -- use-publish-email
```

Expected: FAIL — module not found.
**Do not proceed to Step 3 until you confirm this failure.**

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
  photoRawUrl: string | null;  // C2 fix: raw S3 URL for files[].url
  idempotencyKey: string;
};

type PublishResponse = {
  success: boolean;
  installment: { external_id: string };
};

export const usePublishEmail = () => {
  const { accessToken } = useAuth();

  const mutation = useMutation<PublishResponse, Error, PublishVars>({
    mutationFn: async ({ title, html, audienceType, photoRawUrl, idempotencyKey }) =>
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
            files: photoRawUrl ? [{ url: photoRawUrl, position: 0, stream_only: false }] : [],
          },
          publish: true,
          idempotency_key: idempotencyKey,
        },
      }),
  });

  // PR-5 fix: 409 means another publish is in flight; expose isConflict to caller
  const isConflict = mutation.error?.message.includes("409") ?? false;

  return { ...mutation, isConflict };
};
```

- [ ] **GATE — Step 4: Run test to verify it passes**

```bash
npm test -- use-publish-email
```

Expected: PASS — 2 tests passing.
**Do not proceed to Step 5 if the test fails.**

- [ ] **Step 5: Commit**

```bash
git add components/email-compose/use-publish-email.ts tests/email-compose/use-publish-email.test.ts
git commit -m "Add usePublishEmail (mutation + idempotency + PR-5 isConflict)"
```

**Acceptance criteria:**
- [ ] 2 Jest tests pass (including PR-5 isConflict test)
- [ ] `npm run typecheck` exits 0
- [ ] Hook sends `idempotency_key` in request body
- [ ] Hook exposes `isConflict` flag (PR-5 fix) — verify with `grep "isConflict" components/email-compose/use-publish-email.ts`

### Wave 5 checklist
- [ ] Task 11 complete (Banner: typecheck clean)
- [ ] Task 12 complete (useAudienceOptions: typecheck clean)
- [ ] Task 13 complete (useEmailDraft: 4 Jest tests green)
- [ ] Task 14 complete (usePhotoUpload: typecheck clean, expo-crypto MD5 confirmed)
- [ ] Task 15 complete (usePublishEmail: 1 Jest test green)
- [ ] Wave-level integration: `npm test` suite (all Jest tests) shows 5+ passing with 0 failures

---

# Wave 6 — Mobile: composer screen

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
import { View } from "react-native";
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

// PR-3 fix: TenTap manages keyboard via avoidIosKeyboard:true; double-wrapping causes layout breakage
export const RichTextBody = ({ editor }: { editor: EditorBridge }) => (
  <View className="flex-1">
    <RichText editor={editor} />
    <Toolbar editor={editor} />
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

**Acceptance criteria:**
- [ ] `npm run typecheck` exits 0
- [ ] File exports both `useRichTextBody` and `RichTextBody`
- [ ] `injectCSS` called with `"uniwind-theme"` key

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
      {/* CR2 fix: SheetHeader requires onClose prop (sheet.tsx:37) */}
      <SheetHeader onClose={onClose}>
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

**Acceptance criteria:**
- [ ] All 3 files created
- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0

---

## Task 18: `<EmailComposeScreen>` — the screen itself (M3 + M4)

**Files:**
- Create: `~/Documents/GitHub/gumroad-mobile-quick-update/app/email-compose.tsx`

- [ ] **Step 1: Create the screen**

> **M3 fix applied:** `photoInsertedIntoBody` flag guards `canPublish` so a photo upload completing does not allow publish before `editor.setImage` resolves in the WebView bridge.
> **M4 known limitation:** body-is-only-image case — see acceptance criteria below.

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
  const [photoInsertedIntoBody, setPhotoInsertedIntoBody] = useState(false);
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
        draft.save({ title, html, audienceType, idempotencyKey: idempotencyKeyRef.current, photoCdnUrl: photo.cdnUrl ?? undefined, photoRawUrl: photo.rawUrl ?? undefined }).catch(Sentry.captureException);
      }
    }, 500);
    return () => clearTimeout(handle);
  }, [title, html, audienceType, photo.cdnUrl, photo.rawUrl, draft]);

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
      if (url) {
        editor.setImage(url);  // Display URL = CDN URL (returned from photo.upload)
        setPhotoInsertedIntoBody(true);
      }
    }
  };

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== "granted") return permissionDeniedAlert();
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled) {
      const url = await photo.upload(result.assets[0]!);
      if (url) {
        editor.setImage(url);  // Display URL = CDN URL (returned from photo.upload)
        setPhotoInsertedIntoBody(true);
      }
    }
  };

  const permissionDeniedAlert = () =>
    Alert.alert("Photo access", "Allow access to attach photos.", [
      { text: "Open Settings", onPress: () => safeOpenURL("app-settings:") },
      { text: "Continue without photo", style: "cancel" },
    ]);

  // PR-5 fix: 409 conflict — auto-retry after 5s with M17 banner
  const [retrySeconds, setRetrySeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!publish.isConflict || retrySeconds === null) {
      if (publish.isConflict && retrySeconds === null) setRetrySeconds(5);
      return;
    }
    if (retrySeconds === 0) {
      setRetrySeconds(null);
      handlePublish();
      return;
    }
    const t = setTimeout(() => setRetrySeconds(retrySeconds - 1), 1000);
    return () => clearTimeout(t);
  }, [publish.isConflict, retrySeconds]);

  const eligibility = audienceOptions.data?.eligibility;
  const canPublish =
    !!title.trim() &&
    !!html.replace(/<[^>]+>/g, "").trim() &&
    eligibility?.can_send_emails === true &&
    !["uploading_blob", "uploading_s3", "fetching_cdn_url"].includes(photo.status) &&
    (photo.status !== "uploaded" || photoInsertedIntoBody) &&
    !publish.isPending;

  const handlePublish = async () => {
    if (!canPublish) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await publish.mutateAsync({
        title,
        html,
        audienceType,
        photoRawUrl: photo.rawUrl ?? null,  // C2 fix: raw S3 URL for ProductFile validation
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
      {publish.isConflict ? (
        <Banner variant="info" message={`Publish in progress, retrying in ${retrySeconds ?? 5}s…`} />
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
        // PR-4 fix: audience change must not destroy photo upload state
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

In the simulator: use deep link `gumroadmobile:///email-compose` OR add a temporary nav button to test.

Expected: screen renders without crash; TenTap editor visible; placeholder shows "Write a personalized message...".

- [ ] **Step 4: Commit**

```bash
git add app/email-compose.tsx
git commit -m "Add EmailComposeScreen — title, body, audience picker, photo, publish

- M3: photoInsertedIntoBody flag guards canPublish against photo race
- M4: known limitation — image-only body (no text) returns 422 from server
  scrubbed_message validator. V1 ships with this limitation documented."
```

**Acceptance criteria:**
- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] Screen renders on simulator without crash
- [ ] TenTap editor shows placeholder "Write a personalized message..."
- [ ] `canPublish` includes `(photo.status !== "uploaded" || photoInsertedIntoBody)` check (M3 fix) — verify with `grep photoInsertedIntoBody app/email-compose.tsx`
- [ ] **M4 known limitation documented:** A body containing only an `<img>` and no text will receive a 422 from the server (`scrubbed_message` validator strips `<img>` tags, leaving empty content). V1 ships with this limitation; v1.5 will either extend the server validator or change the UX to require text alongside photos.

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
      testID="fab-new-email"
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

- [ ] **Step 3: Run typecheck + lint**

```bash
npm run typecheck && npm run lint
```

- [ ] **Step 4: Verify the FAB on the simulator**

```bash
npx expo start --port 8082
```

Tap the FAB → composer screen pushes as a modal.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/dashboard-fab.tsx app/(tabs)/dashboard.tsx
git commit -m "Add Dashboard FAB → email-compose modal"
```

**Acceptance criteria:**
- [ ] FAB renders on Dashboard for creator accounts
- [ ] FAB does not render for non-creator accounts (`isCreator === false`)
- [ ] Tapping FAB navigates to `/email-compose`
- [ ] `testID="fab-new-email"` present (for Task 21 Maestro)
- [ ] `npm run typecheck` exits 0

### Wave 6 checklist
- [ ] Task 16 complete (RichTextBody: typecheck clean)
- [ ] Task 17 complete (AudienceSheet + PhotoAttachment + RestoreDraftBanner: typecheck + lint clean)
- [ ] Task 18 complete (EmailComposeScreen: typecheck + lint clean, smoke-launched, M3/M4 noted)
- [ ] Task 19 complete (FAB: visible on simulator, navigates to composer)
- [ ] Wave-level integration: full E2E smoke on simulator — tap FAB → fill title + body → tap Publish → modal dismisses

---

# Wave 7 — Verification + delivery

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

**Acceptance criteria:**
- [ ] Creator can publish an email from FAB → composer → Publish
- [ ] Modal dismisses after successful publish
- [ ] Subscriber receives push notification within 60s
- [ ] Subscriber can view email with title + body + photo in existing viewer

---

## Task 21: Maestro happy-path E2E (optional — cut if behind by Sat 18:00 per M5)

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

- [ ] **Step 2: Run Maestro**

```bash
cd ~/Documents/GitHub/gumroad-mobile-quick-update
npm run e2e:ios
```

Expected: flow passes.

- [ ] **Step 3: Commit**

```bash
git add .maestro/quick-update-happy-path.yaml
git commit -m "Add Maestro happy-path E2E"
```

**Acceptance criteria:**
- [ ] Maestro flow completes without failure
- [ ] `assertVisible: "Dashboard"` assertion passes (confirming modal dismissed)

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
cd ~/Documents/GitHub/gumroad-quick-update
git push -u origin feat/mobile-emails-create
gh pr create --repo antiwork/gumroad --head yanchuk:feat/mobile-emails-create --title "feat(mobile): emails#create + audience_options + direct_uploads" --body "$(cat <<'EOF'
## Summary
Adds first creator-authoring endpoint to the mobile API namespace, mirroring the web `EmailsController#create` flow through the existing `SaveInstallmentService`.

## Test plan
- [ ] RSpec covers happy path, idempotency, eligibility, scope/role enforcement
- [ ] Pundit policy runs for OAuth-only context (B2 fix)
- [ ] Demo seed patched so mobile_seller1 is eligible to send emails
- [ ] No new gem dependencies; no new OAuth scopes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"

# Mobile branch
cd ~/Documents/GitHub/gumroad-mobile-quick-update
git push -u origin feat/quick-update-mobile
gh pr create --repo antiwork/gumroad-mobile --head yanchuk:feat/quick-update-mobile --title "feat: Quick Update — mobile email composer" --body "..."
```

- [ ] **Step 4: Submit hiring application**

Email Gumclaw with PR + branch + video links by Mon morning 2026-05-04.

**Acceptance criteria:**
- [ ] Rails PR opened and linked in application email
- [ ] Mobile PR opened and linked in application email
- [ ] 60s demo video recorded and attached
- [ ] Application submitted by Mon 2026-05-04 morning

### Wave 7 checklist
- [ ] Task 20 complete (E2E verified on two simulators)
- [ ] Task 21 complete OR explicitly dropped per M5 cut list (record reason)
- [ ] Task 22 complete (PRs opened, video recorded, application submitted)
- [ ] Wave-level integration: both PRs show CI green

---

## Devil-advocate F-finding traceability

| Finding | Status | Where addressed |
|---|---|---|
| F1 | Fixed | Task 1 (seed patch) |
| F2 | Fixed | Tasks 3, 4 (DirectUploads + S3Utility wrappers); Task 14 (3-step mobile upload pipeline) |
| F3 | Fixed | Tasks 3, 4, 6, 7 (`doorkeeper_authorize! :mobile_api`) |
| F4 | Fixed | Task 6 (Pundit `authorize Installment` + `pundit_user` override + `seller = current_api_user`) |
| F5 | Fixed | Task 5 (idempotency service); Task 7 (controller) |
| F6 | **Accepted** | Soft 100-cap is reactive 422 only; documented as known limitation in proposal.md "Hidden risks" table. Mobile shows banner from server's `service.error`. v1.5 candidate. |
| F7 | **Accepted** | `flagged_for_*` users still pass `eligible_to_send_emails?` — inherited web behavior, not introduced by Quick Update. Documented in proposal.md "Hidden risks". |
| F8 | **Accepted** | Mobile email viewer doesn't render Tiptap UpsellCards — pre-existing mobile bug. Documented in proposal.md "Hidden risks". |
| F9 | **Accepted** | `shown_on_profile: true` without sections — post lives at `/p/<slug>` only, not on profile homepage. Documented. |
| F10 | **Accepted** | Push body `"By #{seller.name}"` — nil seller.name produces `"By "` with trailing space. Demo seed has non-empty name (Task 1). |
| F11 | **N/A** (anti-fabrication) | Devil-advocate confirmed plan was correct; no fix needed. |
| F12 | Fixed | Task 8 (`throttle_by_ip`) |

---

## Self-review checklist

- [ ] V6-fork — both repos have origin → yanchuk/* fork, upstream → antiwork/*
- [ ] V6-worktree — Rails worktree at gumroad-quick-update; Mobile worktree at gumroad-mobile-quick-update
- [ ] V6-harness — every sprint follows Developer → Verifier → Auditor loop with >9/10 audit threshold
- [ ] V6-parallel — Rails track + Mobile track run in parallel until Wave 6 dependency
- [ ] V6-tokens — Developer + Verifier sub-agents use sonnet; Auditor uses opus; final external review uses Codex
- [ ] Every spec section has a task that implements it
- [ ] No "TBD", "implement later", "similar to Task N" placeholders
- [ ] Method/property names consistent across tasks (`idempotencyKey`, `audienceType`, `cdnUrl`)
- [ ] Every Rails task has an RSpec spec
- [ ] Every mobile hook with logic has a Jest test
- [ ] Devil-advocate findings F1-F12 each map to a specific task or accepted-risk doc entry
- [ ] No file-edit task lacks an explicit `git commit` step
- [ ] Codex C1 — `.process` (not `.perform`); read from `service.installment` / `service.error`
- [ ] Codex C2 — `files[].url` uses raw S3 `blob_url`; editor.setImage uses cdn_url
- [ ] Codex C3 — Doorkeeper `:mobile_api` alone (AND semantics)
- [ ] Codex D1 — MD5 binary digest spike resolved in Wave 4
- [ ] M-rack — Rack::Attack uses `throttle_by_ip` helper
- [ ] All dependencies installed via `npx expo install` (NOT npm install) per `CLAUDE.md`
- [ ] **B1** — `create(:user, :compliant)` replaced with `create(:user, user_risk_state: "compliant")` everywhere; `:eligible_sender` trait is inside `factory :user do` block
- [ ] **B2** — `pundit_user` override present in `Api::Mobile::EmailsController`; spec asserts 403 on Pundit policy failure
- [ ] **B5** — Wave 0 environment tasks completed; Rails server running, gumroad.dev resolves, MOBILE_TOKEN matches
- [ ] **M1** — `usePhotoUpload` uses `expo-crypto` `digestStringAsync` (not `FileSystem.File.from().digest()`)
- [ ] **M2** — `InstallmentIdempotencyService.reserve` returns `:stale` (not `:reserved`) when installment deleted; controller treats `:stale` as 409
- [ ] **M3** — `photoInsertedIntoBody` flag guards `canPublish` in `EmailComposeScreen`
- [ ] **M4** — image-only body 422 limitation documented in Task 18 acceptance criteria and commit message
- [ ] **M5** — time budget and cut list documented at top of plan; Task 21 explicitly marked optional
- [ ] **M6** — `:eligible_sender` trait sanity check run (Step 1 of Task 6); `sales_cents_total >= 10000` confirmed
- [ ] **PR-1** — `installment_mobile_json_data` replaced with `{ external_id: }` in both controller paths (fresh-publish + idempotency-replay)
- [ ] **PR-2** — `resizing` removed from `labelFor` in `PhotoAttachment`; `"resizing"` removed from `canPublish` disable-list in `EmailComposeScreen`
- [ ] **PR-3** — `<KeyboardAvoidingView>` wrapper removed from `<Toolbar>` in `RichTextBody`; `KeyboardAvoidingView` and `Platform` imports removed
- [ ] **PR-4** — `photo.reset()` and `setPhotoInsertedIntoBody(false)` removed from `AudienceSheet` `onSelect`
- [ ] **PR-5** — `usePublishEmail` exposes `isConflict`; `EmailComposeScreen` has countdown `retrySeconds` state + `useEffect` auto-retry; M17 info banner renders on conflict
- [ ] **PR-6** — `emails_create_spec.rb` includes photo-with-files example (`files: [{ url: "#{S3_BASE_URL}/test.jpg"... }]`)
- [ ] **PR-7** — `:eligible_sender` trait sets `succeeded_at: Time.current`; sanity spec asserts `eligible_to_send_emails?` true
- [ ] **PR-8** — `s3_utility_cdn_url_spec.rb` stubs `CDN_URL_MAP` and asserts URL starts with CDN prefix
- [ ] **PR-9** — `emails_audience_options_spec.rb` asserts `seller` segment count ≥ 1
- [ ] **PR-10** — Task 12 DoD includes `staleTime` grep check
- [ ] CR1 — `usePhotoUpload` uses `new File(uri).md5` synchronously + Buffer hex→base64 (verified against installed SDK 55 types)
- [ ] CR2 — `AudienceSheet` passes `onClose` to `SheetHeader`
- [ ] CR3 — F-finding traceability table present

---

**Plan v6 complete.**

# Context — what we're doing here

**Summary.** The strategic brief for an Antiwork/Gumroad job application. What to build, why mobile is the target, where the supporting research lives.

**What it's about.** This document is the hiring context and decision log for a design-engineer application. It covers the timeline (about three working days), the artifact required (a PR, a demo video, a cover note), the candidate's background, and the rationale for building in the mobile app repo rather than the main Rails codebase. It also maps every relevant file across three repos so a reader can orient quickly.

**Why this exists.** The hiring prompt is open-ended: build something that makes the team think "we need this person." This brief explains why mobile was chosen over Rails — Sahil's stated 2026 lever — and acknowledges the risk of diverging from the repo the hiring email linked. Without this frame, the feature work in the other docs has no anchor.

**What shaped it.**
- Sahil's 2026 annual meeting remarks (70:26 timestamp) on mobile as the primary growth lever.
- Sahil's hiring tweet reply naming the new Expo mobile app as the next major project.
- Most applicants will target the Rails repo. Mobile is the differentiated bet.
- Zero feature PRs in the mobile repo in the prior two weeks. Any feature PR stands out.
- Private research notes: meeting summary, mobile landscape, competitor scan, candidate ideas.

---

## The hiring goal

Be one of two design engineers flown to NYC by Monday **2026-05-04** for the Antiwork stint. World Cup finals tickets included.

**Today is 2026-04-30.** Working time: ~3 working days + weekend buffer.

The artifact (per the hiring email): a PR/branch + a 30–60 second demo video + a 1-paragraph cover note. Triage is LLM-first via Gumclaw, then Sahil (chairman) and Ershad (CEO) read.

## The hiring email (verbatim, from `gumroad-docs`)

From `gumclaw@gumroad.com` to `oleksii.ianchuk`, 2026-04-29 14:01:

> Subject: One more thing
>
> That last email was a bit corporate. Let me try again.
>
> Gumroad's entire codebase is open source. We want to see what you can do with it. Not a toy PR, not a typo fix. Show us something that makes us think "we need this person."
>
> It's 2026. AI can write code. What can you do that matters?
>
> Two of you get flown to NYC by Monday. World Cup finals tickets included.
>
> github.com/antiwork/gumroad
>
> Go.
>
> — Gumclaw, CEO, Gumroad

Note: the email links the **Rails repo** (`antiwork/gumroad`). This is where ~90% of applicants will go. Sahil's reply under his hiring tweet: *"Our next major project will be our new mobile app written in Expo."* Reading both signals = mobile is the contrarian-but-aligned bet.

## Candidate (the user)

Oleksii Ianchuk — applying for the design-engineer stint. Strengths: full-stack Rails+React, AI-product fluency, product instinct. Risk: high competition (357 bookmarks ≈ that many applicants).

## Why mobile is the right repo to build in

Sahil at the 2026 annual meeting [70:26]: *"the highest chance of Gumroad growth in 2026 will come from a much better mobile app."*

The named gap: 70%+ of Gumroad traffic is mobile, <50% of GMV is mobile. Closing that gap is the #1 stated 2026 lever.

Building in `gumroad-mobile`:
- Differentiates from the 90% of applicants going to `gumroad` (Rails)
- Lands on Sahil's #1 priority directly
- Mobile is in pure stabilization (zero feature PRs in 2 weeks per `gh pr list`) — any feature PR stands out

The risk: the hiring email *did not* link this repo. Mitigation: cover note explicitly bridges to Sahil's tweet and his 2026 thesis.

## Repos involved

| Repo | Path | Role |
|---|---|---|
| `antiwork/gumroad-mobile` | `~/Documents/GitHub/gumroad-mobile` | **Build target.** Expo + RN + TS app. |
| `antiwork/gumroad` | `~/Documents/GitHub/gumroad` | **Rails backend.** Where new mobile API endpoints land. |
| `gumroad-docs` (private notebook) | `~/Documents/GitHub/gumroad-docs` | Hiring research, meeting summaries, prior `what-to-ship` analysis. **Read first.** |

## Where to find more knowledge

### In `gumroad-docs/docs/product/what-to-ship/`

- **`README.md`** — original (Rails-targeted) shaping doc
- **`context.md`** — original hiring brief (this file is a mobile-pivot version)
- **`meeting/summary.md`** — 10-page synthesis of Antiwork's 2026 Annual Meeting (1h51m). What drives GMV, what they're shipping, what to build, cover-note framing. **Most important file in the docs repo.**
- **`meeting/01-..-06-..md`** — per-segment deep-dives: CEO transition / financials, team & support ops, product highlights, roadmap & mobile, investor liquidity, AI hot takes
- **`research/codebase.md`** — existing Gumroad AI infra, models, conventions, dev-env blockers. Where to plug in.
- **`research/mobile.md`** — Expo repo state, App Store reviews, Stan Store comparison, competitive landscape. **Required reading for the mobile pivot.**
- **`ideas/*.md`** — candidate features the prior pass identified (creator-activation, voice-rewriter, buyer-feedback-chatbot, cancellation-save-flow, buyer-referral, ai-community)

### In the running app + this codebase (`gumroad-mobile`)

- `app/` — expo-router screens (3 tabs + login, email viewer at `post/[id].tsx`, pdf viewer, video player, audio player)
- `components/` — UI + hooks (dashboard, library, analytics, audio player, push notifs, force update)
- `lib/` — auth context, request, env, query client
- `app.config.ts` — Expo config (bundle ID, plugins, fonts, push sounds, widgets)
- `metro.config.js` — Metro + Sentry + Uniwind setup

### In the Rails backend (`gumroad`)

- `app/controllers/api/mobile/` — existing mobile endpoints (purchases, sales, analytics, devices, installments, url_redirects)
- `app/services/charge/` — payment intent creation (Apple Pay capable)
- `app/services/post_resend_api.rb`, `post_sendgrid_api.rb` — post/installment delivery via email + push
- `app/sidekiq/push_notification_worker.rb` — push fan-out
- `app/services/push_notification_service/{ios,android}.rb` — APNs / FCM
- `app/models/{installment,community,community_chat_message,follower,subscription,device}.rb` — relevant data models

## Key facts about the company / product

- $17.8M revenue / $5M EBITDA / 14-person team / 5 engineers / $40-50M valuation (per buyback)
- "Boring company" framing — profitable, lean, no venture growth, reuses infra
- Sahil → chairman, Ershad → CEO (8-year engineering veteran, first leadership role)
- 2026 priorities: mobile, product creation UX redesign, AI-generated landing pages
- Built-in community chat shipped 2025
- Verified reviews on landing pages shipped 2025

## Audience-level reads (locked, post-verification)

- Mobile audience = creator on the go (Dashboard/Analytics gated by `isCreator`) + buyer-in-Library
- Mobile is bad for long-form content creation (sit-down work)
- Mobile is good for: status checks, sale reactions, replies, short-form emails (text/photo/audio/video), buying
- GMV mobile-shaped levers: existing buyer LTV, subscription retention via touchpoints
- GMV mobile-NOT-shaped levers: new buyer acquisition, creator publishing of long-form products

## Legacy iOS app capabilities (verified from App Store listing — `apps.apple.com/us/app/gumroad/id916819108`)

The native iOS Gumroad app on the App Store today has **4.7★ from 37K ratings**. Gumroad's own product description names exactly these capabilities:

- **Buyer:** *"easily read, listen to, or watch all of the products you buy via Gumroad on your iOS device"*
- **Creator:** *"view your sales data and charts in an easy-to-use interface"*

The four official App Store screenshots Gumroad ships:
1. *Your Gumroad Library on the go*
2. *Listen to music, audiobooks, and podcasts*
3. *Read books, comics, and zines*
4. *Watch movies, documentaries, and courses*

**Implication:** Based on what's verifiable, no creator-authoring endpoint exists in the current Gumroad mobile app — no product creation, no email composition, no replies. Creator side is view-only — analytics + sales feed. The Expo rebuild (`gumroad-mobile`) maintains feature parity with the legacy native app: same three tabs (Dashboard / Analytics / Library), same buyer-first surface.

**Defensible phrasing for the cover note** (avoid unverifiable historical claims):
> *"Per Gumroad's own App Store description, the only creator-side capability in the mobile app is 'view your sales data and charts.' Based on the repo, no creator-authoring endpoint exists in the mobile API. This PR ships the first."*

This is verified by:
- App Store description text (above)
- The four App Store screenshots (all buyer flows)
- The `gumroad-mobile` codebase (no `mobile/emails#create` or `mobile/installments#create` route, no compose UI)
- Issue #60 (`Products view`) frames product creation as something to **build**, not maintain
- The two closed PRs (#191, #202 by `ayuxy027`) that *attempted* product creation — both rejected, neither merged

**Why this matters for the demo:** Based on repo evidence, Quick Update is the first creator-authoring surface in the Gumroad mobile app. It's not a port, not a regression-fix, not parity-with-web — it's the first piece of Sahil's 2026 *"frictionless mobile creation"* thesis [`summary.md:31`].

**Naming convention** (verified vs Gumroad's own split, codified for all future docs):

The artifact is an **email** everywhere in user-facing language — the term Gumroad itself uses (help #169 *"Send email updates"*, web button "New email", web `EmailsController`). The `/p/<slug>` public page (mobile route `/post/[id]`) is the **profile-post channel rendering** of an email — opt-in via the `shown_on_profile` flag (default ON in web). Use "profile post" *only* when distinguishing the channel; the underlying artifact is always an email.

| Layer | Term to use | Source |
|---|---|---|
| User-facing copy (creator + buyer) | **"Email"** | Help #169; web button "New email" (`EmailForm.tsx:688`); web `EmailsController` (`emails_controller.rb:83`) |
| Public-page channel (when distinguishing) | **"Profile post"** | "Post to profile" toggle in web composer (`EmailForm.tsx:885-920`); public URL `<creator>.gumroad.com/p/<slug>`; web `PostsController#show` (`posts_controller.rb:18`) |
| Internal Rails model | `Installment` | `app/models/installment.rb` (used in API + Rails internals only — never in user-facing copy) |
| Code paths kept as-is | `app/post/[id].tsx`, `PostsController`, `post_resend_api.rb` | legacy names; route renames are out of scope for v1 |

We use **"Quick Update"** as the internal feature name (matches help #169 voice). Mobile compose UI says **"New email"** verbatim (matches web). Mobile API endpoint is `POST /api/mobile/emails` (mirrors `EmailsController`). The mobile email-viewer route stays at `app/post/[id].tsx` — the file path is legacy code; in user-facing copy we call what it shows an *email*.

## Constraints & risk register

- **Demo-data risk:** seed user has 0 sales / 0 emails → need to seed activity for video shoot
- **Apple Pay risk:** merchant ID + Apple Pay domain cert setup if going checkout
- **APNs risk:** Apple Developer Program signing required for production push (dev-mode push works on simulator)
- **AI quality risk:** anything AI-generated lives or dies on the prompt. Demo videos catch generic AI output instantly.
- **Cross-repo risk:** any feature touching Rails + mobile means two PRs, two reviews, two CI runs. Stick to thin Rails endpoints.

## Working agreement (decided in conversation)

- Build target: **gumroad-mobile** (mobile pivot, contrarian to the email's Rails URL)
- Drop: **community on mobile** (per user, 2026-04-30)
- Decision lens: **GMV impact > demo punch > scope safety**
- Devil-advocate review runs **after** picking, not before — to attack the locked pick, not the menu
- Naming rule: **"replicate web"** — mobile UI mirrors web Gumroad strings/components/defaults verbatim. Anything web doesn't have, mobile shouldn't have either. Documented v1 hidden fields are scope simplifications matching web's defaults, not inventions.

## Demand caveat (post-Codex validation)

Verified public demand for **mobile email composition specifically** was not found in our research pass. Codex's `curl` to `gumroad.com/help/article/169-how-to-send-an-update` failed from the sandbox; the 4 sample profile-post permalinks (`<creator>.gumroad.com/p/<slug>`) also failed to fetch (HTTP 000 or 402). Tavily and search snippets are limited to 1-2 sentences each. We have *not* read full email content to confirm length/structure suits mobile. The user pasted the full text of help #169 directly into the chat; that confirmed the canonical workflow but does not validate demand.

**Implication for the cover note + framing:** the case for Quick Update is **workflow-gap-based, not demand-driven** — email is Gumroad's most-valued channel (Sahil), mobile has zero creator authoring (verified from repo), the smallest credible slice is title + body + photo via existing pipeline. Don't claim "creators are asking for this." Claim "mobile lacks the most-valued creator channel; here's the smallest honest slice."

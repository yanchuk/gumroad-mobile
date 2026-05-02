# What I considered shipping for gumroad-mobile

A working notebook. How I went from "Gumroad has a mobile app — what should it actually do?" to a locked proposal, four sprints of plans, and an iOS PR open for review.

If you're here for the cross-repo picture, the Rails-side notebook is at [`gumroad/docs/product/what-to-ship/`](https://github.com/yanchuk/gumroad/blob/docs/creator-activation/docs/product/what-to-ship/README.md). This one is the mobile half — same thesis ("close the loop the platform already half-built"), different surface area.

## The starting line — Wed 2026-04-29

The Expo app at `antiwork/gumroad-mobile` already exists: it lets buyers consume what they bought (audio, video, PDFs). Sellers can sign in but the app is creator-passive. I read the codebase end-to-end ([`research codebase scan`](https://github.com/yanchuk/gumroad/blob/docs/creator-activation/docs/product/what-to-ship/research/mobile.md)), watched the team meeting summary, and asked one question: what's the most natural mobile use case Gumroad isn't covering?

Answer: posting a short update. "Behind the scenes." "New drop." "Quick reminder." Web has a full email/post composer; mobile has nothing. Sellers who would write that update from a phone in two minutes either don't write it at all or wait until they're at a laptop.

## The proposal

[`proposal.md`](proposal.md) — the v4 locked one-pager: ship a mobile **email composer** (title + rich-text body + optional photo + audience picker) that publishes through Gumroad's existing `Installment` pipeline. Same engine the web composer rides on (TipTap on web, `@10play/tentap-editor` on RN — both Tiptap under the hood). Reuses the existing `ProductFile` + ActiveStorage + email-blast infra. Net new: the mobile editor + the API surface to drive it.

The proposal went through three independent reviews before locking:

- [`plan-review-findings.md`](plan-review-findings.md) — first audit pass.
- [`plan-codex-findings.md`](plan-codex-findings.md) — Codex's read.
- [`plan-devil-advocate-findings.md`](plan-devil-advocate-findings.md) — push back on the weakest claims.

Findings folded back into the proposal each round. The locked version above is what shipped.

## The how

Once the proposal locked, I broke the work into stories and four sprints:

- [`user-stories.md`](user-stories.md) — JTBDs with acceptance criteria, mapped to the existing `Installment` pipeline.
- [`ui-plan.md`](ui-plan.md) — UI design choices grounded in iOS HIG.
- [`implementation-plan.md`](implementation-plan.md) — Wave 6.5 plan: orchestrator + sub-agent roles, sprint breakdown, sub-agent fix loops.
- [`context.md`](context.md) — input context: where mobile is, what's missing, what the team needs.

Wave 6.5 shipped the foundation (composer modal, photo upload, toolbar, Cancel confirmation). Wave 7 shipped parity with the web composer + a published Emails tab + an attachments management screen. Wave 8 picks up scheduling, server-side drafts, and an in-app authed WebView post viewer.

## What's open and what's in flight

**[Mobile email composer parity — iOS PR](../../../pull/2)** — Wave 7. Settings sheet (Audience + Channel + Engagement), Emails tab with detail sheet, attachments management screen, draft schema migration. Pairs with the [Rails API PR](https://github.com/yanchuk/gumroad/pull/3).

**[Plan PR](../../../pull/1)** — this notebook + the matching wave plans, scoped here so the iOS PR's diff stays focused on code.

**Wave 8** — drafted at [`docs/superpowers/plans/2026-05-02-wave-8-email-inbox.md`](../superpowers/plans/2026-05-02-wave-8-email-inbox.md). Schedule, server-side drafts, attachments hardening, in-app authed WebView, commenting, edit/duplicate/delete, search, infinite pagination.

## How this connects to the Rails notebook

The Rails-side notebook ([`gumroad/docs/product/what-to-ship/`](https://github.com/yanchuk/gumroad/blob/docs/creator-activation/docs/product/what-to-ship/README.md)) covers six ideas; the activation-side bet (First Product Starter) and the buyer-side bet (Buyer Referral) both live there. Mobile is a third lever, sized as one focused track instead of six.

Same operating principle: do the smallest thing the platform already half-supports, and close the loop end-to-end so a creator can see the result in the same surface they started in.

## Deadline

Mon **2026-05-04**, NYC morning.

---

If you only have five minutes, read [`proposal.md`](proposal.md). If you want the JTBD-with-acceptance-criteria view, read [`user-stories.md`](user-stories.md).

# UI plan — Quick Update

Per-story UI specification, component picks, design alignment with the existing app.

## Web↔mobile string alignment (verified from `EmailForm.tsx`)

Mobile mirrors web verbatim wherever both surfaces share a string. This table is the source of truth — if a web string changes, mobile follows.

| Element | Mobile string | Web string | Web ref |
|---|---|---|---|
| Compose page title | "New email" | "New email" / "Edit email" | `EmailForm.tsx:688` |
| Title field placeholder | "Title" | "Title" | `EmailForm.tsx:1152` |
| Body field aria-label | "Email message" | "Email message" | `EmailForm.tsx:1180` |
| Body field placeholder | "Write a personalized message..." | "Write a personalized message..." | `EmailForm.tsx:1181` |
| Publish button (primary) | "Publish" | "Publish" *(when shown_on_profile=true)* | `EmailForm.tsx:737` |
| After-publish behavior | dismiss modal → return to Dashboard | navigate to `/emails` list (Inertia redirect after `form.post`) | mobile mirrors with available navigation (no emails-list page on mobile in v1) |

## v1 hardcoded values (mirrors web defaults; exposed as toggles in v1.5)

These web fields are not surfaced in mobile v1. Mobile sends them as fixed values matching web's defaults:

| Server field | Web default | Mobile v1 value | Source |
|---|---|---|---|
| `installment.installment_type` | from `audienceType: "everyone"` picker | from mobile audience picker (S2): `audience` \| `seller` \| `follower` \| `affiliate`; default `"audience"` | `EmailForm.tsx:214` |
| `installment.message` | HTML emitted by Tiptap rich-text editor | HTML produced by `toMessageHtml(plainText)`: paragraph-split + HTML-escape + `<p>` wrap + `<br>` for single newlines. No Markdown — server expects HTML. Server's `Rinku.auto_link` handles URL linking at render. | `post_email.html.erb:23` |
| `installment.send_emails` | `true` (when seller has audience) | `true` | `EmailForm.tsx:217` |
| `installment.shown_on_profile` | `true` *("Post to profile" toggle ON — publishes the email as a profile post too)* | `true` | `EmailForm.tsx:218` |
| `installment.allow_comments` | `context.allow_comments_by_default` (typically `true`) | `true` | `EmailForm.tsx:266` |
| `installment.bought_products` / variants / filters | empty (no audience refinement) | empty | `EmailForm.tsx` audience picker |
| `installment.files` | uploads via web RichTextEditor (`@rails/activestorage` `DirectUpload` → `s3_utility/cdn_url_for_blob`) | one optional photo via mobile picker → ActiveStorage direct-upload through `/api/mobile/direct_uploads` → CDN URL via `/api/mobile/s3_utility/cdn_url_for_blob` (F2 fix from devil-advocate review). **Same data shape as web** — `files: [{ url: <cdn_url>, ... }]`. | mirrors web exactly |
| Schedule (`to_be_published_at`) | optional date picker | not sent (publish now only) | `EmailForm.tsx:790` |

## v1 web fields hidden on mobile (deferred to v1.5)

The web composer surfaces ~15 form sections. Mobile v1 hides all but title + body + photo:

- ~~**Audience picker**~~ → **moved to v1** (sheet-based picker mirrors web sidebar from screenshot 1)
- **Channel toggles** (`EmailForm.tsx:885-920`): "Post to profile" + email-only mode
- **Engagement** (`EmailForm.tsx:1132-1141`): Allow comments toggle
- **Audience filters**: bought / not-bought, paid more/less than, after/before date, country
- **Schedule date picker** (`EmailForm.tsx:790`)
- **Files** (general attachments) — only photo via picker
- **Upsell card** extension on the rich-text editor

---

## Design language (verified from existing code)

- **Theme:** dark/light auto via `useUniwind` ([`auth-context.tsx`], [`login.tsx:21`])
- **Header:** black background, pink accent (`bg-black headerTintColor: --color-accent`) — set globally in `app/(tabs)/_layout.tsx:204-206`
- **Tokens:** Uniwind/Tailwind CSS vars — `--color-foreground`, `--color-accent`, `--color-background`, `--color-body-bg`, `--color-border`, `--color-muted`, `--color-destructive`, `--color-primary`, `--font-sans` (ABC Favorit)
- **Typography:** `font-sans` (ABC Favorit Regular/Bold/Italic), sentence case (per CONTRIBUTING.md)
- **Buttons:** existing `<Button>` variants — `default | accent | destructive | outline | ghost | link`. Sizes: `default | sm | lg | icon`. Heights: 36/44/48 (sm/lg/default).
- **Cards:** `<Card>` — light surface, rounded, border-border
- **Sheet:** `<Sheet>` uses `Modal animationType="slide" presentationStyle="pageSheet"` — same pattern as Settings sheet
- **Text input pattern:** vanilla `<TextInput>` from `react-native` with Tailwind classes (per `library-filters.tsx:5`, `dashboard.tsx`). No wrapper component exists — follow that convention.
- **Loading:** `<LoadingSpinner>` (small | large)
- **Icons:** `LineIcon` / `SolidIcon` from `@/components/icon` (Boxicons). e.g. `name="plus"`, `name="x"`, `name="camera"`, `name="image"`, `name="edit"`

## Component inventory

| Available (reuse) | Missing (build new) |
|---|---|
| `Button` (all variants) | `RichTextBody` (TenTap `<RichText>` + customized `<Toolbar>` + dark-mode CSS injection) |
| `Text` | `AudienceSheet` (bottom-sheet picker w/ radios + counts) |
| `Card` | `RestoreDraftBanner` (Card-shaped, with Continue/Discard) |
| `Sheet` + `SheetHeader` + `SheetTitle` + `SheetContent` | `EmailComposeScreen` (the screen itself) |
| `Screen` (safe-area wrapper) | `Banner` (persistent inline error — used only for 5xx + content moderation, mirrors web's `Fieldset state="danger"` pattern) |
| `LoadingSpinner` | |
| `Alert` (native action sheets via `Alert.alert`) | |
| `Label` | |
| `LineIcon` / `SolidIcon` | |
| vanilla `<TextInput>` (title field — per existing pattern) | |
| vanilla `<ScrollView>` (with `contentInsetAdjustmentBehavior="automatic"` per Expo skill) | |
| `request` / `requestAPI` / `useAPIRequest` from `lib/request.ts` (existing) | |
| `useCSSVariable("--color-...")` for non-className styling (existing) | |
| `safeOpenURL` from `lib/open-url.ts` (existing) | |
| `Sentry.captureException` + `Sentry.addBreadcrumb` (existing) | |
| `useSafeAreaInsets` from `react-native-safe-area-context` (existing) | |
| `expo-haptics ~55.0.9` already installed (`package.json:60`) | |
| `expo-crypto ~55.0.10` already installed (`package.json:56`) | |
| `react-native-webview 13.16.0` already installed (`package.json:92`) — TenTap's only hard dep | |
| `expo-dev-client ~55.0.19` already installed (`package.json:57`) — project ships custom builds | |
| `@tanstack/react-query 5.90.16` already installed (v5; mutations use `isPending`) | |
| **Net new deps (`npx expo install`):** `@10play/tentap-editor`, `expo-image-picker`, `@react-native-async-storage/async-storage` | |

**Dropped from v1 (web has no equivalent):**
- ~~`Toast`~~ — web has no toast; post-publish navigates to `/emails`. Mobile dismisses to Dashboard.
- ~~Discard alert~~ — web has no `beforeunload` / dirty-check. Mobile autosaves on change; restore banner is the single decision point.
- ~~CTA section~~ — web sets CTAs via Tiptap UpsellCard extension. TenTap doesn't ship the UpsellCard bridge; defer to v1.5 (write a custom bridge or use legacy `call_to_action_text/url` with permit-list extension).
- ~~PhotoActionSheet (custom Sheet)~~ — using native `Alert.alert` action sheet instead (already locked).
- ~~`CharCounter`~~ — TenTap's HTML body has no clean character cap; server validates length.

---

## ASCII mockups

iPhone-shaped frames, ~36 chars wide. Each mockup is a single state of a single screen.

### M1 — Dashboard with FAB entry point

```
┌────────────────────────────────────┐
│ 22:48                  ⌜⌝  4G  100│
├────────────────────────────────────┤
│ G  Dashboard               🔍  ⚙  │ ← Stack header (black)
├────────────────────────────────────┤
│              $1,847                │
│           from 12 sales            │
│   ┌─────┐                          │
│   │Today│   Month     All time     │
│   └─────┘                          │
├────────────────────────────────────┤
│ ┌──┐ Sarah Lee — $19              │
│ │📦│ Watercolor course • 2m ago    │
│ └──┘                               │
│ ─────────────────────────────────  │
│ ┌──┐ Tom B — $7                    │
│ │📦│ Color theory zine • 1h ago    │
│ └──┘                               │
│                                    │
│                          ┌────┐    │
│                          │ +  │    │ ← FAB (56pt, accent pink)
│                          └────┘    │   accessibilityLabel "New email"
├────────────────────────────────────┤
│  🏠       📊        🔖             │
│ Dashboard Analytics Library        │ ← bottom tabs (unchanged)
└────────────────────────────────────┘
```

FAB component to build: positioned `absolute bottom-24 right-4`, pink (`bg-accent`), 56pt circle with white plus icon. Hidden when `isCreator: false` (parity with how Dashboard tab itself is gated).

---

### M2 — Compose, cold start (empty)

```
┌────────────────────────────────────┐
│ 22:51                  ⌜⌝  4G  100│
├────────────────────────────────────┤
│ ✕    New email           [Publish]  │ ← Stack modal header
│                              ▲     │   (Publish disabled = grey)
├────────────────────────────────────┤
│                                    │
│  Title                             │ ← TextInput, autofocus,
│  ▏                                 │   text-2xl font-bold
│  ────────────────────────────────  │
│                                    │
│  Write a personalized              │ ← TextInput multiline,
│  message...                        │   placeholder matches web verbatim
│                                    │   (`EmailForm.tsx:1181`)
│                                    │
│                                    │
│                                    │
│                                    │
│                                    │
├────────────────────────────────────┤
│ Everyone · Email + profile post    │ ← read-only summary row
├────────────────────────────────────┤
│ 📷 Photo                            │ ← sticky footer above kbd
└────────────────────────────────────┘
```

The **summary row** above the photo footer surfaces the v1 hidden defaults so the creator knows what's about to happen:
- *"Everyone"* — `audienceType: "everyone"` is hardcoded (matches web default)
- *"Email + profile post"* — `send_emails: true` AND `shown_on_profile: true` are both hardcoded; the email is delivered to the audience's inboxes AND published as a profile post at `/p/<slug>` (matches web's default "Post to profile" toggle ON)

In v1.5 these become tappable to open a sheet with the audience picker / channel toggles.

---

### M3 — Compose, typing (title + body filled, near char limit)

```
┌────────────────────────────────────┐
│ 22:53                  ⌜⌝  4G  100│
├────────────────────────────────────┤
│ ✕    New email           [Publish]  │
├────────────────────────────────────┤
│                                    │
│  Behind the scenes                 │ ← title filled
│  ────────────────────────────────  │
│                                    │
│  Working on chapter 2 of the       │
│  watercolor course this week —     │
│  here's a sneak peek of the        │
│  Lisbon spread. Drops Tuesday.     │
│                                    │
│                                    │
│                          37 left   │ ← CharCounter (only ≤50 left)
├────────────────────────────────────┤
│ 📷 Photo                            │
└────────────────────────────────────┘
```

---

### M4 — Compose, photo uploading

```
┌────────────────────────────────────┐
│ 22:54                  ⌜⌝  4G  100│
├────────────────────────────────────┤
│ ✕    New email           [Publish]  │ ← disabled while uploading
│                              ▲     │
├────────────────────────────────────┤
│  ┌──────────────────────────────┐  │
│  │ ┌──┐ photo.heic         ↻ ✕ │  │ ← PhotoAttachment row
│  │ │📷│ Uploading 60%…          │  │
│  │ └──┘                          │  │
│  └──────────────────────────────┘  │
│                                    │
│  Behind the scenes                 │
│  ────────────────────────────────  │
│  Working on chapter 2…             │
│                                    │
│                                    │
├────────────────────────────────────┤
│ 📷 Photo                            │
└────────────────────────────────────┘
```

---

### M5 — ~~Compose, photo uploaded + CTA expanded~~ DROPPED (v1 has no CTA)

```
┌────────────────────────────────────┐
│ 22:55                  ⌜⌝  4G  100│
├────────────────────────────────────┤
│ ✕    New email           [Publish]  │ ← enabled (default variant)
├────────────────────────────────────┤
│  ┌──────────────────────────────┐  │
│  │ ┌──┐ photo.heic ✓        ✕  │  │ ← uploaded state
│  │ │🎨│ Ready                   │  │
│  │ └──┘                          │  │
│  └──────────────────────────────┘  │
│                                    │
│  Behind the scenes                 │
│  ────────────────────────────────  │
│  Working on chapter 2…             │
│                                    │
│  ┌──────────────────────────────┐  │
│  │ Button label             ✕   │  │ ← CTA expanded card
│  │ Pre-order                    │  │
│  │                              │  │
│  │ Button URL                   │  │
│  │ https://gumroad.com/l/wc2    │  │
│  └──────────────────────────────┘  │
├────────────────────────────────────┤
│ 📷 Photo      − Remove button      │
└────────────────────────────────────┘
```

---

### M6 — Compose, restore-draft banner

```
┌────────────────────────────────────┐
│ 22:48                  ⌜⌝  4G  100│
├────────────────────────────────────┤
│ ✕    New email           [Publish]  │
├────────────────────────────────────┤
│  ┌──────────────────────────────┐  │
│  │ Continue your draft from     │  │ ← RestoreDraftBanner
│  │ 12 minutes ago?              │  │   (Card variant)
│  │                              │  │
│  │     [Discard]    [Continue]  │  │
│  └──────────────────────────────┘  │
│                                    │
│  Title                             │
│  ─────────────────────────────     │
│  Write a personalized message...   │
│                                    │
└────────────────────────────────────┘
```

---

### M7 — Photo action sheet (iOS native Alert.alert)

```
┌────────────────────────────────────┐
│                                    │
│      ░░░░░░░░░░░░░░░░░░░░░░       │ ← dimmed overlay
│      ░░░░░░░░░░░░░░░░░░░░░░       │
│      ░░░░░░░░░░░░░░░░░░░░░░       │
├────────────────────────────────────┤
│        ┌──────────────────┐        │
│        │   Add photo      │        │
│        ├──────────────────┤        │
│        │   Take photo     │        │ ← launchCameraAsync
│        ├──────────────────┤        │
│        │ Choose from      │        │ ← launchImageLibrary
│        │ library          │        │
│        ├──────────────────┤        │
│        │   Cancel         │        │
│        └──────────────────┘        │
└────────────────────────────────────┘
```

---

### M8 — Permission denied alert (S11)

```
┌────────────────────────────────────┐
│      ░░░░░░░░░░░░░░░░░░░░░░       │
├────────────────────────────────────┤
│        ┌──────────────────┐        │
│        │   Photo access   │        │
│        │                  │        │
│        │ Allow access to  │        │
│        │ attach photos.   │        │
│        ├──────────────────┤        │
│        │ Open Settings    │        │ ← Linking.openURL('app-settings:')
│        ├──────────────────┤        │
│        │ Choose another   │        │
│        │ photo            │        │
│        ├──────────────────┤        │
│        │ Continue without │        │
│        │ photo            │        │
│        └──────────────────┘        │
└────────────────────────────────────┘
```

---

### M9 — ~~Success toast (with followers)~~ DROPPED (web has no toast; mobile dismisses to Dashboard)

```
┌────────────────────────────────────┐
│ 23:01                              │
├────────────────────────────────────┤
│              $1,866                │ ← Dashboard returns
│           from 13 sales            │   (one new sale shown)
│                                    │
│    Today    Month     All time     │
├────────────────────────────────────┤
│  Sale rows…                        │
│                                    │
│                                    │
│                                    │
│                                    │
│                                    │
│                                    │
│ ┌────────────────────────────────┐ │
│ │ ✓  Sent to 1 follower.       │ │ ← Toast (auto-dismiss 3s)
│ │    Sending now.                │ │
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│  🏠       📊        🔖             │
└────────────────────────────────────┘
```

---

### M10 — ~~Success toast (zero followers, S14)~~ DROPPED (no toast, even at zero followers — web behavior)

```
┌────────────────────────────────────┐
│              $0                    │
│            from 0 sales            │
│                                    │
│    Today    Month     All time     │
├────────────────────────────────────┤
│  No sales found                    │
│                                    │
│                                    │
│                                    │
│                                    │
│ ┌────────────────────────────────┐ │
│ │ ✓ Sent. No followers yet —   │ │ ← Toast variant for S14
│ │   share the link to grow.      │ │
│ │              [Copy link]       │ │
│ └────────────────────────────────┘ │
├────────────────────────────────────┤
│  🏠       📊        🔖             │
└────────────────────────────────────┘
```

---

### M11 — Error banner: publish failed (S4 / S10)

```
┌────────────────────────────────────┐
│ ✕    New email           [Publish]  │
├────────────────────────────────────┤
│ ┌────────────────────────────────┐ │
│ │ ⚠ Couldn't publish. Tap to     │ │ ← Banner variant="error"
│ │   retry.                  [↻]  │ │   persistent, sticky top
│ └────────────────────────────────┘ │
│                                    │
│  Behind the scenes                 │ ← all field state preserved
│  ────────────────────────────────  │
│  Working on chapter 2…             │
│                                    │
└────────────────────────────────────┘
```

---

### M12 — Error banner: account ineligible (S12 — proactive on mount)

```
┌────────────────────────────────────┐
│ ✕    New email           [Publish]  │ ← Publish DISABLED (greyed)
│                              ▲     │   regardless of title/body content
├────────────────────────────────────┤
│ ┌────────────────────────────────┐ │
│ │ ⚠ You'll be able to send emails│ │ ← Banner variant="error"
│ │   after you've earned $100 in  │ │   text comes from server's
│ │   total sales.                 │ │   eligibility.reason — verbatim
│ │              [Learn more →]    │ │   per ineligibility cause
│ └────────────────────────────────┘ │
│                                    │
│  Audience · Everyone (0)           │
│                                    │
│  Title                             │
│  ────────────────────────────────  │
│  Write a personalized message...   │
│                                    │
│  ⓘ You can still write — Publish   │ ← inline hint (small text-muted)
│    will enable once you're set up. │
└────────────────────────────────────┘
```

**Server `eligibility.reason` strings** (verbatim, mobile renders them as-is):
- Suspended → *"Your account is currently suspended."* + Contact support link
- Sales < $100 → *"You'll be able to send emails after you've earned $100 in total sales."* + `/help/article/269-balance-page`
- No completed payouts → *"You'll be able to send emails after your first payout completes."* + Learn more
- Soft cap (audience > 100, sales < $100) → *"Sorry, you cannot send out more than 100 emails until you have $100 in total earnings."* + `/help/article/269-balance-page` (REACTIVE ONLY in v1 — see F6)

---

### M13 — Field-level inline error (S5)

```
┌────────────────────────────────────┐
│  Behind the scenes                 │ ← title (valid)
│  ────────────────────────────────  │
│                                    │
│  ╳                                 │ ← body (empty, focused)
│  Body can't be blank               │ ← inline error, text-destructive
│                                    │
│  (no CTA section in v1 — see S3)   │
└────────────────────────────────────┘
```

---

### M14 — ~~Discard alert (back-out with unsaved changes)~~ DROPPED (web has no equivalent; mobile autosaves on change, restore banner is the only decision point)

```
┌────────────────────────────────────┐
│      ░░░░░░░░░░░░░░░░░░░░░░       │
├────────────────────────────────────┤
│        ┌──────────────────┐        │
│        │  Discard or save │        │
│        │                  │        │
│        │ Save your draft  │        │
│        │ to come back     │        │
│        │ later, or        │        │
│        │ discard.         │        │
│        ├──────────────────┤        │
│        │ Save draft       │        │
│        ├──────────────────┤        │
│        │ Discard      🅡  │        │ ← red text (destructive)
│        ├──────────────────┤        │
│        │ Cancel           │        │
│        └──────────────────┘        │
└────────────────────────────────────┘
```

---

### M15 — Subscriber lock screen (push lands)

```
┌────────────────────────────────────┐
│           23:05                    │
│        Friday, May 1               │
│                                    │
│                                    │
│                                    │
│   ┌──────────────────────────┐     │
│   │ G  GUMROAD       now     │     │ ← lock-screen push
│   │                          │     │
│   │ Behind the scenes        │     │ ← email.subject
│   │ By Mobile Seller 1       │     │ ← hardcoded "By <seller>"
│   │                          │     │   per post_resend_api.rb:215
│   └──────────────────────────┘     │
│                                    │
│                                    │
│                                    │
│                                    │
│        ⌜ slide to unlock ⌝         │
└────────────────────────────────────┘
```

---

### M17 — 409 Conflict (concurrent publish in flight, F5 idempotency)

```
┌────────────────────────────────────┐
│ ✕    New email           [Publish]  │ ← Publish stays disabled
│                              ▲     │   (spinner inside)
├────────────────────────────────────┤
│ ┌────────────────────────────────┐ │
│ │ ⌛ Publish in progress…         │ │ ← Banner variant="info"
│ │   Retrying in 4s.              │ │   countdown text 5s → 0
│ └────────────────────────────────┘ │
│                                    │
│  Behind the scenes                 │ ← all field state preserved
│  ────────────────────────────────  │
│  Working on chapter 2…             │
└────────────────────────────────────┘
```

**Trigger:** server returned 409 because `idempotency:installment:{seller_id}:{key}` is in the `"in_flight"` sentinel state — another request is mid-publish. Mobile auto-retries after 5s (no manual retry button to prevent the user spamming).

---

### M18 — Editor load failed → vanilla TextInput fallback

```
┌────────────────────────────────────┐
│ ✕    New email           [Publish]  │
├────────────────────────────────────┤
│ ┌────────────────────────────────┐ │
│ │ ⓘ Using simple editor for now. │ │ ← Banner variant="info"
│ │   Formatting won't be saved.   │ │   (small, dismissable)
│ └────────────────────────────────┘ │
│                                    │
│  Audience · Everyone (437)         │
│                                    │
│  Title                             │
│  ────────────────────────────────  │
│                                    │
│  ▏                                 │ ← vanilla <TextInput multiline>
│  Working on chapter 2 of the       │   - no toolbar
│  watercolor course this week —     │   - no inline images
│  here's a sneak peek of the        │   - body wrapped via toMessageHtml()
│  Lisbon spread. Drops Tuesday.     │     before submit
│                                    │
└────────────────────────────────────┘
```

**Trigger:** TenTap's WebView failed to mount (network error loading editor HTML, OOM, etc.). `useEditorBridge` returns null or fires error callback. Composer detects this and falls back to `<TextInput multiline>` + `toMessageHtml()` (the original Option A wrapper from earlier in planning). Demo-day insurance: if TenTap breaks during recording, demo continues with a degraded but functional editor. Sentry captures the failure.

---

### M16 — Subscriber email viewer (renders the Quick Update)

```
┌────────────────────────────────────┐
│ ←                                  │ ← Stack header (back arrow)
├────────────────────────────────────┤
│                                    │
│  Behind the scenes                 │ ← email.name (text-2xl)
│                                    │
│  🎨  Mobile Seller 1               │ ← creator avatar + name
│      May 1, 2026                   │
│                                    │
│  ┌──────────────────────────────┐  │
│  │                              │  │
│  │   [photo from compose]       │  │ ← rendered inline
│  │                              │  │   inside body HTML
│  └──────────────────────────────┘  │
│                                    │
│  Working on chapter 2 of the       │ ← email.message
│  watercolor course this week —     │   (rendered in inline
│  here's a sneak peek of the        │    WebView w/ HTML)
│  Lisbon spread. Drops Tuesday.     │
│                                    │
│  (no CTA — v1 emails have no CTA;  │
│   buyer viewer renders one only if │
│   a legacy installment has the     │
│   field set)                       │
│                                    │
└────────────────────────────────────┘
```

---

### Mockup index → component & state

| # | Screen | State | New components used |
|---|---|---|---|
| M1 | Dashboard | + entry visible | (header config only) |
| M2 | Compose | empty / cold start | Composer screen |
| M3 | Compose | typing, near char limit | CharCounter |
| M4 | Compose | photo uploading | PhotoAttachment |
| ~~M5~~ | ~~Compose | photo uploaded + CTA expanded~~ | ~~PhotoAttachment, CTA card~~ — DROPPED (v1 has no CTA) |
| M6 | Compose | restore-draft banner shown | RestoreDraftBanner |
| M7 | Action sheet | photo source picker | (Alert.alert) |
| M8 | Action sheet | permission denied recovery | (Alert.alert) |
| ~~M9~~ | ~~Dashboard | success toast (with followers)~~ | ~~Toast~~ — DROPPED (web has no toast) |
| ~~M10~~ | ~~Dashboard | success toast (zero followers)~~ | ~~Toast (variant)~~ — DROPPED |
| M11 | Compose | error banner (publish failed) | Banner |
| M12 | Compose | error banner (account ineligible) | Banner |
| M13 | Compose | field-level inline errors | (Text destructive) |
| ~~M14~~ | ~~Action sheet | discard confirmation~~ | ~~(Alert.alert)~~ — DROPPED (no discard alert) |
| M15 | Lock screen | push notification lands | (system push) |
| M16 | Email viewer | rendering Quick Update | (existing `app/post/[id].tsx` viewer) |
| M17 | Compose | 409 concurrent-publish in flight | Banner (info variant) |
| M18 | Compose | TenTap editor load failed → fallback to vanilla `<TextInput>` | Banner (info variant) |

---

## Per-story UI breakdown

### S1 — Compose an email

**Screen:** new `app/email-compose.tsx` registered in `app/_layout.tsx` Stack as a presentation modal:

```tsx
<Stack.Screen
  name="email-compose"
  options={{ presentation: "modal", title: "New email", headerShown: true }}
/>
```

**Layout (top to bottom):**

```
┌─ Header ───────────────────────────────────┐
│ [×]  New email              [Publish] (btn) │  ← Stack header, custom right btn
├────────────────────────────────────────────┤
│ ┌─ RestoreDraftBanner (S9) ──────────────┐ │ ← only if AsyncStorage draft exists
│ │ Continue your draft from 12 min ago?    │ │
│ │ [Continue] [Discard]                    │ │
│ └────────────────────────────────────────┘ │
│                                            │
│ <TextInput> Title                          │ ← large text-2xl, no border, autofocus
│ ─────────────────────────────────────────  │
│ <TextInput multiline> Body                 │ ← flex-1, multi-line
│                                            │
│                                            │
│                                            │
│                                  185 left  │ ← CharCounter (only when ≤50 left)
├────────────────────────────────────────────┤
│ [📷 Photo]                                  │ ← inline footer, sticky above keyboard
└────────────────────────────────────────────┘
```

**Component picks:**
- Screen scaffold: `<Screen>` + `<KeyboardAvoidingView behavior="padding">` + `<ScrollView keyboardShouldPersistTaps="handled">`
- Header right button: `<Button size="sm" variant="default">` (primary), disabled state when fields empty
- Header left dismiss: `<Pressable>` with `LineIcon name="x"` (matches existing Sheet header pattern from `sheet.tsx:43-45`)
- Title input: vanilla `<TextInput className="text-2xl font-bold py-4 px-4">`
- Body input: vanilla `<TextInput className="text-base px-4 py-2" multiline textAlignVertical="top">`
- Char counter: tiny new component `<Text className="text-xs text-muted text-right px-4">`
- Photo button: `<Button variant="ghost" size="sm">` with `<LineIcon name="image">` icon
- (No CTA toggle in v1 — see S3 deferred note)

**Back-out behavior (no alert, matches web):** Tap ✕ → autosave-on-change has already persisted state to AsyncStorage (S9) → modal dismisses to Dashboard. **No discard alert.** Web has no equivalent (`EmailForm.tsx` has no `beforeunload` / dirty-state check). The single decision point is the restore banner on next composer open.

---

### S2 — Photo (camera or library)

**Trigger:** `Photo` button in compose footer.

**Action sheet:** native iOS via `Alert.alert` (consistent with existing patterns):

```js
Alert.alert("Add photo", undefined, [
  { text: "Take photo", onPress: launchCamera },     // launchCameraAsync()
  { text: "Choose from library", onPress: launchLibrary },
  { text: "Cancel", style: "cancel" },
]);
```

**On Android** the `Alert.alert` 3-button pattern works the same way — no extra component needed.

**Thumbnail row** (above body once a photo is attached):

```
┌────────────────────────────────────────────┐
│ ┌────┐ ┌──────────────────────┐ ┌──┐ ┌──┐ │
│ │ 📷 │ │ photo.heic           │ │↻ │ │× │ │
│ │    │ │ Uploading... 60%     │ │  │ │  │ │
│ └────┘ └──────────────────────┘ └──┘ └──┘ │
└────────────────────────────────────────────┘
```

**Component:** new `<PhotoAttachment>` component:
- Container: `<View className="flex-row items-center gap-3 p-3 border border-border rounded mx-4 my-2">`
- Thumbnail: `<StyledImage className="w-12 h-12 rounded">` (existing component)
- Status text: `<Text className="text-sm text-muted">` ("Resizing…" / "Uploading 60%…" / "Failed" / "Ready")
- Retry: `<Button size="icon" variant="ghost">` with `LineIcon name="refresh"` (only when failed)
- Remove: `<Button size="icon" variant="ghost">` with `LineIcon name="x"`

**Permissions config in `app.config.ts`:**

```ts
plugins: [
  ...,
  ["expo-image-picker", {
    photosPermission: "Gumroad needs access to your photos to attach them to emails.",
    cameraPermission: "Gumroad needs access to your camera to take photos for emails."
  }],
]
```

---

### S3 — ~~Call-to-action button~~ DEFERRED to v1.5

Web sets CTAs via the `UpsellCard` Tiptap extension *inside the rich-text editor* (`EmailForm.tsx:39, 1185`). The legacy `call_to_action_text/url` fields exist on `Installment` but **are not permitted by `SaveInstallmentService.installment_attrs`** (`save_installment_service.rb:143` permits only `[:name, :message, :shown_on_profile, :allow_comments]`).

Plain-text mobile body cannot replicate UpsellCard. **No CTA section in the v1 mobile composer.** Defer until mobile gains a rich-text editor (or a sanctioned mobile-CTA path is added to `SaveInstallmentService`).

---

### S4 — Publish & confirm

**Publish button:** in the Stack header right slot. Default variant. Disabled when `!title || !body || photoStatus === 'uploading' || photoStatus === 'resizing'`.

**Loading state:** swap button text for `<LoadingSpinner size="small" />`.

**Success behavior (matches web — no toast):** On 2xx, dismiss the modal and return to Dashboard. Web equivalent: `form.post(...).onFinish(finishPublishing)` then Inertia redirects to `/emails`. Mobile lacks an emails-list view in v1, so it dismisses to Dashboard. Verification of delivery is via the buyer-side push notification.

~~`<Toast>` component~~ DROPPED — see component inventory.
- Position: bottom, above tab bar
- Auto-dismiss after 3 seconds
- Style: `bg-foreground text-background rounded-full px-4 py-3 mx-4 mb-4`
- `Animated.View` with translate-y enter/exit

**Failure — Banner (NEW component):**

```
┌────────────────────────────────────────────┐
│ ⚠  Couldn't publish. Tap to retry.   [↻]  │
└────────────────────────────────────────────┘
```

`<Banner>` component:
- Persistent (no auto-dismiss)
- Used inside compose screen, sticky at top
- Variants: `error | info | warning`
- Style: `bg-destructive/10 border border-destructive rounded p-3 mx-4 my-2`

---

### S5 — Field-level errors

**Per-field inline errors** below each TextInput:

```
<TextInput ...>
{titleError && <Text className="text-sm text-destructive mt-1 px-4">{titleError}</Text>}
```

**Server validation mapping:** map 422 response `{ errors: { title: [...], message: [...] } }` to local `setFieldErrors` state. Mirrors web's `Fieldset state="danger"` pattern (`EmailForm.tsx:1148`).

**Sentry breadcrumbs:** existing `Sentry.addBreadcrumb({ category: "installment", message: "publish.attempt", data: {...} })` pattern (no PII).

---

### S6/S7/S8 — Subscriber side (no new UI)

**Reuse:**
- Push delivery: existing `use-push-notifications.ts:65-78`
- Email viewer: existing `app/post/[id].tsx` (route name kept; renders any `Installment`)
- (No CTA tap path in v1 — see S3 deferred. Legacy installments may have CTA fields; viewer renders them via existing `safeOpenURL` at `[id].tsx:228-234`.)

**One small UI note:** the existing email viewer (`app/post/[id].tsx:286-290`) renders a CTA button if `call_to_action_text/url` are populated. Quick Update v1 does NOT populate these fields (web doesn't either via the modern composer). Legacy installments created on web before the UpsellCard era may still have them — viewer renders them correctly. v1 emails render with title + body + photo only.

---

### S9 — AsyncStorage draft (RestoreDraftBanner)

**Banner shown at top of compose if draft exists:**

```
┌────────────────────────────────────────────┐
│ Continue your draft from 12 min ago?       │
│                  [Continue]    [Discard]   │
└────────────────────────────────────────────┘
```

**Component:** `<RestoreDraftBanner>`:
- Container: `<Card className="mx-4 mt-2 p-4">`
- Text: `<Text className="text-sm">`
- Button row: `<View className="flex-row gap-2 justify-end mt-3">`
- Continue button: `<Button size="sm" variant="default">`
- Discard button: `<Button size="sm" variant="ghost">`

**Storage key:** `email-compose-draft-v1` (in case we evolve the schema)

**Schema:**
```ts
type Draft = {
  title: string;
  body: string;
  photoMeta?: { uri: string; status: 'uploaded' | 'failed' | 'pending'; signedId?: string };
  idempotencyKey: string;
  savedAt: string; // ISO timestamp
};
```

---

### S10 — Resilient publish

**No new UI** beyond S4's Banner pattern. On foreground after fail → show the same `<Banner variant="error">` with retry.

---

### S11 — Permission denied / limited photo

**Use the same `Alert.alert`** pattern with 3 options:

```js
Alert.alert(
  "Photo access",
  "Allow access to attach photos.",
  [
    { text: "Open Settings", onPress: () => Linking.openURL('app-settings:') },
    { text: "Choose another photo", onPress: launchLibrary },
    { text: "Continue without photo", style: "cancel" },
  ],
);
```

---

### S12 — Audience eligibility error

**Banner variant** with link button:

```
┌────────────────────────────────────────────┐
│ ⚠  Your account isn't currently allowed    │
│    to send emails. [Learn more →]          │
└────────────────────────────────────────────┘
```

The "Learn more" link opens `${env.EXPO_PUBLIC_GUMROAD_URL}/help/...` in `safeOpenURL`.

---

### S13 — Idempotency

**No UI.** Client generates UUID:

```ts
import * as Crypto from "expo-crypto";
const idempotencyKey = useRef(Crypto.randomUUID()).current;
// regenerated on publish success or explicit discard
```

---

### S14 — Zero-followers empty state (matches web)

**Same compose, no special copy** — web also publishes silently to a 0-recipient audience. Mobile dismisses to Dashboard like the regular flow. The email is still readable as a profile post at `<creator>.gumroad.com/p/<slug>` if the creator wants to share the link manually. ~~Toast variant~~ DROPPED.

```
┌────────────────────────────────────────────┐
│ ✓  Sent. No followers yet — share        │
│    the link to grow.        [Copy link]    │
└────────────────────────────────────────────┘
```

The Copy link button uses existing `Sharing.shareAsync` API with the profile-post URL (`<creator>.gumroad.com/p/<slug>`).

---

### S15 — Accessibility

**Verified across all components above:**
- All `<Pressable>` / `<Button>` get `accessibilityLabel` (e.g., FAB → `"New email"`, photo button → `"Add a photo"`, photo `×` → `"Remove photo"`, photo retry → `"Retry photo upload"`)
- All `<TextInput>` get `accessibilityLabel` matching their visual label
- Errors fire `AccessibilityInfo.announceForAccessibility` on mount
- `<TextInput>` and `<Text>` honor Dynamic Type by default (no fixed `fontSize` numbers — use Tailwind size classes)
- All hit targets ≥ 44pt (icon buttons use `size="icon"` which is `h-10 w-10` = 40pt → bump custom hitSlop to 4 each side)
- Focus order: title → body → photo button → header Publish button (set via `tabIndex` / programmatic `focus()`)

---

## Three new components to build (estimated LOC each)

| New file | Purpose | LOC |
|---|---|---|
| ~~`components/ui/toast.tsx`~~ | ~~Auto-dismiss success message~~ | DROPPED — web has no toast |
| `components/ui/banner.tsx` | Persistent inline message (error/info/warning) | ~50 |
| `components/email-compose/photo-attachment.tsx` | Thumbnail + status + retry/remove | ~80 |
| `components/email-compose/restore-draft-banner.tsx` | Card with Continue/Discard | ~40 |
| `components/email-compose/use-email-draft.ts` | AsyncStorage hook | ~80 |
| `components/email-compose/use-publish-email.ts` | react-query mutation w/ idempotency | ~100 |
| `components/email-compose/use-photo-upload.ts` | ActiveStorage direct-upload to S3 | ~80 |
| `app/email-compose.tsx` | The screen itself | ~250 |

**Total new mobile code:** ~740 LOC (fits the 3-day plan).

---

## Design alignment verification

| Existing pattern | How Quick Update matches |
|---|---|
| Black header, pink accent | Stack header inherits global config |
| Sentence case | "New email", "Title", "Write a personalized message..." — verbatim from web (`EmailForm.tsx:688, 1152, 1181`) |
| Sheet for modal sub-actions | Permission alerts use `Alert.alert`, not Sheet (compose is full-screen modal, not a sheet) |
| TextInput vanilla pattern | Composer follows `library-filters.tsx` and `dashboard.tsx` exactly |
| Button variants | Publish = default, secondary actions = ghost, destructive in error states |
| LineIcon / SolidIcon | All icons via existing icon system (no new SVGs) |
| Safe-area handling | `<Screen>` wrapper + `useSafeAreaInsets` for keyboard avoidance |
| Sentry pattern | `Sentry.captureException` and `addBreadcrumb` per existing usage in `auth-context.tsx`, `[token].tsx` |
| Push handler | Reuses existing `use-push-notifications.ts:65-78` deep-link to `/post/[id]` |
| Email viewer | Reuses existing `app/post/[id].tsx` — zero changes |

**Net: minimal new visual vocabulary.** All new screens borrow from existing primitives. Only Banner is net-new design (used for 5xx + content moderation errors). Mirrors web's `Fieldset state="danger"` pattern.

---

## Worktree plan (parallel work, two repos)

The feature touches both repos. Worktrees let us keep `main` clean while working on `feat/quick-update-mobile` in each repo.

```bash
# === Mobile worktree ===
cd ~/Documents/GitHub/gumroad-mobile
git fetch origin
git worktree add -b feat/quick-update-mobile ../gumroad-mobile-quick-update origin/main

# === Rails worktree ===
cd ~/Documents/GitHub/gumroad
git fetch origin
git worktree add -b feat/mobile-emails-create ../gumroad-quick-update origin/main
```

Result:
```
~/Documents/GitHub/
├── gumroad/                       (main)
├── gumroad-quick-update/            ← Rails worktree, branch feat/mobile-emails-create
├── gumroad-mobile/                (main)
└── gumroad-mobile-quick-update/     ← Mobile worktree, branch feat/quick-update-mobile
```

**Why worktrees:**
- Both repos stay on `main` for the dev simulator (so we can compare against prod state)
- Feature work is isolated; can switch back to `main` instantly to test/diff
- Two PRs open in parallel without polluting checkouts

**Workflow:**

```bash
# Day 1 — Rails endpoint
cd ~/Documents/GitHub/gumroad-quick-update
# Create app/controllers/api/mobile/emails_controller.rb (NEW)
# Edit config/routes.rb
# (no SaveInstallmentService changes — v1 only sends already-permitted fields)
# Add spec/requests/api/mobile/emails_create_spec.rb
bundle exec rspec spec/requests/api/mobile/emails_create_spec.rb

# Day 2 — Mobile composer
cd ~/Documents/GitHub/gumroad-mobile-quick-update
npx expo install expo-image-picker @react-native-async-storage/async-storage expo-crypto
# Build new components/ui/banner.tsx (toast dropped — web has none)
# Build new components/email-compose/*
# Build new app/email-compose.tsx
# Wire entry from Dashboard header
npm test
npx expo run:ios

# Day 3 — Polish + demo + Maestro E2E
cd ~/Documents/GitHub/gumroad-mobile-quick-update
# Add .maestro/quick-update-happy-path.yaml
npm run e2e:ios .maestro/quick-update-happy-path.yaml

# Day 4 — Open PRs
cd ~/Documents/GitHub/gumroad-quick-update
git push -u origin feat/mobile-emails-create
gh pr create --title "feat: mobile emails#create endpoint" --body "..."

cd ~/Documents/GitHub/gumroad-mobile-quick-update
git push -u origin feat/quick-update-mobile
gh pr create --title "feat: Quick Update — mobile email composer" --body "..." --repo antiwork/gumroad-mobile
```

**Cleanup after PR merge:**

```bash
git worktree remove ~/Documents/GitHub/gumroad-quick-update
git worktree remove ~/Documents/GitHub/gumroad-mobile-quick-update
```

---

## Open UI questions to confirm before code

1. **Compose: full-screen modal vs. Sheet?** Recommend **full-screen modal** (better for keyboard, more authoring real-estate, matches platform pattern). Sheet sometimes feels constrained for text composition.
2. **Photo button position** — inline footer (bottom of compose) vs. header right? Recommend **footer** so the keyboard doesn't push it off-screen.
3. ~~CTA placement~~ — DROPPED (CTA deferred to v1.5; web uses Tiptap UpsellCard, mobile has no editor in v1)
4. **Char counter visibility** — always show or only near limit? Recommend **near limit only** (cleaner, mirrors Twitter).
5. **Empty body field** — Locked: **"Write a personalized message..."** (verbatim match to web, `EmailForm.tsx:1181`).

Decide these in a single pass; everything else is mechanical.

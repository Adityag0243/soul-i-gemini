# Souli — End-to-End Modernization Plan

**Status:** Active
**Last updated:** 2026-04-26
**Owner:** Backend dev + AI dev + Mobile dev + DevOps (full-time)
**Deadline:** None (ship when right, no scope compromise)

This document is the **single source of truth** for the multi-week project that brings Souli's mobile app, backend, and AI service into alignment for v1 launch. If you (Claude) lose context, read this top-to-bottom and you can resume work without re-deriving any decisions.

---

## 1. Purpose

Modernize three components so they form a coherent v1 product:

- **Mobile app** (`/Users/ioi/Soulai_mobileApp`) — Expo Router 55 / React Query / Zustand / Zod. Today bypasses backend for chat (`souliClient` direct to AI service IP).
- **Backend** (`/Users/ioi/soul-i/backend`) — Node + TypeScript + Prisma + Postgres. Today persists chat but drops all AI metadata; missing many endpoints mobile expects.
- **AI service** (`/Users/ioi/soul-i/ai-ml-gcp`) — FastAPI + Gemini + MongoDB + Qdrant. Today exposed on hardcoded public IP, no auth, sessions anonymous.

End state: mobile → backend → AI (proxy), full feature scope (15 tracks), no AI behavior changes, flat LLM bill, complete observability.

---

## 2. Workflow Rules (READ EVERY TIME)

This is how Claude works on this project:

1. **One task at a time.** Pick the next pending task from the task list (Section 7). Implement it.
2. **Stop after each task.** Do not chain tasks. Do not start the next one without explicit user confirmation.
3. **Report what was done.** Give the user a brief summary of changes (files touched, key decisions made) plus a suggested commit message in conventional-commit format.
4. **No git push.** Claude has NO permission to push to GitHub. The user reviews the diff locally and pushes manually.
5. **Wait for confirmation.** User says "pushed" or "next" or similar before Claude proceeds.
6. **Mark task complete.** After user confirms push, update Section 7 — change `[ ]` to `[x]` and add a `→ <commit-sha-or-date>` note. Then the user picks the next task or Claude suggests it.
7. **Update plan.md if scope changes.** Any decisions made mid-task get written back into this document so future-Claude doesn't have to re-litigate.

**Commit message format:**
```
<type>(<scope>): <subject>

<body explaining why, not what>
```
Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `migration`, `infra`. Scope is the track ID (e.g., `t1`, `t3`).

---

## 3. Locked Decisions

These are FINAL. Do not re-debate without user approval.

| # | Decision | Value |
|---|---|---|
| D1 | Architecture | Mobile → Backend → AI service (proxy). Mobile's `souliClient` direct path is deleted. |
| D2 | Contract source of truth | `docs/BACKEND_API.md` (lives in backend repo, written in Task 1) |
| D3 | `User` shape | Backend bends to mobile: `id: string`, `avatar`, `isAnonymous`, `callName`, no `password` exposed |
| D4 | `ChatSession` shape | Backend bends to mobile: `status` enum (`active|archived|completed`), `metadata` blob with messageCount/lastMessage/mood/phase/energyNode/etc. |
| D5 | `ChatMessage` / `SendMessageResponse` | Rename `assistantMessage` → `aiMessage`. Mobile extends to absorb full AI metadata (phase, energyNode, secondaryNode, nodeReasoning, turnCount, solutionStep, isSolutionComplete, threeDayTask, ragSources, crisisResources). Drop snake_case duplicates. |
| D6 | `SubscriptionStatus` enum | Mobile bends to backend: `ACTIVE | INACTIVE | TRIALING | EXPIRED | CANCELED | PAST_DUE` (uppercase) |
| D7 | Auth password reset | Mobile migrates to backend's 3-step flow (`/auth/password/forgot` → `/verify` → `/reset`). Legacy aliases (`/auth/forgot-password`, `/auth/reset-password`) kept for 1 release. |
| D8 | Voice (v1) | Upload-based via backend. **No LiveKit in v1** (current upload flow works; LiveKit deferred to v1.1+). |
| D9 | AI behavior | **Untouched.** No new prompts, no new models, no Hindi reply gen, no memory injection, no auto-classification, no LLM-powered practice recommendations. Existing English text chat = preserved exactly. |
| D10 | LLM cost | Flat. No new LLM call paths added in v1. |
| D11 | Old chat data | **Option C** — retain anonymous sessions on AI MongoDB (24-month retention), no user-facing claim flow. Mobile in v1 starts each user with empty chat history. |
| D12 | Free tier | 3 sessions per user, lifetime. "Session counts" when user sends 3rd user message in that session (`isComplete = true`, `User.freeSessionsCompleted++`). Paywall on creation of session #4. Sessions in progress are not interrupted. |
| D13 | Coupon popup | **Option B** — proactive at end of session #3 when it crosses the complete threshold. Once per user (`User.couponPopupShown` flag). Creating session #4 still hits paywall regardless. |
| D14 | Crisis flow | **LOW**: silent log only. **MEDIUM**: AI reply plays in full, then inline soft card "Would you like to see support resources?" with [Yes][Not now]. **HIGH**: AI reply plays in full, then `crisis-help.tsx` modal auto-opens with hotline + text line + grounding exercise + "I'm safe right now" required ack. 60-min follow-up push if no ack and no further messages. Suppressed for 5 minutes after dismiss to avoid spam. Session never auto-ends. |
| D15 | Crisis flow clinical review | **REQUIRED before launch.** Mark as a pre-launch blocker. Copy of all crisis-related strings + flow diagrams must be reviewed by a qualified clinician. |
| D16 | Standard response envelope | `{ success: bool, message: string, data?: T, error?: { code, message, field? } }` — backend already does this. Honor everywhere. |
| D17 | Standard pagination | `?page=1&pageSize=N` → `{ items[], total, page, pageSize, hasMore }` |
| D18 | Standard date format | ISO 8601 with timezone. Always. |
| D19 | API versioning | No `/v1/` prefix in v1 (would break mobile). Add via `Accept-Version` header in v1.1 if needed. |
| D20 | Auth providers v1 | Email + Google + Anonymous + Apple + Mobile OTP. Email verification step added. |

---

## 4. Scope

### 4.1 In scope (15 tracks)

| ID | Track | Owner |
|---|---|---|
| T0 | Contract alignment + `docs/BACKEND_API.md` | Backend writes, mobile + AI review |
| T1 | Persist AI metadata on chat | Backend + AI |
| T2 | AI service auth + private network | AI + DevOps |
| T3 | Profile + avatar + device tokens + push registration | Backend |
| T4 | Auth completeness (refresh, logout, sessions, email verify, mobile OTP, Apple) | Backend |
| T5 | Daily check-ins CRUD + streak (no LLM auto-tag) | Backend |
| T6 | Crisis flow + resources | Backend + AI |
| T7 | Practices library + 3-day tasks (SQL recommendations only) | Backend |
| T8 | Insights aggregation | Backend |
| T9 | SSE streaming chat (new endpoint, existing `/chat` untouched) | Backend + AI |
| T11 | Subscription enhancements + coupons refactor + free-tier rules | Backend |
| T12 | Referrals | Backend |
| T13 | AI → backend webhooks | Backend + AI |
| T14 | Notifications inbox + preferences + crons | Backend |
| T17 | Mobile contract update + souliClient removal + new screens | Mobile |
| T18 | Infrastructure hardening | DevOps |
| T19 | Observability (Sentry + PostHog + Datadog) | All |

### 4.2 Out of scope (deferred to v1.1+)

- ~~T10 — AI long-term memory~~ (does not exist today; figure out later)
- ~~T15 — Multilang Hindi/Hinglish reply gen~~ (does not exist today; figure out later)
- ~~T5 partial — `/diagnose` LLM auto-tag on check-ins~~ (does not exist today)
- ~~T7 partial — LLM-powered practice recommendations~~ (SQL version covers v1; LLM version later)
- ~~T16 — LiveKit voice realtime~~ (current upload-based voice works)

---

## 5. Architecture Overview

```
┌─────────────────┐      HTTPS/JSON      ┌─────────────────┐    Internal HTTPS    ┌─────────────────┐
│                 │  ──────────────────► │                 │  ──────────────────► │                 │
│   Mobile App    │   Bearer + x-api-key │     Backend     │   X-Internal-API-Key │   AI Service    │
│  (Expo / RN)    │                      │ (Node/TS/Prisma)│                      │ (FastAPI/Gemini)│
│                 │  ◄────────────────── │                 │  ◄────────────────── │                 │
└─────────────────┘   typed JSON         └────────┬────────┘    typed JSON        └────────┬────────┘
                                                  │                                        │
                                                  ▼                                        ▼
                                          ┌──────────────┐                         ┌──────────────┐
                                          │  Postgres    │                         │  MongoDB     │
                                          │  (Prisma)    │                         │  + Qdrant    │
                                          └──────────────┘                         └──────────────┘
                                                  │
                                                  ▼
                                          ┌──────────────┐
                                          │  S3 / GCS    │
                                          │  + CDN       │
                                          │ (avatars,    │
                                          │  voice, etc) │
                                          └──────────────┘

  Background:
  - Cron: 3-day task reminder, daily check-in nudge, session auto-archive
  - Webhooks: AI → Backend on phase_change, crisis_detected, solution_complete, three_day_task_assigned
```

Key removals from current state:
- Mobile no longer talks directly to AI service (delete `souliClient.ts`)
- AI service no longer reachable on public IP (move to private VPC)
- Hardcoded `13.127.63.17:8000` references removed everywhere

---

## 6. Repository Layout

| Repo | Path | Role |
|---|---|---|
| Backend | `/Users/ioi/soul-i/backend` | Node/TS/Express/Prisma. Owns user data, chat persistence, payments, notifications. |
| AI service | `/Users/ioi/soul-i/ai-ml-gcp` | FastAPI. Owns conversation state in MongoDB, RAG via Qdrant, TTS/STT. |
| Mobile | `/Users/ioi/Soulai_mobileApp` | Expo Router. Separate repo. |
| Plan / docs | `/Users/ioi/soul-i/plan.md` (this file) + `/Users/ioi/soul-i/backend/docs/BACKEND_API.md` (Task 1 deliverable) | |

---

## 7. Task List

Each task is **atomic** (one PR-sized unit of work) and **sequential** (do them in order unless explicitly reordered).

Status legend: `[ ]` pending · `[~]` in progress · `[x]` complete

### Phase 1: T0 — Contract documentation

- [x] **1.1** Write `/Users/ioi/soul-i/backend/docs/BACKEND_API.md` — canonical request/response schemas for every endpoint in scope, error codes, auth requirements, status codes. This is the contract both teams build against. → 2026-04-26

### Phase 2: T1 — Persist AI metadata

- [x] **2.1** Prisma migration: extend `ChatMessage` with `phase`, `energyNode`, `secondaryNode`, `nodeReasoning`, `turnCount`, `solutionStep`, `ragSources` (json), `detectedEmotion`, `audioUrl`, `durationMs` → 2026-04-26
- [x] **2.2** Prisma migration: extend `ChatSession` with `phase`, `energyNode`, `secondaryNode`, `commitmentStatus`, `solutionStep`, `solutionComplete`, `threeDayTask`, `threeDayTaskAssignedAt`, `lastActivityAt`, `channelType`, `livekitRoomName`, `totalTokensUsed`, `mood`, `isComplete` → 2026-04-27 (already existed in migration 20260426120100)
- [x] **2.3** Update `chat.service.ts` to persist all AI metadata on assistant message create (currently dropped at line 236) → 2026-04-27 (already implemented)
- [x] **2.4** Update `chat.service.ts` to mirror metadata to `ChatSession` on every assistant message → 2026-04-27 (already implemented)
- [x] **2.5** Add `GET /chat/sessions/{id}/ai-state` proxy endpoint → 2026-04-27 (already implemented)
- [x] **2.6** Update `SendMessageResponse` shape: rename `assistantMessage` → `aiMessage`, add full metadata fields, drop snake_case duplicates → 2026-04-27 (already implemented)
- [x] **2.7** AI service: enrich `GET /session/{id}/state` to return full metadata → 2026-04-27 (already implemented)

### Phase 3: T3 — Profile + avatar + device tokens

- [x] **3.1** Prisma migration: extend `User` with `callName`, `avatarUrl`, `country`, `timezone`, `locale`, `dateOfBirth`, `gender`, `preferredVoice`, `pushNotificationsEnabled`, `emailNotificationsEnabled`, `lastActiveAt`, `onboardingCompleted` → 2026-04-27 (already implemented)
- [x] **3.2** Prisma migration: add `UserDeviceToken` table → 2026-04-27 (already implemented)
- [x] **3.3** Build canonical `User` serializer + apply to all auth endpoints → 2026-04-27 (already implemented)
- [x] **3.4** `PATCH /users/me` partial update of allowed fields → 2026-04-27 (already implemented)
- [x] **3.5** `POST /users/me/call-name` (dedicated for onboarding) → 2026-04-27 (already implemented)
- [x] **3.6** S3 bucket setup + `POST /users/me/avatar` (multipart, resize) → 2026-04-27 (already implemented)
- [x] **3.7** `DELETE /users/me/avatar` → 2026-04-27 (already implemented)
- [x] **3.8** `POST /notifications/token` and `DELETE /notifications/token` → 2026-04-27 (already implemented)

### Phase 4: T4 — Auth completeness

- [x] **4.1** Add legacy aliases `/auth/forgot-password` and `/auth/reset-password` → new 3-step paths
- [x] **4.2** `POST /auth/email/verify/send` + `POST /auth/email/verify/confirm`
- [x] **4.3** `POST /auth/mobile/otp/send` + `POST /auth/mobile/otp/verify` (SMS provider stubbed — Q6 still gates real send)
- [x] **4.4** `POST /auth/apple` + `POST /auth/link/apple` (verifier needs `APPLE_BUNDLE_ID` env var; hard-fails without it)
- [x] **4.5** `POST /auth/refresh` (verify exists; document) → `/auth/refresh` added as canonical; `/auth/token/refresh` kept as legacy alias
- [x] **4.6** `POST /auth/logout` and `POST /auth/logout-all` → 2026-04-27
- [x] **4.7** `GET /auth/sessions` (list active devices) + `DELETE /auth/sessions/{keystoreId}` (revoke) → 2026-04-27

### Phase 5: T2 — AI service auth + private network

- [x] **5.1** AI service: middleware requiring `X-Internal-API-Key` header. Reject all other requests. → 2026-04-27
- [x] **5.2** Backend: include `X-Internal-API-Key` header on every AI service call (env var) → 2026-04-27
- [ ] **5.3** Move AI service off public IP (DevOps coordination — private VPC + internal DNS)
- [x] **5.4** Backend: propagate `X-Request-Id` header to AI service for tracing → 2026-04-27

### Phase 6: T11 — Subscription + coupons + free-tier rules

- [x] **6.1** Prisma migration: `User.freeSessionsCompleted Int @default(0)`, `User.couponPopupShown Boolean @default(false)` → 2026-04-27
- [x] **6.2** Logic: increment `freeSessionsCompleted` and set `ChatSession.isComplete = true` when user sends 3rd user message in that session → 2026-04-27
- [x] **6.3** Logic: block `POST /chat/sessions` (session #4) when `freeSessionsCompleted >= 3 && !activeSubscription` → 402 Payment Required → 2026-04-27
- [x] **6.4** `GET /chat/sessions/status/free` → `{ used, total: 3, blocked, showCouponPopup }` → 2026-04-27
- [x] **6.5** `POST /chat/sessions/coupon-popup/shown` (acknowledge popup so it doesn't reshow) → 2026-04-27
- [x] **6.6** Migrate `SubscriptionStatus` enum: add `TRIALING`, `INACTIVE`. Backfill `FREE` → `INACTIVE`. → 2026-04-27
- [x] **6.7** Prisma migration: `Coupon` and `CouponRedemption` tables → 2026-04-27
- [x] **6.8** `GET /coupons/{code}/validate` (pre-flight) → 2026-04-27
- [x] **6.9** `POST /payments/coupon/redeem` aligned to new tables → 2026-04-27
- [x] **6.10** `GET /payments/subscription/entitlements` (consolidated source of truth) → 2026-04-27
- [x] **6.11** `POST /payments/subscription/pause` + `/resume` → 2026-04-27
- [x] **6.12** `GET /payments/subscription/upcoming-charge` → 2026-04-27
- [x] **6.13** `POST /payments/checkout/portal` (Stripe customer portal URL) → 2026-04-27

### Phase 7: T5 — Daily check-ins

- [x] **7.1** Prisma migration: extend `DailyCheckin` with `voiceReflection`, `audioUrl`, `date Date` + `@@unique([userId, date])` → 2026-04-27
- [ ] **7.2** `POST /checkins` (upsert by date)
- [ ] **7.3** `GET /checkins/today`
- [ ] **7.4** `GET /checkins?range=30d&page=1`
- [ ] **7.5** `GET /checkins/streak`
- [ ] **7.6** `GET /checkins/{id}` + `PATCH /checkins/{id}` + `DELETE /checkins/{id}`

### Phase 8: T7 — Practices library + 3-day tasks

- [ ] **8.1** Seed `EnergyNode` with 7 nodes (scattered, blocked, depleted, outofcontrol, suppressed, normal, grief) + descriptions, colors, icons
- [ ] **8.2** Seed `Practice` table with initial content
- [ ] **8.3** `GET /energy-nodes` + `GET /energy-nodes/{id}`
- [ ] **8.4** `GET /practices?energyNodeId=&type=&limit=20` (filter + paginate)
- [ ] **8.5** `GET /practices/{id}` (full content)
- [ ] **8.6** `GET /practices/recommended` — pure SQL: lookup user's recent `energyNode`, return top N by aggregate feedback score (no LLM)
- [ ] **8.7** `POST /practices/{id}/feedback` + `GET /practices/{id}/feedback/mine` (use existing `PracticeFeedback`)
- [ ] **8.8** Prisma migration: `UserPracticeSave` (or use existing if found)
- [ ] **8.9** `GET /users/me/practices/saved` + `POST/DELETE /users/me/practices/{id}/save`
- [ ] **8.10** Prisma migration: `PracticeAssignment` table (3-day tasks from AI)
- [ ] **8.11** `GET /practice-assignments/active` + `GET /practice-assignments?range=30d` + `GET /{id}`
- [ ] **8.12** `POST /practice-assignments/{id}/complete` + `DELETE /practice-assignments/{id}`

### Phase 9: T14 — Notifications

- [ ] **9.1** Prisma migration: `Notification` table (in-app inbox)
- [ ] **9.2** Prisma migration: `NotificationPreference` (per-type toggles: dailyCheckIn, practiceReminder, subscription, crisis, marketing)
- [ ] **9.3** `GET /notifications?unreadOnly=true&limit=20`
- [ ] **9.4** `POST /notifications/{id}/read` + `POST /notifications/read-all` + `DELETE /notifications/{id}`
- [ ] **9.5** `GET /notifications/preferences` + `PATCH /notifications/preferences`
- [ ] **9.6** Job runner setup (BullMQ or pg_cron — TBD per Q3 below)
- [ ] **9.7** Cron: 3-day task reminder push (24h before expiry)
- [ ] **9.8** Cron: daily check-in nudge (user's local 8pm via `User.timezone`)
- [ ] **9.9** Cron: session auto-archive (>30d inactive AND complete)
- [ ] **9.10** Push notification delivery (Expo push or APNS/FCM — TBD per Q4 below)

### Phase 10: T6 — Crisis flow

- [ ] **10.1** Prisma migration: `CrisisResource` table
- [ ] **10.2** Seed `CrisisResource` with at least 5 countries (US, IN, UK, AU, CA): hotlines, grounding exercises, articles
- [ ] **10.3** `GET /crisis/resources?country=IN&type=hotline|exercise|article`
- [ ] **10.4** `GET /crisis/grounding-exercises/{id}` (full content)
- [ ] **10.5** Backend: when chat response has `crisisLevel: HIGH`, include inline `crisisResources` in response (no second round-trip)
- [ ] **10.6** Backend: on HIGH crisis, create `Notification` record (so it appears in inbox)
- [ ] **10.7** Backend: on HIGH crisis, send immediate push notification (if user enabled)
- [ ] **10.8** Backend: cron — 60-min follow-up push if user hasn't acked "I'm safe" and hasn't messaged again
- [ ] **10.9** AI service: emit webhook to backend `/internal/ai-events` on crisis detection
- [ ] **10.10** Crisis copy clinical review (BLOCKER for launch — assign owner)

### Phase 11: T8 — Insights

- [ ] **11.1** `GET /users/me/insights?range=7d|30d|90d|all` — aggregation: totalSessions, totalMessages, totalVoiceMinutes, checkInStreak, energyNodeFrequency, energyNodeTrend, moodTrend, crisisEvents counts, practicesCompleted, topThemes
- [ ] **11.2** Add Postgres read replica if query latency requires (TBD after measuring)

### Phase 12: T9 — SSE streaming

- [ ] **12.1** AI service: `POST /chat/stream` SSE endpoint (events: chunk, metadata, done, error). **Existing `/chat` left untouched.**
- [ ] **12.2** Backend: `POST /chat/messages?stream=true` SSE proxy that pipes AI's stream + persists final message + metadata when stream completes
- [ ] **12.3** Backend: `Idempotency-Key` header support to dedupe retries (60s window)

### Phase 13: T13 — AI → backend webhooks

- [ ] **13.1** Backend: `POST /internal/ai-events` (auth: shared secret)
- [ ] **13.2** AI service: emit on `phase_change`, `crisis_detected`, `solution_complete`, `three_day_task_assigned`, `name_extracted`
- [ ] **13.3** Backend: react to `solution_complete` → mark session complete, persist `threeDayTask` if any
- [ ] **13.4** Backend: react to `three_day_task_assigned` → create `PracticeAssignment` record

### Phase 14: T12 — Referrals

- [ ] **14.1** `GET /referrals/me` → `{ code, sharedCount, convertedCount, rewardsEarned }`
- [ ] **14.2** `POST /referrals/apply` (called at signup with `code`)
- [ ] **14.3** Optional: `GET /referrals/leaderboard`

### Phase 15: T17 — Mobile (interleaved per backend track)

Mobile updates happen **after each backend track is shipped**, not all at the end. Sub-tasks below are grouped by parent track.

**T17 baseline (one-time):**
- [ ] **15.0a** Delete `src/api/souliClient.ts` and `src/queries/useSouliChat.ts`
- [ ] **15.0b** Replace all souliClient consumers (e.g., `VoiceChatScreen.tsx:97`) with backend-routed equivalents
- [ ] **15.0c** Fix tech debt: `appStore.ts:51` set `DEV_RESET_ONBOARDING = false`; `authStore.ts:102-121` delete anonymous mock fallback; `useChat.ts:45` replace hardcoded `isPaywalled = false` with `useSubscriptionEntitlements()` check

**Per-track mobile updates (added when each backend track is done):**
- [ ] **15.T1** Update `SendMessageResponse` type, `ChatMessage` type, `ChatSession` type to absorb new fields
- [ ] **15.T3** Update `User` type, add avatar upload UI, add push token registration on login
- [ ] **15.T4** Add email verification flow, mobile OTP screen, Apple Sign-In button, sessions/devices screen
- [ ] **15.T5** Build daily check-in flow + reflections list + streak display
- [ ] **15.T6** Build crisis modal trigger logic (LOW/MEDIUM/HIGH per D14) + crisis resources screen
- [ ] **15.T7** Build practices library + practice detail + 3-day task tracker
- [ ] **15.T8** Build insights dashboard in `journey.tsx`
- [ ] **15.T9** Add SSE streaming consumer (event-source-polyfill or custom fetch)
- [ ] **15.T11** Update `SubscriptionStatus` enum to uppercase, add coupon entry + popup, paywall on session #4, password reset 3-step flow
- [ ] **15.T12** Build referral screen
- [ ] **15.T14** Build notifications inbox + preferences screen

### Phase 16: T18 — Infrastructure

- [ ] **16.1** S3/GCS bucket for avatars + voice audio + practice media
- [ ] **16.2** CloudFront / CloudFlare CDN in front of bucket
- [ ] **16.3** Move all secrets to AWS Secrets Manager / GCP Secret Manager
- [ ] **16.4** AI service mTLS or shared-secret transport
- [ ] **16.5** PgBouncer connection pooling
- [ ] **16.6** Prisma `migrate deploy` in CI/CD pipeline
- [ ] **16.7** CORS whitelist for mobile bundle ID + Expo dev URLs
- [ ] **16.8** Rate limiting: `/chat/messages` 60/min/user, `/auth/email/login` 5/min/IP, `/auth/anonymous` 10/hr/IP, `/payments/coupon/redeem` 5/hr/user

### Phase 17: T19 — Observability

- [ ] **17.1** Sentry — backend
- [ ] **17.2** Sentry — AI service
- [ ] **17.3** Sentry — mobile (`@sentry/react-native`)
- [ ] **17.4** PostHog — mobile (product analytics events: signup, chat_started, paid_conversion, churn)
- [ ] **17.5** Datadog or Grafana — API latency, error rate, AI call latency, Stripe webhook success, DB query times
- [ ] **17.6** AI service `GET /health/deep` with subsystem checks (gemini, mongodb, qdrant, whisper, edge_tts)
- [ ] **17.7** Backend `GET /health/deep` with subsystem checks (DB, AI service, Stripe, Razorpay, S3, LiveKit, AWS SES)

---

## 8. Currently Working On

**Next pending task:** Task 7.2 — `POST /checkins` (upsert by date)

(Update this section before starting and after completing each task.)

---

## 9. Open Questions / Pending User Input

These need answers from the user before specific tasks start. Tasks affected are noted.

| Q | Question | Affects | Status |
|---|---|---|---|
| Q1 | Where should `BACKEND_API.md` live? | Task 1.1 | ✅ Resolved → `/Users/ioi/soul-i/backend/docs/BACKEND_API.md` |
| Q2 | Is `plan.md` location OK at repo root? | Meta | ✅ Resolved → `/Users/ioi/soul-i/plan.md` |
| Q3 | Job runner choice: BullMQ (needs Redis) or pg_cron (zero new infra)? | Phase 9 (notifications) | Open |
| Q4 | Push notification delivery: Expo push (built-in, easier) or APNS/FCM directly (more control)? | Phase 9 | Open |
| Q5 | Storage cloud: AWS S3 (backend currently on AWS) or GCP (AI service is on GCP)? | Phase 3.6, Phase 16 | Open |
| Q6 | SMS provider for mobile OTP: Twilio, AWS SNS, MessageBird, other? | Task 4.3 | Open |
| Q7 | Email provider: backend currently uses AWS SES — confirm? | Task 4.2 | ✅ Resolved → AWS SES (codebase already uses it via `password-reset-email.service.ts`; new `email-verification.service.ts` mirrors that pattern) |
| Q8 | Apple Developer team access — who has it for Sign in with Apple setup? | Task 4.4 | ⚠️ Partial — code lands and verifies against Apple JWKs (public). To activate in any env, set `APPLE_BUNDLE_ID` (and optionally `APPLE_SERVICE_ID` for web). Team access still needed for prod cred provisioning. |
| Q9 | Clinical reviewer for crisis copy — who, and when can they review? | Task 10.10 (LAUNCH BLOCKER) | Open |
| Q10 | Current monthly LLM bill + current DAU + target launch DAU? Useful for cost monitoring even if no new LLM paths added. | Task 17.5 | Open |
| Q11 | Ordering: Should Phase 4 (Auth) come before Phase 3 (Profile)? | Sequencing | ✅ Resolved → Phase 3 first, then Phase 4. Reason: canonical User serializer must exist before auth endpoints adopt it; doing it in reverse means rewriting every auth response. |

---

## 10. Reference Material

### 10.1 Existing API doc

User-provided API doc shared in conversation (see Google Doc: `https://docs.google.com/document/d/1KjD6sFVyMeMMHSfx-h-i3fQ6OwRofRuB6xk5pZDbmu8`). Used as the *starting point* for `BACKEND_API.md` but enriched per the locked decisions in Section 3 (especially D3, D4, D5, D6, D7).

### 10.2 Mobile contract files (de facto current contract)

- `/Users/ioi/Soulai_mobileApp/src/api/endpoints.ts` — endpoint registry
- `/Users/ioi/Soulai_mobileApp/src/types/api.ts` — type definitions
- `/Users/ioi/Soulai_mobileApp/src/api/souliClient.ts` — direct AI path **TO BE DELETED**
- `/Users/ioi/Soulai_mobileApp/src/utils/storage.ts` — `STORAGE_KEYS` registry

### 10.3 Backend key files

- `/Users/ioi/soul-i/backend/prisma/schema.prisma` — Prisma schema (current state)
- `/Users/ioi/soul-i/backend/src/modules/chat/services/chat.service.ts` — chat logic (line 236 = where AI metadata is currently dropped)
- `/Users/ioi/soul-i/backend/src/modules/chat/services/ai.service.ts` — backend's AI service client (line 368, 416 = where session_id is passed)
- `/Users/ioi/soul-i/backend/src/modules/auth/routes/auth.routes.ts` — current auth routes
- `/Users/ioi/soul-i/backend/src/modules/payments/routes/payment.routes.ts` — current payment routes

### 10.4 AI service key files

- `/Users/ioi/soul-i/ai-ml-gcp/souli_pipeline/api.py` — FastAPI routes
- `/Users/ioi/soul-i/ai-ml-gcp/souli_pipeline/storage/mongo_store.py` — note line 7: "No user_id association — sessions are anonymous benchmark data"
- `/Users/ioi/soul-i/ai-ml-gcp/souli_pipeline/conversation/intake.py:125` — Hinglish crisis keywords
- `/Users/ioi/soul-i/ai-ml-gcp/souli_pipeline/voice/tts.py:32` — TTS voice list

---



## 11. Definitions

- **"Session counts"** — A `ChatSession` becomes `isComplete = true` when the user sends their 3rd user message in that session. This increments `User.freeSessionsCompleted`. Sessions never re-open after completion.
- **"Active subscription"** — `UserSubscription.status IN (ACTIVE, TRIALING)` AND `currentPeriodEnd > now()`.
- **"Crisis level"** — Returned by AI service per message: `NONE | LOW | MEDIUM | HIGH`. Backend respects exactly; does not re-classify.
- **"Phase"** — AI conversation phase: `greeting | intake | sharing | deepening | venting | summarization | commitment_check | solution`.
- **"Energy node"** — One of 7 internal taxonomies AI uses: `scattered | blocked | depleted | outofcontrol | suppressed | normal | grief`.

---

## 12. Change Log

| Date | Change | By |
|---|---|---|
| 2026-04-26 | Plan created | Claude (after multi-turn brainstorm with user) |
| 2026-04-26 | Q1, Q2, Q11 resolved. Phase 3 (Profile) confirmed before Phase 4 (Auth). Task 3.3 expanded to include applying canonical User serializer to all auth endpoints. | Claude per user direction |

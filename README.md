# PromptGrowth — API Server

Express REST API for **PromptGrowth**, an AI prompt marketplace. Handles authentication, prompt CRUD & moderation, bookmarks, reviews, reports, Stripe Premium payments, and admin analytics. Data is stored in **MongoDB** via Mongoose.

> **Companion repo:**(https://github.com/tomalahmed/PromtGrowth-Client) (Next.js client)  

---

## Table of contents

- [Overview](#overview)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Data models](#data-models)
- [Roles & permissions](#roles--permissions)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Scripts & seeding](#scripts--seeding)
- [API reference](#api-reference)
- [Business logic](#business-logic)
- [Security](#security)
- [Deploy on Render](#deploy-on-render)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)

---

## Overview

The API is the single source of truth for:

- **Auth** — JWT in httpOnly cookies (email/password + Google via Firebase Admin)
- **Marketplace** — approved prompts (public + Pro listings in browse)
- **Pro gating** — private prompt content stripped for non-Premium viewers
- **Premium** — Stripe checkout, webhook, and session verification
- **Moderation** — admin approve / reject / feature workflow
- **Social** — bookmarks, reviews, reports

Base URL: `/api`  
Health: `GET /api/health` → `{ "status": "ok" }`

---

## Tech stack

| Category | Technology |
|----------|------------|
| Runtime | Node.js 18+ |
| Framework | Express 5 |
| Database | MongoDB + Mongoose 9 |
| Auth | JWT (`jsonwebtoken`) + bcrypt |
| Google | Firebase Admin (`verifyIdToken`) |
| Payments | Stripe (checkout + webhooks) |
| Validation | express-validator |
| Security | Helmet, CORS, express-rate-limit, custom input sanitization |

---

## Architecture

```mermaid
flowchart TB
  Client["Next.js client"]
  Proxy["/api proxy"]
  Express["Express app"]
  MW["Middleware stack"]
  Ctrl["Controllers"]
  Mongo["MongoDB Atlas"]

  Client --> Proxy --> Express
  Express --> MW
  MW --> Ctrl
  Ctrl --> Mongo
```

### Middleware order (`src/app.js`)

1. `trust proxy` — correct IPs behind Render
2. Helmet — security headers
3. CORS — `CLIENT_URL` with credentials
4. Stripe webhook — **raw body** (before JSON parser)
5. `cookie-parser` + `express.json` (1MB limit)
6. `sanitizeInput` — Express 5–compatible NoSQL sanitization
7. Rate limiter — `/api`
8. Route handlers
9. 404 JSON handler
10. Global error handler

---

## Data models

### User

| Field | Type | Notes |
|-------|------|-------|
| `name` | String | Display name |
| `email` | String | Unique, lowercase |
| `password` | String | Hashed; optional if Google-only |
| `photoURL` | String | Avatar URL |
| `role` | Enum | `user` \| `creator` \| `admin` |
| `isPremium` | Boolean | Unlocks Pro prompt content |
| `firebaseUid` | String | Google accounts |
| `promptCount` | Number | Creator prompt tally |

### Prompt

| Field | Type | Notes |
|-------|------|-------|
| `title`, `description`, `content` | String | Core listing |
| `category`, `aiTool` | String | Marketplace filters |
| `tags` | String[] | Searchable |
| `difficulty` | Enum | `Beginner` \| `Intermediate` \| `Pro` |
| `visibility` | Enum | `public` \| `private` (**Pro prompt**) |
| `status` | Enum | `pending` \| `approved` \| `rejected` |
| `featured` | Boolean | Homepage featured section |
| `copyCount` | Number | Usage metric |
| `averageRating`, `reviewCount` | Number | From reviews |
| `creator` | ObjectId → User | Owner |

### Other collections

- **Bookmark** — user ↔ prompt
- **Review** — rating (1–5) + comment per user per prompt
- **Report** — user flags on prompts (admin actions)
- **Payment** — Stripe session records

---

## Roles & permissions

| Action | Visitor | User | Premium | Creator | Admin |
|--------|---------|------|---------|---------|-------|
| Browse marketplace (`GET /prompts`) | Yes | Yes | Yes | Yes | Yes |
| View prompt detail | No* | Yes | Yes | Yes | Yes |
| View Pro content | — | Locked | Yes | Own: yes | Yes |
| Bookmark / review | No | Yes | Yes | Yes | Yes |
| Publish prompts | No | No** | No | Yes | Yes |
| Moderate prompts | No | No | No | No | Yes |
| Manage users | No | No | No | No | Yes |

\*Client middleware requires login for `/prompts/:id`.  
\*\*Free users can create up to 3 prompts if given creator role; registration defaults to `user`.

**Creator role** is assigned by admin (`PATCH /users/:id/role`), not self-service.

---

## Getting started

### Prerequisites

- Node.js **18+**
- MongoDB Atlas cluster (or local MongoDB)
- Firebase project (for Google sign-in)
- Stripe account (optional, for Premium)

### Install & run

```bash
cd Marketplace-Platform-Server
npm install
cp .env.example .env
# Edit MONGODB_URI, JWT_SECRET, etc.
npm run dev
```

Verify: **http://localhost:5000/api/health**

---

## Environment variables

### Required

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | `mongodb+srv://.../dbname?retryWrites=true&w=majority` |
| `JWT_SECRET` | Strong secret; **≥ 32 characters** in production |

### Production required

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `production` |
| `CLIENT_URL` | Frontend origin, e.g. `https://your-app.vercel.app` (**no trailing slash**) |

### Payments (Stripe)

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | `sk_test_...` or `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | From Stripe webhook dashboard |
| `STRIPE_PREMIUM_PRICE_CENTS` | Default `500` ($5.00) |

### Google sign-in (Firebase Admin)

| Variable | Description |
|----------|-------------|
| `FIREBASE_PROJECT_ID` | Same as client `NEXT_PUBLIC_FIREBASE_PROJECT_ID` |
| `FIREBASE_CLIENT_EMAIL` | Service account email from JSON key |
| `FIREBASE_PRIVATE_KEY` | Private key — **one line**, `\n` for line breaks, no quotes on Render |

Download key: Firebase Console → Project settings → Service accounts → Generate new private key.

### Platform admin (seeding)

| Variable | Description |
|----------|-------------|
| `REAL_ADMIN_EMAIL` | Production admin login email |
| `REAL_ADMIN_PASSWORD` | Production admin password |
| `REAL_ADMIN_NAME` | Display name (optional) |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_EXPIRES_IN` | `7d` | Token lifetime |
| `ENABLE_DEMO` | `false` in prod | Allow demo email logins |
| `COOKIE_SAME_SITE` | `lax` | Cookie SameSite (works with Next.js `/api` proxy) |
| `PORT` | `5000` locally | **Do not set on Render** |

---

## Scripts & seeding

| Command | Description |
|---------|-------------|
| `npm run dev` | Nodemon hot reload |
| `npm start` | Production server |
| `npm run health` | Curl local `/api/health` |
| `npm run seed` | **Dev only** — demo users + sample prompts |
| `npm run seed:admin` | Create/update real admin from `REAL_ADMIN_*` |

### Demo seed (`npm run seed`)

Creates demo accounts (e.g. creator, free user, demo admin) with known passwords.  
**Never run in production** with `ENABLE_DEMO=false`.

### Real admin (`npm run seed:admin`)

```bash
# Set REAL_ADMIN_EMAIL + REAL_ADMIN_PASSWORD in .env first
npm run seed:admin
```

Run once against your target database (local or production URI).

---

## API reference

All routes prefixed with `/api`.  
Auth = `verifyToken` (JWT cookie). Role = `verifyRole(...)`.

### Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | — | Liveness check |

### Auth (`/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | — | Create account (`role: user`) |
| POST | `/login` | — | Email/password → JWT cookie |
| POST | `/logout` | — | Clear cookie |
| GET | `/me` | Yes | Current user profile |
| POST | `/google-sync` | — | Body: `{ idToken, name?, email?, photoURL? }` |

Rate-limited. Password min **8** characters on register.

### Prompts (`/prompts`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Optional | Marketplace list (search, filter, sort, paginate) |
| GET | `/featured` | Optional | 6 featured approved prompts |
| GET | `/top-creators` | Optional | Creators by copies + count |
| GET | `/me/mine` | Yes | Current user's prompts |
| GET | `/admin/all` | Admin | All prompts for moderation |
| GET | `/:id` | Yes | Prompt detail (Pro sanitization applied) |
| POST | `/` | Yes | Create prompt (pending approval) |
| PATCH | `/:id` | Yes | Update (owner or admin) |
| DELETE | `/:id` | Yes | Delete (owner or admin) |
| PATCH | `/:id/copy` | Yes | Increment copy count (Premium required for Pro) |
| PATCH | `/:id/approve` | Admin | Approve prompt |
| PATCH | `/:id/reject` | Admin | Reject with feedback |
| PATCH | `/:id/feature` | Admin | Toggle featured |

**Query params** (`GET /`): `search`, `category`, `aiTool`, `difficulty`, `sort` (`latest` \| `popular` \| `copies`), `page`, `limit` (max 100).

### Bookmarks (`/bookmarks`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Yes | Paginated bookmarked prompts (sanitized) |
| GET | `/check/:promptId` | Yes | `{ bookmarked: boolean }` |
| POST | `/:promptId` | Yes | Toggle bookmark |

### Reviews (`/reviews`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/recent` | Optional | Recent reviews |
| GET | `/me` | Yes | Current user's reviews |
| GET | `/prompt/:promptId` | Optional | Reviews for a prompt |
| POST | `/:promptId` | Yes | Submit review (Premium for Pro prompts) |

### Reports (`/reports`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/:promptId` | Yes | Flag a prompt |
| GET | `/` | Admin | List reports |
| PATCH | `/:id` | Admin | Resolve / dismiss |

### Payments (`/payments`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/create-checkout-session` | Yes | Stripe Checkout URL |
| POST | `/verify-session` | Yes | Body: `{ sessionId }` — activate Premium |
| POST | `/webhook` | Stripe sig | `checkout.session.completed` (raw body route) |
| GET | `/` | Admin | Payment history |

### Users (`/users`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/profile` | Yes | Profile + stats |
| PATCH | `/profile` | Yes | Update name / photoURL |
| GET | `/creator/analytics` | Creator, Admin | Creator stats |
| GET | `/admin/analytics` | Admin | Platform analytics |
| GET | `/` | Admin | List users (search, role filter) |
| PATCH | `/:id/role` | Admin | Change user role |
| DELETE | `/:id` | Admin | Delete user |

---

## Business logic

### Pro prompt gating (`src/utils/promptVisibility.js`)

1. Creator sets `visibility: "private"` when publishing (Pro prompt).
2. Approved Pro prompts appear in marketplace for everyone.
3. For viewers who are **not** owner, admin, or Premium:
   - `content` removed from response
   - `contentPreview` = first 180 chars
   - `contentLocked: true`, `isPro: true`
4. Bookmarks and list endpoints use the same sanitization.

### Premium activation

1. User completes Stripe Checkout.
2. **Webhook** `checkout.session.completed` → `isPremium: true` + Payment record.
3. **Fallback:** client calls `POST /payments/verify-session` with `session_id` (useful in local dev without webhook forwarding).

### Google authentication

1. Client sends Firebase `idToken`.
2. Server `verifyFirebaseIdToken(idToken)`.
3. Upsert user by email; **role only set on insert** (not overwritten on login).
4. Issue JWT cookie via `sendAuthResponse`.

### Demo isolation (`src/utils/demoScope.js`)

When a demo admin logs in, list endpoints filter to demo-scoped data only. Disabled in production when `ENABLE_DEMO=false`.

---

## Security

| Measure | Implementation |
|---------|----------------|
| Password hashing | bcrypt (pre-save hook) |
| JWT | httpOnly cookie, `secure` in production |
| CORS | Whitelist `CLIENT_URL` only |
| Rate limiting | Auth routes + global `/api` cap |
| Input sanitization | Custom middleware (Express 5 safe) |
| Query filters | Whitelisted string fields + regex escape |
| Pagination cap | Max 100 items per page |
| Admin role | Re-fetched from DB on `verifyRole` |
| Google sync | Requires verified Firebase `idToken` |
| Error responses | Generic 500 message in production |
| Demo accounts | Blocked in production unless `ENABLE_DEMO=true` |

---

## Deploy on Render

### Service settings

| Setting | Value |
|---------|-------|
| Environment | Node |
| Build command | `npm install` |
| Start command | `npm start` |
| **Do not set** | `PORT` (Render assigns automatically) |

### Environment checklist

```env
NODE_ENV=production
MONGODB_URI=mongodb+srv://...@cluster.mongodb.net/promtgrowth?...
JWT_SECRET=<64-char-random-string>
CLIENT_URL=https://your-app.vercel.app
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
REAL_ADMIN_EMAIL=...
REAL_ADMIN_PASSWORD=...
ENABLE_DEMO=false
```

### MongoDB Atlas

1. Create database user + connection string with real DB name (not `yourDatabaseName`).
2. **Network Access** → allow `0.0.0.0/0` (or Render outbound IPs).

### Stripe webhook

- URL: `https://<service>.onrender.com/api/payments/webhook`
- Event: `checkout.session.completed`
- Copy signing secret → `STRIPE_WEBHOOK_SECRET`

### After deploy

```bash
# From local machine with production MONGODB_URI in .env
npm run seed:admin
```

Test: `curl https://<service>.onrender.com/api/health`

---

## Project structure

```
Marketplace-Platform-Server/
├── server.js                 # Entry: validateEnv → connectDB → listen
├── src/
│   ├── app.js                # Express app + middleware
│   ├── config/
│   │   ├── db.js
│   │   ├── env.js            # Startup validation
│   │   ├── firebaseAdmin.js
│   │   ├── realAdmin.js
│   │   └── stripe.js
│   ├── controllers/
│   ├── middlewares/
│   │   ├── verifyToken.js
│   │   ├── verifyRole.js
│   │   ├── sanitizeInput.js
│   │   ├── rateLimiter.js
│   │   └── errorHandler.js
│   ├── models/
│   ├── routes/
│   ├── scripts/
│   │   ├── seed.js
│   │   └── seed-real-admin.js
│   ├── utils/
│   │   ├── promptVisibility.js
│   │   ├── apiFeatures.js
│   │   ├── demoScope.js
│   │   └── pagination.js
│   └── data/
│       └── seed-data.json
└── .env.example
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Internal server error` on every route | `express-mongo-sanitize` + Express 5 | Use `sanitizeInput` middleware (included) |
| Server won't start | Missing env | Check logs for `validateEnv` errors |
| `JWT_SECRET must be at least 32 characters` | Weak secret | Use 32+ char random string |
| MongoDB connection failed | Atlas IP / wrong URI | Whitelist `0.0.0.0/0`; fix DB name in URI |
| CORS error from browser | `CLIENT_URL` mismatch | Exact match with Vercel URL, no trailing `/` |
| Google 401 / 503 | Firebase misconfig | Match project IDs; fix private key `\n` format |
| Premium not applied | Webhook / verify | Set real `STRIPE_WEBHOOK_SECRET`; test verify-session |
| Empty marketplace | No approved prompts | Run seed or approve prompts in admin |
| Demo login blocked | Production guard | Set `ENABLE_DEMO=true` only for staging |

### Render logs

Production hides error details in JSON responses. Always check **Logs** for `[error]` stack traces.

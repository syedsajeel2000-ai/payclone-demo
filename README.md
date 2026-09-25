# PayClone — PayPal-Inspired Payment Platform (Functional Demo)

> **A complete, fully functional, PayPal-inspired digital payment platform — built as an educational demo.**
> **Demo payment environment. No real money is transferred.**

Just completed my PayPal Clone! Now users can send, receive, and manage digital transactions securely. 🚀

Clone Link:
[Clone Link]

GitHub Repository:
[GitHub Link]

#rehancodingwithai
#codingwithai
#WebDevelopment
#Fintech
#OnlinePayments

---

## 📌 Project Overview

PayClone is a web-based, PayPal-inspired payment platform where registered users can create accounts, fund a demo wallet, send and receive demo money, track every transaction, and manage security settings including a two-factor authentication (2FA) flow.

This is an **educational demo / PayPal-inspired clone**:

- ❌ It does **not** connect to real bank accounts or real money transfers.
- ✅ It uses a **safe demo wallet and dummy payment system**.
- ✅ Every button, form and flow **actually works** — there are no dead buttons, fake confirmations or "coming soon" placeholders.

**Stack:** Node.js (zero runtime dependencies) · vanilla HTML/CSS/JavaScript (ES modules) · JSON file data layer · scrypt password hashing · httpOnly session cookies.

---

## ✨ Features

| Area | What works |
|---|---|
| **Authentication** | Sign up (validation, unique username/email, strong passwords), login by email *or* username, secure logout, forgot/reset password flow |
| **Wallet** | Live balance, demo top-ups (Demo Card / Demo Bank Transfer / Demo Wallet Top-Up), saved demo payment methods (brand + last 4 only) |
| **Send Money** | Recipient live search by email or username, amount/note validation, confirmation popup (recipient, amount, fee, total), instant settlement |
| **Receive Money** | Shareable payment profile, payment requests with unique reference + link, request status, cancellation |
| **Transactions** | Full history, search, 7 filters, 4 sort orders, detail modal, printable/downloadable receipt |
| **Notifications** | Payment sent/received, funds added, request fulfilled, security events, 2FA changes, live unread badge (bell + sidebar) |
| **Security** | scrypt-hashed passwords (never displayed), password change, simulated 2FA enable/verify/disable, login activity, security alerts |
| **Settings** | Profile (name, username, email, phone, country), notification toggles, display preferences (date/time format, default home) |
| **UX** | Professional fintech UI, subtle premium animations, responsive from 320px → 1440px+, hamburger sidebar on mobile |
| **Consistency** | One shared transaction record per transfer → matching IDs on both sides, no duplicates, survives refresh |

---

## 📄 Pages / Routes

| # | Page | Route | Description |
|---|---|---|---|
| 1 | Landing / Homepage | `#/` | Hero, feature cards, security section, CTAs |
| 2 | Login | `#/login` | Email **or** username + password (+ 2FA step) |
| 3 | Sign Up | `#/signup` | Full name, username, email, password, confirm |
| 4 | Forgot Password | `#/forgot` | Honest simulated reset-token flow |
| 5 | Reset Password | `#/reset/:token` | Choose a new strong password |
| 6 | Dashboard | `#/dashboard` | Balance, totals, recent transactions, quick actions, security status |
| 7 | Wallet | `#/wallet` | Balance, add demo funds, payment methods, wallet activity |
| 8 | Send Money | `#/send` | Recipient lookup, validation, confirm + success popups |
| 9 | Receive Money | `#/receive` | Payment profile, payment requests, shareable links |
| 10 | Transaction History | `#/transactions` | Search / filters / sort / totals |
| 11 | Transaction Details | `#/transactions/:id` | Full detail modal + **Download Receipt** |
| 12 | Payment Request (public) | `#/pay/:ref` | Shareable link anyone can open and pay |
| 13 | Account Settings | `#/settings` | Profile, Security, Notifications, Preferences |
| 14 | Security / 2FA | `#/security` | Password, 2FA flow, login activity, security alerts |
| 15 | Notifications | `#/notifications` | Inbox with unread tracking + mark all read |
| 16 | Help / Support | `#/help` | FAQ + quick links + demo disclaimer |
| 17 | 404 | any unknown route | "Page Not Found" + Go Home / Back to Dashboard |

All navigation works — sidebar, topbar, quick actions, footer links and deep links.

---

## 🔐 Authentication

- **Sign up** validates required fields, email format, username format, unique username & email (case-insensitive), password strength, and password confirmation.
- **Passwords are hashed with `scrypt` + a unique random salt** (`crypto.scryptSync`, 64-byte key). Plain-text passwords are never stored, never logged and never sent to the frontend.
- **Login** accepts email *or* username, returns a generic error (no account enumeration), and records login activity (success/failure, device, IP).
- **Sessions** are opaque random tokens stored server-side and delivered in `HttpOnly; SameSite=Lax` cookies.
- **Password reset** issues a 30-minute single-use token. Because no email provider is connected, the UI **says so honestly** and shows the simulated token on screen — it never pretends an email was sent. Successful reset signs out every session.
- **Logout** destroys the server-side session and clears the cookie.

---

## 👛 Wallet System

- Balance is stored as **integer cents** (no floating-point drift) and displayed with currency formatting.
- **Add Funds** supports three dummy methods:
  - **Demo Card** — dummy card number, expiry (MM/YY) and CVV are validated, then **discarded**; only brand + last 4 digits are saved as a label.
  - **Demo Bank Transfer** and **Demo Wallet Top-Up** — instant sandbox credits.
- Every top-up increases the balance, creates a `Wallet Top-Up` transaction, and raises a notification.
- New accounts receive **$1,000 in welcome demo funds** (recorded as a real top-up transaction). Configurable via `STARTING_BALANCE`.
- The UI is clearly labelled everywhere: **"Demo Wallet — demo transactions only, no real money is transferred."**

---

## 💸 Send / Receive System

**Send Money**

1. Live recipient lookup by **email or username** (`/api/users/lookup`).
2. Validation: recipient exists, amount > 0, amount ≤ balance, cannot send to yourself, note ≤ 200 chars.
3. **Confirm Payment popup** shows Recipient · Amount · Fee ($0.00) · **Total** with *Cancel* / *Confirm Send*.
4. On confirm: sender balance −amount, receiver balance +amount, **one shared transaction record** (identical ID for both parties), notifications for both users.
5. **Success popup**: "✓ Payment Successful — You sent $50.00 to @username." with recipient, amount, transaction ID, date/time and *View Transaction* / *Done* buttons.

**Receive Money**

- Profile card with copyable email/username.
- **Request Money**: amount + optional message → generates a unique reference (`REQ-XXXXXXXX`) and shareable link `#/pay/REQ-XXXXXXXX`.
- Anyone can open the link; a logged-in, funded user can pay it in one confirmed step. Requests show Pending/Completed status and can be cancelled while unpaid.

---

## 🧾 Transaction Tracking

Every transaction stores: **Transaction ID, sender, recipient, amount, currency, type, status, date, time, note, reference, fee**.

- **Types:** Money Sent · Money Received · Wallet Top-Up · Payment Request
- **Statuses:** Completed · Pending · Failed

**History page** provides:

- 🔍 **Search** by name, email, username, transaction ID or reference
- 🏷 **Filters:** All · Sent · Received · Added Funds · Pending · Completed · Failed
- ↕️ **Sort:** Newest · Oldest · Highest Amount · Lowest Amount
- **Detail modal** with every field + **Download Receipt** (self-contained printable HTML receipt) + Print

**Data consistency:** one record per transfer is shared by both parties, so transaction IDs always match, nothing is duplicated, and history survives page refresh (persistent JSON storage).

---

## 🔒 Security

- scrypt password hashing with per-user salt; `timingSafeEqual` verification.
- Passwords never displayed in the UI, never returned by any API.
- HTTP-only session cookies + server-side session store (revocable).
- Server-side validation on every action (client validation is only for UX).
- Card numbers never stored (brand + last 4 only); no real banking credentials requested anywhere.
- Login activity log + security notifications (new login, password change, 2FA events).
- All rendered data is HTML-escaped (XSS-safe templating).

---

## 🔑 Two-Factor Authentication (2FA)

Available at **Security → Enable 2FA**:

1. **Setup screen** — a demo QR representation + setup key + 6-digit verification code.
2. **Verify** — enter the code to activate; wrong codes are rejected ("Invalid verification code.").
3. Confirmation: **"Two-factor authentication enabled."**
4. From then on, login requires password **+** 6-digit code (single-use, 5-minute challenge).
5. **Disable** requires your password.

> ⚠️ **Honesty note:** this is a **simulated** 2FA demo. No real authenticator provider (Google Authenticator, Authy, etc.) is connected, so the code is generated by the platform and shown in the UI. The full flow is functional, but the app never falsely claims real authenticator-grade protection.

---

## 🗄 Database / Data Model

No external database is required — a **structured JSON data layer** (`data/db.json`, atomic writes) keeps the app fully functional and persistent. Entities:

```
USERS            id, full_name, username, email, password_salt, password_hash,
                 phone, country, balance (cents), currency, created_at, updated_at

TRANSACTIONS     id, payer_id, payee_id, amount, currency, fee, type, status,
                 note, reference, method, created_at, paid_at

NOTIFICATIONS    id, user_id, title, message, type, link, read, created_at

SECURITY         user_id, two_factor_enabled, two_factor_demo_code,
                 two_factor_pending_code/expiry, password_updated_at, updated_at

PAYMENT_METHODS  id, user_id, type, label, last4, created_at

SETTINGS         user_id, notifications{payments,requests,security,emailDemo},
                 preferences{dateFormat,timeFormat,defaultHome}

SESSIONS         token -> user_id, created_at, expires_at, ip, device
LOGIN_ACTIVITY   id, user_id, ip, device, success, note, created_at
PASSWORD_RESETS  token -> user_id, expires_at
```

> The data directory is git-ignored. To reset the demo, delete `data/` and restart.

---

## 🛠 Technologies

- **Runtime:** Node.js ≥ 18 (tested on Node 24) — **zero npm dependencies**
- **HTTP:** built-in `node:http`, custom static file server + JSON API router
- **Frontend:** vanilla ES modules, no framework, no build step
- **Styling:** modern CSS (custom properties, grid/flex, keyframe animations, container breakpoints)
- **Security:** `node:crypto` scrypt password hashing, timing-safe comparison, httpOnly cookies
- **Storage:** JSON file with atomic temp-file + rename writes, serialised write queue
- **Tests:** `tests/api.test.js` — end-to-end suite (spawns an isolated server)

---

## 🚀 Installation

```bash
# 1. Clone the repository
git clone https://github.com/<your-username>/paypal-clone.git
cd paypal-clone

# 2. (Optional) create your local environment file
cp .env.example .env

# 3. Start the server — there are no dependencies to install
npm start
```

Open **http://localhost:3000** in your browser.

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` and adjust as needed. **Never commit `.env` — no API keys, passwords, database secrets or service-role keys belong in this repository.**

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Port the demo server listens on |
| `NODE_ENV` | `development` | `development` or `production` |
| `DATA_DIR` | `./data` | Where the JSON demo database is stored |
| `STARTING_BALANCE` | `1000.00` | Welcome demo funds for new accounts (sandbox money) |
| `MAX_TOPUP` | `1000000.00` | Maximum single demo top-up amount |

---

## 💻 Development

```bash
npm start     # run the server (auto-serves /public and /api)
npm test      # run the end-to-end API test suite (isolated port + temp data dir)
```

There is no build step — edit files in `public/` and refresh the browser.

```
├── server.js              # HTTP server: static SPA + JSON API
├── lib/
│   ├── api.js             # API router (method + path matching, cookies, errors)
│   ├── auth.js            # sessions, scrypt, 2FA challenges, guards
│   ├── db.js              # JSON data layer (atomic persistence)
│   ├── shared.js          # public user shape, transaction decoration
│   ├── receipt.js         # printable receipt HTML builder
│   └── routes/            # auth / money / account endpoint modules
├── public/
│   ├── index.html
│   ├── css/               # base · layout · components · responsive
│   └── js/                # router, api client, store, ui kit, pages/
└── tests/api.test.js
```

---

## 🏗 Production Build

There is nothing to compile. For a production-style run:

```bash
NODE_ENV=production PORT=3000 node server.js
```

In production the server sets caching headers for static assets and serves the SPA from `public/`.

### Deployment

The app is a single Node process with a file-based database — it deploys anywhere Node runs:

- **Railway / Render / Fly.io / Cyclic:** start command `npm start`, add a persistent volume for `DATA_DIR` (e.g. `/data`) so demo data survives restarts.
- **VPS (PM2):**
  ```bash
  npm install -g pm2
  pm2 start server.js --name payclone
  pm2 save && pm2 startup
  ```
- **Docker:**
  ```dockerfile
  FROM node:20-alpine
  WORKDIR /app
  COPY . .
  ENV NODE_ENV=production PORT=3000
  EXPOSE 3000
  CMD ["node", "server.js"]
  ```
  ```bash
  docker build -t payclone . && docker run -p 3000:3000 -v payclone-data:/app/data payclone
  ```

Put it behind HTTPS (e.g. Caddy/nginx) before exposing it publicly, and set `DATA_DIR` to a mounted volume.

---

## 🧪 Testing Checklist

`npm test` runs **161 automated assertions**. Everything below has been manually verified in the browser too:

- [x] **Authentication:** signup · login (email & username) · logout · password reset · change password · 2FA-gated login
- [x] **Wallet:** balance · add demo funds (card/bank/top-up) · balance updates · method registration
- [x] **Send:** recipient search · amount validation · self-send blocked · over-balance blocked · confirmation popup · successful transfer · sender −/receiver + balance · matching IDs
- [x] **Receive:** profile copy · payment request creation · shareable link · paying a request · double-pay blocked · cancellation
- [x] **Transactions:** history · search · filters · sorting · details · receipt download
- [x] **Security:** password protection · 2FA setup/verify/disable · invalid code rejected · login activity
- [x] **UI:** dashboard · sidebar · hamburger menu · modals · toasts · animations · responsive 320/375/425/768/1024/1440+ · no horizontal scroll · no console errors affecting functionality
- [x] **404** for unknown routes, all navigation links functional

---

## ⚠️ Disclaimer

PayClone is a **demo payment environment built for educational purposes**. No real money is transferred, no real financial institutions are involved, no banking credentials are requested and no real card data is stored. Do not use it for real transactions.

---

## 📣 Social Caption

> Just completed my PayPal Clone! Now users can send, receive, and manage digital transactions securely. 🚀
>
> Clone Link:
> [Clone Link]
>
> GitHub Repository:
> [GitHub Link]
>
> #rehancodingwithai #codingwithai #WebDevelopment #Fintech #OnlinePayments

---

MIT © PayClone Demo

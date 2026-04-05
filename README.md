# Qure — Healthcare Queue Management System

A multi-hospital SaaS healthcare queue management system for patient appointments, live queues, staff operations, and notifications. This repository contains the **web application** (Vite + Express), the **backend API** (Node.js + Prisma + MongoDB), and the **patient mobile app** (Flutter).

**For reviewers and moderators:** use [Quick start for reviewers](#quick-start-for-reviewers) first, then the detailed sections if anything fails.

## Table of contents

- [Quick start for reviewers](#quick-start-for-reviewers)
- [Overview](#overview)
- [Features](#features)
- [Technology stack](#technology-stack)
- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Clone the repository](#clone-the-repository)
- [Install dependencies](#install-dependencies)
- [Environment variables](#environment-variables)
- [Database setup (Prisma + MongoDB)](#database-setup-prisma--mongodb)
- [Run the project locally](#run-the-project-locally)
- [Patient mobile app (Flutter)](#patient-mobile-app-flutter)
- [Verify the installation](#verify-the-installation)
- [Troubleshooting](#troubleshooting)
- [Tests and linting](#tests-and-linting)
- [Deployment](#deployment)
- [Demo video](#demo-video)
- [Design prototype (Figma)](#design-prototype-figma)
- [Live deployment](#live-deployment)
- [Analysis](#analysis)
- [Contributing](#contributing)
- [License](#license)

---

## Quick start for reviewers

Complete these steps in order. All commands assume a Unix-like shell (macOS, Linux, or WSL). On Windows, use PowerShell equivalents or Git Bash.

| Step | Action                                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Install [Node.js 18+](https://nodejs.org/), [npm 9+](https://docs.npmjs.com/), and obtain a [MongoDB](https://www.mongodb.com/) connection string (Atlas or local).                                                                        |
| 2    | Clone the repo and run `npm install` at the **repository root** (installs frontend + backend workspaces).                                                                                                                                  |
| 3    | Create `backend/.env` (see [Backend](#backend)). Minimum: `DATABASE_URL`, `JWT_SECRET`. Optional but recommended for full features: Cloudinary, Brevo.                                                                                     |
| 4    | From `backend/`: `npx prisma generate` and `npx prisma db push`.                                                                                                                                                                           |
| 5    | Start the API: `cd backend && npm run dev` → default **http://localhost:5000**.                                                                                                                                                            |
| 6    | Create `frontend/.env` with `VITE_API_URL=http://localhost:5000/api` (must match your backend port and include `/api`).                                                                                                                    |
| 7    | Start the web UI: `cd frontend && npm run dev` → **http://localhost:3000**.                                                                                                                                                                |
| 8    | (Optional) Patient app: install [Flutter](https://flutter.dev/docs/get-started/install), then `cd qureapp && flutter pub get && flutter run` with API URL aligned to your backend (see [Patient mobile app](#patient-mobile-app-flutter)). |

**Health check:** open `http://localhost:5000/health` — you should get a successful response from the API.

---

## Overview

Qure improves patient experience and hospital operations with multi-tenant (hospital-scoped) data, real-time queue awareness, appointment booking, notifications, and role-based interfaces for patients, staff, and administrators.

### Key capabilities

- **Multi-hospital support:** Data isolated per hospital.
- **Queue management:** Live queue status and workflows (backend-controlled lifecycle).
- **Appointments:** Booking, reminders, and check-in automation (where enabled).
- **Authentication:** JWT-based sessions for web and mobile patient flows.
- **Integrations:** Cloudinary (images), Brevo (email), optional Firebase for push on mobile.

---

## Features

### Patient (web + mobile where applicable)

- Book and manage appointments
- Queue status and feedback
- Notifications (in-app / email depending on configuration)
- Profile and avatar uploads (when Cloudinary is configured)

### Staff

- Department queues, doctor assignment, room / waiting areas
- Dashboards, exports, hospital settings

### System

- Automated check-in and reminders (feature flags + cron-style jobs in backend)
- Email via Brevo
- File uploads via Cloudinary

---

## Technology stack

| Area             | Technologies                                                           |
| ---------------- | ---------------------------------------------------------------------- |
| **Web frontend** | Vanilla JavaScript (ES6+), Vite 7.x, CSS variables                     |
| **Backend**      | Node.js 18+, Express 4.x, Prisma 5.x, MongoDB                          |
| **Mobile**       | Flutter (Dart SDK per `qureapp/pubspec.yaml`), Riverpod, GoRouter, Dio |
| **Auth**         | JWT (`jsonwebtoken`)                                                   |
| **Realtime**     | Socket.io (backend + frontend client)                                  |
| **Tooling**      | npm workspaces, ESLint                                                 |

---

## Repository layout

```
Qure/
├── backend/                 # REST API + Prisma
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   └── utils/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── package.json
│   └── render.yaml          # Render deployment blueprint
│
├── frontend/                # Vite multi-page SPA-style app
│   ├── src/
│   ├── patient/
│   ├── staff/
│   ├── public/
│   ├── package.json
│   ├── vite.config.js
│   └── vercel.json
│
├── qureapp/                 # Flutter patient application
│   ├── lib/
│   ├── pubspec.yaml
│   └── test/
│
├── Docs/                    # Additional documentation
├── package.json             # Root workspaces + convenience scripts
├── Analysis.md
└── README.md                # This file
```

---

## Prerequisites

| Requirement               | Notes                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| **Node.js**               | ≥ 18.x ([nodejs.org](https://nodejs.org/))                                                     |
| **npm**                   | ≥ 9.x (bundled with Node)                                                                      |
| **MongoDB**               | Atlas URI or local instance; required for `DATABASE_URL`                                       |
| **Git**                   | To clone the repository                                                                        |
| **Cloudinary** (optional) | Avatar / uploads — omit only if you skip upload features                                       |
| **Brevo** (optional)      | Transactional email — omit if you do not need email in dev                                     |
| **Flutter** (optional)    | Only for `qureapp/` — see [Flutter install docs](https://docs.flutter.dev/get-started/install) |

---

## Clone the repository

```bash
git clone https://github.com/dazeez1/Qure.git
cd Qure
```

If you use SSH:

```bash
git clone git@github.com:dazeez1/Qure.git
cd Qure
```

---

## Install dependencies

### Root

The root `package.json` defines **npm workspaces** for `frontend` and `backend`. One install at the root links both:

```bash
cd Qure
npm install
```

This runs `postinstall` in the backend (including `prisma generate`) when the backend package is installed.

### Flutter app (`qureapp`)

```bash
cd Qure/qureapp
flutter pub get
```

---

## Environment variables

### Backend

Create **`backend/.env`** (never commit real secrets). The server reads `PORT` or defaults to **5000** (`backend/src/app.js`).

```env
# Server
NODE_ENV=development
PORT=5000

# Database (required)
DATABASE_URL=mongodb+srv://USER:PASSWORD@cluster.example.mongodb.net/DATABASE?retryWrites=true&w=majority

# JWT (required for auth)
JWT_SECRET=use_a_long_random_string_in_production
JWT_EXPIRES_IN=7d

# Cloudinary (optional — image uploads)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Brevo (optional — email)
BREVO_API_KEY=

# CORS: origin of the web app (no trailing path)
FRONTEND_URL=http://localhost:3000

# Feature flags
ENABLE_AUTO_CHECKIN=true
ENABLE_APPOINTMENT_REMINDERS=true
```

**Important:** If you change `PORT`, you must use the same host and port in `VITE_API_URL` (frontend) and in `API_BASE_URL` (Flutter), and keep `FRONTEND_URL` aligned with where the browser loads the web app (usually `http://localhost:3000`).

### Frontend

Create **`frontend/.env`**:

```env
VITE_API_URL=http://localhost:5000/api
```

`VITE_API_URL` must end with **`/api`** and match your running backend base URL.

### Flutter (`qureapp`)

The API base URL is compiled in via `--dart-define` (see [Patient mobile app](#patient-mobile-app-flutter)). The default in code is `http://localhost:5000/api` if you do not pass a define — **change it if your backend uses another port.**

---

## Database setup (Prisma + MongoDB)

From **`backend/`**:

```bash
cd backend
npx prisma generate
npx prisma db push
```

- **`db push`** applies the schema to MongoDB (suitable for development).
- Optional: **`npx prisma studio`** opens a GUI to inspect data.

If `DATABASE_URL` is wrong or the cluster blocks your IP (Atlas), Prisma commands will fail — fix the URI and network access first.

---

## Run the project locally

Start **MongoDB** (or confirm Atlas is reachable), then run **backend** and **frontend** in separate terminals.

### Terminal 1 — Backend

```bash
cd backend
npm run dev
```

Expected: server listening on `http://localhost:5000` (or your `PORT`).

### Terminal 2 — Frontend

```bash
cd frontend
npm run dev
```

Expected: Vite dev server at **http://localhost:3000** (see `frontend/vite.config.js`).

### Convenience scripts (from repository root)

```bash
npm run dev:backend   # backend only
npm run dev:frontend  # frontend only
```

The root script `npm run dev` runs frontend and backend together (`&`); on some shells you may prefer two terminals for clearer logs.

### Production-style local run

```bash
# Backend
cd backend && npm start

# Frontend build + preview
cd frontend && npm run build && npm run preview
```

### Default accounts

There are no fixed demo credentials in the README. After `db push`, use the app’s registration flows to create a hospital admin, staff, or patient as designed in the UI.

---

## Patient mobile app (Flutter)

Location: **`qureapp/`**.

### Prerequisites

- Flutter SDK compatible with `qureapp/pubspec.yaml` (`environment.sdk`, e.g. Dart 3.11+).
- Xcode (macOS) for iOS; Android Studio / SDK for Android.
- A running **backend** reachable from the device or emulator.

### Install packages

```bash
cd qureapp
flutter pub get
```

### Point the app at your API

`qureapp/lib/core/env/app_config.dart` uses:

- **`API_BASE_URL`** via `--dart-define`, defaulting to `http://localhost:5000/api`.

**Examples:**

```bash
# Emulator / same machine (Android emulator uses 10.0.2.2 for host loopback — the app rewrites localhost on Android)
flutter run --dart-define=API_BASE_URL=http://localhost:5000/api

# Physical device on same LAN (use your computer's LAN IP)
flutter run --dart-define=API_BASE_URL=http://192.168.1.10:5000/api
```

**Android emulator note:** The app normalizes `localhost` / `127.0.0.1` to `10.0.2.2` for HTTP on Android so the emulator can reach the host machine.

### Run and build

```bash
cd qureapp
flutter run
flutter build apk    # Android
flutter build ios    # iOS (macOS only)
```

### CORS

CORS applies to **browser** clients. Native Flutter uses the HTTP client directly; ensure the device can reach the API URL and that firewalls allow the port.

---

## Verify the installation

| Check              | Expected                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Backend health     | `GET http://localhost:5000/health` returns success                                                                    |
| Frontend loads     | Browser opens `http://localhost:3000` without build errors                                                            |
| API from browser   | Login / register network calls go to `VITE_API_URL` without CORS errors if `FRONTEND_URL` matches the frontend origin |
| Prisma             | `npx prisma db push` completed without connection errors                                                              |
| Flutter (optional) | `flutter doctor` clean; `flutter run` reaches API with correct `API_BASE_URL`                                         |

---

## Troubleshooting

| Problem                                          | Things to check                                                                                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CORS errors in browser**                       | `FRONTEND_URL` in `backend/.env` must be the **exact origin** of the Vite app (scheme + host + port), e.g. `http://localhost:3000`. Redeploy or restart backend after changes. |
| **401 / cannot log in**                          | `JWT_SECRET` set; database reachable; same API URL as configured in `.env` / dart-define.                                                                                      |
| **Connection refused**                           | Backend running; correct `PORT`; `VITE_API_URL` / `API_BASE_URL` host and port match.                                                                                          |
| **Prisma / MongoDB errors**                      | Valid `DATABASE_URL`; Atlas IP allowlist; user/password and database name correct.                                                                                             |
| **Flutter cannot reach API on Android emulator** | Use `10.0.2.2` instead of `localhost` if not using the app’s automatic rewrite, or pass a LAN IP for physical devices.                                                         |
| **Workspaces install oddities**                  | Run `npm install` from **repository root**; delete `node_modules` in root, `frontend`, and `backend` and reinstall if needed.                                                  |

---

## Tests and linting

### Flutter (`qureapp`)

```bash
cd qureapp
flutter test
flutter analyze
```

### Backend

```bash
cd backend
npm run lint
npm run test:wait-time
npm run test:appointments
```

### Frontend

```bash
cd frontend
npm run lint
```

### Root

```bash
npm run lint
```

---

## Deployment

The system is typically deployed as:

- **Frontend:** Vercel (static build from `frontend/`, `VITE_API_URL` points to production API).
- **Backend:** Render or similar (`backend/render.yaml`).
- **Database:** MongoDB Atlas.
- **Assets / email:** Cloudinary, Brevo.

### Deployment architecture

| Layer                 | Production role                         |
| --------------------- | --------------------------------------- |
| **Client**            | Browser loads SPA; calls API over HTTPS |
| **Frontend (Vercel)** | Hosts Vite `dist/`; env-based API URL   |
| **Backend (Render)**  | Node process, REST + Socket.io          |
| **Database**          | MongoDB via Prisma                      |
| **Files / email**     | Cloudinary, Brevo                       |

**Request flow:** Browser → CDN (frontend) → HTTPS → API (`/api/...`) → MongoDB and external services.

### Backend (Render) — summary

1. Create a Web Service; **root directory** `backend`.
2. Build: e.g. `npm install && npm run prisma:generate` (see `backend/render.yaml`).
3. Start: `npm start`.
4. Set env vars: `NODE_ENV`, `PORT` (if provided by host), `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CLOUDINARY_*`, `BREVO_API_KEY`, `FRONTEND_URL` (production web **origin** only), feature flags.
5. Verify `https://<your-api-host>/health`.

### Frontend (Vercel) — summary

1. Root directory **`frontend`**.
2. Build: `npm run build`.
3. Set `VITE_API_URL` to your production API base including **`/api`**.

### Post-deploy

- Set backend `FRONTEND_URL` to the live frontend origin (CORS).
- Redeploy backend after changing CORS-related env.

### Configuration files

- `backend/render.yaml` — Render blueprint.
- `frontend/vercel.json` — Vercel output and headers.

### Example production URLs (this project)

| Service  | URL                                                                            |
| -------- | ------------------------------------------------------------------------------ |
| Frontend | [https://www.qurequeue.com/](https://www.qurequeue.com/)                       |
| Backend  | [https://qure-vbfm.onrender.com](https://qure-vbfm.onrender.com)               |
| Health   | [https://qure-vbfm.onrender.com/health](https://qure-vbfm.onrender.com/health) |

---

## Demo video

**[Demo video — Google Drive](https://drive.google.com/drive/folders/1nQ650BPcvyr-nnSnXwHxgzmxtOee-j4F?usp=sharing)**

---

## Design prototype (Figma)

**[Qure Design — ALU Figma prototype](https://www.figma.com/proto/ZgIejwv9TrGqiXm86h9CRd/Qure-Design---ALU?node-id=125-7990&t=Z1Uag9G7wToWwk8G-1)**

---

## Live deployment

| Service                  | Production URL                                                                 |
| ------------------------ | ------------------------------------------------------------------------------ |
| **Frontend (Vercel)**    | [https://www.qurequeue.com/](https://www.qurequeue.com/)                       |
| **Backend API (Render)** | [https://qure-vbfm.onrender.com](https://qure-vbfm.onrender.com)               |
| **API health**           | [https://qure-vbfm.onrender.com/health](https://qure-vbfm.onrender.com/health) |

---

## Analysis

For objectives, results, and technical discussion:

**[Analysis.md](./Analysis.md)**

---

## Contributing

This is a project submission. For questions or issues: **d.azeez@alustudent.com**

---

## License

This project is licensed under the **MIT License**.

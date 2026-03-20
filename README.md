# Qure - Healthcare Queue Management System

A comprehensive multi-hospital SaaS healthcare queue management system that streamlines patient appointments, queue management, and hospital operations.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Installation & Setup](#installation--setup)
- [Running the Application](#running-the-application)
- [Deployment](#deployment)
- [Demo Video](#demo-video)
- [Live Deployment](#live-deployment)
- [Related Files](#related-files)
- [Analysis](#analysis)
- [Contributing](#contributing)
- [License](#license)

## Overview

Qure is a modern healthcare queue management system designed to improve patient experience and optimize hospital operations. The system supports multiple hospitals, real-time queue management, appointment scheduling, automated check-ins, and comprehensive notification systems.

### Key Capabilities

- **Multi-Hospital Support**: Complete isolation and scoping for multiple healthcare facilities
- **Real-Time Queue Management**: Live queue status updates with estimated wait times
- **Appointment Scheduling**: Patient self-service appointment booking and management
- **Automated Workflows**: Auto-check-in, appointment reminders, and status notifications
- **Role-Based Access**: Separate interfaces for patients, staff, doctors, and administrators
- **Analytics & Reporting**: Comprehensive dashboards and export capabilities

## Features

### Patient Features

- Book and manage appointments
- View real-time queue status
- In-app and email notifications
- View appointment history with pagination
- Submit feedback after consultations
- Profile management with avatar uploads

### Staff Features

- Multi-department queue management
- Doctor assignment and load balancing
- Room and waiting area management
- Real-time analytics and dashboards
- Export functionality for reports
- Hospital settings and configuration

### System Features

- Automated appointment check-in (15 minutes before appointment time)
- Automated appointment reminders (24h and 2h before)
- Email notifications via Brevo
- Cloudinary integration for image uploads
- JWT-based authentication
- Hospital-scoped data isolation

## Technology Stack

### Frontend

- **Framework**: Vanilla JavaScript (ES6+)
- **Build Tool**: Vite 7.3.1
- **Styling**: CSS3 with CSS Variables
- **Deployment**: Vercel

### Backend

- **Runtime**: Node.js 18+
- **Framework**: Express.js 4.21.1
- **Database**: MongoDB with Prisma ORM 5.19.0
- **Authentication**: JWT (jsonwebtoken)
- **File Upload**: Cloudinary, Multer
- **Email Service**: Brevo
- **Deployment**: Render

### Development Tools

- **Package Manager**: npm
- **Code Quality**: ESLint
- **Version Control**: Git

## Project Structure

```
Qure/
├── backend/                 # Backend API server
│   ├── src/
│   │   ├── config/         # Database and service configurations
│   │   ├── controllers/    # Request handlers
│   │   ├── middleware/     # Authentication, error handling
│   │   ├── routes/         # API route definitions
│   │   ├── services/       # Business logic services
│   │   └── utils/          # Utility functions
│   ├── prisma/
│   │   └── schema.prisma   # Database schema
│   ├── uploads/            # Local file uploads (dev)
│   ├── package.json
│   └── render.yaml         # Render deployment config
│
├── frontend/               # Frontend application
│   ├── src/
│   │   ├── pages/          # Page-specific JavaScript
│   │   ├── utils/          # Utility functions
│   │   ├── styles/         # CSS stylesheets
│   │   └── js/             # Shared JavaScript modules
│   ├── patient/            # Patient-facing pages
│   ├── staff/              # Staff-facing pages
│   ├── public/             # Static assets
│   ├── package.json
│   ├── vite.config.js      # Vite configuration
│   └── vercel.json         # Vercel deployment config
│
├── Docs/                   # Project documentation
├── VERCEL_TROUBLESHOOTING.md
└── README.md               # This file
```

## Installation & Setup

### Prerequisites

- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 9.0.0 or higher
- **MongoDB**: MongoDB Atlas account or local MongoDB instance
- **Cloudinary Account**: For image uploads
- **Brevo Account**: For email notifications

### Step 1: Clone the Repository

```bash
git clone  https://github.com/dazeez1/Qure.git
cd Qure
```

### Step 2: Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Set up environment variables
# Create a .env file in the backend directory with the following:
```

**Backend Environment Variables** (`.env` file):

```env
# Server Configuration
NODE_ENV=development
PORT=5001

# Database
DATABASE_URL=your_mongodb_connection_string

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=7d

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# Brevo (Email Service) Configuration
BREVO_API_KEY=your_brevo_api_key

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000

# Feature Flags
ENABLE_AUTO_CHECKIN=true
ENABLE_APPOINTMENT_REMINDERS=true
```

```bash
# Generate Prisma Client
npx prisma generate

# Push database schema (for development)
npx prisma db push

# (Optional) Open Prisma Studio to view database
npx prisma studio
```

### Step 3: Frontend Setup

```bash
# Navigate to frontend directory (from project root)
cd frontend

# Install dependencies
npm install

# Set up environment variables
# Create a .env file in the frontend directory:
```

**Frontend Environment Variables** (`.env` file):

```env
# API Configuration
VITE_API_URL=http://localhost:5001/api
```

### Step 4: Verify Installation

```bash
# From project root, verify both packages are installed
npm install
```

## ▶ Running the Application

### Development Mode

#### Option 1: Run Separately

**Terminal 1 - Backend:**

```bash
cd backend
npm run dev
```

Backend will run on `http://localhost:5001`

**Terminal 2 - Frontend:**

```bash
cd frontend
npm run dev
```

Frontend will run on `http://localhost:3000`

#### Option 2: Run from Root (if configured)

```bash
# From project root
npm run dev:backend  # In one terminal
npm run dev:frontend # In another terminal
```

### Production Build

**Backend:**

```bash
cd backend
npm start
```

**Frontend:**

```bash
cd frontend
npm run build
npm run preview  # Preview production build locally
```

### Access the Application

- **Frontend**: Open `http://localhost:3000` in your browser
- **Backend API**: Available at `http://localhost:5001/api`
- **Health Check**: `http://localhost:5001/health`

### Default Accounts

After initial setup, you'll need to:

1. Register a new hospital admin account through the registration page
2. Create staff accounts through the admin dashboard
3. Patients can self-register

## Deployment

This section documents **environments**, **tools**, and a **step-by-step deployment plan** used to run Qure in production. The system is split into a static **frontend** (Vite) and a **Node/Express API** with **MongoDB** (Prisma).

### Deployment architecture

| Layer        | Environment (production)          | Role                                                          |
| ------------ | --------------------------------- | ------------------------------------------------------------- |
| **Client**   | End-user browser                  | Loads the SPA from the CDN; calls the API over HTTPS          |
| **Frontend** | **Vercel**                        | Hosts the built Vite app (`frontend/dist`), env-based API URL |
| **Backend**  | **Render** (Web Service)          | Runs `node src/app.js`, REST API + Socket.io                  |
| **Database** | **MongoDB Atlas** (or compatible) | Data store via Prisma (`DATABASE_URL`)                        |
| **Files**    | **Cloudinary**                    | Avatars / uploads                                             |
| **Email**    | **Brevo**                         | Transactional email                                           |

**Request flow:** Browser → Vercel (HTML/JS/CSS) → HTTPS → Render API (`/api/...`) → MongoDB / external services.

### Tools used

| Tool              | Purpose                                                      |
| ----------------- | ------------------------------------------------------------ |
| **Git / GitHub**  | Source control and CI triggers for Vercel & Render           |
| **Vercel**        | Frontend build & hosting (`npm run build`, output `dist/`)   |
| **Render**        | Backend hosting; `backend/render.yaml` documents build/start |
| **MongoDB Atlas** | Managed MongoDB for Prisma                                   |
| **Cloudinary**    | Image hosting                                                |
| **Brevo**         | Email delivery                                               |

### Prerequisites (production)

- GitHub repository connected to Vercel and Render
- MongoDB connection string (`DATABASE_URL`)
- JWT secret, Cloudinary keys, Brevo API key
- Domain or default URLs for frontend (Vercel) and backend (Render)

### Backend deployment (Render)

1. **Create a Web Service** on [Render](https://render.com) and connect this repository.
2. Set **Root Directory** to `backend`.
3. **Build command:** `npm install && npm run prisma:generate` (matches `backend/render.yaml`).
4. **Start command:** `npm start` (runs `node src/app.js`).
5. **Configure environment variables** in the Render dashboard (minimum):

   | Variable                                               | Notes                                                                       |
   | ------------------------------------------------------ | --------------------------------------------------------------------------- |
   | `NODE_ENV`                                             | `production`                                                                |
   | `PORT`                                                 | Render often injects `PORT` (e.g. `10000`); ensure the app uses it          |
   | `DATABASE_URL`                                         | MongoDB connection string                                                   |
   | `JWT_SECRET`                                           | Strong secret for signing tokens                                            |
   | `JWT_EXPIRES_IN`                                       | e.g. `7d`                                                                   |
   | `CLOUDINARY_*`                                         | Cloud name, API key, API secret                                             |
   | `BREVO_API_KEY`                                        | For email                                                                   |
   | `FRONTEND_URL`                                         | **Full Vercel URL** (origin only, no trailing path) — required for **CORS** |
   | `ENABLE_AUTO_CHECKIN` / `ENABLE_APPOINTMENT_REMINDERS` | `true`/`false` as needed                                                    |

6. **Deploy** and wait for the build to finish. Note the public URL (production example: **`https://qure-vbfm.onrender.com`**).

7. **Verify:** open **`https://qure-vbfm.onrender.com/health`** — expect a successful JSON/OK response.

> **Note:** On Render’s free tier, services may **spin down** after idle time; the first request can be slow (cold start).

### Frontend deployment (Vercel)

1. **Import the project** in [Vercel](https://vercel.com) from the same GitHub repo.
2. Set **Root Directory** to `frontend`.
3. **Install:** `npm install` (default).
4. **Build:** `npm run build` (Vite writes to `frontend/dist` — see `frontend/vercel.json`).
5. Add **environment variable** for production builds:

   | Variable       | Example (production)                 |
   | -------------- | ------------------------------------ |
   | `VITE_API_URL` | `https://qure-vbfm.onrender.com/api` |

   Use your **actual** Render API base URL including `/api` (shown above for this project).

6. **Deploy** and copy the Vercel production URL.

### Post-deploy wiring

1. In **Render**, set `FRONTEND_URL` to the **Vercel origin** for this project: **`https://qure-frontend.vercel.app`** (same host as [the live site](https://qure-frontend.vercel.app/); no path — CORS matches the origin only).
2. **Redeploy** the backend so CORS picks up the new origin.
3. Confirm the frontend’s `VITE_API_URL` is **`https://qure-vbfm.onrender.com/api`** (or your current Render URL + `/api`).

### Verification in the target environment

Use these checks to confirm the system works **after** deployment:

| Check  | How                                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------- |
| API up | `GET https://qure-vbfm.onrender.com/health` returns success                                             |
| CORS   | Open [the live frontend](https://qure-frontend.vercel.app/); login/register should not show CORS errors |
| Auth   | Register/login as patient or staff completes without network errors                                     |
| Data   | Hospital-scoped flows (queue, appointments) behave as in local testing                                  |

### Configuration files

- `backend/render.yaml` — Blueprint for Render (build/start and env keys).
- `frontend/vercel.json` — Vercel build output (`dist`), rewrites, security headers.

## Demo Video

Watch the comprehensive 5-minute demo showcasing the core functionalities of Qure:

**[ Demo Video - Google Drive](https://drive.google.com/drive/folders/1nQ650BPcvyr-nnSnXwHxgzmxtOee-j4F?usp=sharing)**

The demo covers:

- Patient appointment booking and management
- Real-time queue management and status updates
- Staff security
- Staff dashboard and queue operations
- Doctor assignment and consultation workflow
- Notification system (in-app and email)

## Live Deployment

| Service                  | Production URL                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------- |
| **Frontend (Vercel)**    | **[https://qure-frontend.vercel.app/](https://qure-frontend.vercel.app/)**         |
| **Backend API (Render)** | **[https://qure-vbfm.onrender.com](https://qure-vbfm.onrender.com)**               |
| **API health check**     | **[https://qure-vbfm.onrender.com/health](https://qure-vbfm.onrender.com/health)** |

## Analysis

For a detailed analysis of the project results, objectives achievement, and implementation details, see:

**[ Analysis.md](./Analysis.md)**

The analysis covers:

- Project objectives vs. achieved results
- Implementation approach and decisions
- Technical challenges and solutions
- System architecture and design patterns
- Future improvements and recommendations

## Contributing

This is a project submission. For questions or issues, please contact d.azeez@alustudent.com

## License

This project is licensed under the MIT License.

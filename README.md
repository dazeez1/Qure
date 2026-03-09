# Qure - Healthcare Queue Management System

A comprehensive multi-hospital SaaS healthcare queue management system that streamlines patient appointments, queue management, and hospital operations.

##  Table of Contents

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

##  Overview

Qure is a modern healthcare queue management system designed to improve patient experience and optimize hospital operations. The system supports multiple hospitals, real-time queue management, appointment scheduling, automated check-ins, and comprehensive notification systems.

### Key Capabilities

- **Multi-Hospital Support**: Complete isolation and scoping for multiple healthcare facilities
- **Real-Time Queue Management**: Live queue status updates with estimated wait times
- **Appointment Scheduling**: Patient self-service appointment booking and management
- **Automated Workflows**: Auto-check-in, appointment reminders, and status notifications
- **Role-Based Access**: Separate interfaces for patients, staff, doctors, and administrators
- **Analytics & Reporting**: Comprehensive dashboards and export capabilities

##  Features

### Patient Features
-  Book and manage appointments
-  View real-time queue status
-  In-app and email notifications
-  View appointment history with pagination
-  Submit feedback after consultations
-  Profile management with avatar uploads

### Staff Features
-  Multi-department queue management
-  Doctor assignment and load balancing
-  Room and waiting area management
-  Real-time analytics and dashboards
-  Export functionality for reports
-  Hospital settings and configuration

### System Features
-  Automated appointment check-in (15 minutes before appointment time)
-  Automated appointment reminders (24h and 2h before)
-  Email notifications via Brevo
-  Cloudinary integration for image uploads
-  JWT-based authentication
-  Hospital-scoped data isolation

##  Technology Stack

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

##  Project Structure

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
├── DEPLOYMENT.md           # Deployment guide
├── VERCEL_TROUBLESHOOTING.md
└── README.md               # This file
```

##  Installation & Setup

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
3. Patients can self-register or be invited

##  Deployment

The application is configured for deployment on:
- **Frontend**: Vercel (from `frontend/` directory)
- **Backend**: Render (from `backend/` directory)

### Quick Deployment Steps

1. **Deploy Backend to Render:**
   - Connect GitHub repository
   - Set Root Directory to `backend`
   - Add environment variables (see `DEPLOYMENT.md`)
   - Deploy

2. **Deploy Frontend to Vercel:**
   - Connect GitHub repository
   - Set Root Directory to `frontend`
   - Add `VITE_API_URL` environment variable
   - Deploy

3. **Update CORS:**
   - Update `FRONTEND_URL` in Render with your Vercel URL
   - Redeploy backend

For detailed deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md)

##  Demo Video

Watch the comprehensive 5-minute demo showcasing the core functionalities of Qure:

**[ Demo Video - Google Drive](https://drive.google.com/drive/folders/1nQ650BPcvyr-nnSnXwHxgzmxtOee-j4F?usp=sharing)**

The demo covers:
- Patient appointment booking and management
- Real-time queue management and status updates
- Staff security
- Staff dashboard and queue operations
- Doctor assignment and consultation workflow
- Notification system (in-app and email)

> **Note**: The demo focuses on core functionalities rather than sign-up and sign-in processes.

##  Live Deployment

- **Frontend (Vercel)**: [[https://qure-frontend.vercel.app/](https://qure-frontend.vercel.app/)]
- **Backend API (Render)**: [[https://qure-vbfm.onrender.com](https://qure-vbfm.onrender.com)]
- **API Health Check**: [https://qure-vbfm.onrender.com/health](https://qure-vbfm.onrender.com/health)]

##  Related Files

### Documentation
- [Analysis.md](./Analysis.md) - Project analysis and objectives evaluation

##  Analysis

For a detailed analysis of the project results, objectives achievement, and implementation details, see:

**[ Analysis.md](./Analysis.md)**

The analysis covers:
- Project objectives vs. achieved results
- Implementation approach and decisions
- Technical challenges and solutions
- System architecture and design patterns
- Future improvements and recommendations

##  Contributing

This is a project submission. For questions or issues, please contact the development team.

## License



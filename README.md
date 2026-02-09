# Qure - Healthcare Queue Management System

A comprehensive healthcare queue management system designed to streamline patient flow, appointment scheduling, and staff operations in healthcare facilities.


##  Description

Qure is a full-stack healthcare queue management system that enables healthcare facilities to efficiently manage patient queues, appointments, and staff operations. The system features role-based access control with separate interfaces for patients and staff, secure authentication, and a modern, responsive user interface.

### Key Features

- **User Authentication & Authorization**
  - Patient and Staff registration with role-based access
  - JWT-based secure authentication
  - Password reset functionality with email notifications
  - Hospital access code verification for staff

- **Role-Based Dashboards**
  - Patient dashboard for queue management
  - Staff dashboard for facility operations
  - Settings page with organization management

- **Security Features**
  - Password hashing with bcrypt
  - JWT token authentication
  - Input validation and sanitization
  - Protected API routes

---

##  Setup Instructions

### Prerequisites

- **Node.js** (v18.0.0 or higher)
- **npm** (v9.0.0 or higher)
- **MongoDB** (running locally or connection string)
- **Git**

### Installation Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/dazeez1/Qure.git
   cd Qure
   ```

2. **Install dependencies**
   ```bash
   # Install root dependencies
   npm install
   
   # Install backend dependencies
   cd backend
   npm install
   
   # Install frontend dependencies
   cd ../frontend
   npm install
   ```

3. **Set up environment variables**

   Create a `.env` file in the `backend` directory:
   ```env
   # Database
   DATABASE_URL="mongodb://localhost:27017/qure"
   
   # JWT Secret (change this to a secure random string)
   JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
   
   # Server Port
   PORT=5001
   
   # Frontend URL (for email links)
   FRONTEND_URL="http://localhost:3000"
   
   # Environment
   NODE_ENV="development"
   ```

4. **Set up the database**

   Ensure MongoDB is running, then generate Prisma client:
   ```bash
   cd backend
   npm run prisma:generate
   npm run prisma:push
   ```

5. **Run the application**

   From the root directory:
   ```bash
   # Run both frontend and backend concurrently
   npm run dev
   
   # Or run separately:
   # Backend (port 5001)
   npm run dev:backend
   
   # Frontend (port 3000)
   npm run dev:frontend
   ```

6. **Access the application**

   - **Frontend:** http://localhost:3000
   - **Backend API:** http://localhost:5001
   - **API Health Check:** http://localhost:5001/health

### Development Scripts

```bash
# Run both servers
npm run dev

# Run frontend only
npm run dev:frontend

# Run backend only
npm run dev:backend

# Lint code
npm run lint
```

---

## Designs

### Figma Mockups

**Design Link:** [Qure Design - ALU](https://www.figma.com/design/ZgIejwv9TrGqiXm86h9CRd/Qure-Design---ALU?m=auto&t=D2U8iypO1VrQHnMH-1)

The Figma design includes:
- User interface mockups for all pages
- Component designs and style guide
- Responsive layouts for mobile and desktop
- User flow diagrams

### System Diagrams

The following system architecture and design diagrams are available in the `Docs/` folder:

#### 1. System Architecture Diagram
![System Architecture](Docs/System%20Architecture%20Design.png)

#### 2. Entity Relationship Diagram (ERD)
![ERD](Docs/ERD.png)

#### 3. Class Diagram
![Class Diagram](Docs/Class%20Diagram.png)

#### 4. Use Case Diagram
![Use Case Diagram](Docs/Use%20Case%20Diagram.png)

#### 5. System Architecture (Alternative)
![System Architecture](Docs/system-architecture.png)


---

##  Deployment Plan

### Production Deployment Checklist

#### Backend Deployment

1. **Environment Setup**
   - Set up MongoDB Atlas
   - Configure production environment variables
   - Set secure JWT secret
   - Configure production email service (replace Ethereal Email)

2. **Server Deployment Options**
   - **Option :** Deploy to Render, Railway.


3. **Database Migration**
   ```bash
   npm run prisma:push  # Push schema to production database
   ```

4. **Environment Variables (Production)**
   ```env
   DATABASE_URL="<production-mongodb-connection-string>"
   JWT_SECRET="<strong-random-secret>"
   PORT=5001
   FRONTEND_URL="<production-frontend-url>"
   NODE_ENV="production"
   EMAIL_HOST="<smtp-host>"
   EMAIL_USER="<smtp-user>"
   EMAIL_PASS="<smtp-password>"
   ```

#### Frontend Deployment

1. **Build the application**
   ```bash
   cd frontend
   npm run build
   ```

2. **Deployment Options**
   - **Option 1:** Deploy to Vercel 
   - **Option 2:** Deploy to GitHub Pages


3. **Environment Variables**
   - Set `VITE_API_URL` to production backend URL

4. **Update API Configuration**
   - Ensure `frontend/src/config/api.js` points to production backend

### Deployment Architecture

```
┌─────────────────┐
│   Frontend      │  (Vercel/Github)  │
└────────┬────────┘
         │
         │ HTTPS
         │
┌────────▼────────┐
│   Backend API   │  (Render/Heroku/Railway)
│   (Express.js)  │
└────────┬────────┘
         │
         │
┌────────▼────────┐
│   MongoDB      │  (MongoDB Atlas)
│   Database     │
└─────────────────┘
```

---

##  Video Demo

**Video Demo:** [Watch the demo video](https://drive.google.com/drive/folders/1SpUOKctHdocRaEIQT2HmYX0LnV1txvPV?usp=sharing)


**Demo Content:**
- Project overview and setup
- User registration (Patient and Staff)
- Login functionality
- Patient dashboard features
- Staff dashboard and access code verification
- Settings page navigation
- System architecture overview

---


### Key Technologies

**Backend:**
- Node.js & Express.js
- Prisma ORM
- MongoDB
- JWT (jsonwebtoken)
- bcryptjs
- nodemailer

**Frontend:**
- Vanilla JavaScript (ES6+)
- Vite
- CSS3

---

## Contributors

- [Azeez Damilare Gbenga]

---


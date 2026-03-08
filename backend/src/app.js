import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import compression from 'compression';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import authRoutes from './routes/authRoutes.js';
import patientAuthRoutes from './routes/patientAuthRoutes.js';
import patientRoutes from './routes/patientRoutes.js';
import appointmentRoutes from './routes/appointmentRoutes.js';
import queueRoutes from './routes/queueRoutes.js';
import staffRoutes from './routes/staffRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import roomRoutes from './routes/roomRoutes.js';
import waitingAreaRoutes from './routes/waitingAreaRoutes.js';
import announcementRoutes from './routes/announcementRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import feedbackRoutes from './routes/feedbackRoutes.js';
import supportRoutes from './routes/supportRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Get __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Middleware
app.use(cors());
// Enable compression for all responses
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically
app.use('/uploads', express.static(join(__dirname, 'uploads')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Qure API is running' });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/patient/auth', patientAuthRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/staff/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/waiting-areas', waitingAreaRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/support', supportRoutes);

// 404 handler for undefined routes
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Start auto-check-in scheduler (runs every 5 minutes)
  if (process.env.ENABLE_AUTO_CHECKIN !== 'false') {
    startAutoCheckInScheduler();
  }
});

/**
 * Start auto-check-in scheduler
 * Runs every 5 minutes to automatically check in patients when appointment time arrives
 */
async function startAutoCheckInScheduler() {
  try {
    const { processAutoCheckIn } = await import('./services/autoCheckInService.js');
    
    // Run immediately on startup (for testing)
    // processAutoCheckIn().catch(console.error);
    
    // Then run every 5 minutes
    setInterval(async () => {
      try {
        const result = await processAutoCheckIn();
        if (result.success) {
          console.log(`[Auto-Check-In] Processed ${result.processed} appointments: ${result.successful} successful, ${result.errors} errors`);
        }
      } catch (error) {
        console.error('[Auto-Check-In] Scheduler error:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes
    
    console.log('✅ Auto-check-in scheduler started (runs every 5 minutes)');
  } catch (error) {
    console.error('❌ Failed to start auto-check-in scheduler:', error);
  }
}

export default app;


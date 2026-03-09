/**
 * Server-Sent Events (SSE) Controller for Real-time Wait Time Updates
 * 
 * Provides real-time wait time updates via SSE for queue entries
 */

import prisma from '../config/database.js';
import {
  getConsultationTimeForDepartment,
  getCurrentServingSequence,
  getActiveDoctorsCount,
  calculateQueueWaitTime,
} from '../services/waitTime.service.js';
import { authenticatePatient } from '../middleware/patientAuthMiddleware.js';
import { authenticate } from '../middleware/authMiddleware.js';

/**
 * SSE endpoint for wait time updates
 * GET /api/queue/:id/wait-time/stream
 * 
 * Streams real-time wait time updates for a specific queue entry
 * Updates every 30 seconds
 */
export const streamWaitTime = async (req, res) => {
  try {
    const user = req.user;
    const patient = req.patient;
    const { id } = req.params;

    // Allow both staff and patient access
    if (!user && !patient) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Wait time stream connected' })}\n\n`);

    // Function to calculate and send wait time
    const sendWaitTimeUpdate = async () => {
      try {
        const queueEntry = await prisma.queueEntry.findUnique({
          where: { id },
          include: {
            department: {
              select: {
                id: true,
                name: true,
              },
            },
            patient: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        });

        if (!queueEntry) {
          res.write(`data: ${JSON.stringify({ type: 'error', message: 'Queue entry not found' })}\n\n`);
          return;
        }

        // Validate access
        if (user) {
          if (user.hospitalId !== queueEntry.hospitalId) {
            res.write(`data: ${JSON.stringify({ type: 'error', message: 'Access denied' })}\n\n`);
            return;
          }
        } else if (patient) {
          if (patient.id !== queueEntry.patientId) {
            res.write(`data: ${JSON.stringify({ type: 'error', message: 'Access denied' })}\n\n`);
            return;
          }
        }

        // Only calculate for active entries
        if (!['WAITING', 'TRIAGE', 'CALLED', 'IN_CONSULTATION'].includes(queueEntry.status)) {
          res.write(`data: ${JSON.stringify({ 
            type: 'update', 
            data: { 
              estimatedWaitMinutes: null,
              minWaitMinutes: null,
              maxWaitMinutes: null,
              message: 'Queue entry is not in an active status' 
            } 
          })}\n\n`);
          return;
        }

        const currentServingSequence = await getCurrentServingSequence(queueEntry.hospitalId, queueEntry.departmentId);
        const activeDoctors = await getActiveDoctorsCount(queueEntry.hospitalId, queueEntry.departmentId);
        const avgConsultationTimeMinutes = await getConsultationTimeForDepartment(queueEntry.departmentId);
        const position = Math.max(0, queueEntry.sequenceNumber - currentServingSequence);
        const estimatedWaitMinutes = calculateQueueWaitTime({
          position,
          activeDoctors,
          consultationTime: avgConsultationTimeMinutes,
        });

        let minWaitMinutes = null;
        let maxWaitMinutes = null;
        if (estimatedWaitMinutes !== null && estimatedWaitMinutes > 0) {
          const varianceFactor = Math.max(0.15, Math.min(0.30, (position / Math.max(activeDoctors, 1)) * 0.05));
          const confidenceInterval = estimatedWaitMinutes * varianceFactor;
          minWaitMinutes = Math.max(0, Math.round(estimatedWaitMinutes - confidenceInterval));
          maxWaitMinutes = Math.round(estimatedWaitMinutes + confidenceInterval);
        }

        res.write(`data: ${JSON.stringify({
          type: 'update',
          data: {
            queueEntryId: id,
            estimatedWaitMinutes,
            minWaitMinutes,
            maxWaitMinutes,
            avgConsultationTimeMinutes,
            activeDoctors,
            position,
            lastUpdated: new Date().toISOString(),
          },
        })}\n\n`);
        
        // Monitor wait time changes for this queue entry (async, non-blocking)
        setImmediate(async () => {
          try {
            const { monitorWaitTimeForEntry } = await import('../services/waitTimeNotification.service.js');
            await monitorWaitTimeForEntry(id);
          } catch (error) {
            console.error('Error monitoring wait time for queue entry:', error);
            // Don't throw - this is a background operation
          }
        });
      } catch (error) {
        console.error('Error in sendWaitTimeUpdate:', error);
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to calculate wait time' })}\n\n`);
      }
    };

    // Send initial update immediately
    await sendWaitTimeUpdate();

    // Set up interval to send updates every 30 seconds
    const intervalId = setInterval(async () => {
      // Check if client is still connected
      if (res.writableEnded || res.destroyed) {
        clearInterval(intervalId);
        return;
      }

      await sendWaitTimeUpdate();
    }, 30000); // 30 seconds

    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(intervalId);
      res.end();
    });

    // Keep connection alive with heartbeat
    const heartbeatInterval = setInterval(() => {
      if (res.writableEnded || res.destroyed) {
        clearInterval(heartbeatInterval);
        return;
      }
      res.write(`: heartbeat\n\n`);
    }, 15000); // 15 seconds

    req.on('close', () => {
      clearInterval(heartbeatInterval);
    });
  } catch (error) {
    console.error('Error in streamWaitTime:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to establish wait time stream',
      });
    } else {
      res.end();
    }
  }
};

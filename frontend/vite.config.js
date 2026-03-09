import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        register: resolve(__dirname, 'register.html'),
        login: resolve(__dirname, 'login.html'),
        'forgot-password': resolve(__dirname, 'forgot-password.html'),
        'reset-password': resolve(__dirname, 'reset-password.html'),
        'accept-invite': resolve(__dirname, 'accept-invite.html'),
        'patient/dashboard': resolve(__dirname, 'patient/dashboard.html'),
        'patient/book-appointment': resolve(__dirname, 'patient/book-appointment.html'),
        'patient/contact': resolve(__dirname, 'patient/contact.html'),
        'patient/feedback': resolve(__dirname, 'patient/feedback.html'),
        'patient/my-bookings': resolve(__dirname, 'patient/my-bookings.html'),
        'patient/profile': resolve(__dirname, 'patient/profile.html'),
        'patient/queue-status': resolve(__dirname, 'patient/queue-status.html'),
        'staff/dashboard': resolve(__dirname, 'staff/dashboard.html'),
        'staff/verify-access': resolve(__dirname, 'staff/verify-access.html'),
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});


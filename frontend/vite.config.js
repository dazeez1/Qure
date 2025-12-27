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
        '404': resolve(__dirname, '404.html'),
        'patient-dashboard': resolve(__dirname, 'patient/dashboard.html'),
        'staff-dashboard': resolve(__dirname, 'staff/dashboard.html'),
        'staff-verify-access': resolve(__dirname, 'staff/verify-access.html'),
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});


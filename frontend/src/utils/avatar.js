/**
 * Avatar utility functions
 * Handles displaying patient avatars consistently across the application
 */

import { getApiBaseUrl } from './apiClient.js';

/**
 * Display avatar or initials in an element
 * @param {HTMLElement} element - The element to display avatar in
 * @param {string|null} avatarUrl - URL of the avatar image
 * @param {string} fullName - Patient's full name for initials fallback
 */
export function displayAvatar(element, avatarUrl, fullName) {
  if (!element) return;

  // Clear existing content
  element.innerHTML = '';

  if (avatarUrl) {
    const img = document.createElement('img');
    
    // Cloudinary URLs are already full HTTPS URLs, use as-is
    // For backward compatibility, handle local uploads too
    let imageSrc = avatarUrl;
    if (!avatarUrl.startsWith('http://') && !avatarUrl.startsWith('https://')) {
      const API_BASE = new URL(getApiBaseUrl()).origin;
      if (avatarUrl.startsWith('/uploads/')) {
        imageSrc = `${API_BASE}${avatarUrl}`;
      } else {
        const normalizedPath = avatarUrl.startsWith('/') ? avatarUrl : `/uploads/${avatarUrl}`;
        imageSrc = `${API_BASE}${normalizedPath}`;
      }
    }
    
    // Add cache-busting parameter to ensure fresh image load (only for non-Cloudinary URLs)
    if (!imageSrc.includes('cloudinary.com')) {
      const separator = imageSrc.includes('?') ? '&' : '?';
      const timestamp = Date.now();
      imageSrc = `${imageSrc}${separator}t=${timestamp}`;
    }
    
    img.src = imageSrc;
    img.alt = fullName || 'Profile';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.objectFit = 'cover';
    img.style.borderRadius = 'inherit';
    img.style.display = 'block';
    img.style.margin = '0';
    img.style.padding = '0';
    
    img.onerror = (error) => {
      console.error('Avatar image failed to load:', img.src, error);
      // If image fails to load, show initials instead
      element.innerHTML = '';
      const initial = fullName
        ? fullName
            .split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2)
        : 'U';
      const span = document.createElement('span');
      span.textContent = initial;
      element.appendChild(span);
    };
    element.appendChild(img);
  } else {
    // Show initials
    const initial = fullName
      ? fullName
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2)
      : 'U';
    const span = document.createElement('span');
    span.textContent = initial;
    element.appendChild(span);
  }
}

/**
 * Get initials from full name
 * @param {string} fullName - Full name
 * @returns {string} Initials (max 2 characters)
 */
export function getInitials(fullName) {
  if (!fullName) return 'U';
  return fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

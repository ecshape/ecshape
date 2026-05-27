/**
 * Utility functions for handling timezone conversions
 * All timestamps from the server are in UTC and are converted to the user's local timezone
 */

/**
 * Get the user's local timezone (browser timezone)
 * @returns Timezone string (e.g., 'Asia/Jerusalem', 'Europe/Paris', 'America/New_York')
 */
export const getUserTimezone = (): string => {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
};

/**
 * Format date in user's local timezone
 * @param date - Date string (UTC) or Date object
 * @param options - Intl.DateTimeFormatOptions
 * @param locale - Locale string (default: 'he-IL' for Hebrew)
 * @returns Formatted date string in user's local timezone
 */
export const formatLocalTime = (
  date: string | Date,
  options: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit'
  },
  locale: string = 'he-IL'
): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  // Date object automatically handles UTC to local timezone conversion
  return dateObj.toLocaleString(locale, {
    ...options,
    // Don't specify timeZone - use browser's local timezone automatically
  });
};

/**
 * Format date for chat message timestamp (uses user's local timezone)
 * @param date - Date string (UTC) or Date object
 * @returns Formatted time string in user's local timezone
 */
export const formatChatTime = (date: string | Date): string => {
  return formatLocalTime(date, {
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Format date for chat message date header (uses user's local timezone)
 * @param date - Date string (UTC) or Date object
 * @returns Formatted date string in user's local timezone
 */
export const formatChatDate = (date: string | Date): string => {
  return formatLocalTime(date, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Legacy functions for backward compatibility (deprecated - use formatLocalTime instead)
 * These still use Israel timezone for any legacy code that might depend on them
 */
export const toIsraelTime = (date: string | Date): Date => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return new Date(dateObj.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
};

export const formatIsraelTime = (
  date: string | Date,
  options: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit'
  }
): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleString('he-IL', {
    ...options,
    timeZone: 'Asia/Jerusalem'
  });
};
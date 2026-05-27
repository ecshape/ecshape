// Helper functions for dashboard

/**
 * Calculate week range (Monday to Sunday)
 */
export const getWeekRange = (date: Date = new Date()) => {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(date.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  
  return { start: monday, end: sunday };
};

/**
 * Format date for API (YYYY-MM-DD)
 */
export const formatDateForAPI = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

/**
 * Get day name (MON, TUE, etc.)
 */
export const getDayName = (date: Date, locale: string = 'en'): string => {
  if (locale === 'he') {
    const days = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
    const dayIndex = date.getDay();
    // Sunday = 0, Monday = 1, ..., Saturday = 6
    // Hebrew: א' = Sunday, ב' = Monday, ..., ש' = Saturday
    return days[dayIndex === 0 ? 6 : dayIndex - 1];
  }
  return date.toLocaleDateString(locale, { weekday: 'short' }).toUpperCase();
};

/**
 * Get day number (22, 23, etc.)
 */
export const getDayNumber = (date: Date): string => {
  return date.getDate().toString();
};

/**
 * Get all days in week (Monday to Sunday)
 */
export const getWeekDays = (date: Date = new Date()): Date[] => {
  const { start } = getWeekRange(date);
  const days: Date[] = [];
  
  for (let i = 0; i < 7; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    days.push(day);
  }
  
  return days;
};


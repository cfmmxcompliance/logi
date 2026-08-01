/**
 * Mexico City timezone utilities
 * 
 * All timestamps in the system should use nowMX() instead of new Date().toISOString()
 * to ensure times are stored and compared in local Mexico City time (America/Mexico_City).
 * 
 * Format returned: "YYYY-MM-DDTHH:mm:ss" (no UTC suffix — treated as local MX time)
 * This ensures that .split('T')[0] always returns the correct local date.
 */

const MX_TZ = 'America/Mexico_City';

/**
 * Returns the current date+time as a local Mexico City ISO string.
 * Format: "YYYY-MM-DDTHH:mm:ss"
 * Use this instead of new Date().toISOString() throughout the entire system.
 */
export const nowMX = (): string => {
  return new Date().toLocaleString('sv-SE', { timeZone: MX_TZ }).replace(' ', 'T') + '-06:00';
};

/**
 * Returns the current date in Mexico City as "YYYY-MM-DD".
 * Use this instead of new Date().toISOString().split('T')[0].
 */
export const todayMX = (): string => {
  return new Date().toLocaleDateString('en-CA', { timeZone: MX_TZ });
};

/**
 * Returns the current time in Mexico City as "HH:mm".
 */
export const timeMX = (): string => {
  return new Date().toLocaleTimeString('es-MX', {
    timeZone: MX_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
};

/**
 * Converts any stored timestamp (UTC ISO or local MX) to its local Mexico date "YYYY-MM-DD".
 * Handles both UTC ("2026-08-01T05:30:00.000Z") and local ("2026-07-31T23:30:00") formats.
 */
export const toMXDate = (isoString: string): string => {
  if (!isoString) return '';
  try {
    // If string has no 'Z' and no '+', treat as already local — just split
    if (!isoString.endsWith('Z') && !isoString.includes('+')) {
      return isoString.split('T')[0];
    }
    return new Date(isoString).toLocaleDateString('en-CA', { timeZone: MX_TZ });
  } catch {
    return isoString.split('T')[0];
  }
};

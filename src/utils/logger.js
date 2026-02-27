/**
 * Environment-aware logger utility
 * Provides secure logging that respects production environment constraints
 */

const isDevelopment = import.meta.env.MODE === 'development' || import.meta.env.NODE_ENV === 'development';

/**
 * Sanitizes data by removing sensitive information
 * @param {any} data - Data to sanitize
 * @returns {any} - Sanitized data
 */
const sanitizeData = (data) => {
  if (!data || typeof data !== 'object') {
    return data;
  }

  // Create a deep copy to avoid mutating original data
  const sanitized = JSON.parse(JSON.stringify(data));

  // Sensitive field patterns to remove or mask
  const sensitiveFields = [
    'password', 'token', 'accessToken', 'refreshToken', 'apiKey', 'secret',
    'authorization', 'auth', 'jwt', 'sessionId', 'userId', 'email'
  ];

  const maskSensitiveFields = (obj) => {
    if (Array.isArray(obj)) {
      return obj.map(item => maskSensitiveFields(item));
    }
    
    if (obj && typeof obj === 'object') {
      const masked = {};
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        const isSensitive = sensitiveFields.some(field => lowerKey.includes(field));
        
        if (isSensitive) {
          masked[key] = '[REDACTED]';
        } else if (typeof value === 'object') {
          masked[key] = maskSensitiveFields(value);
        } else {
          masked[key] = value;
        }
      }
      return masked;
    }
    
    return obj;
  };

  return maskSensitiveFields(sanitized);
};

/**
 * Logger class with environment-aware logging
 */
class Logger {
  /**
   * Log error messages (always enabled)
   * @param {string} message - Error message
   * @param {any} data - Additional data to log
   */
  static error(message, data = null) {
    const sanitizedData = data ? sanitizeData(data) : null;
    if (sanitizedData) {
      console.error(message, sanitizedData);
    } else {
      console.error(message);
    }
  }

  /**
   * Log warning messages (development only)
   * @param {string} message - Warning message
   * @param {any} data - Additional data to log
   */
  static warn(message, data = null) {
    if (!isDevelopment) return;
    
    const sanitizedData = data ? sanitizeData(data) : null;
    if (sanitizedData) {
      console.warn(message, sanitizedData);
    } else {
      console.warn(message);
    }
  }

  /**
   * Log info messages (development only)
   * @param {string} message - Info message
   * @param {any} data - Additional data to log
   */
  static info(message, data = null) {
    if (!isDevelopment) return;
    
    const sanitizedData = data ? sanitizeData(data) : null;
    if (sanitizedData) {
      console.info(message, sanitizedData);
    } else {
      console.info(message);
    }
  }

  /**
   * Log debug messages (development only)
   * @param {string} message - Debug message
   * @param {any} data - Additional data to log
   */
  static debug(message, data = null) {
    if (!isDevelopment) return;
    
    const sanitizedData = data ? sanitizeData(data) : null;
    if (sanitizedData) {
      console.log('[DEBUG]', message, sanitizedData);
    } else {
      console.log('[DEBUG]', message);
    }
  }

  /**
   * Log general messages (development only)
   * @param {string} message - Log message
   * @param {any} data - Additional data to log
   */
  static log(message, data = null) {
    if (!isDevelopment) return;
    
    const sanitizedData = data ? sanitizeData(data) : null;
    if (sanitizedData) {
      console.log(message, sanitizedData);
    } else {
      console.log(message);
    }
  }
}

export default Logger;
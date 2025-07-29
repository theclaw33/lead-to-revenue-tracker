const Fuse = require('fuse.js');

/**
 * Utility functions for the Lead-to-Revenue Tracker
 */
class Utils {
  /**
   * Perform fuzzy string matching between two strings
   * @param {string} str1 - First string to compare
   * @param {string} str2 - Second string to compare
   * @param {number} threshold - Similarity threshold (0-1, where 1 is exact match)
   * @returns {Object} Match result with score and isMatch boolean
   */
  static fuzzyMatch(str1, str2, threshold = 0.8) {
    if (!str1 || !str2) {
      return { score: 0, isMatch: false };
    }
    
    // Normalize strings
    const normalizedStr1 = str1.toLowerCase().trim();
    const normalizedStr2 = str2.toLowerCase().trim();
    
    // Exact match
    if (normalizedStr1 === normalizedStr2) {
      return { score: 1, isMatch: true };
    }
    
    // Use Fuse.js for fuzzy matching
    const fuse = new Fuse([normalizedStr2], {
      includeScore: true,
      threshold: 1 - threshold // Fuse uses inverse threshold
    });
    
    const result = fuse.search(normalizedStr1);
    
    if (result.length > 0) {
      const score = 1 - result[0].score; // Convert back to our threshold system
      return {
        score: score,
        isMatch: score >= threshold
      };
    }
    
    return { score: 0, isMatch: false };
  }

  /**
   * Find the best match from an array of options
   * @param {string} target - Target string to match against
   * @param {Array} options - Array of strings or objects with name property
   * @param {number} threshold - Minimum similarity threshold
   * @param {string} keyPath - Path to the property to match against (for objects)
   * @returns {Object|null} Best match object with item and score, or null
   */
  static findBestMatch(target, options, threshold = 0.8, keyPath = null) {
    if (!target || !options || options.length === 0) {
      return null;
    }
    
    const fuseOptions = {
      includeScore: true,
      threshold: 1 - threshold,
      keys: keyPath ? [keyPath] : undefined
    };
    
    const fuse = new Fuse(options, fuseOptions);
    const results = fuse.search(target);
    
    if (results.length > 0) {
      const bestMatch = results[0];
      const score = 1 - bestMatch.score;
      
      if (score >= threshold) {
        return {
          item: bestMatch.item,
          score: score,
          index: bestMatch.refIndex
        };
      }
    }
    
    return null;
  }

  /**
   * Clean and normalize customer names for better matching
   * @param {string} name - Customer name to normalize
   * @returns {string} Normalized name
   */
  static normalizeCustomerName(name) {
    if (!name) return '';
    
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\b(inc|llc|corp|ltd|company|co)\b/g, '') // Remove common business suffixes
      .trim();
  }

  /**
   * Extract first and last name from full name
   * @param {string} fullName - Full customer name
   * @returns {Object} Object with firstName and lastName
   */
  static parseCustomerName(fullName) {
    if (!fullName) {
      return { firstName: '', lastName: '' };
    }
    
    const parts = fullName.trim().split(/\s+/);
    
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: '' };
    } else if (parts.length === 2) {
      return { firstName: parts[0], lastName: parts[1] };
    } else {
      // More than 2 parts - first part is first name, rest is last name
      return {
        firstName: parts[0],
        lastName: parts.slice(1).join(' ')
      };
    }
  }

  /**
   * Format currency amount for display
   * @param {number} amount - Amount to format
   * @param {string} currency - Currency code (default: USD)
   * @returns {string} Formatted currency string
   */
  static formatCurrency(amount, currency = 'USD') {
    if (typeof amount !== 'number' || isNaN(amount)) {
      return '$0.00';
    }
    
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  }

  /**
   * Format date for display
   * @param {string|Date} date - Date to format
   * @param {string} format - Format type ('short', 'long', 'iso')
   * @returns {string} Formatted date string
   */
  static formatDate(date, format = 'short') {
    if (!date) return '';
    
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    
    if (isNaN(dateObj.getTime())) {
      return '';
    }
    
    switch (format) {
      case 'iso':
        return dateObj.toISOString().split('T')[0];
      case 'long':
        return dateObj.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      case 'short':
      default:
        return dateObj.toLocaleDateString('en-US');
    }
  }

  /**
   * Calculate percentage
   * @param {number} value - Value
   * @param {number} total - Total
   * @param {number} decimals - Number of decimal places
   * @returns {string} Formatted percentage
   */
  static calculatePercentage(value, total, decimals = 2) {
    if (!total || total === 0) return '0%';
    
    const percentage = (value / total) * 100;
    return `${percentage.toFixed(decimals)}%`;
  }

  /**
   * Calculate ROI (Return on Investment)
   * @param {number} revenue - Total revenue
   * @param {number} investment - Total investment
   * @param {number} decimals - Number of decimal places
   * @returns {string} Formatted ROI percentage
   */
  static calculateROI(revenue, investment, decimals = 2) {
    if (!investment || investment === 0) return 'N/A';
    
    const roi = ((revenue - investment) / investment) * 100;
    return `${roi.toFixed(decimals)}%`;
  }

  /**
   * Validate email address
   * @param {string} email - Email to validate
   * @returns {boolean} Whether email is valid
   */
  static isValidEmail(email) {
    if (!email) return false;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate phone number (US format)
   * @param {string} phone - Phone number to validate
   * @returns {boolean} Whether phone number is valid
   */
  static isValidPhone(phone) {
    if (!phone) return false;
    
    // Remove all non-digits
    const cleaned = phone.replace(/\D/g, '');
    
    // US phone numbers should have 10 digits (with or without country code)
    return cleaned.length === 10 || (cleaned.length === 11 && cleaned.startsWith('1'));
  }

  /**
   * Format phone number for display
   * @param {string} phone - Phone number to format
   * @returns {string} Formatted phone number
   */
  static formatPhone(phone) {
    if (!phone) return '';
    
    const cleaned = phone.replace(/\D/g, '');
    
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+1 (${cleaned.slice(1,4)}) ${cleaned.slice(4,7)}-${cleaned.slice(7)}`;
    }
    
    return phone; // Return original if can't format
  }

  /**
   * Sanitize string for logging (remove sensitive information)
   * @param {string} str - String to sanitize
   * @returns {string} Sanitized string
   */
  static sanitizeForLogging(str) {
    if (!str) return '';
    
    // Replace potential sensitive patterns
    return str
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
      .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]')
      .replace(/\b\d{4}[-.]?\d{4}[-.]?\d{4}[-.]?\d{4}\b/g, '[CARD]')
      .replace(/\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g, '[SSN]');
  }

  /**
   * Generate a simple hash for webhook validation
   * @param {string} data - Data to hash
   * @param {string} secret - Secret key
   * @returns {string} Hash
   */
  static generateHash(data, secret) {
    const crypto = require('crypto');
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  /**
   * Retry function with exponential backoff
   * @param {Function} fn - Function to retry
   * @param {number} maxRetries - Maximum number of retries
   * @param {number} baseDelay - Base delay in ms
   * @returns {Promise} Promise that resolves with function result
   */
  static async retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (i === maxRetries) {
          throw lastError;
        }
        
        const delay = baseDelay * Math.pow(2, i);
        console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms delay`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Deep merge two objects
   * @param {Object} target - Target object
   * @param {Object} source - Source object
   * @returns {Object} Merged object
   */
  static deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
          result[key] = this.deepMerge(result[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }
    
    return result;
  }
}

module.exports = Utils;
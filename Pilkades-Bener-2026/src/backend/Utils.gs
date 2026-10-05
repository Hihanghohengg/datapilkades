/**
 * Utility functions for string manipulation and formatting
 */

const Utils = {
  /**
   * Sanitizes input to prevent XSS and injection
   */
  sanitize: function(input) {
    if (typeof input !== 'string') return input;
    return input.replace(/[<>&"']/g, function(match) {
      const escape = {
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&#39;'
      };
      return escape[match];
    });
  },

  /**
   * Calculates Levenshtein distance between two strings
   */
  levenshtein: function(a, b) {
    const matrix = [];
    let i, j;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    
    for (i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    
    for (i = 1; i <= b.length; i++) {
      for (j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) == a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            Math.min(
              matrix[i][j - 1] + 1, // insertion
              matrix[i - 1][j] + 1 // deletion
            )
          );
        }
      }
    }
    return matrix[b.length][a.length];
  },

  /**
   * Calculates similarity percentage between two strings
   */
  similarity: function(s1, s2) {
    let longer = s1.toLowerCase();
    let shorter = s2.toLowerCase();
    if (s1.length < s2.length) {
      longer = s2.toLowerCase();
      shorter = s1.toLowerCase();
    }
    const longerLength = longer.length;
    if (longerLength === 0) return 1.0;
    return (longerLength - this.levenshtein(longer, shorter)) / parseFloat(longerLength);
  },

  /**
   * Auto-computes age based on date of birth (dd/mm/yy or dd/mm/yyyy or dd-mm-yyyy)
   */
  computeAge: function(dobString) {
    if (!dobString) return "";
    let parts = dobString.split(/[-/]/);
    if (parts.length !== 3) return "";
    
    let day = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10);
    let year = parseInt(parts[2], 10);
    
    if (year < 100) {
      year += (year > 30 ? 1900 : 2000); // basic logic for yy
    }
    
    const today = new Date();
    const currentDate = new Date(2026, 9, 4); // Based on context 2026
    let age = currentDate.getFullYear() - year;
    const m = currentDate.getMonth() - (month - 1);
    
    if (m < 0 || (m === 0 && currentDate.getDate() < day)) {
      age--;
    }
    return age;
  },

  /**
   * Helper to format date object to DD/MM/YYYY HH:mm
   */
  formatDateTime: function(date) {
    const pad = (n) => n < 10 ? '0' + n : n;
    return pad(date.getDate()) + '/' + 
           pad(date.getMonth() + 1) + '/' + 
           date.getFullYear() + ' ' + 
           pad(date.getHours()) + ':' + 
           pad(date.getMinutes());
  }
};

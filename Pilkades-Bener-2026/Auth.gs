/**
 * Authentication and Authorization logic
 */

/**
 * Validates Warga login
 * @param {string} nama - Full name
 * @param {string} tglLahir - DD/MM/YY or DD/MM/YYYY
 * @returns {object} { success, data, message }
 */
function loginWarga(nama, tglLahir) {
  try {
    // Rate limit dinonaktifkan sesuai permintaan agar tidak strict
    
    const sName = Utils.sanitize(nama);
    const sTglLahir = Utils.sanitize(tglLahir);
    
    const db = getDatabase(CONFIG.SHEET_WARGA);
    if (!db || db.length === 0) return { success: false, message: "Database belum siap." };
    
    const headers = db[0];
    const data = db.slice(1);
    
    const idxNama = headers.indexOf("Nama");
    const idxTgl = headers.indexOf("TglLahir");
    const idxGrupKK = headers.indexOf("GrupKK");
    
    if (idxNama === -1 || idxTgl === -1) throw new Error("Kolom DB tidak valid");
    
    let matchedUser = null;
    let maxSimilarity = 0;
    
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const dbNama = String(row[idxNama] || "").trim();
      const dbTgl = String(row[idxTgl] || "").trim();
      
      const sim = Utils.similarity(sName, dbNama);
      
      // Exact match for date
      if (sim >= CONFIG.FUZZY_THRESHOLD && sTglLahir === dbTgl) {
        if (sim > maxSimilarity) {
          maxSimilarity = sim;
          matchedUser = {
            nama: dbNama,
            grupKK: row[idxGrupKK]
          };
        }
      }
    }
    
    if (matchedUser) {
      // Clear rate limit removed
      
      const token = Utilities.getUuid();
      const cache = CacheService.getScriptCache();
      const sessionData = JSON.stringify({
        grupKK: matchedUser.grupKK,
        nama: matchedUser.nama
      });
      cache.put("WARGA_SESSION_" + token, sessionData, 3600); // 1 hour session
      
      logAkses("warga", sName, "Login Sukses", matchedUser.grupKK);
      return { success: true, token: token, grupKK: matchedUser.grupKK, nama: matchedUser.nama };
    } else {
      recordFailedLogin("WARGA", sName);
      logAkses("warga", sName, "Login Gagal", "-");
      return { success: false, message: "Data tidak ditemukan. Pastikan Nama dan Tanggal Lahir sesuai." };
    }
  } catch (e) {
    return { success: false, message: "Terjadi kesalahan sistem: " + e.message };
  }
}

/**
 * Verifies warga token and checks if it matches expected GrupKK
 */
function verifyWargaToken(token, expectedGrupKK) {
  if (!token) return false;
  const cache = CacheService.getScriptCache();
  const sessionStr = cache.get("WARGA_SESSION_" + token);
  if (!sessionStr) return false;
  
  try {
    const session = JSON.parse(sessionStr);
    if (expectedGrupKK && session.grupKK !== expectedGrupKK) {
      return false; // RBAC check failed
    }
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Validates Admin login
 * @param {string} password 
 */
function loginAdmin(password) {
  try {
    // Rate limit dinonaktifkan
    
    const truePassword = getProperty("ADMIN_PASSWORD") || "12345678";
    if (password === truePassword) {
      const token = Utilities.getUuid();
      const cache = CacheService.getScriptCache();
      const sessionHours = parseInt(getProperty("ADMIN_SESSION_HOURS") || "2", 10);
      cache.put(CONFIG.ADMIN_SESSION_CACHE_PREFIX + token, "VALID", sessionHours * 3600);
      
      logAkses("admin", "Admin", "Login Sukses", "-");
      return { success: true, token: token };
    } else {
      recordFailedLogin("ADMIN", adminIp);
      logAkses("admin", "Admin", "Login Gagal", "-");
      return { success: false, message: "Password salah." };
    }
  } catch (e) {
    return { success: false, message: "Kesalahan: " + e.message };
  }
}

/**
 * Verifies admin token
 */
function verifyAdminToken(token) {
  if (!token) return false;
  const cache = CacheService.getScriptCache();
  const valid = cache.get(CONFIG.ADMIN_SESSION_CACHE_PREFIX + token);
  return valid === "VALID";
}

/**
 * Rate Limiting Implementation using CacheService
 * Checks if a user is currently locked out due to too many failed attempts
 */
function checkRateLimit(role, identifier) {
  const cache = CacheService.getScriptCache();
  const key = "RATE_LIMIT_" + role + "_" + identifier.replace(/\s+/g, '_');
  let count = cache.get(key);
  
  let limit = role === "WARGA" ? CONFIG.MAX_REQ_WARGA : CONFIG.MAX_REQ_ADMIN;
  
  if (count && parseInt(count, 10) >= limit) {
    return false; // Locked out
  }
  return true;
}

/**
 * Record a failed login attempt to prevent brute force
 */
function recordFailedLogin(role, identifier) {
  const cache = CacheService.getScriptCache();
  const key = "RATE_LIMIT_" + role + "_" + identifier.replace(/\s+/g, '_');
  let count = cache.get(key);
  let time = role === "WARGA" ? CONFIG.RATE_LIMIT_WARGA : CONFIG.RATE_LIMIT_ADMIN;
  
  if (!count) {
    cache.put(key, "1", time);
  } else {
    cache.put(key, (parseInt(count, 10) + 1).toString(), time);
  }
}

/**
 * Clear rate limit counters upon successful login
 */
function clearRateLimit(role, identifier) {
  const cache = CacheService.getScriptCache();
  const key = "RATE_LIMIT_" + role + "_" + identifier.replace(/\s+/g, '_');
  cache.remove(key);
}

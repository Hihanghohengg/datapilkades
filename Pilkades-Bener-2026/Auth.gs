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
    if (!checkRateLimit("WARGA", nama)) {
      return { success: false, message: "Terlalu banyak percobaan. Coba lagi nanti." };
    }
    
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
      logAkses("warga", sName, "Login Sukses", matchedUser.grupKK);
      return { success: true, grupKK: matchedUser.grupKK, nama: matchedUser.nama };
    } else {
      logAkses("warga", sName, "Login Gagal", "-");
      return { success: false, message: "Data tidak ditemukan. Pastikan Nama dan Tanggal Lahir sesuai." };
    }
  } catch (e) {
    return { success: false, message: "Terjadi kesalahan sistem: " + e.message };
  }
}

/**
 * Validates Admin login
 * @param {string} password 
 */
function loginAdmin(password) {
  try {
    const adminIp = "ADMIN_SESSION";
    if (!checkRateLimit("ADMIN", adminIp)) {
      return { success: false, message: "Terlalu banyak percobaan." };
    }
    
    const truePassword = getProperty("ADMIN_PASSWORD") || "12345678";
    if (password === truePassword) {
      const token = Utilities.getUuid();
      const cache = CacheService.getScriptCache();
      const sessionHours = parseInt(getProperty("ADMIN_SESSION_HOURS") || "2", 10);
      cache.put(CONFIG.ADMIN_SESSION_CACHE_PREFIX + token, "VALID", sessionHours * 3600);
      logAkses("admin", "Admin", "Login Sukses", "-");
      return { success: true, token: token };
    } else {
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
 */
function checkRateLimit(role, identifier) {
  const cache = CacheService.getScriptCache();
  const key = "RATE_LIMIT_" + role + "_" + identifier.replace(/\s+/g, '_');
  let count = cache.get(key);
  
  let limit = role === "WARGA" ? CONFIG.MAX_REQ_WARGA : CONFIG.MAX_REQ_ADMIN;
  let time = role === "WARGA" ? CONFIG.RATE_LIMIT_WARGA : CONFIG.RATE_LIMIT_ADMIN;
  
  if (!count) {
    cache.put(key, "1", time);
    return true;
  }
  
  count = parseInt(count, 10);
  if (count >= limit) {
    return false;
  }
  
  cache.put(key, (count + 1).toString(), time);
  return true;
}

/**
 * Konstanta dan konfigurasi global
 */
const CONFIG = {
  // Default Properties (fallback jika belum diset di Script Properties)
  DEFAULT_PROPERTIES: {
    "SHEET_ID": "",
    "ADMIN_PASSWORD": "",
    "ADMIN_SESSION_HOURS": "2",
    "TEMPLATE_DOC_ID": ""
  },

  // Hardcoded constants
  NO_TPS: "06",
  
  // Sheet names (Sesuai request terbaru 3 tab: Data, Laporan, Log_Akses)
  SHEET_WARGA: "Data", 
  SHEET_LAPORAN: "Laporan",
  SHEET_LOG: "Log_Akses",
  
  // Session
  ADMIN_SESSION_CACHE_PREFIX: "ADMIN_SESSION_",
  
  // Rate Limiting (in seconds)
  RATE_LIMIT_WARGA: 60, // 10x per 60s
  RATE_LIMIT_ADMIN: 300, // 5x per 300s
  MAX_REQ_WARGA: 10,
  MAX_REQ_ADMIN: 5,
  
  // Validation
  FUZZY_THRESHOLD: 0.8 // 80% similarity
};

/**
 * Get Script Properties helper with fallback to DEFAULT_PROPERTIES
 */
function getProperty(key) {
  let val = PropertiesService.getScriptProperties().getProperty(key);
  if (!val) {
    return CONFIG.DEFAULT_PROPERTIES[key];
  }
  return val;
}

/**
 * Database operations (CRUD to Google Sheets)
 */

function getSpreadsheet() {
  const sheetId = getProperty("SHEET_ID");
  if (!sheetId) throw new Error("SHEET_ID belum diset di Script Properties.");
  return SpreadsheetApp.openById(sheetId);
}

function getDatabase(sheetName) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  return data;
}

/**
 * Ambil data KK berdasarkan GrupKK
 */
function getKeluargaByGrupKK(token, grupKK) {
  if (!verifyWargaToken(token, grupKK)) return { success: false, message: "Akses ditolak" };

  const db = getDatabase(CONFIG.SHEET_WARGA);
  const headers = db[0];
  const data = db.slice(1);
  const idxGrupKK = headers.indexOf("GrupKK");
  
  let result = [];
  let alamat = "";
  let kepala = "";
  
  data.forEach((row, index) => {
    if (row[idxGrupKK] === grupKK) {
      let obj = {};
      headers.forEach((h, i) => {
        obj[h] = row[i];
      });
      obj.RowIndex = index + 2; // +1 for header, +1 for 0-index
      result.push(obj);
      if (obj.Alamat && !alamat) alamat = obj.Alamat;
      if (obj.KepalaKeluarga && !kepala) kepala = obj.KepalaKeluarga;
    }
  });
  
  return { success: true, data: result, alamat: alamat, kepala: kepala };
}

/**
 * Update StatusKonfirmasi seluruh KK
 */
function setStatusKonfirmasi(grupKK, status) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_WARGA);
  const data = sheet.getDataRange().getValues();
  const idxGrupKK = data[0].indexOf("GrupKK");
  const idxStatus = data[0].indexOf("StatusKonfirmasi");
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][idxGrupKK] === grupKK) {
      sheet.getRange(i + 1, idxStatus + 1).setValue(status);
    }
  }
}

/**
 * User submit Laporan "Sesuai"
 */
function submitLaporanSesuai(token, grupKK, namaUser) {
  if (!verifyWargaToken(token, grupKK)) return { success: false, message: "Akses ditolak" };
  
  setStatusKonfirmasi(grupKK, "Sesuai");
  insertLaporan(namaUser, "", grupKK, "Sesuai", "{}", "Selesai", "Auto-approve");
  return { success: true };
}

/**
 * User submit Laporan Tambah/Kurang
 */
function submitLaporanPerubahan(token, grupKK, namaUser, tglLahirUser, jenis, dataJson) {
  if (!verifyWargaToken(token, grupKK)) return { success: false, message: "Akses ditolak" };

  setStatusKonfirmasi(grupKK, "Menunggu Review");
  insertLaporan(namaUser, tglLahirUser, grupKK, jenis, dataJson, "Baru", "");
  return { success: true };
}

/**
 * Insert baris ke tab Laporan
 */
function insertLaporan(nama, tglLahir, grupKK, jenis, dataStr, status, catatan) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_LAPORAN);
  sheet.appendRow([
    Utils.formatDateTime(new Date()),
    nama,
    tglLahir,
    grupKK,
    jenis,
    dataStr,
    status,
    catatan
  ]);
}

/**
 * Insert baris ke tab Log_Akses
 */
function logAkses(role, nama, hasil, grupKK) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET_LOG);
    sheet.appendRow([
      Utils.formatDateTime(new Date()),
      role,
      nama,
      hasil,
      grupKK,
      "Web" 
    ]);
  } catch (e) {
    // Ignore logging errors
  }
}

/**
 * Admin: Ambil semua Laporan
 */
function getLaporanList(token) {
  if (!verifyAdminToken(token)) return { success: false, message: "Unauthorized" };
  
  const db = getDatabase(CONFIG.SHEET_LAPORAN);
  if (db.length < 2) return { success: true, data: [] };
  
  const headers = db[0];
  const data = db.slice(1);
  let result = [];
  
  data.forEach((row, idx) => {
    let obj = { Id: idx + 2 }; // Row number
    headers.forEach((h, i) => {
      obj[h] = row[i];
    });
    result.push(obj);
  });
  
  return { success: true, data: result.reverse() }; // Newest first
}

/**
 * Admin: Get Notif Count (Laporan Baru)
 */
function getNotifCount(token) {
  if (!verifyAdminToken(token)) return 0;
  const data = getLaporanList(token).data || [];
  return data.filter(d => d.Status === "Baru").length;
}

/**
 * Admin: Mark Laporan as Read
 */
function markLaporanAsRead(token, rowIdx) {
  if (!verifyAdminToken(token)) return { success: false };
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_LAPORAN);
  const headers = sheet.getDataRange().getValues()[0];
  const colStatus = headers.indexOf("Status") + 1;
  
  const currentStatus = sheet.getRange(rowIdx, colStatus).getValue();
  if (currentStatus === "Baru") {
    sheet.getRange(rowIdx, colStatus).setValue("Dibaca");
  }
  return { success: true };
}

/**
 * Admin: Approve Laporan
 */
function approveLaporan(token, rowIdx, jenis, dataJsonStr, grupKK) {
  if (!verifyAdminToken(token)) return { success: false, message: "Unauthorized" };
  const ss = getSpreadsheet();
  const sheetLaporan = ss.getSheetByName(CONFIG.SHEET_LAPORAN);
  const sheetWarga = ss.getSheetByName(CONFIG.SHEET_WARGA);
  const wargaHeaders = sheetWarga.getDataRange().getValues()[0];
  
  const dataObj = JSON.parse(dataJsonStr);
  
  try {
    if (jenis === "Tambah Orang") {
      let newRow = new Array(wargaHeaders.length).fill("");
      const allWarga = getDatabase(CONFIG.SHEET_WARGA);
      const noCol = wargaHeaders.indexOf("No");
      let maxNo = 0;
      for (let i = 1; i < allWarga.length; i++) {
        let n = parseInt(allWarga[i][noCol], 10);
        if (!isNaN(n) && n > maxNo) maxNo = n;
      }
      
      const mapCol = (headerName, value) => {
        let idx = wargaHeaders.indexOf(headerName);
        if (idx > -1) newRow[idx] = value || "";
      };
      
      mapCol("No", maxNo + 1);
      mapCol("GrupKK", grupKK);
      mapCol("KepalaKeluarga", dataObj.KepalaKeluarga || "-"); 
      mapCol("NIK", dataObj.NIK || "");
      mapCol("Nama", dataObj.Nama);
      mapCol("JK", dataObj.JK);
      mapCol("TempatLahir", dataObj.TempatLahir);
      mapCol("TglLahir", dataObj.TglLahir);
      mapCol("Umur", Utils.computeAge(dataObj.TglLahir));
      mapCol("Status", dataObj.Status);
      mapCol("Alamat", dataObj.Alamat);
      mapCol("RT", dataObj.RT || "");
      mapCol("RW", dataObj.RW || "");
      mapCol("Disabilitas", dataObj.Disabilitas || "");
      mapCol("Keterangan", dataObj.Keterangan || "");
      mapCol("NoHP", "");
      mapCol("NoTPS", CONFIG.NO_TPS);
      mapCol("StatusKonfirmasi", "Sudah Direvisi");
      
      sheetWarga.appendRow(newRow);
      
    } else if (jenis === "Kurang Orang") {
      const allWarga = getDatabase(CONFIG.SHEET_WARGA);
      const idxGrupKK = wargaHeaders.indexOf("GrupKK");
      const idxNama = wargaHeaders.indexOf("Nama");
      const idxKet = wargaHeaders.indexOf("Keterangan");
      
      let foundRow = -1;
      for (let i = 1; i < allWarga.length; i++) {
        if (allWarga[i][idxGrupKK] === grupKK && allWarga[i][idxNama] === dataObj.Nama) {
          foundRow = i + 1; // 1 for header, 1 for 1-based index
          break;
        }
      }
      
      if (foundRow > -1) {
        sheetWarga.getRange(foundRow, idxKet + 1).setValue(dataObj.Alasan);
      }
    }
    
    // Update Laporan status
    const lapHeaders = sheetLaporan.getDataRange().getValues()[0];
    sheetLaporan.getRange(rowIdx, lapHeaders.indexOf("Status") + 1).setValue("Selesai");
    sheetLaporan.getRange(rowIdx, lapHeaders.indexOf("Catatan Admin") + 1).setValue("Disetujui");
    
    setStatusKonfirmasi(grupKK, "Sudah Direvisi");
    
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

/**
 * Admin: Tolak Laporan
 */
function tolakLaporan(token, rowIdx, catatan) {
  if (!verifyAdminToken(token)) return { success: false };
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_LAPORAN);
  const headers = sheet.getDataRange().getValues()[0];
  
  sheet.getRange(rowIdx, headers.indexOf("Status") + 1).setValue("Ditolak");
  sheet.getRange(rowIdx, headers.indexOf("Catatan Admin") + 1).setValue(catatan);
  
  return { success: true };
}

/**
 * Admin: Update Warga (Inline Edit / Hapus)
 */
function updateWargaBatch(token, dataUpdates) {
  if (!verifyAdminToken(token)) return { success: false, message: "Unauthorized" };
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_WARGA);
  const headers = sheet.getDataRange().getValues()[0];
  
  try {
    dataUpdates.forEach(item => {
      if (item.action === "update") {
        for (let key in item.data) {
          let colIdx = headers.indexOf(key);
          if (colIdx > -1) {
            if (key === "TglLahir") {
               let ageCol = headers.indexOf("Umur");
               if(ageCol > -1) sheet.getRange(item.rowIndex, ageCol + 1).setValue(Utils.computeAge(item.data[key]));
            }
            sheet.getRange(item.rowIndex, colIdx + 1).setValue(item.data[key]);
          }
        }
      } else if (item.action === "delete") {
        let ketIdx = headers.indexOf("Keterangan");
        if (ketIdx > -1) sheet.getRange(item.rowIndex, ketIdx + 1).setValue("Dihapus (Admin)");
      }
    });
    return { success: true };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

/**
 * Get Dashboard Stats
 */
function getDashboardStats(token) {
  if (!verifyAdminToken(token)) return null;
  
  const warga = getDatabase(CONFIG.SHEET_WARGA).slice(1);
  const idxStatus = getDatabase(CONFIG.SHEET_WARGA)[0].indexOf("StatusKonfirmasi");
  
  let totalData = warga.length;
  let sudah = 0;
  let belum = 0;
  let review = 0;
  let direvisi = 0;
  
  warga.forEach(row => {
    let stat = row[idxStatus];
    if (stat === "Sesuai") sudah++;
    else if (stat === "Belum") belum++;
    else if (stat === "Menunggu Review") review++;
    else if (stat === "Sudah Direvisi") direvisi++;
  });
  
  return {
    total: totalData,
    sudah: sudah,
    belum: belum,
    review: review,
    direvisi: direvisi
  };
}

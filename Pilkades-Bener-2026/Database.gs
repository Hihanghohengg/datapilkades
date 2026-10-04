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
 * Cari anggota KK di database berdasarkan filter
 */
function cariAnggotaKK(nama, userAlamat, userRT, userRW, userGrupKK) {
  const db = getDatabase(CONFIG.SHEET_WARGA);
  if (!db || db.length === 0) return { success: false, message: "DB Error" };
  
  const headers = db[0];
  const data = db.slice(1);
  
  const idxNama = headers.indexOf("Nama");
  const idxAlamat = headers.indexOf("Alamat");
  const idxRT = headers.indexOf("RT");
  const idxRW = headers.indexOf("RW");
  const idxGrupKK = headers.indexOf("GrupKK");
  const idxTgl = headers.indexOf("TglLahir");
  const idxUmur = headers.indexOf("Umur");
  
  if (idxNama === -1 || idxAlamat === -1) return { success: false, message: "Kolom DB tidak valid" };
  
  let matches = [];
  const sName = Utils.sanitize(nama);
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const dbNama = String(row[idxNama] || "").trim();
    const dbAlamat = String(row[idxAlamat] || "").trim();
    const dbRT = String(row[idxRT] || "").trim();
    const dbRW = String(row[idxRW] || "").trim();
    const dbGrupKK = String(row[idxGrupKK] || "").trim();
    
    // Syarat 2: Alamat + RT + RW harus sama
    if (dbAlamat.toLowerCase() !== userAlamat.toLowerCase()) continue;
    if (dbRT !== userRT) continue;
    if (dbRW !== userRW) continue;
    
    // Syarat 3: GrupKK KOSONG
    if (dbGrupKK && dbGrupKK !== "") continue;
    
    // Syarat 1: Nama match fuzzy
    const sim = Utils.similarity(sName, dbNama);
    if (sim >= 0.8) {
      matches.push({
        Nama: dbNama,
        Umur: row[idxUmur] || "",
        TglLahir: row[idxTgl] || "",
        Alamat: dbAlamat,
        RT: dbRT,
        RW: dbRW,
        RawRowData: row, // Pass raw row for Tambah Orang
        RowIndex: i + 2
      });
    }
  }
  
  return { success: true, data: matches };
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
        let val = row[i];
        if (h === "TglLahir" && val instanceof Date) {
          let d = val.getDate();
          let m = val.getMonth() + 1;
          let y = val.getFullYear();
          val = (d < 10 ? '0'+d : d) + '-' + (m < 10 ? '0'+m : m) + '-' + y;
        }
        obj[h] = val;
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
 * Wrapper: Simpan Laporan Tambah Warga Baru
 */
function simpanLaporanTambahWargaBaru(token, grupKK, namaUser, dataJson) {
  return submitLaporanPerubahan(token, grupKK, namaUser, "-", "Tambah Warga Baru", dataJson);
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
 * Admin: Ambil data Log_Akses
 */
function getLogAkses(token) {
  if (!verifyAdminToken(token)) return { success: false, message: "Unauthorized" };
  
  const db = getDatabase(CONFIG.SHEET_LOG);
  if (db.length < 2) return { success: true, data: [] };
  
  const headers = db[0];
  const data = db.slice(1);
  let result = [];
  
  data.forEach((row, idx) => {
    let obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i];
    });
    result.push(obj);
  });
  
  return { success: true, data: result.reverse() }; // Newest first
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
 * Admin: Ambil laporan berdasarkan status
 */
function getLaporanByStatus(token, status) {
  let res = getLaporanList(token);
  if (!res.success) return res;
  let filtered = res.data.filter(lap => lap.Status === status);
  return { success: true, data: filtered };
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
 * Admin: Approve Laporan Warga Baru (Wrapper)
 */
function approveLaporanWargaBaru(token, rowIdx, dataJsonStr, grupKK) {
  return approveLaporan(token, rowIdx, "Tambah Warga Baru", dataJsonStr, grupKK);
}

/**
 * Admin: Approve Laporan Tambah Orang (Wrapper)
 */
function approveLaporanTambahOrang(token, rowIdx, dataJsonStr, grupKK) {
  return approveLaporan(token, rowIdx, "Tambah Orang", dataJsonStr, grupKK);
}

/**
 * Admin: Approve Laporan Kurang Orang (Wrapper)
 */
function approveLaporanKurangOrang(token, rowIdx, dataJsonStr, grupKK) {
  return approveLaporan(token, rowIdx, "Kurang Orang", dataJsonStr, grupKK);
}

/**
 * Admin: Approve Laporan (Internal Core)
 */
function approveLaporan(token, rowIdx, jenis, dataJsonStr, grupKK) {
  if (!verifyAdminToken(token)) return { success: false, message: "Unauthorized" };
  const ss = getSpreadsheet();
  const sheetLaporan = ss.getSheetByName(CONFIG.SHEET_LAPORAN);
  const sheetWarga = ss.getSheetByName(CONFIG.SHEET_WARGA);
  const wargaHeaders = sheetWarga.getDataRange().getValues()[0];
  
  const dataObj = JSON.parse(dataJsonStr);
  
  try {
    if (jenis === "Tambah Warga Baru") {
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
      mapCol("HubunganKeluarga", dataObj.Hubungan || "");
      mapCol("Alamat", dataObj.Alamat);
      mapCol("RT", dataObj.RT || "");
      mapCol("RW", dataObj.RW || "");
      mapCol("Disabilitas", dataObj.Disabilitas || "");
      mapCol("Keterangan", dataObj.Keterangan || "");
      mapCol("NoHP", "");
      mapCol("NoTPS", CONFIG.NO_TPS || "06");
      mapCol("StatusKonfirmasi", "Sudah Direvisi");
      
      sheetWarga.appendRow(newRow);
      
    } else if (jenis === "Tambah Orang") {
      // Tambah Orang dari Database existing (GrupKK kosong)
      const allWarga = getDatabase(CONFIG.SHEET_WARGA);
      const idxNama = wargaHeaders.indexOf("Nama");
      const idxGrupKK = wargaHeaders.indexOf("GrupKK");
      
      let foundRow = -1;
      for (let i = 1; i < allWarga.length; i++) {
        if (allWarga[i][idxNama] === dataObj.Nama && !allWarga[i][idxGrupKK]) {
          foundRow = i + 1;
          break;
        }
      }
      
      if (foundRow > -1) {
        sheetWarga.getRange(foundRow, idxGrupKK + 1).setValue(grupKK);
      }
    } else if (jenis === "Kurang Orang") {
      const allWarga = getDatabase(CONFIG.SHEET_WARGA);
      const idxGrupKK = wargaHeaders.indexOf("GrupKK");
      const idxNama = wargaHeaders.indexOf("Nama");
      const idxKet = wargaHeaders.indexOf("Keterangan");
      
      let foundRow = -1;
      for (let i = 1; i < allWarga.length; i++) {
        if (allWarga[i][idxGrupKK] === grupKK && allWarga[i][idxNama] === dataObj.Nama) {
          foundRow = i + 1; 
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
 * Get Dashboard Stats (Real-time from KK perspective)
 */
function getDashboardStats(token) {
  if (!verifyAdminToken(token)) return null;
  
  const warga = getDatabase(CONFIG.SHEET_WARGA).slice(1);
  const headers = getDatabase(CONFIG.SHEET_WARGA)[0];
  const idxStatus = headers.indexOf("StatusKonfirmasi");
  const idxGrupKK = headers.indexOf("GrupKK");
  const idxNama = headers.indexOf("Nama");
  const idxHub = headers.indexOf("HubunganKeluarga");
  
  let kkMap = {}; // groupBy GrupKK
  
  warga.forEach(row => {
    let gkk = row[idxGrupKK];
    if (gkk) {
      if (!kkMap[gkk]) {
        kkMap[gkk] = {
          GrupKK: gkk,
          NamaKepala: "",
          Status: "Belum",
          JumlahPemilih: 0
        };
      }
      kkMap[gkk].JumlahPemilih++;
      
      let stat = row[idxStatus];
      if (stat === "Sesuai" || stat === "Sudah Direvisi" || stat === "Menunggu Review") {
        // If any member has this status, assume the KK has this status
        kkMap[gkk].Status = stat;
      }
      
      let hub = String(row[idxHub] || "").toLowerCase();
      if (hub.includes("kepala")) {
        kkMap[gkk].NamaKepala = row[idxNama];
      } else if (!kkMap[gkk].NamaKepala) {
        kkMap[gkk].NamaKepala = row[idxNama]; // fallback
      }
    }
  });
  
  let sudah = 0;
  let belum = 0;
  let review = 0;
  let direvisi = 0;
  
  Object.values(kkMap).forEach(kk => {
    if (kk.Status === "Sesuai") sudah++;
    else if (kk.Status === "Belum") belum++;
    else if (kk.Status === "Menunggu Review") review++;
    else if (kk.Status === "Sudah Direvisi") direvisi++;
  });
  
  return {
    totalKK: Object.keys(kkMap).length,
    sesuai: sudah,
    belum: belum,
    menungguReview: review,
    sudahDirevisi: direvisi,
    list: Object.values(kkMap)
  };
}

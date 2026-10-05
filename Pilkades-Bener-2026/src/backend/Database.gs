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
  if (!db || db.length < 2) return { success: false, message: "Database Warga kosong atau tidak valid" };

  const session = getWargaSession(token);
  const headers = db[0];
  const data = db.slice(1);
  const idxGrupKK = headers.indexOf("GrupKK");
  
  let result = [];
  let alamat = "";
  let kepala = "";
  
  const cleanGrupKK = String(grupKK || "").trim();

  // Hanya cocokkan jika GrupKK tidak kosong
  if (cleanGrupKK !== "" && cleanGrupKK !== "-" && cleanGrupKK !== "0") {
    data.forEach((row, index) => {
      let rGrup = String(row[idxGrupKK] || "").trim();
      if (rGrup !== "" && rGrup === cleanGrupKK) {
        let obj = {};
        headers.forEach((h, i) => {
          let val = row[i];
          if (h === "TglLahir" && val instanceof Date) {
            let d = val.getDate();
            let m = val.getMonth() + 1;
            let y = val.getFullYear();
            val = (d < 10 ? '0'+d : d) + '-' + (m < 10 ? '0'+m : m) + '-' + y;
          }
          obj[h] = val !== undefined && val !== null ? val : "";
        });
        obj.RowIndex = index + 2;
        result.push(obj);
        if (obj.Alamat && !alamat) alamat = obj.Alamat;
        if (obj.KepalaKeluarga && !kepala) kepala = obj.KepalaKeluarga;
      }
    });
  }
  
  // Jika warga masuk sebagai 'sendiri' (belum punya GrupKK di sheet)
  if (result.length === 0 && session && session.rowIndex) {
    let rowIndex = session.rowIndex;
    let r = data[rowIndex - 2];
    if (r) {
      let obj = {};
      headers.forEach((h, i) => {
        let val = r[i];
        if (h === "TglLahir" && val instanceof Date) {
          let d = val.getDate();
          let m = val.getMonth() + 1;
          let y = val.getFullYear();
          val = (d < 10 ? '0'+d : d) + '-' + (m < 10 ? '0'+m : m) + '-' + y;
        }
        obj[h] = val !== undefined && val !== null ? val : "";
      });
      obj.RowIndex = rowIndex;
      if (!obj.GrupKK || String(obj.GrupKK).trim() === "") obj.GrupKK = cleanGrupKK || session.nik || ("KK-" + rowIndex);
      if (!obj.KepalaKeluarga) obj.KepalaKeluarga = obj.Nama;
      if (!obj.HubunganKeluarga) obj.HubunganKeluarga = "KEPALA KELUARGA";
      result.push(obj);
      alamat = obj.Alamat || "";
      kepala = obj.Nama || "";
    }
  }

  return { success: true, data: result, alamat: alamat, kepala: kepala };
}

/**
 * Update StatusKonfirmasi seluruh KK
 */
function setStatusKonfirmasi(grupKK, status, userRowIndex) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_WARGA);
  const data = sheet.getDataRange().getValues();
  const idxGrupKK = data[0].indexOf("GrupKK");
  const idxStatus = data[0].indexOf("StatusKonfirmasi");
  const idxKepala = data[0].indexOf("KepalaKeluarga");
  const idxHub = data[0].indexOf("HubunganKeluarga");
  const idxNama = data[0].indexOf("Nama");

  const cleanGrupKK = String(grupKK || "").trim();
  let updatedCount = 0;

  if (cleanGrupKK !== "" && cleanGrupKK !== "-" && cleanGrupKK !== "0") {
    for (let i = 1; i < data.length; i++) {
      let rGrup = String(data[i][idxGrupKK] || "").trim();
      if (rGrup !== "" && rGrup === cleanGrupKK) {
        sheet.getRange(i + 1, idxStatus + 1).setValue(status);
        updatedCount++;
      }
    }
  }

  // Jika warga 'sendiri' yang GrupKK di sheet sebelumnya masih kosong:
  if (updatedCount === 0 && userRowIndex && userRowIndex >= 2 && userRowIndex <= data.length) {
    sheet.getRange(userRowIndex, idxStatus + 1).setValue(status);
    if (idxGrupKK > -1 && cleanGrupKK) {
      sheet.getRange(userRowIndex, idxGrupKK + 1).setValue(cleanGrupKK);
    }
    if (idxKepala > -1) {
      let currentKepala = data[userRowIndex - 1][idxKepala];
      if (!currentKepala) sheet.getRange(userRowIndex, idxKepala + 1).setValue(data[userRowIndex - 1][idxNama]);
    }
    if (idxHub > -1) {
      let currentHub = data[userRowIndex - 1][idxHub];
      if (!currentHub) sheet.getRange(userRowIndex, idxHub + 1).setValue("KEPALA KELUARGA");
    }
  }
}

/**
 * User submit Laporan "Sesuai" (Langsung update status)
 */
function submitSesuai(token, grupKK, namaUser) {
  if (!verifyWargaToken(token, grupKK)) return { success: false, message: "Akses ditolak" };
  const session = getWargaSession(token);
  const userRowIndex = session ? session.rowIndex : null;
  setStatusKonfirmasi(grupKK, "Sesuai", userRowIndex);
  return { success: true };
}

/**
 * Warga: Simpan Perubahan (Edit, Tambah, Kurang) secara langsung
 */
function wargaUpdateKeluarga(token, grupKK, updates, namaUser) {
  if (!verifyWargaToken(token, grupKK)) return { success: false, message: "Akses ditolak" };
  const session = getWargaSession(token);
  const userRowIndex = session ? session.rowIndex : null;

  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_WARGA);
  const headers = sheet.getDataRange().getValues()[0];
  
  try {
    updates.forEach(item => {
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
        // Pastikan GrupKK terisi jika sebelumnya kosong
        let idxGrup = headers.indexOf("GrupKK");
        if (idxGrup > -1 && grupKK) {
          let curGrup = sheet.getRange(item.rowIndex, idxGrup + 1).getValue();
          if (!curGrup || String(curGrup).trim() === "" || String(curGrup).trim() === "-") {
            sheet.getRange(item.rowIndex, idxGrup + 1).setValue(grupKK);
          }
        }
      } else if (item.action === "delete") {
        let colIdx = headers.indexOf("Keterangan");
        if (colIdx > -1) {
          sheet.getRange(item.rowIndex, colIdx + 1).setValue("Dihapus: " + item.alasan);
        }
      } else if (item.action === "add") {
        let newRow = [];
        headers.forEach(h => {
          if (h === "Umur" && item.data.TglLahir) {
            newRow.push(Utils.computeAge(item.data.TglLahir));
          } else if (h === "StatusKonfirmasi") {
            newRow.push("Sesuai");
          } else if (h === "GrupKK") {
            newRow.push(grupKK);
          } else if (h === "KepalaKeluarga" && (!item.data[h] || item.data[h] === "")) {
            newRow.push(namaUser || (session ? session.nama : ""));
          } else {
            newRow.push(item.data[h] !== undefined ? item.data[h] : "");
          }
        });
        sheet.appendRow(newRow);
      }
    });
    
    // Set status KK menjadi Sesuai
    setStatusKonfirmasi(grupKK, "Sesuai", userRowIndex);
    
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
  
  const dbWarga = getDatabase(CONFIG.SHEET_WARGA);
  if (!dbWarga || dbWarga.length < 2) {
    return {
      totalKK: 0,
      totalWarga: 0,
      sudah: 0,
      belum: 0,
      wargaSudah: 0,
      wargaBelum: 0,
      persen: 0,
      list: []
    };
  }
  
  const warga = dbWarga.slice(1);
  const headers = dbWarga[0];
  const idxStatus = headers.indexOf("StatusKonfirmasi");
  const idxGrupKK = headers.indexOf("GrupKK");
  const idxNama = headers.indexOf("Nama");
  const idxHub = headers.indexOf("HubunganKeluarga");
  const idxAlamat = headers.indexOf("Alamat");
  const idxRT = headers.indexOf("RT");
  const idxRW = headers.indexOf("RW");
  
  let kkMap = {}; // groupBy GrupKK
  let wargaSudah = 0;
  let wargaBelum = 0;

  warga.forEach(row => {
    let stat = String(row[idxStatus] || "").trim();
    let isRowSudah = (stat === "Sesuai" || stat === "Sudah Direvisi" || stat === "Sudah");
    if (isRowSudah) {
      wargaSudah++;
    } else {
      wargaBelum++;
    }

    let rawGkk = row[idxGrupKK];
    let isGroupValid = (rawGkk && String(rawGkk).trim() !== "" && String(rawGkk).trim() !== "-" && String(rawGkk).trim() !== "0");
    let gkkKey = isGroupValid ? String(rawGkk).trim() : ("MANDIRI-" + (row[idxNama] || Math.random()));
    let displayGrup = isGroupValid ? String(rawGkk).trim() : "-";

    if (!kkMap[gkkKey]) {
      kkMap[gkkKey] = {
        GrupKK: displayGrup,
        NamaKepala: row[idxNama] || "",
        Alamat: row[idxAlamat] || "",
        RT: row[idxRT] || "",
        RW: row[idxRW] || "",
        Status: "Belum",
        JumlahPemilih: 0
      };
    }
    kkMap[gkkKey].JumlahPemilih++;
    
    if (isRowSudah) {
      kkMap[gkkKey].Status = "Sudah";
    }
    
    let hub = String(row[idxHub] || "").toLowerCase();
    if (hub.includes("kepala")) {
      kkMap[gkkKey].NamaKepala = row[idxNama];
    }
  });
  
  let sudah = 0;
  let belum = 0;
  
  Object.values(kkMap).forEach(kk => {
    if (kk.Status === "Sudah") sudah++;
    else belum++;
  });

  const totalKK = Object.keys(kkMap).length;
  const persen = totalKK > 0 ? Math.round((sudah / totalKK) * 100) : 0;
  
  return {
    totalKK: totalKK,
    totalWarga: warga.length,
    sudah: sudah,
    belum: belum,
    wargaSudah: wargaSudah,
    wargaBelum: wargaBelum,
    persen: persen,
    list: Object.values(kkMap)
  };
}

/**
 * Ambil semua data pemilih (seluruh database warga) untuk pengecekan admin
 */
function getAllWarga(token) {
  if (!verifyAdminToken(token)) return { success: false, message: "Akses ditolak" };

  const dbWarga = getDatabase(CONFIG.SHEET_WARGA);
  if (!dbWarga || dbWarga.length < 2) {
    return { success: true, data: [] };
  }

  const headers = dbWarga[0];
  const rows = dbWarga.slice(1);

  let result = [];
  rows.forEach((row, idx) => {
    let obj = {};
    headers.forEach((h, i) => {
      let val = row[i];
      if (h === "TglLahir" && val instanceof Date) {
        let d = val.getDate();
        let m = val.getMonth() + 1;
        let y = val.getFullYear();
        val = (d < 10 ? '0' + d : d) + '-' + (m < 10 ? '0' + m : m) + '-' + y;
      }
      obj[h] = val !== undefined && val !== null ? String(val).trim() : "";
    });
    let s = obj.StatusKonfirmasi || "";
    obj.StatusKonfirmasi = (s === "Sesuai" || s === "Sudah Direvisi" || s === "Sudah") ? "Sudah" : "Belum";
    obj.No = idx + 1;
    result.push(obj);
  });

  return { success: true, data: result };
}


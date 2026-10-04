/**
 * PDF Generation using Google Docs Template
 */

function generatePdfForKK(token, grupKK) {
  try {
    const templateId = getProperty("TEMPLATE_DOC_ID");
    if (!templateId) throw new Error("Template belum di-set. Hubungi Admin.");
    
    // verify token
    if (!verifyWargaToken(token, grupKK)) {
      // Also allow Admin to generate PDF?
      if (!verifyAdminToken(token)) {
        throw new Error("Akses ditolak");
      }
    }
    
    const dbRes = getKeluargaByGrupKK(token, grupKK); // Use token
    if (!dbRes.success || dbRes.data.length === 0) {
      throw new Error("Data KK tidak ditemukan.");
    }
    
    // Filter data yang valid (bukan yang pindah/meninggal/dihapus)
    let pemilihList = dbRes.data.filter(p => {
      const ket = String(p.Keterangan || "").toLowerCase();
      return ket.indexOf("meninggal") === -1 && 
             ket.indexOf("pindah") === -1 && 
             ket.indexOf("dihapus") === -1;
    });
    
    // Pastikan Kepala Keluarga (Laki-laki / paling tua) berada di urutan pertama
    pemilihList.sort((a, b) => {
      let hubA = String(a.HubunganKeluarga || "").toUpperCase();
      let hubB = String(b.HubunganKeluarga || "").toUpperCase();
      let isKepalaA = hubA.includes("KEPALA");
      let isKepalaB = hubB.includes("KEPALA");
      
      if (isKepalaA && !isKepalaB) return -1;
      if (!isKepalaA && isKepalaB) return 1;
      
      // Laki-laki diutamakan jika status kepala tidak jelas
      let aIsLaki = String(a.JK || "").toUpperCase() === "LAKI-LAKI";
      let bIsLaki = String(b.JK || "").toUpperCase() === "LAKI-LAKI";
      if (aIsLaki && !bIsLaki) return -1;
      if (!aIsLaki && bIsLaki) return 1;
      
      // Urutkan berdasarkan Umur (Tertua ke Termuda)
      let umurA = parseInt(a.Umur) || 0;
      let umurB = parseInt(b.Umur) || 0;
      return umurB - umurA;
    });
    
    // Kepala KK diambil dari orang pertama hasil sorting
    let namaKepalaKK = pemilihList.length > 0 ? pemilihList[0].Nama : "-";

    const copy = DriveApp.getFileById(templateId).makeCopy('Form_Pilkades_' + grupKK);
    const doc = DocumentApp.openById(copy.getId());
    const body = doc.getBody();
    
    body.replaceText('\\{\\{KEPALA_KK\\}\\}', namaKepalaKK);
    body.replaceText('\\{\\{ALAMAT\\}\\}', dbRes.alamat || "-");
    
    // Replace placeholders for 11 slots
    for (let i = 1; i <= 11; i++) {
      let textPlaceholder = `\\{\\{PEMILIH_${i}\\}\\}`;
      if (i <= pemilihList.length) {
        let p = pemilihList[i - 1];
        body.replaceText(textPlaceholder, p.Nama);
      } else {
        body.replaceText(textPlaceholder, ""); // string kosong
      }
    }
    
    doc.saveAndClose();
    
    const pdfBlob = copy.getAs('application/pdf');
    const pdfFile = DriveApp.createFile(pdfBlob);
    
    // Set file agar bisa diakses/download publik (tanpa login Google)
    pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // Hapus Docs temporary
    copy.setTrashed(true);
    
    // Kembalikan URL direct download dari Google Drive
    return { success: true, url: 'https://drive.google.com/uc?export=download&id=' + pdfFile.getId() };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

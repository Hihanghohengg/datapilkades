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
    const pemilihList = dbRes.data.filter(p => {
      const ket = String(p.Keterangan || "").toLowerCase();
      return ket.indexOf("meninggal") === -1 && 
             ket.indexOf("pindah") === -1 && 
             ket.indexOf("dihapus") === -1;
    });
    
    const copy = DriveApp.getFileById(templateId).makeCopy('Form_Pilkades_' + grupKK);
    const doc = DocumentApp.openById(copy.getId());
    const body = doc.getBody();
    
    body.replaceText('{{KEPALA_KK}}', dbRes.kepala || "-");
    body.replaceText('{{ALAMAT}}', dbRes.alamat || "-");
    
    // Replace placeholders for 11 slots
    for (let i = 1; i <= 11; i++) {
      let textPlaceholder = `{{PEMILIH_${i}}}`;
      if (i <= pemilihList.length) {
        let p = pemilihList[i - 1];
        let info = `${p.Nama} | ${p.TempatLahir}, ${p.TglLahir} | ${p.Umur} thn | ${p.JK} | ${p.Status}`;
        body.replaceText(textPlaceholder, info);
      } else {
        body.replaceText(textPlaceholder, ""); // string kosong
      }
    }
    
    doc.saveAndClose();
    
    const pdfBlob = copy.getAs('application/pdf');
    const pdfFile = DriveApp.createFile(pdfBlob);
    
    // Hapus Docs temporary
    copy.setTrashed(true);
    
    return { success: true, url: pdfFile.getUrl() };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

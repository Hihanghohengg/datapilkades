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
    
    // Cari Kepala Keluarga (Rule: Eksplisit KEPALA -> Laki-laki Tertua -> Orang Tertua)
    let kepalaKK = pemilihList.find(p => String(p.HubunganKeluarga || "").toUpperCase().includes("KEPALA"));
    
    if (!kepalaKK) {
      let males = pemilihList.filter(p => String(p.JK || "").toUpperCase() === "LAKI-LAKI");
      if (males.length > 0) {
        males.sort((a, b) => (parseInt(b.Umur) || 0) - (parseInt(a.Umur) || 0));
        kepalaKK = males[0];
      }
    }
    if (!kepalaKK && pemilihList.length > 0) {
      let all = [...pemilihList];
      all.sort((a, b) => (parseInt(b.Umur) || 0) - (parseInt(a.Umur) || 0));
      kepalaKK = all[0];
    }
    
    // Fungsi pembobotan urutan standar Kartu Keluarga
    const getHubunganScore = (hub) => {
      let h = String(hub || "").toUpperCase();
      if (h.includes("KEPALA")) return 1;
      if (h.includes("ISTRI")) return 2;
      if (h.includes("ANAK")) return 3;
      return 4; // Famili lain / Orang tua / dll
    };

    // Lakukan sorting
    pemilihList.sort((a, b) => {
      // Kepala KK (yang sudah ditentukan di atas) mutlak di urutan pertama (index 0)
      if (a === kepalaKK) return -1;
      if (b === kepalaKK) return 1;
      
      let scoreA = getHubunganScore(a.HubunganKeluarga);
      let scoreB = getHubunganScore(b.HubunganKeluarga);
      
      if (scoreA !== scoreB) {
        return scoreA - scoreB; // Urutan: Istri -> Anak -> Lainnya
      }
      
      // Jika hubungannya sama (misal sesama Anak), urutkan dari Anak Tertua ke Termuda
      let umurA = parseInt(a.Umur) || 0;
      let umurB = parseInt(b.Umur) || 0;
      return umurB - umurA;
    });
    
    // Nama Kepala KK untuk ditempel di field KEPALA_KK
    let namaKepalaKK = kepalaKK ? kepalaKK.Nama : "-";

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

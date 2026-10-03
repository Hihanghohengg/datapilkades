/**
 * Main Entry Point and Routing
 */

function doGet(e) {
  if (!getProperty("SHEET_ID")) {
    return HtmlService.createHtmlOutput('<h1>Setup Belum Selesai</h1><p>SHEET_ID belum diset di Script Properties. Hubungi Admin.</p>');
  }

  const page = e.parameter.page || 'login';
  const allowedPages = [
    'login', 'admin-login', 'konfirmasi', 'data-kk', 'pilih-perubahan',
    'form-tambah', 'form-kurang', 'sukses', 'dashboard', 'monitoring',
    'laporan', 'generate-pdf', 'log-akses', '404'
  ];
  
  if (!allowedPages.includes(page)) {
    return HtmlService.createTemplateFromFile('views/404')
      .evaluate()
      .setTitle('404 Not Found')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  const pageName = page.replace(/-/g, '_');
  const template = HtmlService.createTemplateFromFile(`views_${pageName}`);
  
  // Pass configuration variables to template if needed
  template.config = CONFIG;
  template.scriptUrl = getScriptUrl();
  
  return template.evaluate()
    .setTitle('Sistem Konfirmasi Pilkades Bener 2026')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Include helper for HTML templates (to include partials, scripts, styles)
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getScriptUrl() {
  return ScriptApp.getService().getUrl();
}

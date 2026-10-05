/**
 * Main Entry Point and Routing
 */

function doGet(e) {
  if (!getProperty("SHEET_ID")) {
    return HtmlService.createHtmlOutput('<h1>Setup Belum Selesai</h1><p>SHEET_ID belum diset di Script Properties. Hubungi Admin.</p>');
  }

  const page = e.parameter.page || 'login';
  const allowedPages = [
    'login', 'admin-login', 'data-kk', 'sukses', 'dashboard',
    'monitoring', 'generate-pdf', '404'
  ];
  
  if (!allowedPages.includes(page)) {
    return HtmlService.createTemplateFromFile('frontend/views/404')
      .evaluate()
      .setTitle('404 Not Found')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  let pageName = page.replace(/-/g, '_');
  
  // SPA Routing for admin pages
  const adminSpaPages = ['dashboard', 'monitoring', 'generate_pdf'];
  if (adminSpaPages.includes(pageName)) {
    pageName = 'dashboard';
  }

  const template = HtmlService.createTemplateFromFile(`frontend/views/${pageName}`);
  
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

# Panduan Setup Sistem Konfirmasi & Cetak Form Pilkades Bener 2026 (v8.0)

Sistem telah dibuat sesuai PRD v8.0. Ikuti langkah berikut untuk mendeploy sistem ini.

## Langkah 1: Setup Spreadsheet Database
1. Buat Google Spreadsheet baru.
2. Buat 3 tab (sheet) dengan nama persis:
   - `Data_Warga`
   - `Laporan`
   - `Log_Akses`
3. Upload/impor file `data_warga_384.csv` ke dalam sheet `Data_Warga`.
4. Isi kolom `Laporan` dengan header:
   `Timestamp, Nama Pengisi, Tgl Lahir Pengisi, GrupKK, Jenis Laporan, Data Laporan, Status, Catatan Admin`
5. Isi kolom `Log_Akses` dengan header:
   `Timestamp, Role, Nama Input, Hasil, GrupKK, Device`
6. Catat **Spreadsheet ID** dari URL file (bagian di antara `/d/` dan `/edit`).

## Langkah 2: Setup Template Google Docs
1. Buat Google Docs baru bernama `Template Form Pilkades Bener 2026`.
2. Masukkan desain form Pilkades atau copy dari format yang sudah ada.
3. Masukkan variabel placeholder berikut:
   `{{KEPALA_KK}}`, `{{ALAMAT}}`
   Lalu untuk anggota, buat 11 baris dengan nama variabel:
   `{{PEMILIH_1}}`, `{{PEMILIH_2}}`, hingga `{{PEMILIH_11}}`.
4. Catat **Document ID** dari URL Google Docs (bagian di antara `/d/` dan `/edit`).

## Langkah 3: Setup Google Apps Script
1. Buat project Google Apps Script baru di [script.google.com](https://script.google.com).
2. Salin seluruh isi folder `Pilkades-Bener-2026` ke project Apps Script.
   **PENTING: Apps Script tidak mendukung folder (karakter `/`). Semua file HTML harus menggunakan underscore (`_`) sesuai mapping berikut:**
   - `views_login.html`
   - `views_admin_login.html`
   - `views_konfirmasi.html`
   - `views_data_kk.html`
   - `views_pilih_perubahan.html`
   - `views_form_tambah.html`
   - `views_form_kurang.html`
   - `views_sukses.html`
   - `views_dashboard.html`
   - `views_monitoring.html`
   - `views_laporan.html`
   - `views_generate_pdf.html`
   - `views_log_akses.html`
   - `views_404.html`
   - `styles_main.html`
   - `styles_admin.html`
   - `scripts_api_js.html`
   - `scripts_ui_js.html`
   - `scripts_app_js.html`
   - `scripts_admin_js.html`
   - `partials_sidebar.html`
   - `partials_notif_icon.html`
   - `partials_modal_edit.html`
3. Buka **Project Settings** (ikon gir ⚙️ di kiri) > **Script Properties**.
4. **WAJIB!** Tambahkan properti berikut dengan klik *Add script property* (sistem tidak akan berjalan jika kosong):
   - `SHEET_ID` = `[Spreadsheet ID dari langkah 1]`
   - `ADMIN_PASSWORD` = `[Password rahasia Anda, misal: 12345678]`
   - `ADMIN_SESSION_HOURS` = `2`
   - `TEMPLATE_DOC_ID` = `[Document ID dari langkah 2]`

## Langkah 4: Deployment
1. Di kanan atas, klik **Deploy** > **New deployment**.
2. Pilih tipe **Web app**.
3. Execute as: **Me**.
4. Who has access: **Anyone**.
5. Klik **Deploy** dan berikan izin akses ke akun Google Anda (Drive, Docs, Sheets).
6. Web app URL akan muncul. Link inilah yang akan disebarkan via WhatsApp ke warga (misalnya: `https://script.google.com/macros/s/.../exec`).

## Selesai
Akses link tersebut, secara default akan menuju halaman login warga.
Untuk login admin, klik teks kecil "🔑 Login Admin" di halaman awal atau tambahkan `?page=admin-login` di belakang URL.

require('dotenv').config();
const { initDB, pool } = require('../src/config/db');
const documentRepo = require('../src/repositories/document.repo');
const embeddingService = require('../src/services/embedding.service');

const sampleDocuments = [
  {
    content: "Kebijakan Kerja Jarak Jauh (Remote Work Policy): Karyawan diperbolehkan bekerja dari rumah (WFH) maksimal 3 hari per minggu. Hari Wajib Kantor (WFO) adalah hari Senin dan Kamis untuk meeting koordinasi. Jam kerja inti adalah pukul 10:00 - 16:00 WIB.",
    metadata: { category: "HR", title: "Remote Work Policy" }
  },
  {
    content: "Kebijakan Cuti Tahunan: Setiap karyawan berhak mendapatkan 12 hari cuti tahunan setelah masa percobaan 3 bulan. Sisa cuti tidak dapat diuangkan namun dapat di-carry over maksimal 5 hari ke tahun berikutnya.",
    metadata: { category: "HR", title: "Annual Leave Policy" }
  },
  {
    content: "Reimbursement Lembur: Untuk lembur di atas pukul 20:00 WIB, karyawan berhak mengklaim uang makan sebesar Rp 50.000 dan penggantian biaya taksi (Bluebird/Grab/Gojek) sesuai struk.",
    metadata: { category: "Finance", title: "Overtime Reimbursement" }
  },
  {
    content: "Keamanan IT Standar: Semua laptop perusahaan wajib terenkripsi (BitLocker/FileVault). Password harus diganti setiap 90 hari. Penggunaan flashdisk pribadi dilarang keras untuk mencegah malware.",
    metadata: { category: "IT", title: "IT Security Standard" }
  },
  {
    content: "Prosedur Pengajuan Cuti: Pengajuan cuti dilakukan melalui portal ESS (Employee Self Service) minimal 3 hari sebelum tanggal cuti. Untuk cuti sakit mendadak, wajib melampirkan surat dokter jika lebih dari 2 hari.",
    metadata: { category: "HR", title: "Leave Request Procedure" }
  },
  {
    content: "Jadwal Gajian: Gaji dibayarkan setiap tanggal 25. Jika tanggal 25 jatuh pada hari Sabtu/Minggu/Libur, maka gaji dibayarkan pada hari kerja sebelumnya.",
    metadata: { category: "Finance", title: "Payroll Schedule" }
  },
  {
    content: "Struktur Wifi Kantor: \nSSID: Office-Secure\nPassword: StrongPassword2024!\nSSID: Office-Guest\nPassword: WelcomeGuest123\nTamu hanya diperbolehkan menggunakan jaringan Guest.",
    metadata: { category: "IT", title: "Wifi Access" }
  }
];

const seed = async () => {
  try {
    console.log('Connecting to database...');
    // Ensure DB connection and extensions
    // Note: initDB relies on the pool, using it from file relative path might differ in context
    // Ideally we assume the app logic works.
    
    // We can just use the pool directly but initDB sets up the table if missing which is good.
    await initDB();

    console.log(`Seeding ${sampleDocuments.length} documents...`);

    for (const doc of sampleDocuments) {
      console.log(`Processing: ${doc.metadata.title}`);
      
      // 1. Generate text embedding
      const embedding = await embeddingService.generateEmbedding(doc.content);
      
      // 2. Save to DB
      await documentRepo.saveDocument(doc.content, embedding, doc.metadata);
    }

    console.log('Seeding completed successfully!');
  } catch (error) {
    console.error('Seeding failed:', error);
  } finally {
    await pool.end();
  }
};

seed();

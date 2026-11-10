/* ===== DOM ===== */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);
const app = $('#app');


/* ===== Format teks ===== */
/* Mencegah karakter HTML dari data (nama, alamat, dll) merusak tampilan. */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[char]));
}

function formatRupiah(amount) {
  return 'Rp ' + Math.round(amount || 0).toLocaleString('id-ID');
}

/* Versi halaman Checkout: "Rp. 219.000" */
function formatRupiahDot(amount) {
  return 'Rp. ' + Math.round(amount || 0).toLocaleString('id-ID');
}

/* Versi kartu produk di halaman Koleksi: "Rp.185.000" */
function formatRupiahCard(amount) {
  return 'Rp.' + Math.round(amount || 0).toLocaleString('id-ID');
}

/* Label varian (warna + ukuran), sudah di-escape. Contoh: "Ruby · 16". */
function variantLabel(color, size) {
  return escapeHtml(color + (size ? ' · ' + size : ''));
}


/* ===== Konten brand ===== */
const BRAND_TAGLINE = 'a symphony of grace, where every whispers elegance.';
const BRAND_E = '<span class="accent">É</span>';
const CARE_NOTE = 'Hindari air, parfum, dan bahan kimia agar kilau manik terjaga.';

const WA_CONTACTS = [
  { name: 'Minsae', number: '6281232289050', display: '0812-3228-9050' },
  { name: 'Minwe', number: '6288226102822', display: '0882-2610-2822' },
];


/* ===== Kategori produk ===== */
const PRODUCT_CATEGORIES = ['gelang', 'kalung', 'cincin', 'anting', 'bagcharm'];
const CATEGORY_LABELS = { bagcharm: 'Bag Charm' };

function categoryLabel(category) {
  return CATEGORY_LABELS[category] || category[0].toUpperCase() + category.slice(1);
}


/* ===== Status pesanan ===== */
const STATUS_LABELS = {
  menunggu_ongkir: 'Menunggu ongkir',
  menunggu_bayar: 'Menunggu pembayaran',
  diproses: 'Diproses',
  dikirim: 'Dikirim',
  siap_ambil: 'Siap diambil',
  selesai: 'Selesai',
  dibatalkan: 'Dibatalkan',
  tindak_lanjut: 'Tindak lanjut',
};


/* ===== Notifikasi kecil (toast) ===== */
function showToast(message, duration = 2200) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('on');
  setTimeout(() => toast.classList.remove('on'), duration);
}
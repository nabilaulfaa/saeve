/*
 * staff.js
 * Halaman staf: Admin (pesanan, produk & stok, laporan) dan Kasir (POS).
 * Halaman ditentukan oleh <body data-page="admin|kasir">.
 * Bergantung pada: common.js
 */

const PAGE = document.body.dataset.page;
const CSRF_TOKEN = $('meta[name=csrf-token]').content;


/* ===== Helper khusus staf ===== */
function formatDateTime(value) {
  return new Date(value).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* Tanggal lokal format YYYY-MM-DD (toISOString memakai UTC, bisa meleset sehari dini hari WIB). */
function toDateInputValue(date) {
  return date.toLocaleDateString('en-CA');
}

function statusBadge(status) {
  const kind = ['dibatalkan', 'tindak_lanjut'].includes(status)
    ? 'bad'
    : ['selesai', 'diproses'].includes(status)
      ? 'ok'
      : 'wait';
  return `<span class="bd ${kind}">${STATUS_LABELS[status] || status}</span>`;
}

/* Request ke /staff/... dengan CSRF. Kalau sesi habis, diarahkan ke halaman masuk. */
async function staffApi(url, method = 'GET', body) {
  const response = await fetch('/staff/' + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-CSRF-TOKEN': CSRF_TOKEN,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if ([401, 403, 419].includes(response.status)) location = '/masuk';
    throw new Error(data.message || 'Terjadi kesalahan');
  }
  return data;
}

/* Upload berkas (multipart). Content-Type diisi browser sendiri, jadi tidak ditulis di sini. */
async function staffUpload(url, formData) {
  const response = await fetch('/staff/' + url, {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'X-CSRF-TOKEN': CSRF_TOKEN },
    body: formData,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if ([401, 403, 419].includes(response.status)) location = '/masuk';
    throw new Error(data.message || 'Gagal mengunggah. Periksa ukuran dan format foto.');
  }
  return data;
}

/* Jalankan aksi; kalau gagal, tampilkan pesan errornya sebagai toast. */
async function safely(action) {
  try {
    await action();
  } catch (error) {
    showToast(error.message, 2400);
  }
}

/* Cetak hanya bagian struk (lihat @media print di staff.css). */
function printReceipt() {
  document.body.classList.add('printing-rc');
  print();
  setTimeout(() => document.body.classList.remove('printing-rc'), 600);
}

/* Satu baris form: label + input. */
function formField(id, label, type = 'text', attributes = '') {
  return `<div class="fl">${label}<input id="${id}" type="${type}" ${attributes}></div>`;
}


/* ===== Struk (dipakai Admin dan Kasir) ===== */
function renderReceipt(order) {
  const isPos = order.channel === 'pos';
  const isDelivery = order.delivery === 'kirim';

  const itemRows = order.items.map((item) => `
    <div class="sum">
      <span>${escapeHtml(item.productName)}<br><small>${variantLabel(item.color, item.size)} · ${item.qty} × ${formatRupiah(item.unitPrice)}</small></span>
      <span>${formatRupiah(item.qty * item.unitPrice)}</span>
    </div>`).join('');

  const shippingRow = isDelivery
    ? `<div class="sum"><span>Ongkir</span><span>${formatRupiah(order.shippingFee)}</span></div>`
    : '';

  const paymentRows = isPos && order.payment === 'tunai'
    ? `<div class="sum"><span>Tunai</span><span>${formatRupiah(order.cash)}</span></div>
       <div class="sum"><span>Kembalian</span><span>${formatRupiah(order.change)}</span></div>`
    : `<div class="sum"><span>Pembayaran</span><span>${order.payment === 'tunai' ? 'Tunai' : 'Transfer'}</span></div>`;

  return `
    <div class="rc">
      <span class="logo">SAEV${BRAND_E}</span>
      <p class="sub small">${BRAND_TAGLINE}</p>
      <hr>
      <div class="sum"><span>No.</span><b>${escapeHtml(order.code)}</b></div>
      <div class="sum"><span>Tanggal</span><span>${formatDateTime(order.createdAt)}</span></div>
      <div class="sum"><span>${isPos ? 'Kasir' : 'Pemesan'}</span><span>${escapeHtml(isPos ? order.cashier : order.name)}</span></div>
      <hr>
      ${itemRows}
      <hr>
      <div class="sum"><span>Subtotal</span><span>${formatRupiah(order.subtotal)}</span></div>
      ${order.discount ? `<div class="sum"><span>Diskon${order.voucher ? ' (' + escapeHtml(order.voucher) + ')' : ''}</span><span>−${formatRupiah(order.discount)}</span></div>` : ''}
      ${shippingRow}
      <div class="sum t"><span>TOTAL</span><span>${formatRupiah(order.total)}</span></div>
      ${paymentRows}
      ${order.verified ? '<div class="stamp">LUNAS</div>' : ''}
      <hr>
      <p class="sub small">Terima kasih telah memilih SAEVÉ.<br>${CARE_NOTE}</p>
      <p class="rc-contact">WhatsApp ${WA_CONTACTS.map((contact) => contact.display).join(' · ')}</p>
    </div>`;
}


/* =====================================================================
 * ADMIN
 * ===================================================================== */

const today = new Date();
const thirtyDaysAgo = new Date(today);
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

const admin = {
  tab: 'orders',          // orders | products | promos | reports
  orders: [],
  products: [],
  selectedCode: null,     // kode pesanan yang sedang dibuka (kosong = pesanan pertama)
  receiptCode: null,      // kode pesanan yang struknya sedang ditampilkan
  form: null,             // form produk yang sedang terbuka (tambah/edit); null = daftar produk
  photoQueue: [],         // foto yang dipilih tapi belum disimpan: { file, url }
  vouchers: [],           // daftar voucher (tab Promo)
  voucherForm: emptyVoucherForm(),   // isi form voucher; id null = voucher baru
  report: null,
  from: toDateInputValue(thirtyDaysAgo),
  to: toDateInputValue(today),
  channel: 'semua',
};

/* Pilihan pada dropdown status (urutan sesuai Figma). */
const ADMIN_STATUS_OPTIONS = [
  ['menunggu_bayar', 'Menunggu Pembayaran'],
  ['diproses', 'Diproses'],
  ['dikirim', 'Dikirim'],
  ['siap_ambil', 'Siap diambil'],
  ['selesai', 'Selesai'],
  ['dibatalkan', 'Dibatalkan'],
];

/* Perubahan status manual yang diizinkan server (sama dengan TRANSITIONS di StaffController). */
const STATUS_TRANSITIONS = {
  menunggu_ongkir: ['dibatalkan'],
  menunggu_bayar: ['dibatalkan'],
  tindak_lanjut: ['diproses', 'dibatalkan'],
  diproses: ['dikirim', 'siap_ambil', 'dibatalkan'],
  dikirim: ['selesai', 'dibatalkan'],
  siap_ambil: ['selesai', 'dibatalkan'],
};

/* Status tujuan yang boleh dipilih untuk pesanan ini ("Dikirim" hanya untuk kirim, "Siap diambil" hanya untuk ambil di toko). */
function allowedStatuses(order) {
  const isDelivery = order.delivery === 'kirim';
  return (STATUS_TRANSITIONS[order.status] || []).filter((status) =>
    !(status === 'dikirim' && !isDelivery) && !(status === 'siap_ambil' && isDelivery));
}

/* Status yang butuh tindakan admin (ditandai merah di daftar, dihitung di tab). */
const ACTION_STATUSES = ['menunggu_ongkir', 'tindak_lanjut'];

/* Jumlah pesanan yang butuh tindakan admin (ditampilkan di tab). */
function ordersNeedingAction() {
  return admin.orders.filter((order) => ACTION_STATUSES.includes(order.status)).length;
}

/* Pesanan yang sedang dibuka. Kalau belum ada yang dipilih, pakai pesanan pertama. */
const selectedOrder = () => admin.orders.find((order) => order.code === admin.selectedCode) || admin.orders[0];

function loadReport() {
  return staffApi(`report?from=${admin.from}&to=${admin.to}&channel=${admin.channel}`);
}

function updateOrder(order) {
  admin.orders = admin.orders.map((existing) => (existing.code === order.code ? order : existing));
  drawAdmin();
}

function drawAdmin() {
  const tabs = [
    ['orders', 'Pesanan'],
    ['products', 'Produk & stok'],
    ['promos', 'Promo'],
    ['reports', 'Laporan'],
  ];
  const needAction = ordersNeedingAction();

  const tabButtons = tabs.map(([key, label]) => `
    <button type="button" class="adm-tab ${admin.tab === key ? 'on' : ''}" data-a="tab" data-v="${key}">${label}${key === 'orders' && needAction ? ` (${needAction})` : ''}</button>
  `).join('');

  const content = admin.tab === 'orders'
    ? renderOrdersTab()
    : admin.tab === 'products'
      ? renderProductsTab()
      : admin.tab === 'promos'
        ? renderPromoTab()
        : renderReportTab();

  // Tab ada di bar sendiri di bawah header (#tabs di admin.blade.php)
  const tabBar = $('#tabs');
  if (tabBar) {
    tabBar.innerHTML = tabButtons;
    app.innerHTML = content;
  } else {
    app.innerHTML = `<div class="tabs">${tabButtons}</div>` + content;
  }
}


/* ---- Tab: Pesanan ---- */

/* "Rahul - Online" (dikirim) atau "Titut - Toko" (ambil di toko) */
function orderLabel(order) {
  return `${order.name} - ${order.delivery === 'kirim' ? 'Online' : 'Toko'}`;
}

function renderOrdersTab() {
  const selected = selectedOrder();

  const orderRows = admin.orders.map((order) => `
    <button type="button" class="orow ${selected && order.code === selected.code ? 'on' : ''}" data-a="select" data-v="${escapeHtml(order.code)}">
      <span class="orow-line">
        <span class="orow-code">${escapeHtml(order.code)}</span>
        <span class="orow-total">${formatRupiah(order.total)}</span>
      </span>
      <span class="orow-line">
        <span class="orow-name">${escapeHtml(orderLabel(order))}</span>
        <span class="orow-st ${ACTION_STATUSES.includes(order.status) ? 'act' : ''}">${STATUS_LABELS[order.status] || order.status}</span>
      </span>
    </button>
  `).join('') || '<p class="sub od-empty">Belum ada pesanan.</p>';

  return `
    <div class="split">
      <div class="lst">${orderRows}</div>
      <div>${selected ? renderOrderDetail(selected) : '<div class="od"><p class="sub">Belum ada pesanan.</p></div>'}</div>
    </div>`;
}

function renderOrderDetail(order) {
  const isDelivery = order.delivery === 'kirim';
  const isPending = ['menunggu_ongkir', 'menunggu_bayar', 'tindak_lanjut'].includes(order.status);
  const canSetShipping = isDelivery && !order.verified && ['menunggu_ongkir', 'menunggu_bayar'].includes(order.status);
  const canVerify = order.status === 'menunggu_bayar';
  const receiptShown = admin.receiptCode === order.code;

  const channelLabel = `${isDelivery ? 'Online' : 'Toko'} - ${order.payment === 'tunai' ? 'Tunai' : 'Transfer'}`;
  const address = isDelivery
    ? escapeHtml([order.address, order.city, order.postal].filter(Boolean).join(', '))
    : 'Ambil di toko';

  const itemRows = order.items.map((item) => `
    <div class="od-item">
      <div class="od-line"><span>${escapeHtml(item.productName)}</span><span>${formatRupiah(item.qty * item.unitPrice)}</span></div>
      <div class="od-var">${variantLabel(item.color, item.size)} x ${item.qty}${isPending && item.stock < item.qty ? ` <span class="od-warn">stok kurang (${item.stock})</span>` : ''}</div>
    </div>`).join('');

  const shippingRow = isDelivery
    ? `<div class="od-line"><span>Ongkir</span><span>${order.status === 'menunggu_ongkir' ? 'Belum ditetapkan' : formatRupiah(order.shippingFee)}</span></div>`
    : '';

  const shippingForm = canSetShipping
    ? `<div class="od-lbl">Ongkir (Rp)</div>
       <div class="od-ctl">
         <input id="ship" class="od-in" type="number" min="0" step="500" inputmode="numeric" value="${order.status === 'menunggu_ongkir' ? '' : order.shippingFee}">
         <button type="button" class="od-btn pri" data-a="ship">Tetapkan Ongkir</button>
       </div>`
    : '';

  const paymentRow = `
    <div class="od-ctl od-pay">
      <span class="od-paytxt">Pembayaran : ${order.verified ? 'Terverifikasi' : 'Belum Terverifikasi'}</span>
      ${canVerify ? '<button type="button" class="od-btn" data-a="verify">Tandai Verifikasi</button>' : '<span></span>'}
    </div>
    ${canVerify ? `<p class="od-hint">Cek mutasi rekening untuk ${formatRupiah(order.total)} dari ${escapeHtml(order.name)} sebelum memverifikasi.</p>` : ''}`;

  const followUp = order.status === 'tindak_lanjut'
    ? '<div class="al">Pembayaran masuk tetapi stok kurang. Tambah stok di tab Produk & stok, lalu ubah status ke Diproses.</div>'
    : '';

  // Status saat ini selalu ada di daftar, walau tidak termasuk pilihan Figma (mis. Menunggu ongkir)
  // Semua opsi Figma tetap tampil, tapi yang ditolak server dinonaktifkan
  const allowed = allowedStatuses(order);
  const knownStatus = ADMIN_STATUS_OPTIONS.some(([value]) => value === order.status);
  const statusOptions = (knownStatus ? [] : [[order.status, STATUS_LABELS[order.status] || order.status]])
    .concat(ADMIN_STATUS_OPTIONS)
    .map(([value, label]) => {
      const isCurrent = value === order.status;
      const usable = isCurrent || allowed.includes(value);
      return `<option value="${value}" ${isCurrent ? 'selected' : ''} ${usable ? '' : 'disabled'}>${label}</option>`;
    })
    .join('');

  return `
    <div class="od">
      <div class="od-head">
        <h2 class="od-code">${escapeHtml(order.code)}</h2>
        <span class="od-ch">${channelLabel}</span>
      </div>

      <div class="od-blk">
        <div class="od-k">Pelanggan</div>
        <div class="od-v">${escapeHtml(orderLabel(order))}</div>
        <div class="od-m">${escapeHtml(order.phone)} · ${formatDateTime(order.createdAt)}</div>
      </div>
      <div class="od-blk">
        <div class="od-k">Pengambilan</div>
        <div class="od-v">${address}</div>
      </div>

      <div class="od-items">${itemRows}</div>

      <div class="od-sums">
        <div class="od-line"><span>Subtotal</span><span>${formatRupiah(order.subtotal)}</span></div>
        ${order.discount ? `<div class="od-line"><span>Diskon${order.voucher ? ' (' + escapeHtml(order.voucher) + ')' : ''}</span><span>−${formatRupiah(order.discount)}</span></div>` : ''}
        ${shippingRow}
        <div class="od-line t"><span>Total</span><span>${formatRupiah(order.total)}</span></div>
      </div>

      ${shippingForm}
      ${paymentRow}
      ${followUp}

      <div class="od-lbl">Status</div>
      <div class="od-ctl">
        <select id="st" class="od-in od-sel" aria-label="Status pesanan" ${allowed.length ? '' : 'disabled'}>${statusOptions}</select>
        <button type="button" class="od-btn gray" id="st-go" data-a="status" disabled>Ubah Status</button>
      </div>

      <button type="button" class="od-link" data-a="receipt">${receiptShown ? 'Tutup struk' : 'Lihat struk'}</button>
    </div>
    ${receiptShown ? renderReceipt(order) + '<div class="acts"><button class="btn pri" data-a="print">Cetak struk</button></div>' : ''}`;
}


/* ---- Tab: Produk & stok ---- */
const PHOTO_LIMIT = 6;
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const UPLOAD_ICON = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M24 36V10M12 22L24 10l12 12M10 43h28"/></svg>';

/* Buang foto yang menunggu diunggah (sekaligus melepas memori pratinjaunya). */
function clearPhotoQueue() {
  admin.photoQueue.forEach((item) => URL.revokeObjectURL(item.url));
  admin.photoQueue = [];
}

/* Masukkan foto pilihan/seretan ke antrean setelah dicek format, ukuran, dan jumlahnya. */
function queuePhotos(files) {
  if (!admin.form) return;
  const product = admin.form.id !== null ? admin.products.find((p) => p.id === admin.form.id) : null;

  let room = PHOTO_LIMIT - (product ? (product.photos || []).length : 0) - admin.photoQueue.length;
  for (const file of files) {
    if (!PHOTO_TYPES.includes(file.type)) {
      showToast('Format foto harus JPG, PNG, atau WEBP', 2600);
      continue;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      showToast('Ukuran foto maksimal 5 MB', 2600);
      continue;
    }
    if (room <= 0) {
      showToast('Maksimal ' + PHOTO_LIMIT + ' foto per produk', 2600);
      break;
    }
    admin.photoQueue.push({ file, url: URL.createObjectURL(file) });
    room--;
  }
  drawAdmin();
}

function replaceProduct(updated) {
  admin.products = admin.products.map((product) => (product.id === updated.id ? updated : product));
}

/* ---- Form produk (dipakai untuk Tambah dan Edit) ---- */

/* Nilai awal form untuk produk baru. */
function newProductForm() {
  return {
    id: null,
    name: '',
    category: PRODUCT_CATEGORIES[0],
    price: '',
    weight: '',
    material: '',
    description: '',
    swatch: '#c9a8b8',
    variants: [{ color: '', size: '', stock: '' }],
    removed: [],   // id varian lama yang akan dihapus saat disimpan
  };
}

/* Isi form dari produk yang sudah ada (mode edit). */
function productToForm(product) {
  return {
    id: product.id,
    name: product.name || '',
    category: product.category,
    price: product.price ?? '',
    weight: product.weight ?? '',
    material: product.material ?? '',
    description: product.description ?? '',
    swatch: product.swatch || '#c9a8b8',
    variants: product.variants.map((variant) => ({
      id: variant.id,
      color: variant.color || '',
      size: variant.size || '',
      stock: variant.stock ?? 0,
    })),
    removed: [],
  };
}

function openProductForm(form) {
  clearPhotoQueue();
  admin.form = form;
  drawAdmin();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeProductForm() {
  clearPhotoQueue();
  admin.form = null;
  drawAdmin();
}

function renderProductForm() {
  const form = admin.form;
  const editing = form.id !== null;
  const product = editing ? admin.products.find((p) => p.id === form.id) : null;

  const categoryOptions = PRODUCT_CATEGORIES.map((category) => `
    <option value="${category}" ${category === form.category ? 'selected' : ''}>${categoryLabel(category)}</option>
  `).join('');

  const variantRows = form.variants.map((variant, index) => `
    <div class="pf-vrow">
      <input class="pf-in" type="text" placeholder="Warna" value="${escapeHtml(variant.color)}" data-vr="${index}" data-vf="color" aria-label="Warna varian ${index + 1}">
      <input class="pf-in" type="text" placeholder="Ukuran" value="${escapeHtml(variant.size)}" data-vr="${index}" data-vf="size" aria-label="Ukuran varian ${index + 1}">
      <input class="pf-in" type="number" min="0" placeholder="Jumlah" value="${escapeHtml(variant.stock)}" data-vr="${index}" data-vf="stock" aria-label="Jumlah stok varian ${index + 1}">
      ${form.variants.length > 1
        ? `<button type="button" class="pf-x" data-a="variant-del" data-v="${index}" aria-label="Hapus varian ${index + 1}" title="Hapus varian">×</button>`
        : '<span></span>'}
    </div>`).join('');

  const saved = (product ? product.photos || [] : []).map((photo) => `
    <div class="ph-item">
      <img src="${escapeHtml(photo.url)}" alt="">
      <button type="button" class="ph-x" data-a="photo-del" data-v="${photo.id}" aria-label="Hapus foto">×</button>
    </div>`).join('');

  const queued = admin.photoQueue.map((item, index) => `
    <div class="ph-item new">
      <img src="${item.url}" alt="">
      <button type="button" class="ph-x" data-a="photo-unq" data-v="${index}" aria-label="Batalkan foto ini">×</button>
    </div>`).join('');

  return `
    <section class="pf">
      <h1 class="pf-title">${editing ? 'Edit Produk' : 'Tambah Produk'}</h1>

      <label class="pf-f"><span class="pf-lbl">Nama</span>
        <input class="pf-in" type="text" value="${escapeHtml(form.name)}" data-f="name"></label>

      <div class="pf-row">
        <label class="pf-f"><span class="pf-lbl">Kategori</span>
          <select class="pf-in pf-sel" data-f="category">${categoryOptions}</select></label>
        <label class="pf-f"><span class="pf-lbl">Harga (Rp)</span>
          <input class="pf-in" type="number" min="0" step="500" value="${escapeHtml(form.price)}" data-f="price"></label>
      </div>

      <div class="pf-row">
        <label class="pf-f"><span class="pf-lbl">Bahan</span>
          <input class="pf-in" type="text" value="${escapeHtml(form.material)}" data-f="material"></label>
        <label class="pf-f"><span class="pf-lbl">Berat (gram)</span>
          <input class="pf-in" type="number" min="1" step="1" placeholder="Contoh: 25" value="${escapeHtml(form.weight)}" data-f="weight">
          <span class="pf-note">Berat per barang, dipakai untuk menghitung ongkir.</span></label>
      </div>

      <label class="pf-f"><span class="pf-lbl">Deskripsi singkat</span>
        <textarea class="pf-in" rows="5" data-f="description">${escapeHtml(form.description)}</textarea></label>

      <div class="pf-f">
        <span class="pf-lbl">Varian</span>
        ${variantRows}
        <button type="button" class="pc-link on pf-add" data-a="variant-add">Tambah Varian</button>
      </div>

      <div class="pf-f">
        <span class="pf-lbl">Foto produk</span>
        ${saved || queued ? `<div class="ph-list">${saved}${queued}</div>` : ''}
        <label class="dz">
          ${UPLOAD_ICON}
          <span class="dz-t">Seret foto ke sini atau pilih dari perangkat</span>
          <span class="dz-s">JPG, PNG, WEBP · maks. 5 MB per foto · hingga ${PHOTO_LIMIT} foto</span>
          <input type="file" id="pfile" accept="image/jpeg,image/png,image/webp" multiple>
        </label>
        <p class="pf-hint">Produk bisa disimpan tanpa foto. Pelanggan akan melihat placeholder sampai foto ditambahkan</p>
      </div>

      <div class="pf-acts">
        <button type="button" class="btn-dark" data-a="save-product">${editing ? 'Simpan Perubahan' : 'Simpan Produk'}</button>
        <button type="button" class="pc-link on" data-a="form-cancel">Batal</button>
      </div>
    </section>`;
}

function renderProductCard(product) {
  const cover = (product.photos || [])[0];
  const weight = product.weight ? ` · ${product.weight} g` : '';

  const variantRows = product.variants.map((variant) => `
    <div class="pc-var">
      <span>${variantLabel(variant.color, variant.size)}</span>
      <label class="pc-stok">Stok
        <input type="number" min="0" value="${variant.stock}" data-a="stock" data-v="${variant.id}" aria-label="Stok ${variantLabel(variant.color, variant.size)}">
      </label>
    </div>`).join('');

  return `
    <section class="pc">
      <div class="pc-head">
        <div class="pc-thumb">${cover ? `<img src="${escapeHtml(cover.url)}" alt="">` : ''}</div>
        <div class="pc-info">
          <h2 class="pc-name">${escapeHtml(product.name)}</h2>
          <div class="pc-cat">${categoryLabel(product.category)}${weight}</div>
          <div class="pc-acts">
            <button type="button" class="pc-link" data-a="edit-product" data-v="${product.id}">Edit</button>
            <button type="button" class="pc-link del" data-a="delete-product" data-v="${product.id}">Hapus</button>
          </div>
        </div>
        <div class="pc-price">${formatRupiahCard(product.price)}</div>
      </div>
      <div class="pc-vars">${variantRows}</div>
    </section>`;
}

function renderProductsTab() {
  if (admin.form) return renderProductForm();

  const cards = admin.products.map(renderProductCard).join('') || '<p class="sub">Belum ada produk.</p>';

  return `
    <h1 class="pg-title">Produk &amp; Stok</h1>
    ${cards}
    <button type="button" class="btn-dark" data-a="add-product">Tambah Produk</button>`;
}


/* ---- Tab: Promo & voucher ---- */
const VOUCHER_STATE = {
  aktif: 'Aktif',
  nonaktif: 'Nonaktif',
  kedaluwarsa: 'Kedaluwarsa',
  belum_mulai: 'Belum mulai',
  habis: 'Habis',
};
const VOUCHER_CHANNEL = { semua: 'Semua', online: 'Online', offline: 'Offline' };

function emptyVoucherForm() {
  return {
    id: null,
    code: '',
    type: 'nominal',
    value: '',
    min_spend: '0',
    channel: 'semua',
    starts_at: '',
    ends_at: '',
    usage_limit: '',
    is_active: true,
  };
}

function voucherToForm(voucher) {
  return {
    id: voucher.id,
    code: voucher.code,
    type: voucher.type,
    value: voucher.value,
    min_spend: voucher.minSpend,
    channel: voucher.channel,
    starts_at: voucher.startsAt || '',
    ends_at: voucher.endsAt || '',
    usage_limit: voucher.usageLimit ?? '',
    is_active: voucher.active,
  };
}

/* "2026-11-30" -> "30 Nov 2026" */
function formatDay(value) {
  return new Date(value + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function voucherCut(voucher) {
  return voucher.type === 'persen' ? `${voucher.value}%` : formatRupiah(voucher.value);
}

function voucherPeriod(voucher) {
  if (voucher.startsAt && voucher.endsAt) return `${formatDay(voucher.startsAt)} – ${formatDay(voucher.endsAt)}`;
  if (voucher.endsAt) return `s/d ${formatDay(voucher.endsAt)}`;
  if (voucher.startsAt) return `mulai ${formatDay(voucher.startsAt)}`;
  return '';
}

function renderPromoTab() {
  const form = admin.voucherForm;
  const editing = form.id !== null;

  const rows = admin.vouchers.map((voucher) => {
    const period = voucherPeriod(voucher);
    return `
      <tr class="${editing && form.id === voucher.id ? 'on' : ''}">
        <td class="pm-code">${escapeHtml(voucher.code)}</td>
        <td>${voucherCut(voucher)}${voucher.minSpend ? `<small>min. ${formatRupiah(voucher.minSpend)}</small>` : ''}</td>
        <td>${VOUCHER_CHANNEL[voucher.channel] || voucher.channel}</td>
        <td>${voucher.used}${voucher.usageLimit !== null ? ` / ${voucher.usageLimit}` : ''}</td>
        <td><span class="pm-st ${voucher.state}">${VOUCHER_STATE[voucher.state] || voucher.state}</span>${period ? `<small>${period}</small>` : ''}</td>
        <td class="pm-acts">
          <button type="button" class="pm-link" data-a="promo-edit" data-v="${voucher.id}">Ubah</button>
          <button type="button" class="pm-link" data-a="promo-toggle" data-v="${voucher.id}">${voucher.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
          ${voucher.used === 0 ? `<button type="button" class="pm-link del" data-a="promo-delete" data-v="${voucher.id}">Hapus</button>` : ''}
        </td>
      </tr>`;
  }).join('') || '<tr><td colspan="6">Belum ada voucher.</td></tr>';

  const option = (value, label, current) => `<option value="${value}" ${current === value ? 'selected' : ''}>${label}</option>`;
  const isPercent = form.type === 'persen';

  return `
    <h1 class="pg-title">Promo &amp; voucher</h1>
    <div class="pm">
      <div class="tw pm-list">
        <table class="pm-tbl">
          <tr><th>Kode</th><th>Potongan</th><th>Kanal</th><th>Pemakaian</th><th>Status</th><th></th></tr>
          ${rows}
        </table>
      </div>

      <div class="pm-frame">
        <i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i>
        <div class="pm-form">
          <h2 class="pm-title">${editing ? 'Ubah voucher' : 'Voucher baru'}</h2>

          <label class="pm-f"><span class="pf-lbl">Kode</span>
            <input class="pm-in pm-up" type="text" maxlength="30" autocomplete="off" value="${escapeHtml(form.code)}" data-pf="code"></label>

          <div class="pm-row">
            <label class="pm-f"><span class="pf-lbl">Jenis</span>
              <select class="pm-in pf-sel" data-pf="type">
                ${option('nominal', 'Nominal (Rp)', form.type)}
                ${option('persen', 'Persen (%)', form.type)}
              </select></label>
            <label class="pm-f"><span class="pf-lbl">Nilai</span>
              <input class="pm-in" type="number" min="1" ${isPercent ? 'max="100"' : ''} placeholder="${isPercent ? 'Contoh: 20' : 'Contoh: 25000'}" value="${escapeHtml(form.value)}" data-pf="value"></label>
          </div>

          <div class="pm-row">
            <label class="pm-f"><span class="pf-lbl">Minimum belanja</span>
              <input class="pm-in" type="number" min="0" value="${escapeHtml(form.min_spend)}" data-pf="min_spend"></label>
            <label class="pm-f"><span class="pf-lbl">Kanal</span>
              <select class="pm-in pf-sel" data-pf="channel">
                ${option('semua', 'Semua', form.channel)}
                ${option('online', 'Online', form.channel)}
                ${option('offline', 'Offline', form.channel)}
              </select></label>
          </div>

          <div class="pm-row">
            <label class="pm-f"><span class="pf-lbl">Berlaku dari</span>
              <input class="pm-in" type="date" value="${escapeHtml(form.starts_at)}" data-pf="starts_at"></label>
            <label class="pm-f"><span class="pf-lbl">Sampai</span>
              <input class="pm-in" type="date" value="${escapeHtml(form.ends_at)}" data-pf="ends_at"></label>
          </div>

          <label class="pm-f"><span class="pf-lbl">Batas pemakaian (kosongkan jika tanpa batas)</span>
            <input class="pm-in" type="number" min="1" value="${escapeHtml(form.usage_limit)}" data-pf="usage_limit"></label>

          <label class="pm-chk"><input type="checkbox" ${form.is_active ? 'checked' : ''} data-pf="is_active"> Aktif</label>

          <div class="pm-btns">
            <button type="button" class="btn-dark" data-a="promo-save">${editing ? 'Simpan Perubahan' : 'Simpan Voucher'}</button>
            ${editing ? '<button type="button" class="pc-link on" data-a="promo-cancel">Batal</button>' : ''}
          </div>
        </div>
      </div>
    </div>`;
}


/* ---- Tab: Laporan ---- */
function renderReportTab() {
  const report = admin.report;

  const channelOptions = [
    ['semua', 'Semua'],
    ['online', 'Online'],
    ['offline', 'Offline'],
  ].map(([value, label]) => `
    <option value="${value}" ${admin.channel === value ? 'selected' : ''}>${label}</option>
  `).join('');

  /* Filter baru dipakai setelah tombol "Terapkan" ditekan. */
  const filterBar = `
    <h1 class="pg-title">Laporan penjualan</h1>
    <div class="rp-filter">
      <label class="rp-fl"><span class="pf-lbl">Dari</span>
        <input class="rp-in" type="date" id="rf" value="${admin.from}"></label>
      <label class="rp-fl"><span class="pf-lbl">Sampai</span>
        <input class="rp-in" type="date" id="rt" value="${admin.to}"></label>
      <label class="rp-fl"><span class="pf-lbl">Kanal</span>
        <select class="rp-in pf-sel" id="rch">${channelOptions}</select></label>
      <button type="button" class="btn-dark rp-apply" data-a="report">Terapkan</button>
    </div>`;

  if (!report) return filterBar + '<p class="sub">Memuat laporan…</p>';

  const card = (label, value, note = '') => `
    <div class="stat"><span class="stat-l">${label}</span><b>${value}</b>${note ? `<small>${note}</small>` : ''}</div>`;

  const topRows = report.top.map((row, index) => `
    <tr><td>${index + 1}</td><td>${escapeHtml(row.name)}</td><td>${row.qty}</td><td>${formatRupiah(row.revenue)}</td></tr>
  `).join('') || '<tr><td colspan="4">Belum ada data.</td></tr>';

  const orderRows = report.orders.map((order) => `
    <tr>
      <td>${escapeHtml(order.code)}</td>
      <td>${formatDateTime(order.createdAt)}</td>
      <td>${escapeHtml(order.channel)}</td>
      <td>${escapeHtml(order.customer || '-')}</td>
      <td>${statusBadge(order.status)}</td>
      <td>${formatRupiah(order.total)}</td>
    </tr>
  `).join('') || '<tr><td colspan="6">Belum ada transaksi pada periode ini.</td></tr>';

  return filterBar + `
    <div class="rp-stats">
      ${card('Omzet', formatRupiah(report.revenue))}
      ${card('Pesanan', report.count)}
      ${card('Online', formatRupiah(report.online.revenue), report.online.count + ' pesanan')}
      ${card('Offline', formatRupiah(report.offline.revenue), report.offline.count + ' pesanan')}
      ${card('Item terjual', report.items)}
    </div>

    <h2 class="l">Produk terlaris</h2>
    <div class="tw">
      <table>
        <tr><th>No.</th><th>Produk</th><th>Terjual</th><th>Pendapatan</th></tr>
        ${topRows}
      </table>
    </div>

    <h2 class="l">Transaksi</h2>
    <div class="tw">
      <table class="rp-tbl">
        <tr><th>Kode</th><th>Tanggal</th><th>Kanal</th><th>Pelanggan</th><th>Status</th><th>Total</th></tr>
        ${orderRows}
      </table>
    </div>`;
}


/* ---- Aksi Admin (nilai data-a pada tombol) ---- */
const adminActions = {
  async tab(el) {
    admin.tab = el.dataset.v;
    clearPhotoQueue();
    admin.form = null;
    if (admin.tab === 'products') admin.products = await staffApi('products');
    if (admin.tab === 'promos') {
      admin.vouchers = await staffApi('vouchers');
      admin.voucherForm = emptyVoucherForm();
    }
    if (admin.tab === 'orders') admin.orders = await staffApi('orders');
    if (admin.tab === 'reports' && !admin.report) admin.report = await loadReport();
    drawAdmin();
  },

  select(el) {
    admin.selectedCode = el.dataset.v;
    admin.receiptCode = null;
    drawAdmin();
  },

  receipt() {
    const order = selectedOrder();
    admin.receiptCode = admin.receiptCode === order.code ? null : order.code;
    drawAdmin();
  },

  print() {
    printReceipt();
  },

  async ship() {
    const order = selectedOrder();
    const fee = $('#ship').value;
    if (fee === '') return showToast('Isi ongkir dulu', 2400);
    updateOrder(await staffApi(`orders/${order.id}/shipping`, 'POST', { fee: +fee }));
    showToast('Ongkir disimpan', 2400);
  },

  async verify() {
    const order = selectedOrder();
    updateOrder(await staffApi(`orders/${order.id}/verify`, 'POST'));
    showToast('Pembayaran diverifikasi', 2400);
  },

  /* Ubah status lewat dropdown. Tombolnya baru aktif kalau pilihan berbeda dari status sekarang. */
  async status() {
    const order = selectedOrder();
    const status = $('#st').value;
    if (status === order.status) return;

    if (status === 'dibatalkan' && !confirm('Batalkan pesanan ' + order.code + '? Stok akan dikembalikan bila sudah dikurangi.')) return;

    updateOrder(await staffApi(`orders/${order.id}/status`, 'POST', { status }));
    showToast('Status diperbarui', 2400);
  },

  /* ---- Foto produk ---- */
  'photo-unq'(el) {
    const [removed] = admin.photoQueue.splice(+el.dataset.v, 1);
    if (removed) URL.revokeObjectURL(removed.url);
    drawAdmin();
  },

  async 'photo-del'(el) {
    if (!confirm('Hapus foto ini?')) return;
    replaceProduct(await staffApi(`photos/${el.dataset.v}`, 'DELETE'));
    drawAdmin();
    showToast('Foto dihapus', 2400);
  },

  /* ---- Form produk: tambah & edit ---- */
  'add-product'() {
    openProductForm(newProductForm());
  },

  'edit-product'(el) {
    const product = admin.products.find((p) => p.id === +el.dataset.v);
    if (product) openProductForm(productToForm(product));
  },

  /* ---- Promo & voucher ---- */
  'promo-edit'(el) {
    const voucher = admin.vouchers.find((v) => v.id === +el.dataset.v);
    if (!voucher) return;
    admin.voucherForm = voucherToForm(voucher);
    drawAdmin();
    const form = document.querySelector('.pm-frame');
    if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  'promo-cancel'() {
    admin.voucherForm = emptyVoucherForm();
    drawAdmin();
  },

  async 'promo-save'(el) {
    const f = admin.voucherForm;
    const code = f.code.trim().toUpperCase();
    const value = Number(f.value);

    if (!code) return showToast('Isi kode voucher', 2400);
    if (!(value > 0)) return showToast('Isi nilai potongan', 2400);
    if (f.type === 'persen' && value > 100) return showToast('Potongan persen maksimal 100', 2600);
    if (f.starts_at && f.ends_at && f.ends_at < f.starts_at) return showToast('Tanggal "Sampai" tidak boleh sebelum "Berlaku dari"', 2800);

    const payload = {
      code,
      type: f.type,
      value: Math.round(value),
      min_spend: Math.round(Number(f.min_spend) || 0),
      channel: f.channel,
      starts_at: f.starts_at || null,
      ends_at: f.ends_at || null,
      usage_limit: String(f.usage_limit).trim() === '' ? null : Math.round(Number(f.usage_limit)),
      is_active: !!f.is_active,
    };

    const editing = f.id !== null;
    el.disabled = true;
    try {
      if (editing) await staffApi(`vouchers/${f.id}`, 'PUT', payload);
      else await staffApi('vouchers', 'POST', payload);

      admin.vouchers = await staffApi('vouchers');
      admin.voucherForm = emptyVoucherForm();
      drawAdmin();
      showToast(editing ? 'Voucher diperbarui' : 'Voucher disimpan', 2400);
    } finally {
      el.disabled = false;
    }
  },

  async 'promo-toggle'(el) {
    const updated = await staffApi(`vouchers/${el.dataset.v}/toggle`, 'POST');
    admin.vouchers = await staffApi('vouchers');
    drawAdmin();
    showToast(updated.active ? 'Voucher diaktifkan' : 'Voucher dinonaktifkan', 2400);
  },

  async 'promo-delete'(el) {
    const voucher = admin.vouchers.find((v) => v.id === +el.dataset.v);
    if (!voucher) return;
    if (!confirm('Hapus voucher ' + voucher.code + ' secara permanen?')) return;

    await staffApi(`vouchers/${voucher.id}`, 'DELETE');
    if (admin.voucherForm.id === voucher.id) admin.voucherForm = emptyVoucherForm();
    admin.vouchers = await staffApi('vouchers');
    drawAdmin();
    showToast('Voucher dihapus', 2400);
  },

  async 'delete-product'(el) {
    const product = admin.products.find((p) => p.id === +el.dataset.v);
    if (!product) return;
    if (!confirm('Hapus produk "' + product.name + '" beserta semua varian dan fotonya secara permanen? Tindakan ini tidak bisa dibatalkan.')) return;

    await staffApi(`products/${product.id}`, 'DELETE');
    admin.products = await staffApi('products');
    drawAdmin();
    showToast('Produk dihapus', 2400);
  },

  'form-cancel'() {
    closeProductForm();
  },

  'variant-add'() {
    admin.form.variants.push({ color: '', size: '', stock: '' });
    drawAdmin();
  },

  'variant-del'(el) {
    const [removed] = admin.form.variants.splice(+el.dataset.v, 1);
    // Varian yang sudah tersimpan baru benar-benar dihapus dari database saat form disimpan
    if (removed && removed.id) admin.form.removed.push(removed.id);
    drawAdmin();
  },

  async 'save-product'(el) {
    const form = admin.form;
    if (!form) return;

    const price = Number(form.price);
    const weight = Number(form.weight);
    if (!form.name.trim()) return showToast('Nama produk wajib diisi', 2400);
    if (!(price > 0)) return showToast('Isi harga produk', 2400);
    if (!(weight > 0)) return showToast('Isi berat produk (gram) untuk hitung ongkir', 2600);

    /* Baris varian baru yang kosong total dilewati; baris lain harus punya warna dan jumlah. */
    const rows = form.variants.filter((v) => v.id || v.color.trim() || String(v.size).trim() || String(v.stock) !== '');
    if (!rows.length) return showToast('Tambahkan minimal satu varian', 2400);
    for (const row of rows) {
      if (!row.color.trim()) return showToast('Warna varian wajib diisi', 2400);
      if (String(row.stock) === '' || Number(row.stock) < 0) return showToast('Isi jumlah stok tiap varian', 2400);
    }

    if (form.removed.length && !confirm('Hapus ' + form.removed.length + ' varian secara permanen dari database? Tindakan ini tidak bisa dibatalkan.')) return;

    const payload = {
      name: form.name.trim(),
      category: form.category,
      price,
      weight: Math.round(weight),
      material: form.material,
      description: form.description,
      swatch: form.swatch,
      variants: rows.map((v) => ({
        ...(v.id ? { id: v.id } : {}),
        color: v.color.trim(),
        size: String(v.size).trim() || null,
        stock: Math.round(Number(v.stock)),
      })),
      deleted_variants: form.removed,
    };

    /* Kalau daftar produk dari server belum memuat bahan/deskripsi, jangan menimpanya dengan kosong. */
    const original = form.id !== null ? admin.products.find((p) => p.id === form.id) : null;
    if (original) {
      ['material', 'description', 'swatch'].forEach((key) => {
        if (!(key in original) && payload[key] === '') delete payload[key];
      });
    }

    el.disabled = true;
    try {
      const result = form.id !== null
        ? await staffApi(`products/${form.id}`, 'PUT', payload)
        : await staffApi('products', 'POST', payload);

      let productId = form.id ?? result?.id ?? result?.product?.id ?? result?.data?.id ?? null;

      if (admin.photoQueue.length) {
        if (productId === null) {
          /* Server tidak mengembalikan id: ambil produk terbaru dengan nama yang sama. */
          const list = await staffApi('products');
          const match = list.filter((p) => p.name === payload.name).sort((a, b) => b.id - a.id)[0];
          productId = match ? match.id : null;
        }

        if (productId !== null) {
          const formData = new FormData();
          admin.photoQueue.forEach((item) => formData.append('photos[]', item.file));
          try {
            await staffUpload(`products/${productId}/photos`, formData);
          } catch (error) {
            /* Produk sudah tersimpan; buka lagi mode edit supaya foto bisa dicoba ulang. */
            admin.products = await staffApi('products');
            const saved = admin.products.find((p) => p.id === productId);
            if (saved) admin.form = productToForm(saved);
            drawAdmin();
            throw new Error('Produk tersimpan, tetapi foto gagal diunggah. ' + error.message);
          }
        }
      }

      const wasEditing = form.id !== null;
      clearPhotoQueue();
      admin.form = null;
      admin.products = await staffApi('products');
      drawAdmin();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      showToast(wasEditing ? 'Produk diperbarui' : 'Produk disimpan', 2400);
    } finally {
      el.disabled = false;
    }
  },

  async report() {
    const from = $('#rf').value;
    const to = $('#rt').value;
    if (!from || !to) return showToast('Isi tanggal "Dari" dan "Sampai" dulu', 2600);
    if (from > to) return showToast('Tanggal "Dari" tidak boleh setelah "Sampai"', 2600);

    admin.from = from;
    admin.to = to;
    admin.channel = $('#rch').value;
    admin.report = await loadReport();
    drawAdmin();
  },

};


/* =====================================================================
 * KASIR (POS)
 * ===================================================================== */

const pos = {
  products: [],
  query: '',
  bill: [],       // item yang sedang dibayar: { variantId, name, color, size, price, qty, max }
  receipt: null,  // struk transaksi yang baru selesai
  voucher: null,  // voucher yang dipakai: { code, type, value, minSpend }
  busy: false,    // true selama pembayaran diproses (pembaruan stok otomatis ditunda)
  panelVisible: false, // panel transaksi sedang terlihat di layar (dipakai untuk menyembunyikan bar bawah)
};

const POS_REFRESH_MS = 45000; // stok diambil ulang dari server tiap 45 detik

function drawPos() {
  // Setelah bayar: tampilkan struk
  if (pos.receipt) {
    app.innerHTML = `
      <div class="receipt-wrap">
        <div class="hd">
          <div class="eb">Transaksi selesai</div>
          <h1>${escapeHtml(pos.receipt.code)}</h1>
          <div class="rule"></div>
        </div>
        ${renderReceipt(pos.receipt)}
        <div class="acts">
          <button class="btn" data-a="print">Cetak struk</button>
          <button class="btn pri" data-a="new">Transaksi baru</button>
        </div>
      </div>`;
    return;
  }

  app.innerHTML = `
    <h1 class="l">Kasir</h1>
    <div class="pos">
      <div>
        <input id="q" class="srch" placeholder="Cari produk atau kategori" value="${escapeHtml(pos.query)}">
        <div id="res"></div>
      </div>
      <aside class="box" id="bill-panel">
        <div class="pos-head">
          <h2 class="l">Transaksi</h2>
          <button type="button" class="pos-more" data-a="to-products">+ Tambah barang</button>
        </div>
        <div id="bill"></div>
        <div id="vcbox"></div>
        <div class="fl">Pembayaran
          <select id="pay">
            <option value="tunai">Tunai</option>
            <option value="transfer">Transfer</option>
          </select>
        </div>
        <div class="fl" id="cashw">Uang diterima (Rp)<input id="cash" type="number" min="0"></div>
        <div class="sum"><span>Kembalian</span><b id="chg">-</b></div>
        <button class="btn pri block" id="go" data-a="pay">BAYAR</button>
      </aside>
    </div>

    <div class="pos-bar" id="pos-bar" hidden>
      <span id="pos-bar-info"></span>
      <button type="button" class="pos-bar-btn" data-a="to-bill">Lihat transaksi</button>
    </div>`;

  renderPosResults();
  renderVoucherBox();
  renderBill();
  watchPosPanel();
}

/* Daftar produk di sisi kiri, sudah terfilter oleh kotak pencarian.
 * Angka di tiap varian = sisa stok setelah dikurangi yang sudah ada di transaksi.
 * Varian yang sisanya 0 jadi abu-abu dan tidak bisa diketuk. */
function renderPosResults() {
  const query = pos.query.toLowerCase();
  const inBill = new Map(pos.bill.map((item) => [String(item.variantId), item.qty]));
  const matches = pos.products.filter(
    (product) => !query || product.name.toLowerCase().includes(query) || product.category.includes(query)
  );

  $('#res').innerHTML = matches.map((product) => `
    <div class="pr">
      <div class="sum"><b>${escapeHtml(product.name)}</b><span>${formatRupiah(product.price)}</span></div>
      ${product.variants.map((variant) => {
        const left = variant.stock - (inBill.get(String(variant.id)) || 0);
        const hint = variant.stock ? 'Semua stok sudah ada di transaksi' : 'Stok habis';
        return `<button class="vb" data-a="add" data-p="${product.id}" data-v="${variant.id}" ${left > 0 ? '' : `disabled title="${hint}"`}>${variantLabel(variant.color, variant.size)} · ${variant.stock ? left : 'habis'}</button>`;
      }).join('')}
    </div>
  `).join('') || '<p class="sub">Produk tidak ditemukan.</p>';
}

/* Daftar item transaksi, total, kembalian, dan status tombol BAYAR. */
/* ---- Voucher di kasir ---- */

/* Potongan untuk subtotal tertentu; 0 kalau belum ada voucher atau minimum belanja belum terpenuhi. */
function posDiscount(subtotal) {
  const voucher = pos.voucher;
  if (!voucher || subtotal < voucher.minSpend) return 0;
  const cut = voucher.type === 'persen' ? Math.floor((subtotal * voucher.value) / 100) : voucher.value;
  return Math.max(0, Math.min(cut, subtotal));
}

function renderVoucherBox() {
  const box = $('#vcbox');
  if (!box) return;

  box.innerHTML = pos.voucher
    ? `<div class="pos-vc on">
         <span>Voucher <b>${escapeHtml(pos.voucher.code)}</b> · ${pos.voucher.type === 'persen' ? pos.voucher.value + '%' : formatRupiah(pos.voucher.value)}</span>
         <button type="button" class="pm-link del" data-a="vc-remove">Lepas</button>
       </div>`
    : `<div class="fl">Voucher
         <div class="pos-vc">
           <input id="vc" class="pf-up" type="text" maxlength="30" autocomplete="off" placeholder="Kode voucher">
           <button type="button" class="btn" data-a="vc-apply">Pakai</button>
         </div>
       </div>`;
}

function renderBill() {
  const subtotal = pos.bill.reduce((sum, item) => sum + item.price * item.qty, 0);
  const discount = posDiscount(subtotal);
  const total = subtotal - discount;
  const payment = $('#pay').value;
  const cash = +$('#cash').value || 0;

  const rows = pos.bill.map((item, index) => `
    <div class="sum">
      <span>${escapeHtml(item.name)}<br><small>${variantLabel(item.color, item.size)} · ${formatRupiah(item.price)}</small></span>
      <span class="qty">
        <button data-a="qty" data-x="${index}" data-d="-1">−</button>${item.qty}<button data-a="qty" data-x="${index}" data-d="1">+</button>
      </span>
    </div>
  `).join('') || '<p class="sub">Belum ada item. Pilih varian di sebelah kiri.</p>';

  let voucherRows = '';
  if (pos.voucher && discount) {
    voucherRows = `<div class="sum"><span>Subtotal</span><span>${formatRupiah(subtotal)}</span></div>
      <div class="sum"><span>Diskon (${escapeHtml(pos.voucher.code)})</span><span>−${formatRupiah(discount)}</span></div>`;
  } else if (pos.voucher && subtotal) {
    voucherRows = `<p class="sub small">Voucher ${escapeHtml(pos.voucher.code)} butuh minimal belanja ${formatRupiah(pos.voucher.minSpend)}.</p>`;
  }

  $('#bill').innerHTML = rows + voucherRows + `<div class="sum t"><span>Total</span><span>${formatRupiah(total)}</span></div>`;

  const isCash = payment === 'tunai';
  $('#cashw').style.display = isCash ? '' : 'none';
  $('#chg').textContent = isCash && total && cash >= total ? formatRupiah(cash - total) : '-';
  $('#go').disabled = !(pos.bill.length && (!isCash || cash >= total));

  updatePosBar();
}

/* Tampilkan ulang daftar produk (sisa stok) dan transaksi sekaligus. */
function renderPosAll() {
  renderPosResults();
  renderBill();
}


/* ---- Layar sempit: bar ringkasan di bawah layar ---- */

/* Bar berisi jumlah item + total. Tersembunyi kalau transaksi kosong atau panel transaksi sudah terlihat. */
function updatePosBar() {
  const bar = $('#pos-bar');
  if (!bar) return;

  const count = pos.bill.reduce((sum, item) => sum + item.qty, 0);
  const total = pos.bill.reduce((sum, item) => sum + item.price * item.qty, 0);
  $('#pos-bar-info').textContent = `${count} item · ${formatRupiah(total)}`;
  bar.hidden = !count || pos.panelVisible;
}

/* Pantau apakah panel transaksi sedang terlihat, supaya bar bawah tidak menutupi tombol BAYAR. */
let posPanelObserver = null;
function watchPosPanel() {
  if (posPanelObserver) posPanelObserver.disconnect();
  pos.panelVisible = false;
  if (!('IntersectionObserver' in window)) return;

  posPanelObserver = new IntersectionObserver((entries) => {
    pos.panelVisible = entries[0].isIntersecting;
    updatePosBar();
  }, { threshold: 0.25 });
  posPanelObserver.observe($('#bill-panel'));
}

function isNarrowScreen() {
  return Boolean(window.matchMedia && window.matchMedia('(max-width: 860px)').matches);
}

/* Notifikasi kecil saat barang ditambahkan. Timer lama dibatalkan supaya ketukan beruntun tidak saling memotong. */
let posToastTimer = null;
function posToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('on');
  clearTimeout(posToastTimer);
  posToastTimer = setTimeout(() => toast.classList.remove('on'), 1600);
}


/* ---- Stok otomatis mengikuti server ---- */

/* Samakan item di transaksi dengan stok terbaru. Kalau stoknya jadi kurang, jumlahnya dikurangi dan kasir diberi tahu. */
function syncBillWithStock() {
  const stockById = new Map();
  pos.products.forEach((product) => product.variants.forEach((variant) => stockById.set(String(variant.id), variant.stock)));

  const adjusted = [];
  pos.bill = pos.bill.filter((item) => {
    const stock = stockById.get(String(item.variantId)) ?? 0;
    item.max = stock;
    if (item.qty > stock) {
      adjusted.push(item.name);
      item.qty = stock;
    }
    return item.qty > 0;
  });

  if (adjusted.length) showToast('Stok berubah, jumlah disesuaikan: ' + adjusted.join(', '), 3500);
}

/* Ambil stok terbaru (berkala dan saat tab kasir dibuka lagi). Gagal/offline: diam saja, coba lagi nanti. */
async function refreshPosStock() {
  if (pos.receipt || pos.busy || !$('#res')) return;

  let fresh;
  try {
    fresh = await staffApi('products');
  } catch (error) {
    return;
  }
  if (pos.receipt || pos.busy || !$('#res')) return; // keadaan berubah selama menunggu

  pos.products = fresh;
  syncBillWithStock();
  renderPosAll();
}


/* ---- Aksi Kasir (nilai data-a pada tombol) ---- */
const posActions = {
  print() {
    printReceipt();
  },

  new() {
    pos.receipt = null;
    drawPos();
  },

  add(el) {
    const product = pos.products.find((p) => p.id == el.dataset.p);
    const variant = product.variants.find((v) => v.id == el.dataset.v);
    const existing = pos.bill.find((item) => item.variantId == variant.id);

    if ((existing ? existing.qty : 0) + 1 > variant.stock) return showToast('Stok tidak cukup', 2400);

    if (existing) {
      existing.qty++;
    } else {
      pos.bill.push({
        variantId: variant.id,
        name: product.name,
        color: variant.color,
        size: variant.size,
        price: product.price,
        qty: 1,
        max: variant.stock,
      });
    }
    renderPosAll();

    // Di layar sempit panel transaksi ada di bawah, jadi beri tanda bahwa barangnya masuk
    if (isNarrowScreen()) posToast(`Ditambahkan: ${product.name} · ${variant.color}${variant.size ? ' · ' + variant.size : ''}`);
  },

  qty(el) {
    const index = +el.dataset.x;
    const item = pos.bill[index];
    const newQty = item.qty + +el.dataset.d;

    if (newQty > item.max) return showToast('Stok tidak cukup', 2400);

    if (newQty < 1) pos.bill.splice(index, 1);
    else item.qty = newQty;
    renderPosAll();
  },

  /* Layar sempit: lompat ke panel transaksi / kembali ke daftar produk */
  'to-bill'() {
    $('#bill-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  'to-products'() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  async 'vc-apply'() {
    const code = $('#vc').value.trim();
    if (!code) return showToast('Isi kode voucher', 2400);

    pos.voucher = await staffApi('pos/voucher', 'POST', { code });
    renderVoucherBox();
    renderBill();
    showToast('Voucher ' + pos.voucher.code + ' dipakai', 2200);
  },

  'vc-remove'() {
    pos.voucher = null;
    renderVoucherBox();
    renderBill();
  },

  async pay() {
    const payment = $('#pay').value;
    pos.busy = true;
    try {
      pos.receipt = await staffApi('pos', 'POST', {
        lines: pos.bill.map((item) => ({ variantId: item.variantId, qty: item.qty })),
        pay: payment,
        cash: payment === 'tunai' ? +$('#cash').value : null,
        voucher: pos.voucher ? pos.voucher.code : null,
      });
      pos.bill = [];
      pos.voucher = null;
      pos.products = await staffApi('products');
      drawPos();
    } finally {
      pos.busy = false;
    }
  },
};


/* =====================================================================
 * EVENT (satu pintu untuk semua tombol bertanda data-a)
 * ===================================================================== */

document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-a]');
  if (!el || el.tagName === 'INPUT') return;

  const actions = PAGE === 'admin' ? adminActions : posActions;
  const handler = actions[el.dataset.a];
  if (handler) safely(() => handler(el));
});

document.addEventListener('change', (event) => {
  const el = event.target;

  // Admin: simpan stok begitu angka diubah
  if (el.dataset.a === 'stock') {
    safely(async () => {
      await staffApi(`variants/${el.dataset.v}/stock`, 'POST', { stock: +el.value });
      showToast('Stok disimpan', 2400);
    });
  }

  // Admin: tombol "Ubah Status" aktif hanya kalau pilihan beda dari status sekarang
  if (el.id === 'st') {
    const order = selectedOrder();
    const button = $('#st-go');
    if (order && button) button.disabled = el.value === order.status;
  }

  // Admin: ganti jenis voucher (nominal/persen) -> gambar ulang supaya label & batas nilai ikut berubah
  if (el.dataset.pf === 'type' && admin.voucherForm) {
    admin.voucherForm.type = el.value;
    drawAdmin();
  }

  // Admin: foto dipilih lewat dialog berkas
  if (el.id === 'pfile') queuePhotos(Array.from(el.files));

  // Kasir: ganti metode bayar
  if (el.id === 'pay') renderBill();
});

document.addEventListener('input', (event) => {
  // Admin: isi form voucher disimpan ke state supaya tidak hilang saat tampilan digambar ulang
  if (admin.voucherForm && event.target.dataset && event.target.dataset.pf) {
    const input = event.target;
    admin.voucherForm[input.dataset.pf] = input.type === 'checkbox' ? input.checked : input.value;
  }

  // Admin: simpan isi form produk ke state supaya tidak hilang saat tampilan digambar ulang
  const field = event.target;
  if (admin.form && field.dataset) {
    if (field.dataset.f) admin.form[field.dataset.f] = field.value;
    if (field.dataset.vr !== undefined) admin.form.variants[+field.dataset.vr][field.dataset.vf] = field.value;
  }

  // Kasir: pencarian produk dan input uang diterima
  if (event.target.id === 'q') {
    pos.query = event.target.value;
    renderPosResults();
  }
  if (event.target.id === 'cash') renderBill();
});


/* Admin: seret foto ke kotak unggah */
document.addEventListener('dragover', (event) => {
  const zone = event.target.closest && event.target.closest('.dz');
  if (!zone) return;
  event.preventDefault();
  zone.classList.add('over');
});

document.addEventListener('dragleave', (event) => {
  const zone = event.target.closest && event.target.closest('.dz');
  if (zone) zone.classList.remove('over');
});

document.addEventListener('drop', (event) => {
  const zone = event.target.closest && event.target.closest('.dz');
  if (!zone) return;
  event.preventDefault();
  zone.classList.remove('over');
  queuePhotos(Array.from(event.dataTransfer.files));
});


/* ===== Mulai ===== */
safely(async () => {
  if (PAGE === 'admin') {
    admin.orders = await staffApi('orders');
    drawAdmin();
  } else {
    pos.products = await staffApi('products');
    drawPos();
  }
});

/* Kasir: stok diperbarui berkala supaya mengikuti perubahan dari admin dan pesanan online. */
if (PAGE === 'kasir') {
  setInterval(refreshPosStock, POS_REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshPosStock();
  });
}
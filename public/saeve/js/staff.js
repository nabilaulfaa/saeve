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
  tab: 'orders',          // orders | products | reports
  orders: [],
  products: [],
  selectedCode: null,     // kode pesanan yang sedang dibuka (kosong = pesanan pertama)
  receiptCode: null,      // kode pesanan yang struknya sedang ditampilkan
  showAddForm: false,     // form "Tambah produk"
  photoProductId: null,   // id produk yang panel "Kelola Foto"-nya terbuka
  photoQueue: [],         // foto yang dipilih tapi belum disimpan: { file, url }
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
  const product = admin.products.find((p) => p.id === admin.photoProductId);
  if (!product) return;

  let room = PHOTO_LIMIT - (product.photos || []).length - admin.photoQueue.length;
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

function renderPhotoPanel(product) {
  const saved = (product.photos || []).map((photo) => `
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
    <div class="ph-panel">
      ${saved || queued ? `<div class="ph-list">${saved}${queued}</div>` : ''}
      <label class="dz">
        ${UPLOAD_ICON}
        <span class="dz-t">Seret foto ke sini atau pilih dari perangkat</span>
        <span class="dz-s">JPG, PNG, WEBP · maks. 5 MB per foto · hingga ${PHOTO_LIMIT} foto</span>
        <input type="file" id="pfile" accept="image/jpeg,image/png,image/webp" multiple>
      </label>
      <div class="ph-acts">
        <button type="button" class="btn-dark ph-save" data-a="photo-save" ${admin.photoQueue.length ? '' : 'disabled'}>Simpan Foto</button>
        <button type="button" class="pc-link on" data-a="photo-cancel">Batal</button>
      </div>
    </div>`;
}

function renderProductCard(product) {
  const panelOpen = admin.photoProductId === product.id;
  const cover = (product.photos || [])[0];

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
          <div class="pc-cat">${categoryLabel(product.category)}</div>
          <button type="button" class="pc-link ${panelOpen ? 'on' : ''}" data-a="photos" data-v="${product.id}">Kelola Foto</button>
        </div>
        <div class="pc-price">${formatRupiahCard(product.price)}</div>
      </div>
      ${panelOpen ? renderPhotoPanel(product) : ''}
      <div class="pc-vars">${variantRows}</div>
    </section>`;
}

function renderProductsTab() {
  const categoryOptions = PRODUCT_CATEGORIES.map((category) => `
    <option value="${category}">${categoryLabel(category)}</option>
  `).join('');

  const addForm = admin.showAddForm ? `
    <div class="box">
      <h2 class="l">Produk baru</h2>
      ${formField('np-name', 'Nama produk')}
      <div class="fl">Kategori<select id="np-cat">${categoryOptions}</select></div>
      ${formField('np-price', 'Harga (Rp)', 'number', 'min=0 step=1000')}
      ${formField('np-mat', 'Bahan')}
      ${formField('np-desc', 'Deskripsi singkat')}
      ${formField('np-sw', 'Warna kartu', 'color', 'value="#c9a8b8"')}
      ${formField('np-col', 'Warna varian (pisahkan koma)', 'text', 'placeholder="Ruby, Rose Gold"')}
      ${formField('np-siz', 'Ukuran (opsional, pisahkan koma)', 'text', 'placeholder="14, 16, 18"')}
      ${formField('np-stk', 'Stok awal tiap varian', 'number', 'min=0 value=5')}
      <button class="btn pri" data-a="save-product">Simpan produk</button>
    </div>` : '';

  const cards = admin.products.map(renderProductCard).join('') || '<p class="sub">Belum ada produk.</p>';

  return `
    <h1 class="pg-title">Produk &amp; Stok</h1>
    ${cards}
    ${addForm}
    <button type="button" class="btn-dark" data-a="toggle-add">${admin.showAddForm ? 'Tutup' : 'Tambah Produk'}</button>`;
}


/* ---- Tab: Laporan ---- */
function renderReportTab() {
  const report = admin.report;

  const channelOptions = [
    ['semua', 'Online dan offline'],
    ['online', 'Online'],
    ['offline', 'Offline'],
  ].map(([value, label]) => `
    <option value="${value}" ${admin.channel === value ? 'selected' : ''}>${label}</option>
  `).join('');

  const filterBar = `
    <h1 class="l">Laporan penjualan</h1>
    <div class="row">
      <div class="fl">Dari<input type="date" id="rf" value="${admin.from}"></div>
      <div class="fl">Sampai<input type="date" id="rt" value="${admin.to}"></div>
      <div class="fl">Kanal<select id="rch">${channelOptions}</select></div>
      <button class="btn pri" data-a="report">Tampilkan</button>
    </div>`;

  if (!report) return filterBar + '<p class="sub">Pilih periode lalu klik Tampilkan.</p>';

  const topRows = report.top.map((row) => `
    <tr><td>${escapeHtml(row.name)}</td><td>${row.qty}</td><td>${formatRupiah(row.revenue)}</td></tr>
  `).join('') || '<tr><td colspan="3">Belum ada data.</td></tr>';

  const orderRows = report.orders.map((order) => `
    <tr>
      <td>${escapeHtml(order.code)}</td>
      <td>${escapeHtml(order.channel)}</td>
      <td>${formatDateTime(order.createdAt)}</td>
      <td>${escapeHtml(order.payment)}</td>
      <td>${formatRupiah(order.total)}</td>
    </tr>
  `).join('') || '<tr><td colspan="5">Belum ada transaksi.</td></tr>';

  return filterBar + `
    <div class="stats">
      <div class="stat">Pendapatan<b>${formatRupiah(report.revenue)}</b></div>
      <div class="stat">Transaksi<b>${report.count}</b></div>
      <div class="stat">Item terjual<b>${report.items}</b></div>
    </div>

    <h2 class="l">Produk terlaris</h2>
    <div class="tw">
      <table>
        <tr><th>Produk</th><th>Terjual</th><th>Pendapatan</th></tr>
        ${topRows}
      </table>
    </div>

    <h2 class="l">Transaksi</h2>
    <div class="tw">
      <table>
        <tr><th>No.</th><th>Kanal</th><th>Tanggal</th><th>Bayar</th><th>Total</th></tr>
        ${orderRows}
      </table>
    </div>`;
}


/* ---- Aksi Admin (nilai data-a pada tombol) ---- */
const adminActions = {
  async tab(el) {
    admin.tab = el.dataset.v;
    clearPhotoQueue();
    admin.photoProductId = null;
    if (admin.tab === 'products') admin.products = await staffApi('products');
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
  photos(el) {
    const id = +el.dataset.v;
    clearPhotoQueue();
    admin.photoProductId = admin.photoProductId === id ? null : id;
    drawAdmin();
  },

  'photo-cancel'() {
    clearPhotoQueue();
    admin.photoProductId = null;
    drawAdmin();
  },

  'photo-unq'(el) {
    const [removed] = admin.photoQueue.splice(+el.dataset.v, 1);
    if (removed) URL.revokeObjectURL(removed.url);
    drawAdmin();
  },

  async 'photo-save'() {
    if (!admin.photoQueue.length) return showToast('Pilih foto dulu', 2400);

    const formData = new FormData();
    admin.photoQueue.forEach((item) => formData.append('photos[]', item.file));

    replaceProduct(await staffUpload(`products/${admin.photoProductId}/photos`, formData));
    clearPhotoQueue();
    admin.photoProductId = null;
    drawAdmin();
    showToast('Foto disimpan', 2400);
  },

  async 'photo-del'(el) {
    if (!confirm('Hapus foto ini?')) return;
    replaceProduct(await staffApi(`photos/${el.dataset.v}`, 'DELETE'));
    drawAdmin();
    showToast('Foto dihapus', 2400);
  },

  'toggle-add'() {
    admin.showAddForm = !admin.showAddForm;
    drawAdmin();
  },

  async 'save-product'() {
    await staffApi('products', 'POST', {
      name: $('#np-name').value,
      category: $('#np-cat').value,
      price: +$('#np-price').value,
      material: $('#np-mat').value,
      description: $('#np-desc').value,
      swatch: $('#np-sw').value,
      colors: $('#np-col').value,
      sizes: $('#np-siz').value,
      stock: +$('#np-stk').value,
    });
    admin.showAddForm = false;
    admin.products = await staffApi('products');
    drawAdmin();
    showToast('Produk disimpan', 2400);
  },

  async report() {
    admin.from = $('#rf').value;
    admin.to = $('#rt').value;
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
};

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
      <aside class="box">
        <h2 class="l">Transaksi</h2>
        <div id="bill"></div>
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
    </div>`;

  renderPosResults();
  renderBill();
}

/* Daftar produk di sisi kiri, sudah terfilter oleh kotak pencarian. */
function renderPosResults() {
  const query = pos.query.toLowerCase();
  const matches = pos.products.filter(
    (product) => !query || product.name.toLowerCase().includes(query) || product.category.includes(query)
  );

  $('#res').innerHTML = matches.map((product) => `
    <div class="pr">
      <div class="sum"><b>${escapeHtml(product.name)}</b><span>${formatRupiah(product.price)}</span></div>
      ${product.variants.map((variant) => `
        <button class="vb" data-a="add" data-p="${product.id}" data-v="${variant.id}" ${variant.stock ? '' : 'disabled'}>${variantLabel(variant.color, variant.size)} · ${variant.stock ? variant.stock : 'habis'}</button>
      `).join('')}
    </div>
  `).join('') || '<p class="sub">Produk tidak ditemukan.</p>';
}

/* Daftar item transaksi, total, kembalian, dan status tombol BAYAR. */
function renderBill() {
  const total = pos.bill.reduce((sum, item) => sum + item.price * item.qty, 0);
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

  $('#bill').innerHTML = rows + `<div class="sum t"><span>Total</span><span>${formatRupiah(total)}</span></div>`;

  const isCash = payment === 'tunai';
  $('#cashw').style.display = isCash ? '' : 'none';
  $('#chg').textContent = isCash && total && cash >= total ? formatRupiah(cash - total) : '-';
  $('#go').disabled = !(pos.bill.length && (!isCash || cash >= total));
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
    renderBill();
  },

  qty(el) {
    const index = +el.dataset.x;
    const item = pos.bill[index];
    const newQty = item.qty + +el.dataset.d;

    if (newQty > item.max) return showToast('Stok tidak cukup', 2400);

    if (newQty < 1) pos.bill.splice(index, 1);
    else item.qty = newQty;
    renderBill();
  },

  async pay() {
    const payment = $('#pay').value;
    pos.receipt = await staffApi('pos', 'POST', {
      lines: pos.bill.map((item) => ({ variantId: item.variantId, qty: item.qty })),
      pay: payment,
      cash: payment === 'tunai' ? +$('#cash').value : null,
    });
    pos.bill = [];
    pos.products = await staffApi('products');
    drawPos();
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

  // Admin: foto dipilih lewat dialog berkas
  if (el.id === 'pfile') queuePhotos(Array.from(el.files));

  // Kasir: ganti metode bayar
  if (el.id === 'pay') renderBill();
});

document.addEventListener('input', (event) => {
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
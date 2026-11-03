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
  filter: 'semua',        // filter status di tab pesanan
  selectedCode: null,     // kode pesanan yang sedang dibuka
  receiptCode: null,      // kode pesanan yang struknya sedang ditampilkan
  showAddForm: false,     // form "Tambah produk"
  report: null,
  from: toDateInputValue(thirtyDaysAgo),
  to: toDateInputValue(today),
  channel: 'semua',
};

/* Jumlah pesanan yang butuh tindakan admin (ditampilkan di tab). */
function ordersNeedingAction() {
  return admin.orders.filter((order) => ['menunggu_ongkir', 'tindak_lanjut'].includes(order.status)).length;
}

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
    <button class="pill ${admin.tab === key ? 'on' : ''}" data-a="tab" data-v="${key}">${label}${key === 'orders' && needAction ? ` (${needAction})` : ''}</button>
  `).join('');

  const content = admin.tab === 'orders'
    ? renderOrdersTab()
    : admin.tab === 'products'
      ? renderProductsTab()
      : renderReportTab();

  app.innerHTML = `<div class="tabs">${tabButtons}</div>` + content;
}


/* ---- Tab: Pesanan ---- */
function renderOrdersTab() {
  const visibleOrders = admin.orders.filter((order) => admin.filter === 'semua' || order.status === admin.filter);
  const selected = admin.orders.find((order) => order.code === admin.selectedCode);

  const filterPills = ['semua', ...Object.keys(STATUS_LABELS)].map((status) => `
    <button class="pill ${admin.filter === status ? 'on' : ''}" data-a="filter" data-v="${status}">${status === 'semua' ? 'Semua' : STATUS_LABELS[status]}</button>
  `).join('');

  const orderRows = visibleOrders.map((order) => `
    <button class="orow ${order.code === admin.selectedCode ? 'on' : ''}" data-a="select" data-v="${order.code}">
      <span><b>${escapeHtml(order.code)}</b> · ${escapeHtml(order.name)}</span>
      <span>${formatRupiah(order.total)} ${statusBadge(order.status)}</span>
    </button>
  `).join('') || '<p class="sub">Belum ada pesanan.</p>';

  return `
    <h1 class="l">Pesanan online</h1>
    <div class="pills left">${filterPills}</div>
    <div class="split">
      <div class="lst">${orderRows}</div>
      <div>${selected ? renderOrderDetail(selected) : '<p class="sub">Pilih pesanan di sebelah kiri.</p>'}</div>
    </div>`;
}

function renderOrderDetail(order) {
  const isDelivery = order.delivery === 'kirim';
  const isPending = ['menunggu_ongkir', 'menunggu_bayar', 'tindak_lanjut'].includes(order.status);
  const isFinished = ['selesai', 'dibatalkan'].includes(order.status);
  const canSetShipping = isDelivery && !order.verified && ['menunggu_ongkir', 'menunggu_bayar'].includes(order.status);

  // Tombol "langkah berikutnya" sesuai status & cara penerimaan
  let next = null;
  if (order.status === 'diproses') {
    next = isDelivery ? ['dikirim', 'Tandai dikirim'] : ['siap_ambil', 'Siap diambil'];
  } else if (['dikirim', 'siap_ambil'].includes(order.status)) {
    next = ['selesai', 'Tandai selesai'];
  }

  const address = isDelivery
    ? escapeHtml([order.address, order.city, order.postal].filter(Boolean).join(', '))
    : 'Ambil di toko';

  const itemRows = order.items.map((item) => `
    <div class="sum">
      <span>${escapeHtml(item.productName)} <small>${variantLabel(item.color, item.size)} × ${item.qty}</small>
        ${isPending ? `<span class="bd ${item.stock < item.qty ? 'bad' : 'ok'}">stok ${item.stock}</span>` : ''}
      </span>
      <span>${formatRupiah(item.qty * item.unitPrice)}</span>
    </div>`).join('');

  const shippingRow = isDelivery
    ? `<div class="sum"><span>Ongkir</span><span>${order.status === 'menunggu_ongkir' ? 'Belum ditetapkan' : formatRupiah(order.shippingFee)}</span></div>`
    : '';

  const shippingForm = canSetShipping
    ? `<div class="fl">Ongkos kirim (Rp)<input id="ship" type="number" min="0" step="500" value="${order.status === 'menunggu_ongkir' ? '' : order.shippingFee}"></div>
       <button class="btn" data-a="ship">Simpan ongkir</button>`
    : '';

  const verifyBlock = order.status === 'menunggu_bayar'
    ? `<p class="sub">Cek mutasi rekening untuk ${formatRupiah(order.total)} dari ${escapeHtml(order.name)} sebelum memverifikasi.</p>
       <button class="btn pri" data-a="verify">Pembayaran sudah masuk</button>`
    : '';

  const followUpBlock = order.status === 'tindak_lanjut'
    ? `<div class="al">Pembayaran masuk tetapi stok kurang. Tambah stok di tab Produk & stok, lalu proses.</div>
       <button class="btn pri" data-a="status" data-v="diproses">Proses pesanan</button>`
    : '';

  const nextButton = next ? `<button class="btn pri" data-a="status" data-v="${next[0]}">${next[1]}</button>` : '';
  const cancelButton = isFinished ? '' : '<button class="btn" data-a="cancel">Batalkan pesanan</button>';
  const receiptShown = admin.receiptCode === order.code;

  return `
    <div class="box">
      <div class="sum"><h2 class="l">${escapeHtml(order.code)}</h2>${statusBadge(order.status)}</div>
      <p class="sub">${escapeHtml(order.name)} · ${escapeHtml(order.phone)} · ${formatDateTime(order.createdAt)}<br>${address}</p>
      ${itemRows}
      <div class="sum"><span>Subtotal</span><span>${formatRupiah(order.subtotal)}</span></div>
      ${shippingRow}
      <div class="sum t"><span>Total</span><span>${formatRupiah(order.total)}</span></div>
      ${shippingForm}
      ${verifyBlock}
      ${followUpBlock}
      ${nextButton}${cancelButton}<button class="btn" data-a="receipt">${receiptShown ? 'Tutup struk' : 'Lihat struk'}</button>
    </div>
    ${receiptShown ? renderReceipt(order) + '<div class="acts"><button class="btn pri" data-a="print">Cetak struk</button></div>' : ''}`;
}


/* ---- Tab: Produk & stok ---- */
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

  const productBoxes = admin.products.map((product) => `
    <div class="box">
      <div class="sum"><b>${escapeHtml(product.name)}</b><span>${formatRupiah(product.price)}</span></div>
      <div class="vg">
        ${product.variants.map((variant) => `
          <label class="vi">${variantLabel(variant.color, variant.size)}
            <input type="number" min="0" value="${variant.stock}" data-a="stock" data-v="${variant.id}">
          </label>`).join('')}
      </div>
    </div>
  `).join('');

  return `
    <div class="sum">
      <h1 class="l">Produk dan stok</h1>
      <button class="btn pri" data-a="toggle-add">${admin.showAddForm ? 'Tutup' : 'Tambah produk'}</button>
    </div>
    ${addForm}
    ${productBoxes}
    <p class="sub">Ubah angka stok lalu klik di luar kotak untuk menyimpan.</p>`;
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
const selectedOrder = () => admin.orders.find((order) => order.code === admin.selectedCode);

const adminActions = {
  async tab(el) {
    admin.tab = el.dataset.v;
    if (admin.tab === 'products') admin.products = await staffApi('products');
    if (admin.tab === 'orders') admin.orders = await staffApi('orders');
    if (admin.tab === 'reports' && !admin.report) admin.report = await loadReport();
    drawAdmin();
  },

  filter(el) {
    admin.filter = el.dataset.v;
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
    updateOrder(await staffApi(`orders/${order.id}/shipping`, 'POST', { fee: +$('#ship').value }));
    showToast('Ongkir disimpan', 2400);
  },

  async verify() {
    const order = selectedOrder();
    updateOrder(await staffApi(`orders/${order.id}/verify`, 'POST'));
    showToast('Pembayaran diverifikasi', 2400);
  },

  async status(el) {
    const order = selectedOrder();
    updateOrder(await staffApi(`orders/${order.id}/status`, 'POST', { status: el.dataset.v }));
    showToast('Status diperbarui', 2400);
  },

  async cancel() {
    const order = selectedOrder();
    if (!confirm('Batalkan pesanan ' + order.code + '? Stok akan dikembalikan bila sudah dikurangi.')) return;
    updateOrder(await staffApi(`orders/${order.id}/status`, 'POST', { status: 'dibatalkan' }));
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

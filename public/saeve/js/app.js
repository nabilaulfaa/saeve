/*
 * app.js
 * Halaman pembeli (toko SAEVÉ). Routing memakai hash: #/koleksi, #/produk/1, dst.
 * Bergantung pada: common.js, api.js, dan pdf.js (pdfjsLib).
 */

/* ===== Konfigurasi ===== */

const CART_KEY = 'saeve-cart-v2';
const CATALOG_PDF_URL = '/saeve/SAEVE-Catalog-2026.pdf';
const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const CATALOG_CATEGORIES = ['semua', ...PRODUCT_CATEGORIES];
const ORDER_STEPS = ['menunggu_ongkir', 'menunggu_bayar', 'diproses', 'dikirim', 'selesai'];


/* ===== Keranjang ===== */

let cart = [];
try {
  cart = JSON.parse(localStorage.getItem(CART_KEY)) || [];
} catch (error) {
  /* data keranjang rusak: mulai dari kosong */
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  $('#cnt').textContent = cart.reduce((sum, item) => sum + item.qty, 0);
}

function cartTotal() {
  return cart.reduce((sum, item) => {
    const found = API.findVariant(item.variantId);
    return sum + (found ? found.product.price * item.qty : 0);
  }, 0);
}


/* ===== Potongan HTML yang dipakai berulang ===== */

function whatsappLink(number, text) {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

function pageHeader(eyebrow, title, subtitle) {
  return `
    <div class="hd">
      <div class="eb">${eyebrow}</div>
      <h1>${title}</h1>
      <div class="rule"></div>
      ${subtitle ? `<p class="sub">${subtitle}</p>` : ''}
    </div>`;
}

function stockTag(product) {
  const totalStock = product.variants.reduce((sum, variant) => sum + variant.stock, 0);
  if (totalStock === 0) return '<span class="tag">Habis</span>';
  if (totalStock <= 5) return '<span class="tag">Stok terbatas</span>';
  return '';
}

function productCard(product) {
  return `
    <a class="card" href="#/produk/${product.id}">
      <div class="ph" style="--c:${product.color}">${escapeHtml(product.name[0])}</div>
      <h3>${escapeHtml(product.name)}</h3>
      <span class="price">${formatRupiah(product.price)}</span> ${stockTag(product)}
    </a>`;
}

function whatsappCatalogButtons() {
  const message = 'Halo, saya tertarik dengan katalog produk SAEVÉ dan ingin bertanya lebih lanjut.';
  return WA_CONTACTS.map((contact) => `
    <a class="btn" target="_blank" rel="noopener" href="${whatsappLink(contact.number, message)}">Pesan · ${contact.name}</a>
  `).join('');
}


/* ===== Halaman (view) =====
 * Setiap view mengembalikan string HTML. Event dipasang terpisah di bind().
 */

const views = {
  /* ---- Beranda: pratinjau katalog PDF ---- */
  home() {
    return pageHeader('2026', 'SAEVÉ Catalog', 'Jelajahi seluruh koleksi kami dalam satu halaman.') + `
      <div class="frame" id="pbox">
        <div class="pwrap"><canvas id="pdf"></canvas></div>
      </div>

      <div class="ctl">
        <button id="pprev" aria-label="Sebelumnya">‹</button>
        <span id="pgn">Hal. 1 / –</span>
        <button id="pnext" aria-label="Berikutnya">›</button>
        <i></i>
        <button id="pzo" aria-label="Perkecil">−</button>
        <span id="zm">100%</span>
        <button id="pzi" aria-label="Perbesar">+</button>
        <i></i>
        <button id="pfs" aria-label="Layar penuh">⛶</button>
      </div>

      <p class="sub center">Gunakan panah untuk membaca antar halaman, atau unduh berkas lengkapnya ke perangkat Anda.</p>

      <div class="acts">
        <a class="btn pri" href="#/koleksi">Lihat koleksi</a>
        <a class="btn" href="${CATALOG_PDF_URL}" download>Unduh katalog (PDF)</a>
        ${whatsappCatalogButtons()}
      </div>

      <section class="gallery">
        <div class="hd">
          <div class="eb">SAEV${BRAND_E}</div>
          <h2>Gallery</h2>
          <div class="rule"></div>
        </div>
        <p class="sub center">Belum ada foto di galeri.</p>
      </section>`;
  },

  /* ---- Daftar produk per kategori ---- */
  koleksi(params) {
    const category = params[0] || 'semua';
    const pills = CATALOG_CATEGORIES.map((c) => `
      <a class="pill ${c === category ? 'on' : ''}" href="#/koleksi/${c}">${categoryLabel(c)}</a>
    `).join('');
    const cards = API.getProducts(category).map(productCard).join('')
      || '<p class="sub">Produk tidak ditemukan.</p>';

    return pageHeader('Koleksi', 'Perhiasan SAEVÉ') + `
      <div class="pills">${pills}</div>
      <div class="grid">${cards}</div>`;
  },

  /* ---- Detail produk ---- */
  produk(params) {
    const product = API.getProduct(params[0]);
    if (!product) return '<p>Produk tidak ditemukan.</p>';

    const options = product.variants.map((variant) => `
      <option value="${variant.id}" ${variant.stock ? '' : 'disabled'}>${variantLabel(variant.color, variant.size)} — ${variant.stock ? 'stok ' + variant.stock : 'habis'}</option>
    `).join('');

    return `
      <div class="two">
        <div class="frame full">
          <div class="ph big" style="--c:${product.color}">${escapeHtml(product.name[0])}</div>
        </div>
        <div>
          <div class="eb">${categoryLabel(product.category)}</div>
          <h1 class="left">${escapeHtml(product.name)}</h1>
          <div class="price lg">${formatRupiah(product.price)}</div>
          <p>${escapeHtml(product.description)}</p>
          <p class="sub">Bahan: ${escapeHtml(product.material)}</p>

          <div class="fl">Varian<select id="vr">${options}</select></div>
          <div class="fl">Jumlah<input id="qt" class="input-qty" type="number" min="1" value="1"></div>
          <button class="btn pri" id="add">TAMBAH KE PESANAN</button>
        </div>
      </div>`;
  },

  /* ---- Keranjang ---- */
  keranjang() {
    const header = pageHeader('Pesanan', 'Keranjang');

    if (!cart.length) {
      return header + `
        <p class="sub center">Keranjang masih kosong.</p>
        <div class="acts"><a class="btn pri" href="#/koleksi">Lihat koleksi</a></div>`;
    }

    const rows = cart.map((item, index) => {
      const { product, variant } = API.findVariant(item.variantId);
      return `
        <div class="sum">
          <span>${escapeHtml(product.name)} <small>${variantLabel(variant.color, variant.size)} × ${item.qty}</small></span>
          <span>${formatRupiah(product.price * item.qty)} <button class="btn sm" data-del="${index}">×</button></span>
        </div>`;
    }).join('');

    return header + `
      <div class="box">
        ${rows}
        <div class="sum t"><span>Subtotal</span><span>${formatRupiah(cartTotal())}</span></div>
      </div>
      <div class="acts"><a class="btn pri" href="#/checkout">Checkout</a></div>`;
  },

  /* ---- Checkout ---- */
  checkout() {
    if (!cart.length) return views.keranjang();

    const summaryRows = cart.map((item) => {
      const { product } = API.findVariant(item.variantId);
      return `
        <div class="sum">
          <span>${escapeHtml(product.name)} × ${item.qty}</span>
          <span>${formatRupiah(product.price * item.qty)}</span>
        </div>`;
    }).join('');

    return pageHeader('Checkout', 'Data pemesan') + `
      <div class="two">
        <form id="co" class="box" novalidate>
          <div class="fl">Nama<input name="name"></div>
          <div class="fl">No. WhatsApp<input name="phone" placeholder="08xx xxxx xxxx"></div>
          <div class="fl">Penerimaan
            <select name="delivery">
              <option value="kirim">Dikirim (ongkir ditetapkan admin)</option>
              <option value="pickup">Ambil di toko</option>
            </select>
          </div>
          <div id="ad">
            <div class="fl">Alamat<input name="address"></div>
            <div class="fl">Kota/kabupaten<input name="city"></div>
            <div class="fl">Kode pos<input name="postal"></div>
          </div>
          <div class="err" id="er"></div>
          <button class="btn pri">BUAT PESANAN</button>
        </form>

        <div class="box">
          <h2>Ringkasan</h2>
          ${summaryRows}
          <div class="sum t"><span>Subtotal</span><span>${formatRupiah(cartTotal())}</span></div>
        </div>
      </div>`;
  },

  /* ---- Cek status pesanan ---- */
  pesanan() {
    return pageHeader('Pesanan', 'Cek pesanan', 'Masukkan nomor pesanan dan nomor telepon saat checkout.') + `
      <form id="tf" class="box form-narrow">
        <div class="fl">Nomor pesanan<input name="code" placeholder="SV-1001"></div>
        <div class="fl">Nomor telepon<input name="tel"></div>
        <div class="err" id="er"></div>
        <button class="btn pri">CEK STATUS</button>
      </form>`;
  },

  /* ---- Struk pesanan ---- */
  struk(params) {
    const order = API.getOrder(params[0]);
    if (!order) return '<p>Struk tidak ditemukan.</p>';

    const date = new Date(order.createdAt).toLocaleString('id-ID');
    const currentStep = ORDER_STEPS.indexOf(order.status);
    // Ongkir baru "belum ditetapkan" selama status masih menunggu_ongkir (ongkir Rp 0 / gratis tetap dianggap sudah ditetapkan)
    const shippingPending = order.delivery === 'kirim' && order.status === 'menunggu_ongkir';

    const itemRows = order.items.map((item) => `
      <div class="sum">
        <span>${escapeHtml(item.productName)}<br><small>${variantLabel(item.color, item.size)} · ${item.qty} × ${formatRupiah(item.unitPrice)}</small></span>
        <span>${formatRupiah(item.qty * item.unitPrice)}</span>
      </div>`).join('');

    const timeline = ORDER_STEPS.map((step, index) => `
      <li class="${index <= currentStep ? 'on' : ''}">${STATUS_LABELS[step]}</li>
    `).join('');

    const chatButtons = WA_CONTACTS.map((contact) => `
      <a class="btn" target="_blank" href="${whatsappLink(contact.number, 'Halo, saya ingin konfirmasi pesanan ' + order.code)}">Chat ${contact.name}</a>
    `).join('');

    return pageHeader('Pesanan ' + escapeHtml(order.code), STATUS_LABELS[order.status] || order.status) + `
      <div class="rc">
        <span class="logo">SAEV${BRAND_E}</span>
        <p class="sub small">${BRAND_TAGLINE}</p>
        <hr>
        <div class="sum"><span>No.</span><b>${escapeHtml(order.code)}</b></div>
        <div class="sum"><span>Tanggal</span><span>${date}</span></div>
        <div class="sum"><span>Pemesan</span><span>${escapeHtml(order.name)}</span></div>
        <hr>
        ${itemRows}
        <hr>
        <div class="sum"><span>Subtotal</span><span>${formatRupiah(order.subtotal)}</span></div>
        <div class="sum"><span>Ongkir</span><span>${shippingPending ? 'Ditetapkan admin' : formatRupiah(order.shippingFee)}</span></div>
        <div class="sum t"><span>TOTAL</span><span>${shippingPending ? 'Subtotal + ongkir' : formatRupiah(order.total)}</span></div>
        <hr>
        <ul class="tl">${timeline}</ul>
        <hr>
        <p class="sub small">Terima kasih telah memilih SAEVÉ. ${CARE_NOTE}</p>
      </div>

      <div class="acts">
        <button class="btn pri" data-print>Cetak struk</button>
        ${chatButtons}
      </div>`;
  },
};


/* ===== Router ===== */

async function route() {
  const [, name = 'home', ...params] = (location.hash || '#/').slice(1).split('/');

  try {
    await API.load();
  } catch (error) {
    app.innerHTML = '<p class="sub center">Gagal memuat produk. Pastikan server Laravel berjalan dan migrasi sudah dijalankan.</p>';
    return;
  }

  // Buang item keranjang yang variannya sudah tidak ada
  cart = cart.filter((item) => API.findVariant(item.variantId));
  saveCart();

  const view = views[name || 'home'] || views.home;
  app.innerHTML = view(params);
  scrollTo(0, 0);
  bind();
}


/* ===== Event handler (dipasang setiap halaman selesai dirender) ===== */

function bind() {
  if ($('#pdf')) initPdf();
  bindAddToCart();
  bindCartDelete();
  bindCheckoutForm();
  bindTrackForm();
  bindPrint();
}

function bindAddToCart() {
  const button = $('#add');
  if (!button) return;

  button.onclick = () => {
    const variantId = $('#vr').value;
    const qty = Math.max(1, +$('#qt').value || 1);
    const found = API.findVariant(variantId);
    if (!found) return showToast('Varian tidak tersedia');

    const existing = cart.find((item) => item.variantId === variantId);
    const newQty = (existing ? existing.qty : 0) + qty;
    if (newQty > found.variant.stock) return showToast('Stok tidak cukup');

    if (existing) existing.qty = newQty;
    else cart.push({ variantId, qty });

    saveCart();
    showToast('Ditambahkan ke pesanan');
  };
}

function bindCartDelete() {
  $$('[data-del]').forEach((button) => {
    button.onclick = () => {
      cart.splice(+button.dataset.del, 1);
      saveCart();
      route();
    };
  });
}

function bindCheckoutForm() {
  const form = $('#co');
  if (!form) return;

  // Alamat hanya perlu diisi kalau pesanan dikirim
  const addressBox = $('#ad');
  form.elements.delivery.onchange = () => {
    addressBox.style.display = form.elements.delivery.value === 'kirim' ? '' : 'none';
  };

  form.onsubmit = async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const errorBox = $('#er');
    const phone = data.phone.replace(/\D/g, '');

    if (data.name.trim().length < 3) {
      return (errorBox.textContent = 'Masukkan nama.');
    }
    if (!/^08\d{8,12}$/.test(phone)) {
      return (errorBox.textContent = 'Gunakan nomor yang diawali 08.');
    }
    if (
      data.delivery === 'kirim' &&
      (data.address.trim().length < 8 || data.city.trim().length < 3 || !/^\d{5}$/.test(data.postal))
    ) {
      return (errorBox.textContent = 'Lengkapi alamat, kota, dan kode pos 5 angka.');
    }

    try {
      const order = await API.createOrder(data, cart);
      cart = [];
      saveCart();
      location.hash = '#/struk/' + order.code;
    } catch (error) {
      errorBox.textContent = error.message;
    }
  };
}

function bindTrackForm() {
  const form = $('#tf');
  if (!form) return;

  form.onsubmit = async (event) => {
    event.preventDefault();
    const order = await API.lookupOrder(form.elements.code.value, form.elements.tel.value);
    if (order) {
      location.hash = '#/struk/' + order.code;
    } else {
      $('#er').textContent = 'Pesanan tidak ditemukan. Periksa nomor pesanan dan telepon.';
    }
  };
}

function bindPrint() {
  const button = $('[data-print]');
  if (button) button.onclick = () => print();
}


/* ===== Pratinjau katalog PDF ===== */

let pdfDoc = null;
let pdfPage = 1;
let pdfZoom = 1;
let pdfRendering = false;
let pdfRenderAgain = false;

async function renderPdfPage() {
  const canvas = $('#pdf');
  if (!canvas || !pdfDoc) return;

  // Kalau masih merender, tandai agar dirender ulang setelah selesai
  if (pdfRendering) {
    pdfRenderAgain = true;
    return;
  }
  pdfRendering = true;

  try {
    const page = await pdfDoc.getPage(pdfPage);
    const containerWidth = canvas.parentNode.clientWidth;
    const baseViewport = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (containerWidth / baseViewport.width) * 2 });

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = pdfZoom * 100 + '%';

    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    $('#pgn').textContent = 'Hal. ' + pdfPage + ' / ' + pdfDoc.numPages;
    $('#zm').textContent = Math.round(pdfZoom * 100) + '%';
  } catch (error) {
    /* gagal render satu halaman: abaikan, pengguna bisa coba lagi */
  }

  pdfRendering = false;
  if (pdfRenderAgain) {
    pdfRenderAgain = false;
    renderPdfPage();
  }
}

async function initPdf() {
  const box = $('#pbox');

  $('#pprev').onclick = () => {
    pdfPage = Math.max(1, pdfPage - 1);
    renderPdfPage();
  };
  $('#pnext').onclick = () => {
    if (!pdfDoc) return;
    pdfPage = Math.min(pdfDoc.numPages, pdfPage + 1);
    renderPdfPage();
  };
  $('#pzo').onclick = () => {
    pdfZoom = Math.max(0.5, pdfZoom - 0.25);
    renderPdfPage();
  };
  $('#pzi').onclick = () => {
    pdfZoom = Math.min(2.5, pdfZoom + 0.25);
    renderPdfPage();
  };
  $('#pfs').onclick = () => box.requestFullscreen && box.requestFullscreen();

  try {
    if (!pdfDoc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      pdfDoc = await pdfjsLib.getDocument(CATALOG_PDF_URL).promise;
    }
    renderPdfPage();
  } catch (error) {
    box.innerHTML = '<p class="sub center">Pratinjau katalog tidak tersedia. Gunakan tombol unduh.</p>';
  }
}


/* ===== Mulai ===== */

addEventListener('hashchange', route);
saveCart();
route();
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

/* Isi dengan path foto galeri, contoh: ['/saeve/img/g1.jpg', ...].
 * Kosong = otomatis memakai foto produk dari admin; kalau belum ada foto, kartu placeholder. */
const GALLERY_PHOTOS = [];

const WA_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.2 1.4 2.5 1.5.3.1.5.1.7-.1l1-1.2c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.8-.1 1.4z"/></svg>';

/* Warna swatch di halaman detail. Kalau varian punya field `hex`, itu yang dipakai lebih dulu. */
const COLOR_HEX = {
  brown: '#B08560', aurora: '#C934E0', ruby: '#A3262A', red: '#B3262B', pink: '#E8A0B4',
  rose: '#D9A0A0', 'rose gold': '#C9967A', gold: '#C9A24B', silver: '#C4C4C4', white: '#F4F1EA',
  black: '#222', purple: '#7B2D8E', blue: '#4F7CAC', green: '#4F8A6B', pastel: '#E7D3E6',
  clear: '#E8E4DC', peach: '#F0B99B', lilac: '#BFA3D6',
};

function swatchColor(product, name) {
  const variant = product.variants.find((v) => v.color === name);
  return (variant && variant.hex) || COLOR_HEX[String(name).toLowerCase()] || product.color || '#D9C9A8';
}

/* Dipakai saat klik menu Gallery/Kontak dari halaman selain beranda */
let pendingScroll = null;


/* ===== Keranjang ===== */

let cart = [];
try {
  cart = JSON.parse(localStorage.getItem(CART_KEY)) || [];
} catch (error) {
  /* data keranjang rusak: mulai dari kosong */
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  const counter = $('#cnt');
  if (counter) {
    const total = cart.reduce((sum, item) => sum + item.qty, 0);
    counter.textContent = total;
    counter.hidden = total === 0;
  }
}

/* Voucher yang sudah dicek di halaman checkout: { code, type, value, subtotal, discount } atau null */
let appliedVoucher = null;

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
      ${eyebrow ? `<div class="eb">${eyebrow}</div>` : ''}
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

/* Kartu produk: pakai foto pertama dari admin; kalau belum ada, huruf pertama nama produk */
function productCard(product) {
  const cover = (product.photos || [])[0];
  return `
    <a class="card" href="#/produk/${product.id}">
      <div class="ph" style="--c:${product.color}">${cover
        ? `<img src="${escapeHtml(cover.url)}" alt="${escapeHtml(product.name)}" loading="lazy">`
        : escapeHtml(product.name[0])}</div>
      <h3>${escapeHtml(product.name)}</h3>
      <span class="price">${formatRupiahCard(product.price)}</span> ${stockTag(product)}
    </a>`;
}


/* ===== Galeri (carousel) ===== */

function galleryHtml() {
  // Otomatis: satu foto sampul dari tiap produk (maks. 9), kecuali GALLERY_PHOTOS diisi manual
  const auto = API.getProducts('semua')
    .flatMap((product) => (product.photos || []).slice(0, 1).map((photo) => photo.url))
    .slice(0, 9);
  const photos = GALLERY_PHOTOS.length ? GALLERY_PHOTOS : auto;

  const cards = photos.length
    ? photos.map((src) => `<div class="car-card"><img src="${escapeHtml(src)}" alt="" loading="lazy"></div>`)
    : Array.from({ length: 6 }, () => '<div class="car-card"></div>');
  const pages = Math.ceil(cards.length / 3);
  const dots = Array.from({ length: pages }, (_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('');

  return `
    <div class="car">
      <div class="car-track">${cards.join('')}</div>
      <button class="car-btn prev" aria-label="Sebelumnya"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15 5l-7 7 7 7"/></svg></button>
      <button class="car-btn next" aria-label="Berikutnya"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5l7 7-7 7"/></svg></button>
    </div>
    <div class="dots">${dots}</div>`;
}

function initGallery() {
  const track = $('.car-track');
  if (!track) return;
  const step = () => track.clientWidth + 14;

  $('.car-btn.prev').onclick = () => track.scrollBy({ left: -step(), behavior: 'smooth' });
  $('.car-btn.next').onclick = () => track.scrollBy({ left: step(), behavior: 'smooth' });
  track.onscroll = () => {
    const index = Math.round(track.scrollLeft / step());
    $$('.dots i').forEach((dot, i) => dot.classList.toggle('on', i === index));
  };
}


/* ===== Panel keranjang "Pesanan Anda" (drawer dari kanan) ===== */

const CLOSE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M5 5l14 14M19 5L5 19"/></svg>';

function ensureDrawer() {
  let drawer = $('#drawer');
  if (drawer) return drawer;

  drawer = document.createElement('div');
  drawer.id = 'drawer';
  drawer.className = 'drawer-back';
  drawer.innerHTML = `
    <aside class="drawer" role="dialog" aria-label="Pesanan Anda">
      <header class="dr-head">
        <h2>Pesanan Anda</h2>
        <button type="button" class="dr-close" aria-label="Tutup">${CLOSE_ICON}</button>
      </header>
      <div class="dr-list" id="drList"></div>
      <footer class="dr-foot" id="drFoot"></footer>
    </aside>`;
  document.body.appendChild(drawer);

  drawer.addEventListener('click', onDrawerClick);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeCart();
  });
  return drawer;
}

function renderDrawer() {
  const items = cart.map((item, index) => {
    const found = API.findVariant(item.variantId);
    if (!found) return '';
    const { product, variant } = found;
    return `
      <div class="dr-item">
        <div class="dr-top">
          <div>
            <div class="dr-name">${escapeHtml(product.name)}</div>
            <div class="dr-var">${variantLabel(variant.color, variant.size)}</div>
          </div>
          <button type="button" class="dr-del" data-dr-del="${index}">Hapus</button>
        </div>
        <div class="dr-bot">
          <div class="qty">
            <button type="button" data-dr-dec="${index}" aria-label="Kurangi">−</button>
            <span>${item.qty}</span>
            <button type="button" data-dr-inc="${index}" aria-label="Tambah">+</button>
          </div>
          <span class="price">${formatRupiah(product.price * item.qty)}</span>
        </div>
      </div>`;
  }).join('');

  $('#drList').innerHTML = cart.length ? items : '<p class="sub center dr-empty">Keranjang masih kosong.</p>';
  $('#drFoot').innerHTML = cart.length
    ? `
      <div class="dr-sum"><span>Subtotal</span><span class="price">${formatRupiah(cartTotal())}</span></div>
      <p class="dr-note">Ongkir ditetapkan admin setelah pesanan dibuat</p>
      <a class="btn pri dr-go" href="#/checkout" data-dr-go>Lanjut ke checkout</a>`
    : '<a class="btn pri dr-go" href="#/koleksi" data-dr-go>Lihat koleksi</a>';
}

function onDrawerClick(event) {
  const target = event.target;

  if (target.id === 'drawer' || target.closest('.dr-close') || target.closest('[data-dr-go]')) {
    closeCart();
    return; // link checkout/koleksi tetap berjalan
  }

  const dec = target.closest('[data-dr-dec]');
  const inc = target.closest('[data-dr-inc]');
  const del = target.closest('[data-dr-del]');

  if (dec) {
    const item = cart[+dec.dataset.drDec];
    if (item) item.qty = Math.max(1, item.qty - 1);
  } else if (inc) {
    const item = cart[+inc.dataset.drInc];
    const found = item && API.findVariant(item.variantId);
    if (found && item.qty + 1 > found.variant.stock) return showToast('Stok tidak cukup');
    if (item) item.qty += 1;
  } else if (del) {
    cart.splice(+del.dataset.drDel, 1);
  } else {
    return;
  }

  saveCart();
  renderDrawer();
}

function openCart() {
  const drawer = ensureDrawer();
  renderDrawer();
  document.body.classList.add('lock');
  requestAnimationFrame(() => drawer.classList.add('open'));
}

function closeCart() {
  document.body.classList.remove('lock');
  const drawer = $('#drawer');
  if (drawer) drawer.classList.remove('open');
}


/* ===== Pilih voucher (lembar dari bawah, seperti marketplace) ===== */

function closeVoucherSheet() {
  document.body.classList.remove('lock');
  const sheet = $('#vmSheet');
  if (sheet) sheet.classList.remove('open');
}

function ensureVoucherSheet() {
  let sheet = $('#vmSheet');
  if (sheet) return sheet;

  sheet = document.createElement('div');
  sheet.id = 'vmSheet';
  sheet.className = 'vm-back';
  sheet.innerHTML = `
    <div class="vm" role="dialog" aria-label="Pilih voucher">
      <header class="vm-head">
        <h2>Voucher</h2>
        <button type="button" class="vm-x" aria-label="Tutup">${CLOSE_ICON}</button>
      </header>
      <div class="vm-list" id="vmList"></div>
    </div>`;
  document.body.appendChild(sheet);

  sheet.addEventListener('click', (event) => {
    if (event.target.id === 'vmSheet' || event.target.closest('.vm-x')) closeVoucherSheet();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeVoucherSheet();
  });
  return sheet;
}

/* Nilai singkat untuk sisi kiri kartu: "20%" atau "Rp 25rb" */
function voucherShort(voucher) {
  if (voucher.type === 'persen') return voucher.value + '%';
  if (voucher.value >= 1000 && voucher.value % 1000 === 0) return 'Rp ' + voucher.value / 1000 + 'rb';
  return formatRupiah(voucher.value);
}

function voucherCard(voucher, selectedCode) {
  const isSelected = voucher.code === selectedCode;
  const until = voucher.endsAt
    ? new Date(voucher.endsAt + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  const terms = [
    voucher.type === 'persen' ? `Diskon ${voucher.value}%` : `Potongan ${formatRupiah(voucher.value)}`,
    voucher.minSpend ? `Min. belanja ${formatRupiah(voucher.minSpend)}` : 'Tanpa minimum belanja',
    until ? `Berlaku s/d ${until}` : '',
    voucher.remaining !== null ? `Kuota tersisa ${voucher.remaining}` : '',
  ].filter(Boolean).map((line) => `<div class="vc-tc">${line}</div>`).join('');

  const note = !voucher.eligible
    ? `<div class="vc-note">${escapeHtml(voucher.reason)}</div>`
    : `<div class="vc-save">Hemat ${formatRupiah(voucher.discount)} untuk pesananmu</div>`;

  const action = !voucher.eligible
    ? ''
    : isSelected
      ? '<span class="vc-picked">Dipakai</span>'
      : `<button type="button" class="btn pri" data-vc="${escapeHtml(voucher.code)}">Pakai</button>`;

  return `
    <div class="vc-card ${voucher.eligible ? '' : 'off'} ${isSelected ? 'on' : ''}">
      <div class="vc-val"><b>${voucherShort(voucher)}</b><small>${voucher.type === 'persen' ? 'Diskon' : 'Potongan'}</small></div>
      <div class="vc-body">
        <div class="vc-code">${escapeHtml(voucher.code)}</div>
        ${terms}
        ${note}
      </div>
      <div class="vc-act">${action}</div>
    </div>`;
}

async function openVoucherSheet(onPick, selectedCode) {
  const sheet = ensureVoucherSheet();
  const list = $('#vmList');

  list.innerHTML = '<p class="sub center">Memuat voucher…</p>';
  list.onclick = null;
  document.body.classList.add('lock');
  requestAnimationFrame(() => sheet.classList.add('open'));

  let vouchers;
  try {
    vouchers = await apiRequest('/vouchers/available', {
      method: 'POST',
      body: JSON.stringify({ lines: cart.map((item) => ({ variantId: item.variantId, qty: item.qty })) }),
    });
  } catch (error) {
    list.innerHTML = `<p class="sub center">${escapeHtml(error.message)}</p>`;
    return;
  }

  list.innerHTML = vouchers.length
    ? vouchers.map((voucher) => voucherCard(voucher, selectedCode)).join('')
    : '<p class="sub center">Belum ada voucher yang tersedia saat ini.</p>';

  list.onclick = async (event) => {
    const button = event.target.closest('[data-vc]');
    if (!button) return;

    button.disabled = true;
    try {
      await onPick(button.dataset.vc);
      closeVoucherSheet();
    } catch (error) {
      showToast(error.message);
      button.disabled = false;
    }
  };
}


/* ===== Halaman (view) =====
 * Setiap view mengembalikan string HTML. Event dipasang terpisah di bind().
 */

const views = {
  /* ---- Beranda: pratinjau katalog PDF, galeri, kontak ---- */
  home() {
    const waMessage = 'Halo, saya tertarik dengan katalog produk SAEVÉ dan ingin bertanya lebih lanjut.';

    return pageHeader('', 'SAEVÉ Catalog', 'Jelajahi seluruh koleksi kami dalam satu halaman.') + `
      <div id="viewer">
      <div class="frame" id="pbox">
        <div class="pwrap"><canvas id="pdf"></canvas></div>
      </div>

      <a class="btn dl" href="${CATALOG_PDF_URL}" download>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 20h16"/></svg>
        Unduh katalog (PDF)
      </a>

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
      </div>

      <p class="sub center hint">Gunakan panah untuk membaca antar halaman, atau unduh berkas lengkapnya ke perangkat Anda.</p>

      <section class="gallery" id="gallery">
        <div class="hd">
          <div class="eb">SAEVÉ</div>
          <h2>Gallery</h2>
          <div class="rule"></div>
        </div>
        ${galleryHtml()}
      </section>

      <section class="kontak-sec" id="kontak">
        <div class="hd">
          <h2>Kontak</h2>
          <div class="rule"></div>
        </div>
        <div class="kontak">
          ${WA_CONTACTS.map((contact) => `
            <a class="wa" target="_blank" rel="noopener" href="${whatsappLink(contact.number, waMessage)}">
              ${WA_ICON}
              <div><b>Chat ${contact.name}</b><span>${contact.display}</span></div>
            </a>`).join('')}
        </div>
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

    return `<div class="page-koleksi">` + pageHeader('SAEVÉ', 'Koleksi', 'Perhiasan handmade dengan manik kristal dan rantai rose gold.') + `
      <div class="pills">${pills}</div>
      <div class="grid">${cards}</div>
      </div>`;
  },

  /* ---- Detail produk ---- */
  produk(params) {
    const product = API.getProduct(params[0]);
    if (!product) return '<p>Produk tidak ditemukan.</p>';

    const colors = [...new Set(product.variants.map((variant) => variant.color))];
    const hasSizes = product.variants.some((variant) => variant.size);
    const swatches = colors.map((name) => `
      <button type="button" class="sw" data-color="${escapeHtml(name)}" style="--c:${swatchColor(product, name)}" aria-label="${escapeHtml(name)}" title="${escapeHtml(name)}"></button>
    `).join('');

    // Foto produk dari admin: foto utama + thumbnail kalau lebih dari satu
    const photos = product.photos || [];
    const gallery = `
      <div class="pd-gal">
        <div class="pd-img">${photos[0]
          ? `<img id="pimg" src="${escapeHtml(photos[0].url)}" alt="${escapeHtml(product.name)}">`
          : ''}</div>
        ${photos.length > 1 ? `<div class="pd-thumbs">${photos.map((photo, index) => `
          <button type="button" class="pd-th ${index === 0 ? 'on' : ''}" data-src="${escapeHtml(photo.url)}" aria-label="Foto ${index + 1}"><img src="${escapeHtml(photo.url)}" alt=""></button>`).join('')}</div>` : ''}
      </div>`;

    return `
      <div class="pd" id="pd" data-id="${product.id}">
        ${gallery}
        <div class="pd-info">
          <div class="pd-cat">${categoryLabel(product.category)}</div>
          <h1>${escapeHtml(product.name)}</h1>
          <div class="price lg">${formatRupiah(product.price)}</div>
          <p class="pd-desc">${escapeHtml(product.description)}</p>
          <p class="pd-mat">Bahan: ${escapeHtml(product.material)}</p>

          <div class="pd-lbl">Warna</div>
          <div class="pd-sw">${swatches}</div>
          <div class="pd-cn" id="pcn"></div>

          ${hasSizes ? '<div class="pd-lbl">Ukuran</div><div class="pd-sizes" id="psz"></div>' : ''}

          <div class="pd-qty">
            <div class="qty">
              <button type="button" id="qm" aria-label="Kurangi">−</button>
              <span id="qn">1</span>
              <button type="button" id="qp" aria-label="Tambah">+</button>
            </div>
            <span class="pd-stock" id="pst"></span>
          </div>

          <button type="button" class="btn pri cta" id="add">TAMBAH KE PESANAN</button>
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
    appliedVoucher = null;

    const summaryRows = cart.map((item) => {
      const { product, variant } = API.findVariant(item.variantId);
      return `
        <div class="ck-item">
          <div class="ck-row"><span>${escapeHtml(product.name)}</span><span>${formatRupiahDot(product.price * item.qty)}</span></div>
          <div class="ck-var">${variantLabel(variant.color, variant.size)} x ${item.qty}</div>
        </div>`;
    }).join('');

    return `
      <div class="ck">
        <form id="co" class="ck-form" novalidate>
          <h1>Checkout</h1>
          <p class="sub">Tanpa akun. Cukup isi data berikut.</p>

          <label class="ck-fl"><span>Nama</span><input name="name" autocomplete="name"></label>
          <label class="ck-fl"><span>No. WhatsApp</span><input name="phone" inputmode="tel" autocomplete="tel"></label>

          <div class="ck-lbl">Pengambilan</div>
          <div class="ck-opts">
            <label class="opt"><input type="radio" name="delivery" value="kirim" checked><span>Dikirim</span></label>
            <label class="opt"><input type="radio" name="delivery" value="pickup"><span>Ambil di toko</span></label>
          </div>

          <div id="ad">
            <label class="ck-fl"><span>Alamat</span><textarea name="address" autocomplete="street-address"></textarea></label>
            <div class="ck-two">
              <label class="ck-fl"><span>Kota</span><input name="city"></label>
              <label class="ck-fl"><span>Kode pos</span><input name="postal" inputmode="numeric" maxlength="5"></label>
            </div>
            <p class="ck-note">Ongkir ditetapkan admin setelah pesanan dibuat.</p>
          </div>

          <div class="err" id="er"></div>
          <button class="btn pri ck-go">Buat pesanan</button>
        </form>

        <aside class="ck-card">
          <h2>Ringkasan</h2>
          ${summaryRows}
          <div class="ck-line"></div>
          <div class="ck-sub"><span>Subtotal</span><span>${formatRupiahDot(cartTotal())}</span></div>
          <div id="ckdisc"></div>
          <div class="ck-vc">
            <button type="button" class="ck-vbtn" id="vcopen"><span id="vclabel">Pilih voucher</span><span aria-hidden="true">›</span></button>
            <div class="ck-vmsg" id="vcmsg"></div>
          </div>
          <p class="ck-pay">Pembayaran manual lewat transfer. Rekening tampil setelah pesanan dibuat.</p>
        </aside>
      </div>`;
  },

  /* ---- Pesanan berhasil dibuat ---- */
  dibuat(params) {
    const code = params[0] || '';
    const order = API.getOrder(code);
    const shipping = !order || order.delivery === 'kirim';
    const message = shipping
      ? 'Admin akan menghubungi Anda untuk menetapkan ongkir.<br>Setelah itu, lakukan pembayaran transfer.'
      : 'Admin akan menghubungi Anda untuk konfirmasi pengambilan.<br>Setelah itu, lakukan pembayaran transfer.';

    return `
      <div class="done-wrap">
        <div class="done">
          <div class="done-t">Pesanan dibuat</div>
          <div class="done-code">${escapeHtml(code)}</div>
          <p class="done-msg">${message}</p>
          <p class="sub done-sub">Hubungi admin untuk rekening transfer.</p>
          <a class="btn pri done-go" href="#/struk/${encodeURIComponent(code)}">Cek status pesanan</a>
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
        ${order.discount ? `<div class="sum"><span>Diskon${order.voucherCode ? ' (' + escapeHtml(order.voucherCode) + ')' : ''}</span><span>−${formatRupiah(order.discount)}</span></div>` : ''}
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
  closeCart();
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

  // Lanjutkan scroll ke Gallery/Kontak kalau datang dari menu navbar
  if (pendingScroll) {
    const target = document.getElementById(pendingScroll);
    pendingScroll = null;
    if (target) target.scrollIntoView({ behavior: 'smooth' });
  }
}


/* ===== Event handler (dipasang setiap halaman selesai dirender) ===== */

function bind() {
  if ($('#pdf')) initPdf();
  initGallery();
  bindProduct();
  bindCartDelete();
  bindCheckoutForm();
  bindTrackForm();
  bindPrint();
}

function bindProduct() {
  const root = $('#pd');
  if (!root) return;

  // Klik thumbnail = ganti foto utama
  $$('.pd-th').forEach((button) => {
    button.onclick = () => {
      $('#pimg').src = button.dataset.src;
      $$('.pd-th').forEach((b) => b.classList.toggle('on', b === button));
    };
  });

  const product = API.getProduct(root.dataset.id);
  const variants = product.variants;
  let color = (variants.find((variant) => variant.stock > 0) || variants[0]).color;
  let size = null;
  let qty = 1;

  const optionsOf = (name) => variants.filter((variant) => variant.color === name);
  const current = () => optionsOf(color).find((variant) => (variant.size || null) === (size || null));

  function refresh() {
    // Pilih ukuran yang valid untuk warna ini
    const options = optionsOf(color);
    if (options.some((variant) => variant.size)) {
      const keep = options.find((variant) => variant.size === size && variant.stock > 0);
      size = (keep || options.find((variant) => variant.stock > 0) || options[0]).size;
    } else {
      size = null;
    }

    $$('.sw').forEach((button) => {
      button.classList.toggle('on', button.dataset.color === color);
      button.classList.toggle('out', optionsOf(button.dataset.color).every((variant) => variant.stock === 0));
    });
    $('#pcn').textContent = color;

    const sizeBox = $('#psz');
    if (sizeBox) {
      sizeBox.innerHTML = options.map((variant) => `
        <button type="button" class="chip ${variant.size === size ? 'on' : ''}" data-size="${escapeHtml(variant.size)}" ${variant.stock ? '' : 'disabled'}>${escapeHtml(variant.size)}</button>
      `).join('');
    }

    const stock = current() ? current().stock : 0;
    qty = Math.min(Math.max(1, qty), Math.max(1, stock));
    $('#qn').textContent = qty;
    $('#pst').textContent = stock ? 'Tersedia ' + stock : 'Habis';
    $('#add').disabled = !stock;
  }

  $$('.sw').forEach((button) => {
    button.onclick = () => {
      color = button.dataset.color;
      qty = 1;
      refresh();
    };
  });

  const sizeBox = $('#psz');
  if (sizeBox) {
    sizeBox.onclick = (event) => {
      const chip = event.target.closest('.chip');
      if (!chip || chip.disabled) return;
      size = chip.dataset.size;
      qty = 1;
      refresh();
    };
  }

  $('#qm').onclick = () => {
    qty = Math.max(1, qty - 1);
    refresh();
  };
  $('#qp').onclick = () => {
    const stock = current() ? current().stock : 0;
    if (qty >= stock) return showToast('Stok tidak cukup');
    qty += 1;
    refresh();
  };

  $('#add').onclick = () => {
    const variant = current();
    if (!variant) return showToast('Varian tidak tersedia');

    const variantId = String(variant.id);
    const existing = cart.find((item) => String(item.variantId) === variantId);
    const newQty = (existing ? existing.qty : 0) + qty;
    if (newQty > variant.stock) return showToast('Stok tidak cukup');

    if (existing) existing.qty = newQty;
    else cart.push({ variantId, qty });

    saveCart();
    openCart();
  };

  refresh();
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
  form.addEventListener('change', () => {
    addressBox.style.display = form.elements.delivery.value === 'kirim' ? '' : 'none';
  });

  // Voucher: pelanggan memilih dari daftar voucher yang tersedia (tanpa mengetik kode)
  const voucherButton = $('#vcopen');
  const voucherLabel = $('#vclabel');
  const voucherMsg = $('#vcmsg');
  const discountBox = $('#ckdisc');

  const showVoucher = () => {
    if (!appliedVoucher) {
      discountBox.innerHTML = '';
      voucherLabel.textContent = 'Pilih voucher';
      voucherButton.classList.remove('on');
      voucherMsg.innerHTML = '';
      return;
    }

    discountBox.innerHTML = `
      <div class="ck-sub"><span>Diskon (${escapeHtml(appliedVoucher.code)})</span><span>−${formatRupiahDot(appliedVoucher.discount)}</span></div>
      <div class="ck-sub t"><span>Total</span><span>${formatRupiahDot(cartTotal() - appliedVoucher.discount)}</span></div>`;
    voucherLabel.textContent = `${appliedVoucher.code} · hemat ${formatRupiah(appliedVoucher.discount)}`;
    voucherButton.classList.add('on');
    voucherMsg.innerHTML = '<button type="button" class="ck-vrm" id="vcrm">Lepas voucher</button>';
    $('#vcrm').onclick = () => {
      appliedVoucher = null;
      showVoucher();
    };
  };

  /* Dipanggil saat pelanggan menekan "Pakai" di daftar voucher; potongan dihitung ulang oleh server. */
  const useVoucher = async (code) => {
    const response = await fetch('/api/vouchers/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ code, lines: cart.map((item) => ({ variantId: item.variantId, qty: item.qty })) }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || 'Voucher tidak bisa dipakai.');

    appliedVoucher = body;
    showVoucher();
  };

  voucherButton.onclick = () => openVoucherSheet(useVoucher, appliedVoucher ? appliedVoucher.code : null);

  form.onsubmit = async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    data.voucher = appliedVoucher ? appliedVoucher.code : '';
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
      appliedVoucher = null;
      cart = [];
      saveCart();
      location.hash = '#/dibuat/' + order.code;
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


/* ===== Pratinjau katalog PDF =====
 * Zoom 100% = seluruh halaman muat di bingkai (tanpa scroll).
 * Zoom di atas 100% = bingkai tetap, isi digeser dengan drag/swipe.
 */

let pdfDoc = null;
let pdfPage = 1;
let pdfZoom = 1;
let pdfRendering = false;
let pdfRenderAgain = false;
let pdfResetScroll = false;
let pdfEventsReady = false;

const PDF_MIN_ZOOM = 1;
const PDF_MAX_ZOOM = 3;
const PDF_ZOOM_STEP = 0.25;

/* True hanya kalau viewer PDF ada di halaman DAN sedang layar penuh */
function pdfIsFullscreen() {
  const viewer = $('#viewer');
  return !!viewer && document.fullscreenElement === viewer;
}

/* Ukuran maksimum area halaman supaya satu halaman utuh selalu muat */
function pdfBounds() {
  if (pdfIsFullscreen()) {
    return { w: innerWidth - 80, h: innerHeight - 160 };
  }
  return { w: Math.min(app.clientWidth - 60, 540), h: innerHeight * 0.72 };
}

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
    const base = page.getViewport({ scale: 1 });
    const bounds = pdfBounds();
    const fit = Math.min(bounds.w / base.width, bounds.h / base.height);
    const cssW = base.width * fit;
    const cssH = base.height * fit;
    const wrap = canvas.parentNode;

    // Ingat titik tengah yang sedang dilihat supaya zoom terasa natural
    const oldW = canvas.clientWidth;
    const oldH = canvas.clientHeight;
    const cx = oldW ? (wrap.scrollLeft + wrap.clientWidth / 2) / oldW : 0.5;
    const cy = oldH ? (wrap.scrollTop + wrap.clientHeight / 2) / oldH : 0.5;

    // Bingkai selalu seukuran satu halaman utuh
    wrap.style.width = cssW + 'px';
    wrap.style.height = cssH + 'px';
    canvas.style.width = cssW * pdfZoom + 'px';
    canvas.style.height = cssH * pdfZoom + 'px';

    // Resolusi canvas mengikuti zoom supaya tetap tajam
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const scale = Math.min(fit * pdfZoom * ratio, 4096 / base.width);
    const viewport = page.getViewport({ scale });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

    if (pdfResetScroll) {
      wrap.scrollLeft = 0;
      wrap.scrollTop = 0;
      pdfResetScroll = false;
    } else {
      wrap.scrollLeft = cx * canvas.clientWidth - wrap.clientWidth / 2;
      wrap.scrollTop = cy * canvas.clientHeight - wrap.clientHeight / 2;
    }

    wrap.classList.toggle('zoomed', pdfZoom > 1);
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

function pdfGo(delta) {
  if (!pdfDoc) return;
  const next = Math.min(pdfDoc.numPages, Math.max(1, pdfPage + delta));
  if (next === pdfPage) return;
  pdfPage = next;
  pdfResetScroll = true;
  renderPdfPage();
}

/* Dipasang sekali saja: resize, layar penuh, geser, scroll, dan keyboard */
function initPdfEvents() {
  if (pdfEventsReady) return;
  pdfEventsReady = true;

  let resizeTimer;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderPdfPage, 150);
  });
  document.addEventListener('fullscreenchange', () => {
    pdfZoom = 1;
    pdfResetScroll = true;
    renderPdfPage();
  });

  // Layar penuh + zoom 100%: scroll/swipe = pindah halaman
  let wheelLock = false;
  document.addEventListener('wheel', (event) => {
    if (!pdfIsFullscreen() || pdfZoom > 1) return;
    event.preventDefault();
    if (wheelLock || Math.abs(event.deltaY) < 10) return;
    wheelLock = true;
    setTimeout(() => (wheelLock = false), 450);
    pdfGo(event.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  let touchY = null;
  document.addEventListener('touchstart', (event) => {
    touchY = event.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', (event) => {
    if (touchY === null) return;
    const diff = touchY - event.changedTouches[0].clientY;
    touchY = null;
    if (!pdfIsFullscreen() || pdfZoom > 1 || Math.abs(diff) < 60) return;
    pdfGo(diff > 0 ? 1 : -1);
  }, { passive: true });

  // Panah keyboard
  document.addEventListener('keydown', (event) => {
    if (!$('#pdf') || event.target.closest('input, select, textarea')) return;
    if (event.key === 'ArrowRight' || event.key === 'PageDown') pdfGo(1);
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') pdfGo(-1);
  });

  let drag = null;
  document.addEventListener('pointerdown', (event) => {
    const wrap = event.target.closest('.pwrap');
    if (!wrap || event.pointerType !== 'mouse' || pdfZoom <= 1) return;
    drag = { wrap, x: event.clientX, y: event.clientY, left: wrap.scrollLeft, top: wrap.scrollTop };
    wrap.classList.add('dragging');
    event.preventDefault();
  });
  document.addEventListener('pointermove', (event) => {
    if (!drag) return;
    drag.wrap.scrollLeft = drag.left - (event.clientX - drag.x);
    drag.wrap.scrollTop = drag.top - (event.clientY - drag.y);
  });
  const endDrag = () => {
    if (drag) drag.wrap.classList.remove('dragging');
    drag = null;
  };
  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);
}

async function initPdf() {
  const box = $('#pbox');
  initPdfEvents();

  $('#pprev').onclick = () => pdfGo(-1);
  $('#pnext').onclick = () => pdfGo(1);
  $('#pzo').onclick = () => {
    pdfZoom = Math.max(PDF_MIN_ZOOM, pdfZoom - PDF_ZOOM_STEP);
    renderPdfPage();
  };
  $('#pzi').onclick = () => {
    pdfZoom = Math.min(PDF_MAX_ZOOM, pdfZoom + PDF_ZOOM_STEP);
    renderPdfPage();
  };
  $('#pfs').onclick = () => {
    const viewer = $('#viewer');
    if (document.fullscreenElement) document.exitFullscreen();
    else if (viewer.requestFullscreen) viewer.requestFullscreen();
  };

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

// Menu Gallery & Kontak: scroll ke section (pindah ke beranda dulu kalau sedang di halaman lain)
document.addEventListener('click', (event) => {
  // Tombol ORDERS (pojok kanan bawah) membuka panel keranjang
  if (event.target.closest('#fab')) {
    event.preventDefault();
    openCart();
    return;
  }

  const link = event.target.closest('[data-goto]');
  if (!link) return;
  event.preventDefault();

  const onHome = !location.hash || location.hash === '#/' || location.hash === '#';
  if (onHome) {
    document.getElementById(link.dataset.goto)?.scrollIntoView({ behavior: 'smooth' });
  } else {
    pendingScroll = link.dataset.goto;
    location.hash = '#/';
  }
});

saveCart();
route();
/* ===== Request dasar ===== */
async function apiRequest(url, options = {}) {
  const response = await fetch('/api' + url, {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Terjadi kesalahan');
  }
  return data;
}


/* ===== State ===== */
let products = [];
let productsLoaded = false;

/* Pesanan yang pernah dibuat/dicek disimpan di sessionStorage supaya struk bisa dibuka ulang. */
const ORDERS_KEY = 'sv-orders';
let savedOrders = {};
try {
  savedOrders = JSON.parse(sessionStorage.getItem(ORDERS_KEY)) || {};
} catch (error) {
  /* sessionStorage tidak tersedia: abaikan, struk hanya ada selama halaman terbuka */
}

function rememberOrder(order) {
  savedOrders[order.code] = order;
  try {
    sessionStorage.setItem(ORDERS_KEY, JSON.stringify(savedOrders));
  } catch (error) {
    /* abaikan */
  }
}


/* ===== API publik ===== */
const API = {
  /* Ambil daftar produk. Dipakai ulang kecuali force = true. */
  async load(force = false) {
    if (productsLoaded && !force) return;
    products = await apiRequest('/products');
    productsLoaded = true;
  },

  getProducts(category) {
    return products.filter(
      (product) => !category || category === 'semua' || product.category === category
    );
  },

  getProduct(id) {
    return products.find((product) => String(product.id) === String(id));
  },

  /* Cari varian berdasarkan id. Hasil: { product, variant } atau undefined. */
  findVariant(variantId) {
    for (const product of products) {
      const variant = product.variants.find((v) => String(v.id) === String(variantId));
      if (variant) return { product, variant };
    }
  },

  async createOrder(form, lines) {
    const order = await apiRequest('/orders', {
      method: 'POST',
      body: JSON.stringify({ ...form, lines }),
    });
    rememberOrder(order);
    await API.load(true);
    return order;
  },

  /* Hasil: data pesanan, atau null kalau tidak ditemukan. */
  async lookupOrder(code, phone) {
    try {
      const order = await apiRequest('/orders/lookup', {
        method: 'POST',
        body: JSON.stringify({ code, phone }),
      });
      rememberOrder(order);
      return order;
    } catch (error) {
      return null;
    }
  },

  getOrder(code) {
    return savedOrders[code];
  },

  /* Cari lokasi tujuan (RajaOngkir). Hasil: daftar { id, label, city_name, zip_code, ... } */
  async searchDestination(keyword) {
    return apiRequest('/shipping/search?q=' + encodeURIComponent(keyword));
  },

  /* Estimasi ongkir. weight dalam gram. Hasil: daftar layanan { code, service, description, cost, etd } */
  async shippingCost(destinationId, weight, couriers) {
    return apiRequest('/shipping/cost', {
      method: 'POST',
      body: JSON.stringify({ destination: destinationId, weight, couriers }),
    });
  },
};
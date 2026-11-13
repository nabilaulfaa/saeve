<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductPhoto;
use App\Models\ProductVariant;
use App\Models\Voucher;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class StaffController extends Controller
{
    private const STATUSES = ['menunggu_ongkir', 'menunggu_bayar', 'diproses', 'dikirim', 'siap_ambil', 'selesai', 'dibatalkan', 'tindak_lanjut'];

    private const CATEGORIES = ['gelang', 'kalung', 'cincin', 'anting', 'bagcharm'];

    /* Maksimal foto per produk (harus sama dengan PHOTO_LIMIT di staff.js). */
    private const PHOTO_LIMIT = 6;

    /* Perubahan status manual yang diizinkan: status sekarang => status tujuan. */
    private const TRANSITIONS = [
        'menunggu_ongkir' => ['dibatalkan'],
        'menunggu_bayar'  => ['dibatalkan'],
        'tindak_lanjut'   => ['diproses', 'dibatalkan'],
        'diproses'        => ['dikirim', 'siap_ambil', 'dibatalkan'],
        'dikirim'         => ['selesai', 'dibatalkan'],
        'siap_ambil'      => ['selesai', 'dibatalkan'],
    ];

    /* ---------------------------------------------------------------
     * Helper
     * ------------------------------------------------------------- */

    private function fail(string $message): never
    {
        throw ValidationException::withMessages(['error' => $message]);
    }

    /* Stok terkini untuk semua varian di sekumpulan pesanan (satu query). Hasil: [variant_id => stok]. */
    private function stockFor(iterable $orders): Collection
    {
        $variantIds = collect($orders)
            ->flatMap(fn (Order $order) => $order->items->pluck('variant_id'))
            ->unique();

        return ProductVariant::whereIn('id', $variantIds)->pluck('stock', 'id');
    }

    /* Bentuk JSON pesanan untuk frontend. $stock boleh diberikan agar tidak query berulang. */
    private function oj(Order $o, ?Collection $stock = null): array
    {
        $o->loadMissing('items');
        $stock ??= $this->stockFor([$o]);

        return [
            'id' => $o->id, 'code' => $o->code, 'channel' => $o->channel, 'status' => $o->status,
            'name' => $o->customer_name, 'phone' => $o->phone, 'delivery' => $o->delivery_method,
            'address' => $o->address, 'city' => $o->city, 'postal' => $o->postal_code,
            'subtotal' => $o->subtotal, 'shippingFee' => $o->shipping_fee, 'total' => $o->total,
            'discount' => (int) $o->discount, 'voucher' => $o->voucher_code,
            'verified' => (bool) $o->payment_verified, 'payment' => $o->payment_method,
            'cash' => $o->cash_received, 'change' => $o->change_amount, 'cashier' => $o->cashier,
            'createdAt' => $o->created_at->toIso8601String(),
            'items' => $o->items->map(fn ($i) => [
                'productName' => $i->product_name, 'color' => $i->color, 'size' => $i->size,
                'qty' => $i->qty, 'unitPrice' => $i->unit_price, 'stock' => $stock[$i->variant_id] ?? 0,
            ])->values(),
        ];
    }

    /* Bentuk JSON produk (varian + foto) untuk frontend. */
    private function pj(Product $p): array
    {
        $p->loadMissing(['variants', 'photos']);

        return [
            'id' => $p->id, 'name' => $p->name, 'category' => $p->category, 'price' => $p->price,
            'weight' => (int) $p->weight, 'material' => $p->material, 'description' => $p->description,
            'swatch' => $p->swatch,
            'photos' => $p->photos->map(fn ($photo) => [
                'id' => $photo->id,
                'url' => Storage::disk('public')->url($photo->path),
            ])->values(),
            'variants' => $p->variants->map(fn ($v) => [
                'id' => $v->id, 'color' => $v->color, 'size' => $v->size, 'stock' => $v->stock,
            ])->values(),
        ];
    }

    /* Kurangi stok sesuai item pesanan. Return false (tanpa mengubah apa pun) kalau ada yang kurang. */
    private function deduct(Order $o): bool
    {
        $variants = ProductVariant::whereIn('id', $o->items->pluck('variant_id'))->lockForUpdate()->get()->keyBy('id');

        foreach ($o->items as $item) {
            if (($variants[$item->variant_id]->stock ?? 0) < $item->qty) return false;
        }
        foreach ($o->items as $item) {
            $variants[$item->variant_id]->decrement('stock', $item->qty);
        }
        return true;
    }

    private function restock(Order $o): void
    {
        foreach ($o->items as $item) {
            ProductVariant::where('id', $item->variant_id)->increment('stock', $item->qty);
        }
    }

    /* ---------------------------------------------------------------
     * Pesanan online (admin)
     * ------------------------------------------------------------- */

    public function orders()
    {
        $orders = Order::with('items')->where('channel', 'online')->latest('id')->get();
        $stock = $this->stockFor($orders);

        return $orders->map(fn ($o) => $this->oj($o, $stock))->values();
    }

    public function shipping(Request $r, Order $order)
    {
        $d = $r->validate(['fee' => 'required|integer|min:0|max:10000000']);

        return DB::transaction(function () use ($d, $order) {
            $o = Order::with('items')->lockForUpdate()->findOrFail($order->id);

            if ($o->channel !== 'online' || $o->delivery_method !== 'kirim' || $o->payment_verified
                || !in_array($o->status, ['menunggu_ongkir', 'menunggu_bayar'], true)) {
                $this->fail('Ongkos kirim tidak bisa diubah untuk pesanan ini.');
            }

            $o->update([
                'shipping_fee' => $d['fee'],
                'total' => $o->subtotal - $o->discount + $d['fee'],
                'status' => 'menunggu_bayar',
            ]);
            return $this->oj($o->fresh('items'));
        });
    }

    public function verify(Order $order)
    {
        return DB::transaction(function () use ($order) {
            $o = Order::with('items')->lockForUpdate()->findOrFail($order->id);

            if ($o->payment_verified) $this->fail('Pembayaran sudah diverifikasi.');
            if ($o->status === 'menunggu_ongkir') $this->fail('Tetapkan ongkos kirim dulu.');
            if ($o->status !== 'menunggu_bayar') $this->fail('Status pesanan tidak sesuai.');

            // Stok kurang -> pesanan ditandai tindak_lanjut, admin menambah stok lalu memproses
            $ok = $this->deduct($o);
            $o->update([
                'payment_verified' => true,
                'paid_at' => now(),
                'stock_deducted' => $ok,
                'status' => $ok ? 'diproses' : 'tindak_lanjut',
            ]);
            return $this->oj($o->fresh('items'));
        });
    }

    public function status(Request $r, Order $order)
    {
        $d = $r->validate(['status' => 'required|in:' . implode(',', self::STATUSES)]);

        return DB::transaction(function () use ($d, $order) {
            $o = Order::with('items')->lockForUpdate()->findOrFail($order->id);
            $to = $d['status'];

            if (in_array($o->status, ['selesai', 'dibatalkan'], true)) $this->fail('Pesanan sudah final.');
            if (in_array($to, ['menunggu_ongkir', 'menunggu_bayar', 'tindak_lanjut'], true)) {
                $this->fail('Status ini tidak bisa dipilih manual.');
            }
            if ($to !== 'dibatalkan' && !$o->payment_verified) $this->fail('Verifikasi pembayaran dulu.');

            if (!in_array($to, self::TRANSITIONS[$o->status] ?? [], true)) {
                $this->fail('Perubahan status tidak valid.');
            }
            if ($to === 'dikirim' && $o->delivery_method !== 'kirim') $this->fail('Pesanan ini diambil di toko.');
            if ($to === 'siap_ambil' && $o->delivery_method !== 'pickup') $this->fail('Pesanan ini dikirim, bukan diambil.');

            // Pesanan batal: kuota voucher dikembalikan
            if ($to === 'dibatalkan' && $o->voucher_code) {
                Voucher::where('code', $o->voucher_code)->where('used_count', '>', 0)->decrement('used_count');
            }

            if ($to === 'dibatalkan' && $o->stock_deducted) {
                $this->restock($o);
                $o->stock_deducted = false;
            }

            // Pesanan yang sebelumnya kurang stok baru dikurangi stoknya saat diproses
            if ($to !== 'dibatalkan' && !$o->stock_deducted) {
                if (!$this->deduct($o)) $this->fail('Stok masih kurang. Tambah stok dulu.');
                $o->stock_deducted = true;
            }

            $o->status = $to;
            $o->save();
            return $this->oj($o->fresh('items'));
        });
    }

    /* ---------------------------------------------------------------
     * Produk & stok (admin; daftar produk juga dipakai kasir)
     * ------------------------------------------------------------- */

    public function products()
    {
        return Product::with(['variants', 'photos'])->orderBy('id')->get()
            ->map(fn ($p) => $this->pj($p))
            ->values();
    }

    /* Aturan isian produk (dipakai tambah & edit). Varian dikirim sebagai array per baris. */
    private function productRules(): array
    {
        return [
            'name' => 'required|string|min:2|max:120',
            'category' => 'required|in:' . implode(',', self::CATEGORIES),
            'price' => 'required|integer|min:0|max:100000000',
            'weight' => 'required|integer|min:1|max:100000', // gram, untuk hitung ongkir
            'material' => 'nullable|string|max:200',
            'description' => 'nullable|string|max:1000',
            'swatch' => ['nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'variants' => 'required|array|min:1|max:50',
            'variants.*.id' => 'nullable|integer',
            'variants.*.color' => 'required|string|max:60',
            'variants.*.size' => 'nullable|string|max:30',
            'variants.*.stock' => 'required|integer|min:0|max:9999',
            'deleted_variants' => 'nullable|array|max:50',
            'deleted_variants.*' => 'integer',
        ];
    }

    /* Kunci unik varian (warna + ukuran), huruf besar/kecil dianggap sama. */
    private function variantKey(?string $color, ?string $size): string
    {
        return mb_strtolower(trim((string) $color)) . '|' . mb_strtolower(trim((string) $size));
    }

    public function createProduct(Request $r)
    {
        $d = $r->validate($this->productRules());

        $keys = array_map(fn ($v) => $this->variantKey($v['color'], $v['size'] ?? null), $d['variants']);
        if (count($keys) !== count(array_unique($keys))) $this->fail('Ada varian dengan warna dan ukuran yang sama.');

        $product = DB::transaction(function () use ($d) {
            $product = Product::create([
                'name' => trim($d['name']),
                'category' => $d['category'],
                'price' => $d['price'],
                'weight' => $d['weight'],
                'material' => $d['material'] ?? '',
                'description' => $d['description'] ?? '',
                'swatch' => $d['swatch'] ?? '#e8dfd0',
            ]);

            foreach ($d['variants'] as $v) {
                $product->variants()->create([
                    'color' => trim($v['color']),
                    'size' => ($v['size'] ?? null) !== null && trim($v['size']) !== '' ? trim($v['size']) : null,
                    'stock' => $v['stock'],
                ]);
            }

            return $product;
        });

        return response()->json($this->pj($product->fresh(['variants', 'photos'])), 201);
    }

    /* Edit produk: data utama + varian. Varian tanpa id dibuat baru; varian di deleted_variants dihapus. */
    public function updateProduct(Request $r, Product $product)
    {
        $d = $r->validate($this->productRules());

        return DB::transaction(function () use ($r, $d, $product) {
            $p = Product::with('variants')->lockForUpdate()->findOrFail($product->id);

            // Setiap id varian harus milik produk ini
            $own = $p->variants->keyBy('id');
            $sentIds = [];
            foreach ($d['variants'] as $v) {
                if (!empty($v['id'])) {
                    if (!$own->has($v['id'])) $this->fail('Varian tidak ditemukan pada produk ini.');
                    $sentIds[] = (int) $v['id'];
                }
            }

            // Varian yang diminta dihapus: harus milik produk ini dan tidak boleh ikut dikirim sebagai varian aktif
            $deleteIds = array_values(array_unique(array_map('intval', $d['deleted_variants'] ?? [])));
            foreach ($deleteIds as $id) {
                if (!$own->has($id)) $this->fail('Varian yang dihapus tidak ditemukan pada produk ini.');
                if (in_array($id, $sentIds, true)) $this->fail('Varian yang sama tidak bisa diubah sekaligus dihapus.');
            }

            // Varian yang masih ada di pesanan yang belum selesai/dibatalkan tidak boleh dihapus
            if ($deleteIds) {
                $busy = OrderItem::with('order')
                    ->whereIn('variant_id', $deleteIds)
                    ->whereHas('order', fn ($q) => $q->whereNotIn('status', ['selesai', 'dibatalkan']))
                    ->first();
                if ($busy) {
                    $this->fail("Varian {$busy->color} tidak bisa dihapus karena masih ada di pesanan {$busy->order->code} yang belum selesai.");
                }
            }

            // Cek kombinasi warna+ukuran ganda, termasuk varian lama yang tidak ikut dikirim
            $keys = array_map(fn ($v) => $this->variantKey($v['color'], $v['size'] ?? null), $d['variants']);
            foreach ($p->variants as $existing) {
                if (!in_array($existing->id, $sentIds, true) && !in_array($existing->id, $deleteIds, true)) {
                    $keys[] = $this->variantKey($existing->color, $existing->size);
                }
            }
            if (count($keys) !== count(array_unique($keys))) $this->fail('Ada varian dengan warna dan ukuran yang sama.');

            $fields = [
                'name' => trim($d['name']),
                'category' => $d['category'],
                'price' => $d['price'],
                'weight' => $d['weight'],
            ];
            // Field opsional hanya diubah kalau dikirim (kolom material tidak boleh null)
            if ($r->has('material')) $fields['material'] = $d['material'] ?? '';
            if ($r->has('description')) $fields['description'] = $d['description'] ?? '';
            if ($r->has('swatch') && !empty($d['swatch'])) $fields['swatch'] = $d['swatch'];
            $p->update($fields);

            foreach ($d['variants'] as $v) {
                $values = [
                    'color' => trim($v['color']),
                    'size' => ($v['size'] ?? null) !== null && trim($v['size']) !== '' ? trim($v['size']) : null,
                    'stock' => $v['stock'],
                ];
                if (!empty($v['id'])) {
                    $own[$v['id']]->update($values);
                } else {
                    $p->variants()->create($values);
                }
            }

            // Hapus varian yang dibuang di form. Riwayat pesanan tetap aman karena
            // order_items menyimpan salinan nama produk, warna, dan ukuran.
            if ($deleteIds) {
                $p->variants()->whereIn('id', $deleteIds)->delete();
            }

            return $this->pj($p->fresh(['variants', 'photos']));
        });
    }

    /* Hapus produk beserta varian dan fotonya. Ditolak kalau masih ada di pesanan yang belum selesai/dibatalkan. */
    public function deleteProduct(Product $product)
    {
        $paths = [];

        DB::transaction(function () use ($product, &$paths) {
            $p = Product::with(['variants', 'photos'])->lockForUpdate()->findOrFail($product->id);

            $busy = OrderItem::with('order')
                ->whereIn('variant_id', $p->variants->pluck('id'))
                ->whereHas('order', fn ($q) => $q->whereNotIn('status', ['selesai', 'dibatalkan']))
                ->first();
            if ($busy) {
                $this->fail("Produk tidak bisa dihapus karena masih ada di pesanan {$busy->order->code} yang belum selesai.");
            }

            $paths = $p->photos->pluck('path')->all();
            $p->photos()->delete();
            $p->variants()->delete();
            $p->delete();
        });

        // File foto dihapus setelah data berhasil dihapus dari database
        foreach ($paths as $path) {
            Storage::disk('public')->delete($path);
        }

        return response()->json(['ok' => true]);
    }

    public function stock(Request $r, ProductVariant $variant)
    {
        $d = $r->validate(['stock' => 'required|integer|min:0|max:99999']);
        $variant->update(['stock' => $d['stock']]);

        return ['id' => $variant->id, 'stock' => $variant->stock];
    }

    /* Unggah satu atau beberapa foto produk (JPG/PNG/WEBP, maks. 5 MB per foto, total 6 foto). */
    public function uploadPhotos(Request $r, Product $product)
    {
        $r->validate([
            'photos' => 'required|array|min:1|max:' . self::PHOTO_LIMIT,
            'photos.*' => 'file|mimes:jpg,jpeg,png,webp|max:5120',
        ], [
            'photos.*.mimes' => 'Format foto harus JPG, PNG, atau WEBP.',
            'photos.*.max' => 'Ukuran foto maksimal 5 MB.',
            'photos.*.uploaded' => 'Foto gagal diunggah. Periksa ukuran fotonya.',
        ]);

        return DB::transaction(function () use ($r, $product) {
            $p = Product::with('photos')->lockForUpdate()->findOrFail($product->id);
            $files = $r->file('photos');

            if ($p->photos->count() + count($files) > self::PHOTO_LIMIT) {
                $this->fail('Maksimal ' . self::PHOTO_LIMIT . ' foto per produk.');
            }

            $position = (int) $p->photos->max('position');
            foreach ($files as $file) {
                $p->photos()->create([
                    'path' => $file->store('products', 'public'),
                    'position' => ++$position,
                ]);
            }

            return $this->pj($p->fresh(['variants', 'photos']));
        });
    }

    public function deletePhoto(ProductPhoto $photo)
    {
        $productId = $photo->product_id;

        Storage::disk('public')->delete($photo->path);
        $photo->delete();

        return $this->pj(Product::with(['variants', 'photos'])->findOrFail($productId));
    }

    /* ---------------------------------------------------------------
     * Promo & voucher (admin)
     * ------------------------------------------------------------- */

    private function vj(Voucher $v): array
    {
        return [
            'id' => $v->id, 'code' => $v->code, 'type' => $v->type, 'value' => $v->value,
            'minSpend' => $v->min_spend, 'channel' => $v->channel,
            'startsAt' => $v->starts_at?->format('Y-m-d'), 'endsAt' => $v->ends_at?->format('Y-m-d'),
            'usageLimit' => $v->usage_limit, 'used' => $v->used_count,
            'active' => (bool) $v->is_active, 'state' => $v->state(),
        ];
    }

    private function voucherData(Request $r, ?Voucher $current = null): array
    {
        $r->merge(['code' => Voucher::normalize((string) $r->input('code'))]);

        $d = $r->validate([
            'code' => ['required', 'regex:/^[A-Z0-9_-]{3,30}$/', Rule::unique('vouchers', 'code')->ignore($current?->id)],
            'type' => 'required|in:nominal,persen',
            'value' => 'required|integer|min:1|max:100000000',
            'min_spend' => 'nullable|integer|min:0|max:100000000',
            'channel' => 'required|in:semua,online,offline',
            'starts_at' => 'nullable|date',
            'ends_at' => 'nullable|date|after_or_equal:starts_at',
            'usage_limit' => 'nullable|integer|min:1|max:1000000',
            'is_active' => 'required|boolean',
        ], [
            'code.regex' => 'Kode voucher 3-30 karakter: huruf, angka, minus, atau garis bawah.',
            'code.unique' => 'Kode voucher sudah dipakai.',
            'ends_at.after_or_equal' => 'Tanggal "Sampai" tidak boleh sebelum "Berlaku dari".',
        ]);

        if ($d['type'] === 'persen' && $d['value'] > 100) $this->fail('Potongan persen maksimal 100.');
        if ($current && ($d['usage_limit'] ?? null) !== null && $d['usage_limit'] < $current->used_count) {
            $this->fail('Batas pemakaian tidak boleh kurang dari pemakaian saat ini (' . $current->used_count . ').');
        }

        $d['min_spend'] = $d['min_spend'] ?? 0;
        $d['usage_limit'] = $d['usage_limit'] ?? null;
        $d['starts_at'] = $d['starts_at'] ?? null;
        $d['ends_at'] = $d['ends_at'] ?? null;

        return $d;
    }

    public function vouchers()
    {
        return Voucher::orderByDesc('id')->get()->map(fn ($v) => $this->vj($v))->values();
    }

    public function createVoucher(Request $r)
    {
        $voucher = Voucher::create($this->voucherData($r));

        return response()->json($this->vj($voucher), 201);
    }

    public function updateVoucher(Request $r, Voucher $voucher)
    {
        $voucher->update($this->voucherData($r, $voucher));

        return $this->vj($voucher->fresh());
    }

    public function toggleVoucher(Voucher $voucher)
    {
        $voucher->update(['is_active' => !$voucher->is_active]);

        return $this->vj($voucher->fresh());
    }

    public function deleteVoucher(Voucher $voucher)
    {
        if ($voucher->used_count > 0) {
            $this->fail('Voucher sudah pernah dipakai. Nonaktifkan saja supaya riwayatnya tetap ada.');
        }
        $voucher->delete();

        return response()->json(['ok' => true]);
    }

    /* ---------------------------------------------------------------
     * Laporan penjualan (admin)
     * ------------------------------------------------------------- */

    public function report(Request $r)
    {
        $d = $r->validate([
            'from' => 'required|date',
            'to' => 'required|date|after_or_equal:from',
            'channel' => 'nullable|in:semua,online,offline',
        ]);
        $channel = $d['channel'] ?? 'semua';

        // Semua pesanan terverifikasi pada periode ini (kedua kanal), lalu disaring sesuai pilihan kanal
        $all = Order::with('items')
            ->where('payment_verified', true)
            ->where('status', '!=', 'dibatalkan')
            ->whereBetween('created_at', [Carbon::parse($d['from'])->startOfDay(), Carbon::parse($d['to'])->endOfDay()])
            ->latest('id')
            ->get();

        $orders = match ($channel) {
            'online' => $all->where('channel', 'online'),
            'offline' => $all->where('channel', 'pos'),
            default => $all,
        };
        $orders = $orders->values();

        // Ringkasan per kanal selalu dihitung dari periode penuh, tidak terpengaruh pilihan kanal
        $perChannel = fn (string $ch) => [
            'revenue' => $all->where('channel', $ch)->sum('total'),
            'count' => $all->where('channel', $ch)->count(),
        ];

        // Produk terlaris: jumlah terjual & pendapatan per nama produk (semua varian digabung)
        $top = [];
        foreach ($orders as $o) {
            foreach ($o->items as $i) {
                $top[$i->product_name]['name'] = $i->product_name;
                $top[$i->product_name]['qty'] = ($top[$i->product_name]['qty'] ?? 0) + $i->qty;
                $top[$i->product_name]['revenue'] = ($top[$i->product_name]['revenue'] ?? 0) + $i->qty * $i->unit_price;
            }
        }
        // Urut: paling banyak terjual; kalau sama, pendapatan terbesar; kalau masih sama, nama A-Z
        usort($top, fn ($a, $b) => [$b['qty'], $b['revenue'], $a['name']] <=> [$a['qty'], $a['revenue'], $b['name']]);
        $top = array_slice($top, 0, 5); // tampilkan 5 teratas

        return [
            'revenue' => $orders->sum('total'),
            'count' => $orders->count(),
            'items' => $orders->sum(fn ($o) => $o->items->sum('qty')),
            'online' => $perChannel('online'),
            'offline' => $perChannel('pos'),
            'top' => array_values($top),
            'orders' => $orders->map(fn ($o) => [
                'code' => $o->code,
                'channel' => $o->channel === 'pos' ? 'Offline' : 'Online',
                'createdAt' => $o->created_at->toIso8601String(),
                'customer' => $o->customer_name,
                'status' => $o->status,
                'total' => $o->total,
                'payment' => $o->payment_method,
            ])->values(),
        ];
    }

    /* ---------------------------------------------------------------
     * Kasir / POS
     * ------------------------------------------------------------- */

    /* Cek kode voucher di kasir: kembalikan aturannya, potongan dihitung di layar kasir. */
    public function posVoucher(Request $r)
    {
        $d = $r->validate(['code' => 'required|string|max:30']);

        $voucher = Voucher::where('code', Voucher::normalize($d['code']))->first();
        if (!$voucher) $this->fail('Kode voucher tidak ditemukan.');
        if ($reason = $voucher->unusable('pos')) $this->fail($reason);

        return [
            'code' => $voucher->code, 'type' => $voucher->type,
            'value' => $voucher->value, 'minSpend' => $voucher->min_spend,
        ];
    }

    public function pos(Request $r)
    {
        $d = $r->validate([
            'lines' => 'required|array|min:1',
            'lines.*.variantId' => 'required|integer|exists:product_variants,id',
            'lines.*.qty' => 'required|integer|min:1|max:99',
            'pay' => 'required|in:tunai,transfer',
            'cash' => 'nullable|integer|min:0',
            'voucher' => 'nullable|string|max:30',
        ]);

        $order = DB::transaction(function () use ($d, $r) {
            // Gabungkan baris yang varian-nya sama
            $qty = [];
            foreach ($d['lines'] as $line) {
                $qty[$line['variantId']] = ($qty[$line['variantId']] ?? 0) + $line['qty'];
            }

            $variants = ProductVariant::with('product')->whereIn('id', array_keys($qty))->lockForUpdate()->get();
            $items = [];
            $subtotal = 0;

            foreach ($variants as $v) {
                $q = $qty[$v->id];
                if ($v->stock < $q) $this->fail("Stok {$v->product->name} ({$v->color}) tidak cukup");

                $v->decrement('stock', $q);
                $subtotal += $v->product->price * $q;
                $items[] = [
                    'variant_id' => $v->id, 'product_name' => $v->product->name,
                    'color' => $v->color, 'size' => $v->size, 'qty' => $q, 'unit_price' => $v->product->price,
                ];
            }

            // Voucher (opsional): dicek ulang di server
            $discount = 0;
            $voucherCode = null;
            if (!empty($d['voucher'])) {
                $voucher = Voucher::where('code', Voucher::normalize($d['voucher']))->lockForUpdate()->first();
                if (!$voucher) $this->fail('Kode voucher tidak ditemukan.');
                if ($problem = $voucher->problem($subtotal, 'pos')) $this->fail($problem);

                $discount = $voucher->discountFor($subtotal);
                $voucherCode = $voucher->code;
                $voucher->increment('used_count');
            }
            $total = $subtotal - $discount;

            $cash = $d['pay'] === 'tunai' ? (int) ($d['cash'] ?? 0) : null;
            if ($d['pay'] === 'tunai' && $cash < $total) $this->fail('Uang tunai kurang.');

            $o = Order::create([
                'code' => 'TMP' . uniqid(), 'channel' => 'pos', 'status' => 'selesai',
                'customer_name' => 'Pelanggan toko', 'phone' => '', 'delivery_method' => 'pickup',
                'subtotal' => $subtotal, 'total' => $total, 'payment_method' => $d['pay'],
                'voucher_code' => $voucherCode, 'discount' => $discount,
                'cash_received' => $cash, 'change_amount' => $cash === null ? null : $cash - $total,
                'cashier' => $r->user()->name,
                'payment_verified' => true, 'paid_at' => now(), 'stock_deducted' => true,
            ]);

            // Kode final POS-0001 dibuat dari id (kode sementara dipakai karena id baru ada setelah insert)
            $o->update(['code' => 'POS-' . str_pad((string) $o->id, 4, '0', STR_PAD_LEFT)]);
            $o->items()->createMany($items);

            return $o->fresh('items');
        });

        return response()->json($this->oj($order), 201);
    }
}
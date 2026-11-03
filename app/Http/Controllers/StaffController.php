<?php

namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StaffController extends Controller
{
    private const STATUSES = ['menunggu_ongkir', 'menunggu_bayar', 'diproses', 'dikirim', 'siap_ambil', 'selesai', 'dibatalkan', 'tindak_lanjut'];

    private const CATEGORIES = ['gelang', 'kalung', 'cincin', 'anting', 'bagcharm'];

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
            'verified' => (bool) $o->payment_verified, 'payment' => $o->payment_method,
            'cash' => $o->cash_received, 'change' => $o->change_amount, 'cashier' => $o->cashier,
            'createdAt' => $o->created_at->toIso8601String(),
            'items' => $o->items->map(fn ($i) => [
                'productName' => $i->product_name, 'color' => $i->color, 'size' => $i->size,
                'qty' => $i->qty, 'unitPrice' => $i->unit_price, 'stock' => $stock[$i->variant_id] ?? 0,
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
                'total' => $o->subtotal + $d['fee'],
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
        return Product::with('variants')->orderBy('id')->get()->map(fn ($p) => [
            'id' => $p->id, 'name' => $p->name, 'category' => $p->category, 'price' => $p->price,
            'variants' => $p->variants->map(fn ($v) => [
                'id' => $v->id, 'color' => $v->color, 'size' => $v->size, 'stock' => $v->stock,
            ])->values(),
        ])->values();
    }

    public function createProduct(Request $r)
    {
        $d = $r->validate([
            'name' => 'required|string|min:2|max:120',
            'category' => 'required|in:' . implode(',', self::CATEGORIES),
            'price' => 'required|integer|min:0|max:100000000',
            'material' => 'nullable|string|max:200',
            'description' => 'nullable|string|max:1000',
            'swatch' => ['nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'colors' => 'required|string|max:200',
            'sizes' => 'nullable|string|max:100',
            'stock' => 'required|integer|min:0|max:9999',
        ]);

        // "Ruby, Rose Gold" -> ['Ruby', 'Rose Gold'] (tanpa kosong & duplikat)
        $colors = array_values(array_unique(array_filter(array_map('trim', explode(',', $d['colors'])))));
        $sizes = array_values(array_unique(array_filter(array_map('trim', explode(',', $d['sizes'] ?? '')))));
        if (!$colors) $this->fail('Isi minimal satu warna.');

        DB::transaction(function () use ($d, $colors, $sizes) {
            $product = Product::create([
                'name' => $d['name'],
                'category' => $d['category'],
                'price' => $d['price'],
                'material' => $d['material'] ?? '',
                'description' => $d['description'] ?? '',
                'swatch' => $d['swatch'] ?? '#e8dfd0',
            ]);

            // Satu varian untuk setiap kombinasi warna x ukuran
            foreach ($colors as $color) {
                foreach ($sizes ?: [null] as $size) {
                    $product->variants()->create(['color' => $color, 'size' => $size, 'stock' => $d['stock']]);
                }
            }
        });

        return response()->json(['ok' => true], 201);
    }

    public function stock(Request $r, ProductVariant $variant)
    {
        $d = $r->validate(['stock' => 'required|integer|min:0|max:99999']);
        $variant->update(['stock' => $d['stock']]);

        return ['id' => $variant->id, 'stock' => $variant->stock];
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

        $query = Order::with('items')
            ->where('payment_verified', true)
            ->where('status', '!=', 'dibatalkan')
            ->whereBetween('created_at', [Carbon::parse($d['from'])->startOfDay(), Carbon::parse($d['to'])->endOfDay()]);

        if ($channel === 'online') $query->where('channel', 'online');
        if ($channel === 'offline') $query->where('channel', 'pos');

        $orders = $query->latest('id')->get();

        // Produk terlaris: jumlah terjual & pendapatan per nama produk
        $top = [];
        foreach ($orders as $o) {
            foreach ($o->items as $i) {
                $top[$i->product_name]['name'] = $i->product_name;
                $top[$i->product_name]['qty'] = ($top[$i->product_name]['qty'] ?? 0) + $i->qty;
                $top[$i->product_name]['revenue'] = ($top[$i->product_name]['revenue'] ?? 0) + $i->qty * $i->unit_price;
            }
        }
        usort($top, fn ($a, $b) => $b['qty'] <=> $a['qty']);

        return [
            'revenue' => $orders->sum('total'),
            'count' => $orders->count(),
            'items' => $orders->sum(fn ($o) => $o->items->sum('qty')),
            'top' => array_values($top),
            'orders' => $orders->map(fn ($o) => [
                'code' => $o->code,
                'channel' => $o->channel === 'pos' ? 'Offline' : 'Online',
                'createdAt' => $o->created_at->toIso8601String(),
                'total' => $o->total,
                'payment' => $o->payment_method,
            ])->values(),
        ];
    }

    /* ---------------------------------------------------------------
     * Kasir / POS
     * ------------------------------------------------------------- */

    public function pos(Request $r)
    {
        $d = $r->validate([
            'lines' => 'required|array|min:1',
            'lines.*.variantId' => 'required|integer|exists:product_variants,id',
            'lines.*.qty' => 'required|integer|min:1|max:99',
            'pay' => 'required|in:tunai,transfer',
            'cash' => 'nullable|integer|min:0',
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

            $cash = $d['pay'] === 'tunai' ? (int) ($d['cash'] ?? 0) : null;
            if ($d['pay'] === 'tunai' && $cash < $subtotal) $this->fail('Uang tunai kurang.');

            $o = Order::create([
                'code' => 'TMP' . uniqid(), 'channel' => 'pos', 'status' => 'selesai',
                'customer_name' => 'Pelanggan toko', 'phone' => '', 'delivery_method' => 'pickup',
                'subtotal' => $subtotal, 'total' => $subtotal, 'payment_method' => $d['pay'],
                'cash_received' => $cash, 'change_amount' => $cash === null ? null : $cash - $subtotal,
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
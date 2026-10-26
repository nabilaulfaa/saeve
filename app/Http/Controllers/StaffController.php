<?php
namespace App\Http\Controllers;

use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StaffController extends Controller
{
    private const STATUSES = ['menunggu_ongkir', 'menunggu_bayar', 'diproses', 'dikirim', 'siap_ambil', 'selesai', 'dibatalkan', 'tindak_lanjut'];

    private function fail(string $m): never
    {
        throw ValidationException::withMessages(['error' => $m]);
    }

    private function oj(Order $o): array
    {
        $o->loadMissing('items');
        $stock = ProductVariant::whereIn('id', $o->items->pluck('variant_id'))->pluck('stock', 'id');
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

    private function deduct(Order $o): bool
    {
        $vs = ProductVariant::whereIn('id', $o->items->pluck('variant_id'))->lockForUpdate()->get()->keyBy('id');
        foreach ($o->items as $i) {
            if (($vs[$i->variant_id]->stock ?? 0) < $i->qty) return false;
        }
        foreach ($o->items as $i) {
            $vs[$i->variant_id]->decrement('stock', $i->qty);
        }
        return true;
    }

    private function restock(Order $o): void
    {
        foreach ($o->items as $i) {
            ProductVariant::where('id', $i->variant_id)->increment('stock', $i->qty);
        }
    }

    public function orders()
    {
        return Order::with('items')->where('channel', 'online')->latest('id')->get()->map(fn ($o) => $this->oj($o))->values();
    }

    public function shipping(Request $r, Order $order)
    {
        $d = $r->validate(['fee' => 'required|integer|min:0|max:10000000']);
        if ($order->channel !== 'online' || $order->delivery_method !== 'kirim' || $order->payment_verified
            || !in_array($order->status, ['menunggu_ongkir', 'menunggu_bayar'], true)) {
            $this->fail('Ongkos kirim tidak bisa diubah untuk pesanan ini.');
        }
        $order->update(['shipping_fee' => $d['fee'], 'total' => $order->subtotal + $d['fee'], 'status' => 'menunggu_bayar']);
        return $this->oj($order->fresh('items'));
    }

    public function verify(Order $order)
    {
        return DB::transaction(function () use ($order) {
            $o = Order::with('items')->lockForUpdate()->findOrFail($order->id);
            if ($o->payment_verified) $this->fail('Pembayaran sudah diverifikasi.');
            if ($o->status === 'menunggu_ongkir') $this->fail('Tetapkan ongkos kirim dulu.');
            if ($o->status !== 'menunggu_bayar') $this->fail('Status pesanan tidak sesuai.');
            $ok = $this->deduct($o);
            $o->update(['payment_verified' => true, 'paid_at' => now(), 'stock_deducted' => $ok, 'status' => $ok ? 'diproses' : 'tindak_lanjut']);
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
            if (in_array($to, ['menunggu_ongkir', 'menunggu_bayar', 'tindak_lanjut'], true)) $this->fail('Status ini tidak bisa dipilih manual.');
            if ($to === 'dibatalkan' && $o->stock_deducted) {
                $this->restock($o);
                $o->stock_deducted = false;
            }
            if ($to !== 'dibatalkan') {
                if (!$o->payment_verified) $this->fail('Verifikasi pembayaran dulu.');
                if (!$o->stock_deducted) {
                    if (!$this->deduct($o)) $this->fail('Stok masih kurang. Tambah stok dulu.');
                    $o->stock_deducted = true;
                }
            }
            $o->status = $to;
            $o->save();
            return $this->oj($o->fresh('items'));
        });
    }

    public function products()
    {
        return Product::with('variants')->orderBy('id')->get()->map(fn ($p) => [
            'id' => $p->id, 'name' => $p->name, 'category' => $p->category, 'price' => $p->price,
            'variants' => $p->variants->map(fn ($v) => ['id' => $v->id, 'color' => $v->color, 'size' => $v->size, 'stock' => $v->stock])->values(),
        ])->values();
    }

    public function createProduct(Request $r)
    {
        $d = $r->validate([
            'name' => 'required|string|min:2|max:120', 'category' => 'required|in:gelang,kalung,cincin,anting',
            'price' => 'required|integer|min:0|max:100000000', 'material' => 'nullable|string|max:200',
            'description' => 'nullable|string|max:1000', 'swatch' => ['nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'colors' => 'required|string|max:200', 'sizes' => 'nullable|string|max:100', 'stock' => 'required|integer|min:0|max:9999',
        ]);
        $colors = array_values(array_filter(array_map('trim', explode(',', $d['colors']))));
        $sizes = array_values(array_filter(array_map('trim', explode(',', $d['sizes'] ?? ''))));
        if (!$colors) $this->fail('Isi minimal satu warna.');
        DB::transaction(function () use ($d, $colors, $sizes) {
            $p = Product::create([
                'name' => $d['name'], 'category' => $d['category'], 'price' => $d['price'],
                'material' => $d['material'] ?? '', 'description' => $d['description'] ?? '', 'swatch' => $d['swatch'] ?? '#e8dfd0',
            ]);
            foreach ($colors as $c) {
                foreach ($sizes ?: [null] as $s) {
                    $p->variants()->create(['color' => $c, 'size' => $s, 'stock' => $d['stock']]);
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

    public function report(Request $r)
    {
        $d = $r->validate(['from' => 'required|date', 'to' => 'required|date', 'channel' => 'nullable|in:semua,online,offline']);
        $q = Order::with('items')->where('payment_verified', true)->where('status', '!=', 'dibatalkan')
            ->whereBetween('created_at', [Carbon::parse($d['from'])->startOfDay(), Carbon::parse($d['to'])->endOfDay()]);
        if (($d['channel'] ?? 'semua') === 'online') $q->where('channel', 'online');
        if (($d['channel'] ?? 'semua') === 'offline') $q->where('channel', 'pos');
        $orders = $q->latest('id')->get();
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
            'revenue' => $orders->sum('total'), 'count' => $orders->count(),
            'items' => $orders->sum(fn ($o) => $o->items->sum('qty')),
            'top' => array_values($top),
            'orders' => $orders->map(fn ($o) => [
                'code' => $o->code, 'channel' => $o->channel === 'pos' ? 'Offline' : 'Online',
                'createdAt' => $o->created_at->toIso8601String(), 'total' => $o->total, 'payment' => $o->payment_method,
            ])->values(),
        ];
    }

    public function pos(Request $r)
    {
        $d = $r->validate([
            'lines' => 'required|array|min:1', 'lines.*.variantId' => 'required|integer|exists:product_variants,id',
            'lines.*.qty' => 'required|integer|min:1|max:99', 'pay' => 'required|in:tunai,transfer', 'cash' => 'nullable|integer|min:0',
        ]);
        $order = DB::transaction(function () use ($d, $r) {
            $qty = [];
            foreach ($d['lines'] as $l) $qty[$l['variantId']] = ($qty[$l['variantId']] ?? 0) + $l['qty'];
            $vs = ProductVariant::with('product')->whereIn('id', array_keys($qty))->lockForUpdate()->get();
            $items = [];
            $sub = 0;
            foreach ($vs as $v) {
                $q = $qty[$v->id];
                if ($v->stock < $q) $this->fail("Stok {$v->product->name} ({$v->color}) tidak cukup");
                $v->decrement('stock', $q);
                $sub += $v->product->price * $q;
                $items[] = ['variant_id' => $v->id, 'product_name' => $v->product->name, 'color' => $v->color, 'size' => $v->size, 'qty' => $q, 'unit_price' => $v->product->price];
            }
            $cash = $d['pay'] === 'tunai' ? (int) ($d['cash'] ?? 0) : null;
            if ($d['pay'] === 'tunai' && $cash < $sub) $this->fail('Uang tunai kurang.');
            $o = Order::create([
                'code' => 'TMP' . uniqid(), 'channel' => 'pos', 'status' => 'selesai', 'customer_name' => 'Pelanggan toko', 'phone' => '',
                'delivery_method' => 'pickup', 'subtotal' => $sub, 'total' => $sub, 'payment_method' => $d['pay'],
                'cash_received' => $cash, 'change_amount' => $cash === null ? null : $cash - $sub, 'cashier' => $r->user()->name,
                'payment_verified' => true, 'paid_at' => now(), 'stock_deducted' => true,
            ]);
            $o->update(['code' => 'POS-' . str_pad((string) $o->id, 4, '0', STR_PAD_LEFT)]);
            $o->items()->createMany($items);
            return $o->fresh('items');
        });
        return response()->json($this->oj($order), 201);
    }
}
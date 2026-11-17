<?php
namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Voucher;
use App\Services\RajaOngkirService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class StoreController extends Controller
{
    /* Berat per item (gram) kalau produk belum punya berat. Samakan dengan SHIPPING_DEFAULT_WEIGHT di app.js. */
    private const DEFAULT_ITEM_WEIGHT = 100;

    public function products()
    {
        return Product::with(['variants', 'photos'])->orderBy('id')->get()->map(fn ($p) => [
            'id' => $p->id, 'name' => $p->name, 'category' => $p->category, 'price' => $p->price,
            'weight' => (int) $p->weight, 'material' => $p->material, 'description' => $p->description, 'color' => $p->swatch,
            'photos' => $p->photos->map(fn ($photo) => [
                'id' => $photo->id,
                'url' => Storage::disk('public')->url($photo->path),
            ])->values(),
            'variants' => $p->variants->map(fn ($v) => [
                'id' => $v->id, 'color' => $v->color, 'size' => $v->size, 'stock' => $v->stock,
            ])->values(),
        ])->values();
    }

    public function store(Request $r, RajaOngkirService $ro)
    {
        $r->merge(['phone' => preg_replace('/\D/', '', (string) $r->input('phone', ''))]);
        $d = $r->validate([
            'name' => 'required|string|min:3|max:100',
            'phone' => ['required', 'regex:/^08\d{8,12}$/'],
            'delivery' => 'required|in:kirim,pickup',
            'address' => 'required_if:delivery,kirim|nullable|string|min:8|max:255',
            'city' => 'required_if:delivery,kirim|nullable|string|min:3|max:100',
            'postal' => 'required_if:delivery,kirim|nullable|digits:5',
            'lines' => 'required|array|min:1',
            'lines.*.variantId' => 'required|integer|exists:product_variants,id',
            'lines.*.qty' => 'required|integer|min:1|max:99',
            'voucher' => 'nullable|string|max:30',
            // Pilihan ongkir (opsional). Harganya TIDAK dipercaya dari browser, dihitung ulang di server.
            'shipping_destination_id' => 'nullable|integer',
            'shipping_courier' => 'nullable|string|max:20',
            'shipping_service' => 'nullable|string|max:30',
        ]);

        // Hitung estimasi ongkir SEBELUM transaksi database, supaya panggilan ke RajaOngkir
        // tidak menahan kunci stok.
        $shipping = $this->estimateShipping($d, $ro);

        $order = DB::transaction(function () use ($d, $shipping) {
            $qty = [];
            foreach ($d['lines'] as $l) {
                $qty[$l['variantId']] = ($qty[$l['variantId']] ?? 0) + $l['qty'];
            }
            $variants = ProductVariant::with('product')->whereIn('id', array_keys($qty))->lockForUpdate()->get();
            $items = [];
            $sub = 0;
            foreach ($variants as $v) {
                $q = $qty[$v->id];
                if ($v->stock < $q) {
                    throw ValidationException::withMessages(['stock' => "Stok {$v->product->name} ({$v->color}) tidak cukup"]);
                }
                $sub += $v->product->price * $q;
                $items[] = [
                    'variant_id' => $v->id, 'product_name' => $v->product->name, 'color' => $v->color,
                    'size' => $v->size, 'qty' => $q, 'unit_price' => $v->product->price,
                ];
            }
            // Voucher (opsional): dicek ulang di server saat pesanan dibuat
            $discount = 0;
            $voucherCode = null;
            if (!empty($d['voucher'])) {
                $voucher = Voucher::where('code', Voucher::normalize($d['voucher']))->lockForUpdate()->first();
                if (!$voucher) throw ValidationException::withMessages(['voucher' => 'Kode voucher tidak ditemukan.']);
                if ($problem = $voucher->problem($sub, 'online')) throw ValidationException::withMessages(['voucher' => $problem]);

                $discount = $voucher->discountFor($sub);
                $voucherCode = $voucher->code;
                $voucher->increment('used_count');
            }

            $kirim = $d['delivery'] === 'kirim';

            // Ongkir otomatis: kalau pembeli memilih layanan kurir dan server berhasil memverifikasinya,
            // ongkir langsung masuk total dan pesanan langsung menunggu pembayaran.
            // Kalau tidak ada pilihan (RajaOngkir sedang gangguan), alurnya kembali manual: admin menetapkan ongkir.
            $autoShip = $kirim && $shipping['shipping_estimate'] !== null;
            $fee = $autoShip ? $shipping['shipping_estimate'] : 0;

            $o = Order::create([
                'code' => 'TMP' . uniqid(),
                'status' => ($kirim && !$autoShip) ? 'menunggu_ongkir' : 'menunggu_bayar',
                'customer_name' => $d['name'], 'phone' => $d['phone'], 'delivery_method' => $d['delivery'],
                'address' => $kirim ? $d['address'] : null, 'city' => $kirim ? $d['city'] : null,
                'postal_code' => $kirim ? $d['postal'] : null, 'subtotal' => $sub,
                'shipping_fee' => $fee, 'total' => $sub - $discount + $fee,
                'voucher_code' => $voucherCode, 'discount' => $discount,
            ] + $shipping);
            $o->update(['code' => 'SV-' . (1000 + $o->id)]);
            $o->items()->createMany($items);
            return $o->fresh('items');
        });

        return response()->json($this->orderJson($order), 201);
    }

    /* Cek voucher di halaman checkout: kembalikan potongan untuk isi keranjang saat ini. */
    public function checkVoucher(Request $r)
    {
        $d = $r->validate([
            'code' => 'required|string|max:30',
            'lines' => 'required|array|min:1',
            'lines.*.variantId' => 'required|integer|exists:product_variants,id',
            'lines.*.qty' => 'required|integer|min:1|max:99',
        ]);

        $subtotal = $this->subtotalFor($d['lines']);

        $voucher = Voucher::where('code', Voucher::normalize($d['code']))->first();
        if (!$voucher) throw ValidationException::withMessages(['voucher' => 'Kode voucher tidak ditemukan.']);
        if ($problem = $voucher->problem($subtotal, 'online')) throw ValidationException::withMessages(['voucher' => $problem]);

        return [
            'code' => $voucher->code, 'type' => $voucher->type, 'value' => $voucher->value,
            'subtotal' => $subtotal, 'discount' => $voucher->discountFor($subtotal),
        ];
    }

    /*
     * Daftar voucher untuk dipilih di checkout (seperti marketplace).
     * Voucher yang aktif dan berlaku untuk kanal online selalu ditampilkan; yang belum memenuhi
     * syarat (minimum belanja) ditandai eligible=false beserta alasannya, jadi tidak bisa dipilih.
     */
    public function availableVouchers(Request $r)
    {
        $d = $r->validate([
            'lines' => 'required|array|min:1',
            'lines.*.variantId' => 'required|integer|exists:product_variants,id',
            'lines.*.qty' => 'required|integer|min:1|max:99',
        ]);
        $subtotal = $this->subtotalFor($d['lines']);

        return Voucher::where('is_active', true)->get()
            ->filter(fn ($v) => $v->unusable('online') === null)
            ->map(function ($v) use ($subtotal) {
                $short = $v->min_spend - $subtotal;
                $eligible = $short <= 0;

                return [
                    'code' => $v->code, 'type' => $v->type, 'value' => $v->value,
                    'minSpend' => $v->min_spend,
                    'endsAt' => $v->ends_at?->format('Y-m-d'),
                    'remaining' => $v->usage_limit === null ? null : max(0, $v->usage_limit - $v->used_count),
                    'eligible' => $eligible,
                    'discount' => $eligible ? $v->discountFor($subtotal) : 0,
                    'reason' => $eligible ? null : 'Belanja Rp ' . number_format($short, 0, ',', '.') . ' lagi untuk memakai voucher ini.',
                ];
            })
            ->sortBy([['eligible', 'desc'], ['discount', 'desc'], ['minSpend', 'asc']])
            ->values();
    }

    /* Subtotal (harga x jumlah) dari baris keranjang, dihitung dari harga di database. */
    private function subtotalFor(array $lines): int
    {
        $qty = [];
        foreach ($lines as $l) {
            $qty[$l['variantId']] = ($qty[$l['variantId']] ?? 0) + $l['qty'];
        }

        $subtotal = 0;
        foreach (ProductVariant::with('product')->whereIn('id', array_keys($qty))->get() as $v) {
            $subtotal += $v->product->price * $qty[$v->id];
        }

        return $subtotal;
    }

    /* Total berat (gram) isi keranjang, dihitung dari data produk di database. */
    private function weightFor(array $lines): int
    {
        $qty = [];
        foreach ($lines as $l) {
            $qty[$l['variantId']] = ($qty[$l['variantId']] ?? 0) + $l['qty'];
        }

        $weight = 0;
        foreach (ProductVariant::with('product')->whereIn('id', array_keys($qty))->get() as $v) {
            $perItem = (int) $v->product->weight ?: self::DEFAULT_ITEM_WEIGHT;
            $weight += $perItem * $qty[$v->id];
        }

        return max(1, $weight);
    }

    /*
     * Hitung ulang ongkir pilihan pembeli lewat RajaOngkir.
     * - Pilihan tidak diisi: pesanan dibuat tanpa ongkir otomatis (admin menetapkan manual).
     * - Pilihan diisi tapi gagal diverifikasi: ditolak dengan pesan, supaya total tidak berbeda dari yang dilihat pembeli.
     */
    private function estimateShipping(array $d, RajaOngkirService $ro): array
    {
        $none = [
            'shipping_destination_id' => null, 'shipping_courier' => null,
            'shipping_service' => null, 'shipping_etd' => null, 'shipping_estimate' => null,
        ];

        if (
            $d['delivery'] !== 'kirim'
            || empty($d['shipping_destination_id'])
            || empty($d['shipping_courier'])
            || empty($d['shipping_service'])
        ) {
            return $none;
        }

        try {
            $courier = strtolower($d['shipping_courier']);
            $options = $ro->calculateCost((int) $d['shipping_destination_id'], $this->weightFor($d['lines']), [$courier]);

            foreach ($options as $option) {
                if (strtolower($option['code']) === $courier && $option['service'] === $d['shipping_service']) {
                    return [
                        'shipping_destination_id' => (int) $d['shipping_destination_id'],
                        'shipping_courier' => $courier,
                        'shipping_service' => $option['service'],
                        'shipping_etd' => $option['etd'] ?? null,
                        'shipping_estimate' => (int) $option['cost'],
                    ];
                }
            }
        } catch (\Throwable $e) {
            report($e);
            throw ValidationException::withMessages(['shipping' => 'Ongkir gagal dihitung. Coba lagi sebentar lagi.']);
        }

        throw ValidationException::withMessages(['shipping' => 'Layanan pengiriman yang dipilih tidak tersedia. Silakan pilih ulang.']);
    }

    public function lookup(Request $r)
    {
        $r->validate(['code' => 'required|string', 'phone' => 'required|string']);
        $o = Order::with('items')->where('code', strtoupper(trim($r->code)))->first();
        if (!$o || $o->phone !== preg_replace('/\D/', '', $r->phone)) {
            return response()->json(['message' => 'Pesanan tidak ditemukan'], 404);
        }
        return $this->orderJson($o);
    }

    private function orderJson(Order $o): array
    {
        return [
            'code' => $o->code, 'status' => $o->status, 'name' => $o->customer_name, 'phone' => $o->phone,
            'delivery' => $o->delivery_method, 'address' => $o->address, 'city' => $o->city,
            'subtotal' => $o->subtotal, 'shippingFee' => $o->shipping_fee, 'total' => $o->total,
            'voucherCode' => $o->voucher_code, 'discount' => (int) $o->discount,
            'shippingCourier' => $o->shipping_courier, 'shippingService' => $o->shipping_service,
            'shippingEtd' => $o->shipping_etd,
            'shippingEstimate' => $o->shipping_estimate === null ? null : (int) $o->shipping_estimate,
            'createdAt' => $o->created_at->toIso8601String(),
            'items' => $o->items->map(fn ($i) => [
                'productName' => $i->product_name, 'color' => $i->color, 'size' => $i->size,
                'qty' => $i->qty, 'unitPrice' => $i->unit_price,
            ])->values(),
        ];
    }
}
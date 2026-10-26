<?php
namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StoreController extends Controller
{
    public function products()
    {
        return Product::with('variants')->orderBy('id')->get()->map(fn ($p) => [
            'id' => $p->id, 'name' => $p->name, 'category' => $p->category, 'price' => $p->price,
            'material' => $p->material, 'description' => $p->description, 'color' => $p->swatch,
            'variants' => $p->variants->map(fn ($v) => [
                'id' => $v->id, 'color' => $v->color, 'size' => $v->size, 'stock' => $v->stock,
            ])->values(),
        ])->values();
    }

    public function store(Request $r)
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
        ]);

        $order = DB::transaction(function () use ($d) {
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
            $kirim = $d['delivery'] === 'kirim';
            $o = Order::create([
                'code' => 'TMP' . uniqid(),
                'status' => $kirim ? 'menunggu_ongkir' : 'menunggu_bayar',
                'customer_name' => $d['name'], 'phone' => $d['phone'], 'delivery_method' => $d['delivery'],
                'address' => $kirim ? $d['address'] : null, 'city' => $kirim ? $d['city'] : null,
                'postal_code' => $kirim ? $d['postal'] : null, 'subtotal' => $sub, 'total' => $sub,
            ]);
            $o->update(['code' => 'SV-' . (1000 + $o->id)]);
            $o->items()->createMany($items);
            return $o->fresh('items');
        });

        return response()->json($this->orderJson($order), 201);
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
            'createdAt' => $o->created_at->toIso8601String(),
            'items' => $o->items->map(fn ($i) => [
                'productName' => $i->product_name, 'color' => $i->color, 'size' => $i->size,
                'qty' => $i->qty, 'unitPrice' => $i->unit_price,
            ])->values(),
        ];
    }
}

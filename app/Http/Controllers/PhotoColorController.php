<?php

namespace App\Http\Controllers;

use App\Models\ProductPhoto;
use Illuminate\Http\Request;

/*
 * Warna foto produk (untuk halaman admin).
 * - index  : daftar { idFoto: warna } untuk foto yang sudah diberi warna
 * - update : simpan warna beberapa foto sekaligus; warna kosong = foto umum (semua warna)
 */
class PhotoColorController extends Controller
{
    public function index()
    {
        return ProductPhoto::whereNotNull('color')->pluck('color', 'id');
    }

    public function update(Request $request)
    {
        $data = $request->validate([
            'photos' => 'required|array|max:50',
            'photos.*.id' => 'required|integer|exists:product_photos,id',
            'photos.*.color' => 'nullable|string|max:50',
        ]);

        foreach ($data['photos'] as $row) {
            $color = isset($row['color']) ? trim($row['color']) : '';
            ProductPhoto::whereKey($row['id'])->update(['color' => $color === '' ? null : $color]);
        }

        return response()->json(['ok' => true]);
    }
}
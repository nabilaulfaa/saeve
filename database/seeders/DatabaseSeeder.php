<?php
namespace Database\Seeders;

use App\Models\Product;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        if (Product::exists()) return;
        $data = [
            ['Gelang Manik Ruby Heart', 'gelang', 185000, 'Kristal ruby, rantai rose gold', 'Gelang manik berbentuk hati dengan rantai rose gold.', '#8e2a30', [['Ruby', null, 6], ['Rose Gold', null, 3]]],
            ['Kalung Rantai Merah', 'kalung', 265000, 'Stainless anti karat, kristal', 'Kalung rantai dengan titik manik merah.', '#b5707a', [['Rose Gold', null, 5], ['Silver', null, 0]]],
            ['Cincin Manik Pastel', 'cincin', 145000, 'Kawat rose gold, manik pastel', 'Set cincin tipis warna pastel yang bisa ditumpuk.', '#c9a8b8', [['Pastel', '14', 4], ['Pastel', '16', 2], ['Pastel', '18', 1]]],
            ['Anting Kristal', 'anting', 175000, 'Stainless steel, kristal', 'Anting ringan yang nyaman dipakai seharian.', '#a9b4c4', [['Silver', null, 8], ['Rose Gold', null, 5]]],
        ];
        foreach ($data as [$n, $c, $p, $m, $d, $s, $vs]) {
            $prod = Product::create(['name' => $n, 'category' => $c, 'price' => $p, 'material' => $m, 'description' => $d, 'swatch' => $s]);
            foreach ($vs as [$col, $size, $stock]) {
                $prod->variants()->create(['color' => $col, 'size' => $size, 'stock' => $stock]);
            }
        }
    }
}

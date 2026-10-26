<?php
namespace Database\Seeders;

use App\Models\Product;
use Illuminate\Database\Seeder;

class CatalogSeeder extends Seeder
{
    public function run(): void
    {
        if (Product::where('name', 'Daisy Bracelet')->exists()) return;

        // hapus 4 produk contoh lama
        Product::whereIn('name', ['Gelang Manik Ruby Heart', 'Kalung Rantai Merah', 'Cincin Manik Pastel', 'Anting Kristal'])->delete();

        $ringSizes = ['4', '5', '6', '7', '8', '9', '10', '11', '12', '13'];
        $items = [
            ['Daisy Bracelet', 'gelang', 28000, 'Japanese Seed Beads & Czech Crystals · Stainless Steel 304 Gold Plated', 'Gelang bunga daisy, panjang 16 cm + extender 4 cm. Kode B1D1–B1D5.', '#b98a9a', ['Amethyst', 'Ruby', 'Sage', 'Black', 'Blue'], null],
            ['Breeze Bracelet', 'gelang', 45000, 'Czech Crystals · Stainless Steel 304 Gold Plated', 'Gelang kristal, panjang 16 cm + extender 4 cm. Kode B2B1–B2B3.', '#d8c3a0', ['Clear', 'Champagne', 'Aurora'], null],
            ['Crystal Glint Bracelet', 'gelang', 45000, 'Czech Crystals · Stainless Steel 304 Rose Gold Plated', 'Gelang rantai dengan titik kristal, 16 cm + extender 4 cm. Kode B3CG1–B3CG3.', '#c58b8b', ['Ruby', 'Ice Blue', 'Aurora'], null],
            ['Nami Bracelet', 'gelang', 48000, 'Czech Crystals & Glass Beads · Stainless Steel 304 Gold Plated', 'Gelang 16 cm + extender 4 cm. Kode B4N1–B4N2.', '#8fa8c4', ['Silver', 'Gold'], null],
            ['Roselle Bracelet', 'gelang', 50000, 'Natural Beads & Glass Beads · Stainless Steel 304 Gold Plated', 'Gelang 16 cm + extender 4 cm. Kode B5R1–B5R2.', '#b5557a', ['Silver', 'Gold'], null],
            ['Twine Rings', 'cincin', 25000, 'Czech Beads · Copper Wire', 'Cincin anyaman manik. Kode R1T1–R1T5. Ukuran 4–13, bisa request ukuran.', '#e0b8a8', ['Clear', 'Amethyst', 'Aurora', 'Black', 'Pink'], $ringSizes],
            ['Glimpse Bag Charm', 'bagcharm', 75000, 'Upcycled denim, mirror glass, acrylic shrink charm, stainless steel key clasp, paracord', 'Charm denim bekas dengan bordir tangan. Total panjang ± 17 cm. Kode BC1G1–BC1G2.', '#2c3a5c', ['Bloom', 'Muse'], null],
            ['Pocket Fish Bag Charm', 'bagcharm', 70000, 'Upcycled denim, manik, paracord, stainless steel keyring', 'Pouch tersembunyi berbentuk ikan dengan watermelon beaded charm. Total panjang ± 17–18 cm. Kode BC2PF1.', '#3a4f7a', ['Denim'], null],
            ['Summer Bag Charm', 'bagcharm', 45000, 'Puffy knot, beaded charm, glossy shrink charm, stainless steel keyring', 'Charm musim panas. Total panjang ± 14 cm. Kode BC3S1–BC3S3.', '#c9d6a8', ['Cactus', 'Cherry', 'Ruby Bloom'], null],
        ];

        foreach ($items as [$name, $cat, $price, $mat, $desc, $sw, $colors, $sizes]) {
            $p = Product::create([
                'name' => $name, 'category' => $cat, 'price' => $price,
                'material' => $mat, 'description' => $desc, 'swatch' => $sw,
            ]);
            foreach ($colors as $c) {
                foreach ($sizes ?? [null] as $s) {
                    $p->variants()->create(['color' => $c, 'size' => $s, 'stock' => 5]);
                }
            }
        }
    }
}
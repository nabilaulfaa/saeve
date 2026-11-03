<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /* `php artisan db:seed` menjalankan semua seeder di bawah ini sekaligus. */
    public function run(): void
    {
        $this->call([
            StaffSeeder::class,   // akun admin & kasir
            CatalogSeeder::class, // produk katalog SAEVÉ
        ]);
    }
}
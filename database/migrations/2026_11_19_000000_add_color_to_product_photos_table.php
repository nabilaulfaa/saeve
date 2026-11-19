<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Foto produk bisa dikaitkan ke satu warna. Kosong (null) = foto umum, tampil di semua warna.
     */
    public function up(): void
    {
        Schema::table('product_photos', function (Blueprint $table) {
            $table->string('color', 50)->nullable()->after('path');
        });
    }

    public function down(): void
    {
        Schema::table('product_photos', function (Blueprint $table) {
            $table->dropColumn('color');
        });
    }
};

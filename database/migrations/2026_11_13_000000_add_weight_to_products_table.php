<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('products', function (Blueprint $t) {
            // Berat per barang dalam gram, dipakai untuk hitung ongkir (RajaOngkir).
            $t->unsignedInteger('weight')->default(0)->after('price');
        });
    }

    public function down(): void
    {
        Schema::table('products', fn (Blueprint $t) => $t->dropColumn('weight'));
    }
};

<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('vouchers', function (Blueprint $t) {
            $t->id();
            $t->string('code', 30)->unique();               // disimpan huruf besar
            $t->string('type', 10)->default('nominal');     // nominal (Rp) | persen (%)
            $t->unsignedInteger('value');                   // Rp atau persen sesuai type
            $t->unsignedInteger('min_spend')->default(0);   // minimum belanja (subtotal)
            $t->string('channel', 10)->default('semua');    // semua | online | offline
            $t->date('starts_at')->nullable();
            $t->date('ends_at')->nullable();
            $t->unsignedInteger('usage_limit')->nullable(); // null = tanpa batas
            $t->unsignedInteger('used_count')->default(0);
            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });

        // Catatan pemakaian voucher di pesanan (dipakai saat voucher dihubungkan ke checkout/kasir)
        Schema::table('orders', function (Blueprint $t) {
            $t->string('voucher_code', 30)->nullable()->after('shipping_fee');
            $t->unsignedInteger('discount')->default(0)->after('voucher_code');
        });
    }

    public function down(): void
    {
        Schema::table('orders', fn (Blueprint $t) => $t->dropColumn(['voucher_code', 'discount']));
        Schema::dropIfExists('vouchers');
    }
};

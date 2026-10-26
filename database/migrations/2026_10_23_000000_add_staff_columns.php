<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $t) {
            $t->string('role')->nullable();
        });
        Schema::table('orders', function (Blueprint $t) {
            $t->boolean('stock_deducted')->default(false);
            $t->unsignedInteger('cash_received')->nullable();
            $t->integer('change_amount')->nullable();
            $t->string('cashier')->nullable();
            $t->timestamp('paid_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $t) => $t->dropColumn('role'));
        Schema::table('orders', fn (Blueprint $t) => $t->dropColumn(['stock_deducted', 'cash_received', 'change_amount', 'cashier', 'paid_at']));
    }
};
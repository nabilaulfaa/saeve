<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            // Pilihan ongkir dari pembeli (hanya estimasi; ongkir final tetap di kolom shipping_fee)
            $table->unsignedBigInteger('shipping_destination_id')->nullable()->after('postal_code');
            $table->string('shipping_courier', 20)->nullable()->after('shipping_destination_id');
            $table->string('shipping_service', 30)->nullable()->after('shipping_courier');
            $table->string('shipping_etd', 30)->nullable()->after('shipping_service');
            $table->unsignedInteger('shipping_estimate')->nullable()->after('shipping_etd');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn([
                'shipping_destination_id',
                'shipping_courier',
                'shipping_service',
                'shipping_etd',
                'shipping_estimate',
            ]);
        });
    }
};

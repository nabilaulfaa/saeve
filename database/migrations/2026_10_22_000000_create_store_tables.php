<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('products', function (Blueprint $t) {
            $t->id();
            $t->string('name');
            $t->string('category')->index();
            $t->unsignedInteger('price');
            $t->string('material')->default('');
            $t->text('description')->nullable();
            $t->string('swatch', 9)->default('#e8dfd0');
            $t->timestamps();
        });
        Schema::create('product_variants', function (Blueprint $t) {
            $t->id();
            $t->foreignId('product_id')->constrained()->cascadeOnDelete();
            $t->string('color');
            $t->string('size')->nullable();
            $t->integer('stock')->default(0);
            $t->timestamps();
        });
        Schema::create('orders', function (Blueprint $t) {
            $t->id();
            $t->string('code')->unique();
            $t->string('channel')->default('online');
            $t->string('status')->default('menunggu_ongkir');
            $t->string('customer_name');
            $t->string('phone', 20);
            $t->string('delivery_method')->default('kirim');
            $t->string('address')->nullable();
            $t->string('city')->nullable();
            $t->string('postal_code', 10)->nullable();
            $t->unsignedInteger('subtotal')->default(0);
            $t->unsignedInteger('shipping_fee')->default(0);
            $t->unsignedInteger('total')->default(0);
            $t->string('payment_method')->default('transfer');
            $t->boolean('payment_verified')->default(false);
            $t->timestamps();
        });
        Schema::create('order_items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('order_id')->constrained()->cascadeOnDelete();
            $t->unsignedBigInteger('variant_id');
            $t->string('product_name');
            $t->string('color');
            $t->string('size')->nullable();
            $t->unsignedInteger('qty');
            $t->unsignedInteger('unit_price');
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_items');
        Schema::dropIfExists('orders');
        Schema::dropIfExists('product_variants');
        Schema::dropIfExists('products');
    }
};

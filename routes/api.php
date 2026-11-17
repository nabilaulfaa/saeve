<?php
use App\Http\Controllers\Api\StoreController;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\ShippingController;

Route::get('/products', [StoreController::class, 'products']);
Route::post('/orders', [StoreController::class, 'store'])->middleware('throttle:20,1');
Route::post('/orders/lookup', [StoreController::class, 'lookup'])->middleware('throttle:30,1');
Route::post('/vouchers/check', [StoreController::class, 'checkVoucher'])->middleware('throttle:30,1');
Route::post('/vouchers/available', [StoreController::class, 'availableVouchers'])->middleware('throttle:30,1');
Route::get('/shipping/search', [ShippingController::class, 'search']);
Route::post('/shipping/cost', [ShippingController::class, 'cost']);

Route::middleware('throttle:30,1')->group(function () {
    Route::get('/shipping/search', [ShippingController::class, 'search']);
    Route::post('/shipping/cost', [ShippingController::class, 'cost']);
});
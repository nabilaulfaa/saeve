<?php
use App\Http\Controllers\Api\StoreController;
use Illuminate\Support\Facades\Route;

Route::get('/products', [StoreController::class, 'products']);
Route::post('/orders', [StoreController::class, 'store'])->middleware('throttle:20,1');
Route::post('/orders/lookup', [StoreController::class, 'lookup'])->middleware('throttle:30,1');
Route::post('/vouchers/check', [StoreController::class, 'checkVoucher'])->middleware('throttle:30,1');
Route::post('/vouchers/available', [StoreController::class, 'availableVouchers'])->middleware('throttle:30,1');
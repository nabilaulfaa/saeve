<?php

use App\Http\Controllers\StaffAuthController;
use App\Http\Controllers\StaffController;
use App\Http\Middleware\EnsureRole;
use Illuminate\Support\Facades\Route;

Route::view('/', 'saeve');

Route::get('/masuk', [StaffAuthController::class, 'form'])->name('login');
Route::post('/masuk', [StaffAuthController::class, 'login'])->middleware('throttle:10,1');
Route::post('/keluar', [StaffAuthController::class, 'logout']);

Route::view('/admin', 'admin')->middleware(EnsureRole::class . ':admin');
Route::view('/kasir', 'kasir')->middleware(EnsureRole::class . ':admin,kasir');

Route::prefix('staff')->group(function () {
    Route::middleware(EnsureRole::class . ':admin,kasir')->group(function () {
        Route::get('products', [StaffController::class, 'products']);
        Route::post('pos', [StaffController::class, 'pos']);
        Route::post('pos/voucher', [StaffController::class, 'posVoucher']);
    });
    Route::middleware(EnsureRole::class . ':admin')->group(function () {
        Route::get('orders', [StaffController::class, 'orders']);
        Route::post('orders/{order}/shipping', [StaffController::class, 'shipping']);
        Route::post('orders/{order}/verify', [StaffController::class, 'verify']);
        Route::post('orders/{order}/status', [StaffController::class, 'status']);
        Route::post('products', [StaffController::class, 'createProduct']);
        Route::put('products/{product}', [StaffController::class, 'updateProduct']);
        Route::delete('products/{product}', [StaffController::class, 'deleteProduct']);
        Route::get('vouchers', [StaffController::class, 'vouchers']);
        Route::post('vouchers', [StaffController::class, 'createVoucher']);
        Route::put('vouchers/{voucher}', [StaffController::class, 'updateVoucher']);
        Route::post('vouchers/{voucher}/toggle', [StaffController::class, 'toggleVoucher']);
        Route::delete('vouchers/{voucher}', [StaffController::class, 'deleteVoucher']);
        Route::post('variants/{variant}/stock', [StaffController::class, 'stock']);
        Route::get('report', [StaffController::class, 'report']);
        Route::post('products/{product}/photos', [StaffController::class, 'uploadPhotos']);
        Route::delete('photos/{photo}', [StaffController::class, 'deletePhoto']);
    });
});
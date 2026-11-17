<?php

namespace App\Http\Controllers;

use App\Services\RajaOngkirService;
use Illuminate\Http\Request;
use Exception;

class ShippingController extends Controller
{
    public function search(Request $request, RajaOngkirService $ro)
    {
        $request->validate(['q' => 'required|string|min:3']);

        try {
            return response()->json($ro->searchDestination($request->q));
        } catch (Exception $e) {
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }

    public function cost(Request $request, RajaOngkirService $ro)
    {
        $data = $request->validate([
            'destination' => 'required|integer',
            'weight'      => 'required|integer|min:1',
            'couriers'    => 'array',
        ]);

        try {
            $result = $ro->calculateCost(
                $data['destination'],
                $data['weight'],
                $data['couriers'] ?? ['jne']
            );
            return response()->json($result);
        } catch (Exception $e) {
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }
}
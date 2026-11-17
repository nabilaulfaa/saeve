<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Cache;
use Exception;

class RajaOngkirService
{
    private function client()
    {
        return Http::withHeaders(['key' => config('services.rajaongkir.key')])
            ->baseUrl(config('services.rajaongkir.base_url'))
            ->timeout(15);
    }

    // Cari lokasi berdasarkan kata kunci (nama kota/kecamatan/kode pos)
    public function searchDestination(string $keyword): array
    {
        $keyword = strtolower(trim($keyword));

        // Simpan hasil 1 hari biar hemat kuota dan lebih cepat
        return Cache::remember("ro_search_$keyword", now()->addDay(), function () use ($keyword) {
            $response = $this->client()->get('/destination/domestic-destination', [
                'search' => $keyword,
                'limit'  => 10,
                'offset' => 0,
            ]);

            if ($response->failed()) {
                throw new Exception('Gagal mencari lokasi: ' . $response->body());
            }

            return $response->json('data') ?? [];
        });
    }

    // Hitung ongkir. $weight dalam gram, $couriers contoh: ['jne', 'jnt', 'anteraja']
    public function calculateCost(int $destinationId, int $weight, array $couriers = ['jne']): array
    {
        $response = $this->client()->asForm()->post('/calculate/domestic-cost', [
            'origin'      => config('services.rajaongkir.origin'),
            'destination' => $destinationId,
            'weight'      => $weight,
            'courier'     => implode(':', $couriers),
        ]);

        // Kurir tidak melayani rute/berat ini: bukan gangguan, kembalikan daftar kosong
        if (
            $response->status() === 400
            && str_contains(strtolower((string) $response->json('meta.message')), 'not found')
        ) {
            return [];
        }

        if ($response->failed()) {
            throw new Exception('Gagal hitung ongkir: ' . $response->body());
        }

        return $response->json('data') ?? [];
    }
}
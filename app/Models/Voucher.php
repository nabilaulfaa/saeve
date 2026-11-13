<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;

class Voucher extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'starts_at' => 'date',
            'ends_at' => 'date',
        ];
    }

    /* Kode selalu disimpan huruf besar tanpa spasi di tepi. */
    public static function normalize(string $code): string
    {
        return strtoupper(trim($code));
    }

    /* Keadaan voucher: aktif | nonaktif | kedaluwarsa | belum_mulai | habis */
    public function state(): string
    {
        $today = now()->startOfDay();

        if (!$this->is_active) return 'nonaktif';
        if ($this->ends_at && $today->gt($this->ends_at)) return 'kedaluwarsa';
        if ($this->starts_at && $today->lt($this->starts_at)) return 'belum_mulai';
        if ($this->usage_limit !== null && $this->used_count >= $this->usage_limit) return 'habis';

        return 'aktif';
    }

    /*
     * Alasan voucher tidak bisa dipakai di kanal ini (status, periode, kuota, kanal), atau null kalau bisa.
     * $channel = channel pesanan: 'online' atau 'pos'. Minimum belanja TIDAK dicek di sini.
     */
    public function unusable(string $channel): ?string
    {
        $state = $this->state();
        if ($state !== 'aktif') {
            return match ($state) {
                'kedaluwarsa' => 'Voucher sudah kedaluwarsa.',
                'belum_mulai' => 'Voucher belum berlaku.',
                'habis' => 'Kuota voucher sudah habis.',
                default => 'Voucher tidak aktif.',
            };
        }

        $mapped = $channel === 'pos' ? 'offline' : $channel;
        if ($this->channel !== 'semua' && $this->channel !== $mapped) {
            return 'Voucher tidak berlaku untuk kanal ini.';
        }

        return null;
    }

    /* Seperti unusable(), ditambah cek minimum belanja terhadap subtotal. Null = voucher bisa dipakai. */
    public function problem(int $subtotal, string $channel): ?string
    {
        if ($reason = $this->unusable($channel)) return $reason;

        if ($subtotal < $this->min_spend) {
            return 'Minimal belanja Rp ' . number_format($this->min_spend, 0, ',', '.') . '.';
        }

        return null;
    }

    /* Besar potongan (Rp) untuk subtotal tertentu, tidak pernah melebihi subtotal. */
    public function discountFor(int $subtotal): int
    {
        $cut = $this->type === 'persen' ? intdiv($subtotal * $this->value, 100) : $this->value;

        return max(0, min($cut, $subtotal));
    }
}
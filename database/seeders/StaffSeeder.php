<?php
namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class StaffSeeder extends Seeder
{
    public function run(): void
    {
        $staff = [
            ['Admin SAEVÉ', 'admin@saeve.test', 'admin12345', 'admin'],
            ['Kasir SAEVÉ', 'kasir@saeve.test', 'kasir12345', 'kasir'],
        ];
        foreach ($staff as [$name, $email, $pass, $role]) {
            $u = User::updateOrCreate(['email' => $email], ['name' => $name, 'password' => Hash::make($pass)]);
            $u->forceFill(['role' => $role])->save();
        }
    }
}
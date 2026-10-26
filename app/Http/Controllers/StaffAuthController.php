<?php
namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class StaffAuthController extends Controller
{
    public function form()
    {
        if (Auth::check() && in_array(Auth::user()->role, ['admin', 'kasir'], true)) {
            return redirect(Auth::user()->role === 'admin' ? '/admin' : '/kasir');
        }
        return view('login');
    }

    public function login(Request $r)
    {
        $c = $r->validate(['email' => 'required|email', 'password' => 'required']);
        if (!Auth::attempt($c) || !in_array(Auth::user()->role, ['admin', 'kasir'], true)) {
            Auth::logout();
            return back()->withErrors(['email' => 'Email atau password salah.'])->onlyInput('email');
        }
        $r->session()->regenerate();
        return redirect(Auth::user()->role === 'admin' ? '/admin' : '/kasir');
    }

    public function logout(Request $r)
    {
        Auth::logout();
        $r->session()->invalidate();
        $r->session()->regenerateToken();
        return redirect('/masuk');
    }
}
<?php
namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class EnsureRole
{
    public function handle(Request $r, Closure $next, string ...$roles)
    {
        $u = $r->user();
        if (!$u || !in_array($u->role, $roles, true)) {
            if ($r->expectsJson()) {
                return response()->json(['message' => 'Tidak diizinkan'], 403);
            }
            return redirect('/masuk');
        }
        return $next($r);
    }
}
<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class OdooGateway
{
    /**
     * Handle an incoming request validating Odoo shared token.
     */
    public function handle(Request $request, Closure $next): JsonResponse
    {
        // permitir sólo si token compartido coincide
        $token = $request->header('X-Odoo-Token');
        $shared = env('ODOO_SHARED_TOKEN');

        if (!$token || !$shared || !hash_equals($shared, $token)) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        return $next($request);
    }
}

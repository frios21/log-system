<?php

namespace App\Http\Controllers;

use App\Services\Odoo\DriversService;
use Illuminate\Http\Request;

class DriversController extends Controller
{
    public function __construct(private readonly DriversService $drivers) {}

    /**
     * GET /api/conductores?q=...
     * Devuelve contactos de Odoo 19 que son personas (no empresas).
     */
    public function index(Request $request)
    {
        $q = $request->query('q');
        return response()->json($this->drivers->personas($q));
    }
}

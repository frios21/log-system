<?php

namespace App\Http\Controllers;

use App\Services\Odoo\DriversService;
use Illuminate\Http\Request;

class DriversController extends Controller
{
    public function __construct(private readonly DriversService $drivers) {}

    /**
     * GET /api/conductores
     * Devuelve contactos de Odoo 19 que son personas (no empresas).
     */
    public function index(Request $request)
    {
        return response()->json($this->drivers->todos());
    }
}

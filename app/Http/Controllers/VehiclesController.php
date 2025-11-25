<?php

namespace App\Http\Controllers;

use App\Services\Odoo\VehiclesService;
use Illuminate\Http\Request;

class VehiclesController extends Controller
{
    public function __construct(private VehiclesService $vehicles) {}

    /**
     * GET /vehicles?q=query
     */
    public function index(Request $request)
    {
        $q = $request->query('q');
        return response()->json($this->vehicles->todos($q));
    }

    /**
     * GET /vehicles/{id}
     */
    public function show($id)
    {
        $v = $this->vehicles->porId((int) $id);

        if (!$v) {
            return response()->json(['error' => 'Vehículo no encontrado'], 404);
        }

        return response()->json($v);
    }
}

<?php

namespace App\Http\Controllers\Api\Odoo;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use App\Http\Services\Odoo\VehiclesService;

class VehiclesController extends Controller
{
    protected $service;

    public function __construct(VehiclesService $service)
    {
        $this->service = $service;
    }

    /**
     * GET /api/odoo/vehicles
     * Query param opcional: q
     */
    public function index(Request $request)
    {
        $q = $request->query('q', null);
        $vehicles = $this->service->fetchVehicles($q);
        return response()->json($vehicles);
    }
}

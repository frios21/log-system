<?php

namespace App\Http\Controllers\Api\Odoo;

use App\Http\Controllers\Controller;
use App\Services\Odoo\VehiculosService;

class VehiculosApiController extends Controller
{
    public function __construct(
        private readonly VehiculosService $vehiculos
    ) {}

    public function index()
    {
        return response()->json(
            $this->vehiculos->todos()
        );
    }
}

<?php

namespace App\Http\Controllers\Api\Odoo;

use App\Http\Controllers\Controller;
use App\Services\Odoo\CargasService;

class CargasApiController extends Controller
{
    public function __construct(
        private readonly CargasService $cargas
    ) {}

    public function index()
    {
        return response()->json(
            $this->cargas->todas()
        );
    }

    public function show(int $id)
    {
        $carga = $this->cargas->porId($id);

        if (!$carga) {
            return response()->json(['error' => 'Carga no encontrada'], 404);
        }

        return response()->json($carga);
    }
}

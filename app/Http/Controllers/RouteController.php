<?php

namespace App\Http\Controllers;

use App\Services\Odoo\RutasService;
use Illuminate\Http\Request;

class RouteController extends Controller
{
    public function __construct(private RutasService $rutas) {}

    public function index()
    {
        return response()->json($this->rutas->todas());
    }

    public function show($id)
    {
        $r = $this->rutas->porId((int)$id);

        if (!$r) {
            return response()->json(['error' => 'Ruta no encontrada'], 404);
        }

        return response()->json($r);
    }

    public function store(Request $request)
    {
        $name = $request->input('name', 'Ruta nueva');
        $vehicleId = $request->input('vehicle_id');

        return response()->json(
            $this->rutas->crear($name, $vehicleId),
            201
        );
    }

    public function preview(Request $request, $id)
    {
        $loadIds       = $request->input('load_ids', []);
        $originId      = $request->input('origin_id');
        $destinationId = $request->input('destination_id');

        $result = $this->rutas->previewCargas(
            (int) $id,
            $loadIds,
            $originId,
            $destinationId
        );

        return response()->json($result);
    }

    public function assign(Request $request, $id)
    {
        $loadIds       = $request->input('load_ids', []);
        $vehicleId     = $request->input('vehicle_id');
        $originId      = $request->input('origin_id');
        $destinationId = $request->input('destination_id');

        $result = $this->rutas->asignarCargas(
            (int) $id,
            $loadIds,
            $vehicleId,
            $originId,
            $destinationId
        );

        return response()->json($result);
    }

    public function destroy($id)
    {
        try {
            $this->rutas->eliminar((int)$id);
            return response()->json(['message' => 'Ruta eliminada']);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }
}

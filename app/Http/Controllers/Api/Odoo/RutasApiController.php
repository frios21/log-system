<?php

namespace App\Http\Controllers\Api\Odoo;

use App\Http\Controllers\Controller;
use App\Services\Odoo\RutasService;
use Illuminate\Http\Request;
use App\Services\Odoo\OdooJsonRpc;

class RutasApiController extends Controller
{
    public function __construct(
        private readonly RutasService $rutas
    ) {}

    public function index()
    {
        return response()->json(
            $this->rutas->todas()
        );
    }

    public function show(int $id)
    {
        $ruta = $this->rutas->porId($id);

        if (!$ruta) {
            return response()->json(['error' => 'Ruta no encontrada'], 404);
        }

        return response()->json($ruta);
    }

    public function actualizarDistancia($id, Request $request)
    {
        $km = $request->input('distance_km');

        if ($km === null) {
            return response()->json(['error' => 'distance_km required'], 422);
        }

        $service = new RutasService(new OdooJsonRpc());

        $ok = $service->actualizarDistancia($id, floatval($km));

        return response()->json([
            'success' => $ok,
            'distance_km' => $km,
        ]);
    }

    public function actualizarNombre($id, Request $request)
    {
        $name = $request->input('name');

        if (!$name) {
            return response()->json(['error' => 'name required'], 422);
        }

        $service = new RutasService(new OdooJsonRpc());

        $ok = $service->actualizarNombre($id, $name);

        return response()->json([
            'success' => $ok,
            'name' => $name,
        ]);
    }

    public function updateTotalQnt(int $id, Request $request)
    {
        $data = $request->validate([
            'total_qnt' => ['required', 'numeric', 'min:0'],
        ]);

        try {
            $ok = $this->rutas->actualizarTotalQnt($id, (float) $data['total_qnt']);
            return response()->json(['success' => (bool) $ok]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    public function evaluarDesviacion(Request $request)
    {
        $km_original = $request->km_original;
        $km_nuevo = $request->km_nuevo;
        $kg_original = $request->kg_original;
        $kg_nuevo = $request->kg_nuevo;
        $costo_km = $request->costo_km;

        $costo_original = $km_original * $costo_km;
        $costo_nuevo = $km_nuevo * $costo_km;

        $costo_original_por_kg = $costo_original / $kg_original;
        $costo_nuevo_por_kg = $costo_nuevo / $kg_nuevo;

        return response()->json([
            "coste_original_por_kg" => $costo_original_por_kg,
            "coste_nuevo_por_kg" => $costo_nuevo_por_kg,
            "conviene" => $costo_nuevo_por_kg <= $costo_original_por_kg
        ]);
    }

   public function updateVehicle($id, Request $request)
    {
        $vehicleId = $request->input('vehicle_id');

        if (!$vehicleId) {
            return response()->json(['message' => 'vehicle_id requerido'], 422);
        }

        $rutaExistente = $this->rutas->buscarPorVehiculo($vehicleId);

        if ($rutaExistente && (int)$rutaExistente['id'] !== (int)$id) {
            return response()->json([
                'message' => 'Este vehículo ya está asignado a otra ruta',
                'ruta_id' => $rutaExistente['id'],
                'ruta_name' => $rutaExistente['name'],
            ], 409);
        }

        try {
            $result = $this->rutas->asignarVehiculo((int)$id, (int)$vehicleId);
            return response()->json($result);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }

    public function updateDriver($id, Request $request)
    {
        $driverId = $request->input('driver_id');

        if (!$driverId) {
            return response()->json(['message' => 'driver_id requerido'], 422);
        }

        try {
            $result = $this->rutas->asignarConductor((int)$id, (int)$driverId);
            return response()->json(['success' => (bool)$result]);
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], 500);
        }
    }

    // Nuevo: PATCH /api/rutas/{id} - actualizar nombre o estado
    public function update($id, Request $request)
    {
        $status = $request->input('status');
        $name = $request->input('name');

        if ($status !== null) {
            // Validación simple de estado
            $allowed = ['draft','assigned','done'];
            if (!in_array($status, $allowed, true)) {
                return response()->json(['error' => 'status inválido'], 422);
            }

            $ok = $this->rutas->actualizarEstado((int)$id, $status);
            return response()->json(['success' => (bool)$ok, 'status' => $status]);
        }

        if ($name !== null) {
            $ok = $this->rutas->actualizarNombre((int)$id, $name);
            return response()->json(['success' => (bool)$ok, 'name' => $name]);
        }

        return response()->json(['error' => 'name or status required'], 422);
    }
}

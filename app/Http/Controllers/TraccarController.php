<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Http;
use App\Services\Odoo\OdooJsonRpc;

class TraccarController extends Controller
{
    public function position($deviceId)
    {
        $url = env('TRACCAR_URL') . "/positions";

        try {
            $response = Http::withBasicAuth(
                env('TRACCAR_USER'),
                env('TRACCAR_PASS')
            )->timeout(10)->get($url);

            if ($response->failed()) {
                return response()->json([
                    'error' => 'Traccar unreachable',
                    'url' => $url,
                    'status' => $response->status(),
                    'body' => $response->body(),
                ], 500);
            }

            $positions = collect($response->json());
            $pos = $positions->firstWhere('deviceId', (int)$deviceId);

            return $pos
                ? response()->json($pos)
                : response()->json(['error' => 'Device not found'], 404);

        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Exception',
                'msg' => $e->getMessage(),
                'url' => $url,
            ], 500);
        }
    }

    /**
     * devuelve posiciones Traccar de vehiculos en rutas
     * flujo: route -> vehicle_id -> driver_id -> res.partner.traccar_device_id
     */
    public function activeDraftPositions()
    {
        $odoo = new OdooJsonRpc();

        // Permitir filtrar por múltiples estados vía query ?statuses=draft,assigned,delivered
        $statusesParam = request()->query('statuses');
        if ($statusesParam) {
            $statuses = array_filter(array_map('trim', explode(',', $statusesParam)));
        } else {
            // Por defecto: activos (excluye done/cancelled)
            $statuses = ['assigned', 'in_progress'];
        }

        // Rutas con vehículo según estados
        $routes = $odoo->searchRead(
            'logistics.route',
            [ ['status', 'in', $statuses] ],
            ['id','name','status','vehicle_id']
        );

        // Cargar devices UNA sola vez: id (interno) y uniqueId (tu traccar_device_id)
        $devices = $this->fetchAllDevices();
        $uniqueToInternal = [];
        foreach ($devices as $d) {
            if (isset($d['uniqueId']) && isset($d['id'])) {
                $uniqueToInternal[(string) trim((string)$d['uniqueId'])] = (int) $d['id'];
            }
        }

        $result = [];

        foreach ($routes as $r) {
            $vehicleId = isset($r['vehicle_id']) ? (is_array($r['vehicle_id']) ? ($r['vehicle_id'][0] ?? null) : $r['vehicle_id']) : null;
            if (!$vehicleId) continue;

            // Vehículo + chofer
            $veh = $odoo->searchRead('fleet.vehicle', [ ['id', '=', (int)$vehicleId] ], ['id','name','driver_id']);
            $veh = $veh[0] ?? null; if (!$veh) continue;
            $driverId = isset($veh['driver_id']) ? (is_array($veh['driver_id']) ? ($veh['driver_id'][0] ?? null) : $veh['driver_id']) : null;
            if (!$driverId) continue;

            // Partner con traccar_device_id (tu uniqueId almacenado)
            $drv = $odoo->searchRead('res.partner', [ ['id', '=', (int)$driverId] ], ['id','name','traccar_device_id']);
            $drv = $drv[0] ?? null; if (!$drv) continue;
            $storedUnique = isset($drv['traccar_device_id']) ? trim((string)$drv['traccar_device_id']) : null;
            if (!$storedUnique) continue;

            // Resolver uniqueId -> deviceId interno
            $internalId = $uniqueToInternal[(string) $storedUnique] ?? null;
            if (!$internalId) continue; // no hay device en Traccar con ese uniqueId

            // Obtener posición por deviceId interno (consulta directa)
            $pos = $this->fetchTraccarPosition((int) $internalId);
            if (!$pos) continue;

            $result[] = [
                'route_id' => $r['id'],
                'route_name' => $r['name'] ?? '',
                'status' => $r['status'] ?? null,
                'vehicle_id' => $vehicleId,
                'vehicle_name' => $veh['name'] ?? '',
                'driver_id' => $driverId,
                'driver_name' => $drv['name'] ?? '',
                'traccar_device_id' => (string) $storedUnique, // el que guardas
                'traccar_internal_id' => (int) $internalId,     // el que usa Traccar en positions
                'position' => $pos,
            ];
        }

        return response()->json($result);
    }

    private function fetchAllDevices(): array
    {
        $url = env('TRACCAR_URL') . '/devices';
        try {
            $res = Http::withBasicAuth(env('TRACCAR_USER'), env('TRACCAR_PASS'))
                ->timeout(10)->get($url);
            if ($res->failed()) return [];
            $json = $res->json();
            return is_array($json) ? $json : [];
        } catch (\Throwable $e) { return []; }
    }

    private function fetchAllPositions(): array
    {
        $url = env('TRACCAR_URL') . '/positions';
        try {
            $res = Http::withBasicAuth(env('TRACCAR_USER'), env('TRACCAR_PASS'))
                ->timeout(10)->get($url);
            if ($res->failed()) return [];
            $json = $res->json();
            return is_array($json) ? $json : [];
        } catch (\Throwable $e) { return []; }
    }

    private function fetchTraccarPosition(int $deviceId): ?array
    {
        $url = env('TRACCAR_URL') . "/positions";

        try {
            $response = Http::withBasicAuth(
                env('TRACCAR_USER'),
                env('TRACCAR_PASS')
            )->timeout(10)->get($url);

            if ($response->failed()) {
                return null;
            }

            $positions = collect($response->json());
            $pos = $positions->firstWhere('deviceId', $deviceId);

            return $pos ? $pos : null;

        } catch (\Exception $e) {
            return null;
        }
    }
}
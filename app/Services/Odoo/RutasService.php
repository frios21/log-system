<?php

namespace App\Services\Odoo;

use App\Services\Odoo\OdooJsonRpc;
use Illuminate\Support\Facades\Http;

class RutasService
{
    public function __construct(private readonly OdooJsonRpc $odoo) {}

    public function todas(): array
    {
        return $this->odoo->searchRead(
            'logistics.route',
            [],
            ['id','name','status','vehicle_id','total_distance_km','total_cost','waypoints','load_ids','last_recalc']
        );
    }

    public function porId(int $id): ?array
    {
        $routes = $this->odoo->searchRead(
            'logistics.route',
            [['id','=', $id]],
            ['id','name','status','vehicle_id','total_distance_km','total_cost','waypoints','load_ids']
        );

        $route = $routes[0] ?? null;
        if (!$route) return null;

        $loadIds = $route['load_ids'] ?? [];
        $loads = [];

        if (!empty($loadIds)) {
            $rawLoads = $this->odoo->searchRead(
                'logistics.load',
                [['id','in', $loadIds]],
                ['id','name','vendor_id','vendor_name','total_quantity','total_pallets','line_ids','state']
            );

            // reordenar según load_ids
            $map = [];
            foreach ($rawLoads as $l) { $map[$l['id']] = $l; }
            $loads = [];
            foreach ($loadIds as $lid) { if (isset($map[$lid])) $loads[] = $map[$lid]; }

            foreach ($loads as &$l) {
                $vendorId = is_array($l['vendor_id']) ? ($l['vendor_id'][0] ?? null) : $l['vendor_id'];
                if ($vendorId) {
                    $p = $this->odoo->searchRead(
                        'res.partner',
                        [['id','=', $vendorId]],
                        ['id','name','latitude','longitude','street']
                    );
                    $l['partner'] = $p[0] ?? null;
                } else {
                    $l['partner'] = null;
                }
            }
        }

        $route['loads'] = $loads;

        if (!empty($route['waypoints']) && is_string($route['waypoints'])) {
            $decoded = json_decode($route['waypoints'], true);
            if (is_array($decoded)) $route['waypoints'] = $decoded;
        }

        return $route;
    }

    public function crear(string $name, ?int $vehicleId = null): array
    {
        $vals = [];
        if ($vehicleId) $vals['vehicle_id'] = $vehicleId;

        $id = $this->odoo->create('logistics.route', $vals);
        return ['id' => $id];
    }

    public function asignarCargas(int $routeId, array $loadIds, ?int $vehicleId = null, ?int $originId = null, ?int $destId = null, ?float $totalCost = null): array
    {
        // obtener ruta existente para preservar origen/destino si no se envian nuevos
        $existing = $this->porId($routeId);
        $existingWaypoints = $existing['waypoints'] ?? [];
        $existingOrigin = null; 
        $existingDest = null;

        if (is_array($existingWaypoints) && !empty($existingWaypoints)) {
            $first = $existingWaypoints[0] ?? null;
            $lastIndex = max(count($existingWaypoints) - 1, 0);
            $last = $existingWaypoints[$lastIndex] ?? null;

            if ($first && (!array_key_exists('load_id', $first) || $first['load_id'] === null)) {
                $existingOrigin = $first;
            }
            if ($last && (!array_key_exists('load_id', $last) || $last['load_id'] === null)) {
                $existingDest = $last;
            }
        }

        if (empty($loadIds) && empty($originId) && empty($destId)) {
            return ['route_id' => $routeId, 'waypoints' => $existingWaypoints];
        }

        $waypoints = [];

        // ORIGEN
        if ($originId) {
            $p = $this->odoo->searchRead('res.partner', [['id', '=', $originId]], ['id','name','latitude','longitude']);
            $origin = $p[0] ?? null;
            if ($origin && $origin['latitude'] && $origin['longitude']) {
                $waypoints[] = [
                    'lat' => (float)$origin['latitude'],
                    'lon' => (float)$origin['longitude'],
                    'partner_id' => $origin['id'],
                    'label' => 'Origen: '.$origin['name'],
                    'type' => 'origin',
                ];
            }
        } elseif ($existingOrigin) {
            $waypoints[] = $existingOrigin;
        }

        // cargas (en orden)
        $orderedLoads = [];
        if (!empty($loadIds)) {
            $rawLoads = $this->odoo->searchRead('logistics.load', [['id','in',$loadIds]], ['id','name','vendor_id']);
            $map = [];
            foreach ($rawLoads as $l) { $map[$l['id']] = $l; }
            foreach ($loadIds as $lid) { if (isset($map[$lid])) $orderedLoads[] = $map[$lid]; }

            foreach ($orderedLoads as $l) {
                $vendorId = is_array($l['vendor_id']) ? ($l['vendor_id'][0] ?? null) : $l['vendor_id'];
                if (!$vendorId) continue;
                $p = $this->odoo->searchRead('res.partner', [['id','=',$vendorId]], ['id','name','latitude','longitude']);
                $p = $p[0] ?? null;
                if (!$p || !$p['latitude'] || !$p['longitude']) continue;

                $waypoints[] = [
                    'lat' => (float)$p['latitude'],
                    'lon' => (float)$p['longitude'],
                    'load_id' => $l['id'],
                    'partner_id' => $p['id'],
                    'label' => $p['name'],
                ];
            }
        } else {
            foreach ($existingWaypoints as $wp) {
                if (isset($wp['load_id']) && $wp['load_id'] !== null) {
                    $waypoints[] = $wp;
                }
            }
        }

        // DESTINO
        if ($destId) {
            $p = $this->odoo->searchRead('res.partner', [['id', '=', $destId]], ['id','name','latitude','longitude']);
            $dest = $p[0] ?? null;
            if ($dest && $dest['latitude'] && $dest['longitude']) {
                $waypoints[] = [
                    'lat' => (float)$dest['latitude'],
                    'lon' => (float)$dest['longitude'],
                    'partner_id' => $dest['id'],
                    'label' => 'Destino: '.$dest['name'],
                    'type' => 'destination',
                ];
            }
        } elseif ($existingDest) {
            $waypoints[] = $existingDest;
        }

        $distKm = $this->calcularDistanciaKm($waypoints);

        // guardar
        $vals = [
            'waypoints' => json_encode($waypoints),
            'total_distance_km' => $distKm,
        ];
        if (!empty($loadIds)) $vals['load_ids'] = $loadIds;
        if ($vehicleId) $vals['vehicle_id'] = $vehicleId;
        if ($totalCost !== null) $vals['total_cost'] = $totalCost; // sólo si el front lo envía

        $this->odoo->write('logistics.route', $routeId, $vals);

        // actualizar estado de cargas
        if (!empty($loadIds)) {
            foreach ($loadIds as $lid) {
                $this->odoo->write('logistics.load', $lid, ['state' => 'assigned']);
            }
        }

        return [
            'route_id' => $routeId,
            'waypoints' => $waypoints,
            'total_distance_km' => $distKm,
            'total_cost' => $totalCost ?? ($existing['total_cost'] ?? null),
        ];
    }

    public function previewCargas(int $routeId, array $loadIds, ?int $originId, ?int $destId)
    {
        // 1. Obtener la ruta base (solo para referencia, no escribimos en ella)
        $existing = $this->porId($routeId);
        $existingWaypoints = $existing['waypoints'] ?? [];
        
        // Detectar origen/destino existentes si no se envían nuevos
        $existingOrigin = null;
        $existingDest = null;
        if (is_array($existingWaypoints) && !empty($existingWaypoints)) {
            // Lógica simple: asume primero es origen, último es destino si no tienen load_id
            $first = $existingWaypoints[0] ?? null;
            $last = $existingWaypoints[count($existingWaypoints) - 1] ?? null;
            if ($first && (!isset($first['load_id']) || !$first['load_id'])) $existingOrigin = $first;
            if ($last && (!isset($last['load_id']) || !$last['load_id'])) $existingDest = $last;
        }

        $waypoints = [];

        // 2. Construir ORIGEN
        if ($originId) {
            $p = $this->odoo->searchRead('res.partner', [['id', '=', $originId]], ['id','name','latitude','longitude']);
            $origin = $p[0] ?? null;
            if ($origin) {
                $waypoints[] = [
                    'lat' => (float)$origin['latitude'],
                    'lon' => (float)$origin['longitude'],
                    'partner_id' => $origin['id'],
                    'label' => 'Origen: ' . $origin['name'],
                    'type' => 'origin'
                ];
            }
        } elseif ($existingOrigin) {
            $waypoints[] = $existingOrigin;
        }

        // 3. Construir CARGAS (Intermedios) estrictamente en el orden de $loadIds
        if (!empty($loadIds)) {
            // Traemos todas las cargas involucradas de una sola vez
            $rawLoads = $this->odoo->searchRead('logistics.load', [['id', 'in', $loadIds]], ['id', 'name', 'vendor_id']);
            
            // Indexamos para acceso rápido
            $loadsMap = [];
            foreach ($rawLoads as $l) {
                $loadsMap[$l['id']] = $l;
            }

            // Iteramos sobre el array ORDENADO de IDs que envió el frontend
            foreach ($loadIds as $lid) {
                if (!isset($loadsMap[$lid])) continue;
                $load = $loadsMap[$lid];

                $vendorId = is_array($load['vendor_id']) ? ($load['vendor_id'][0] ?? null) : $load['vendor_id'];
                if (!$vendorId) continue;

                // Nota: Podrías optimizar trayendo todos los partners de una vez, pero esto funciona
                $p = $this->odoo->searchRead('res.partner', [['id', '=', $vendorId]], ['id','name','latitude','longitude']);
                $partner = $p[0] ?? null;

                if ($partner && $partner['latitude'] && $partner['longitude']) {
                    $waypoints[] = [
                        'lat' => (float)$partner['latitude'],
                        'lon' => (float)$partner['longitude'],
                        'load_id' => $load['id'],
                        'partner_id' => $partner['id'],
                        'label' => $load['name'] // o $partner['name']
                    ];
                }
            }
        } else {
            // Si no hay loadIds nuevos, podríamos mantener los existentes, 
            // pero en un contexto de "Assign", si la lista está vacía, no hay intermedios.
        }

        // 4. Construir DESTINO
        if ($destId) {
            $p = $this->odoo->searchRead('res.partner', [['id', '=', $destId]], ['id','name','latitude','longitude']);
            $dest = $p[0] ?? null;
            if ($dest) {
                $waypoints[] = [
                    'lat' => (float)$dest['latitude'],
                    'lon' => (float)$dest['longitude'],
                    'partner_id' => $dest['id'],
                    'label' => 'Destino: ' . $dest['name'],
                    'type' => 'destination'
                ];
            }
        } elseif ($existingDest) {
            $waypoints[] = $existingDest;
        }

        // 5. Calcular Distancia (Backend OSRM o similar)
        // Esto nos da la distancia "fiscal" o "de negocio"
        $distKm = $this->calcularDistanciaKm($waypoints);

        return [
            'route_id' => $routeId,
            'waypoints' => $waypoints,       // El frontend usará esto para dibujar
            'total_distance_km' => $distKm,  // El frontend usará esto para costos
        ];
    }

    public function actualizarDistancia(int $routeId, float $km): bool
    {
        return $this->odoo->write('logistics.route', $routeId, [
            'total_distance_km' => $km,
            'last_recalc' => date('Y-m-d H:i:s'),
        ]);
    }


    public function eliminar(int $id)
    {
        $ruta = $this->porId($id);
        if ($ruta && !empty($ruta['load_ids'])) {
            foreach ($ruta['load_ids'] as $lid) {
                $this->odoo->write('logistics.load', $lid, [ 'state' => 'draft' ]);
            }
        }

        return $this->odoo->call(
            "object",
            "execute_kw",
            [
                $this->odoo->getDb(),
                $this->odoo->getUid(),
                $this->odoo->getPassword(),
                "logistics.route",
                "unlink",
                [[ $id ]]
            ]
        );
    }

    private function calcularDistanciaKm($waypoints)
    {
        if (count($waypoints) < 2) return 0;

        $ghBase = env('GRAPHHOPPER_URL') ?: env('GRAPHOPPER_URL'); // soportar typo alterno
        $ghKey  = env('GRAPHHOPPER_KEY');
        if (!$ghBase) {
            // Si no está configurado, no calculamos (evita usar OSRM)
            return 0;
        }

        try {
            $base = rtrim($ghBase, '/');
            if (!str_ends_with($base, '/route')) {
                $base .= '/route';
            }

            $pointsQs = '';
            foreach ($waypoints as $w) {
                if (!isset($w['lat'], $w['lon'])) continue;
                $pointsQs .= 'point=' . rawurlencode($w['lat'] . ',' . $w['lon']) . '&';
            }

            $params = [
                'profile' => 'truck',
                'points_encoded' => 'false',
                'instructions' => 'false',
                'ch.disable' => 'true',
            ];
            if ($ghKey) $params['key'] = $ghKey;
            $qs = $pointsQs . http_build_query($params);
            $url = $base . '?' . $qs;

            $res = Http::timeout(20)->get($url);
            if (!$res->ok()) return 0;
            $json = $res->json();
            $distM = $json['paths'][0]['distance'] ?? null;
            return is_numeric($distM) ? floatval($distM) / 1000.0 : 0;
        } catch (\Throwable $e) {
            return 0;
        }
    }

    public function actualizarNombre($id, $name)
    {
        return $this->odoo->write('logistics.route', $id, [
            'name' => $name,
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

    public function buscarPorVehiculo(int $vehicleId)
    {
        $res = $this->odoo->searchRead('logistics.route', [
            ['vehicle_id', '=', $vehicleId]
        ], ['id', 'name', 'vehicle_id']);

        return $res[0] ?? null;
    }

    public function asignarVehiculo($idRuta, $vehicleId)
    {
        return $this->odoo->write('logistics.route', $idRuta, [
            'vehicle_id' => $vehicleId
        ]);
    }

    public function actualizarEstado(int $id, string $status): bool
    {
        return $this->odoo->write('logistics.route', $id, [
            'status' => $status,
        ]);
    }
}

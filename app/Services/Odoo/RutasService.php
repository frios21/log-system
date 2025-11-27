<?php

namespace App\Services\Odoo;

use App\Services\Odoo\OdooJsonRpc;

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
        $vals = ['name' => $name];
        if ($vehicleId) $vals['vehicle_id'] = $vehicleId;

        $id = $this->odoo->create('logistics.route', $vals);
        return ['id' => $id, 'name' => $name];
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
                    'label' => $l['name'],
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

    public function previewCargas(int $routeId, array $loadIds, ?int $originId = null, ?int $destId = null, array $fakeLoadIds = [])
    {
        // cargar ruta actual para preservar origen/destino si no se especifican
        $existing = $this->porId($routeId);
        $existingWaypoints = $existing['waypoints'] ?? [];

        // detectar origen/destino existentes si no se envían nuevos
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

        // Normalize fake ids to integers set for quick lookup
        $fakeSet = [];
        foreach ($fakeLoadIds as $f) {
            $fakeSet[intval($f)] = true;
        }

        // Build full waypoints (includes all requested loads in order)
        $fullWaypoints = [];

        // ORIGEN (full)
        if ($originId) {
            $p = $this->odoo->searchRead('res.partner', [['id', '=', $originId]], ['id','name','latitude','longitude']);
            $origin = $p[0] ?? null;
            if ($origin && $origin['latitude'] && $origin['longitude']) {
                $fullWaypoints[] = [
                    'lat' => (float)$origin['latitude'],
                    'lon' => (float)$origin['longitude'],
                    'partner_id' => $origin['id'],
                    'label' => 'Origen: '.$origin['name'],
                    'type' => 'origin',
                ];
            }
        } elseif ($existingOrigin) {
            $fullWaypoints[] = $existingOrigin;
        }

        // If we have loadIds, fetch loads once (we'll use for kg computations and partners)
        $allRequestedLoadIds = $loadIds;
        if (!empty($allRequestedLoadIds)) {
            $rawLoads = $this->odoo->searchRead('logistics.load', [['id','in',$allRequestedLoadIds]], ['id','name','vendor_id','total_quantity']);
            $loadsMap = [];
            foreach ($rawLoads as $l) { $loadsMap[$l['id']] = $l; }
            foreach ($loadIds as $lid) {
                if (!isset($loadsMap[$lid])) continue;
                $l = $loadsMap[$lid];
                $vendorId = is_array($l['vendor_id']) ? ($l['vendor_id'][0] ?? null) : $l['vendor_id'];
                if (!$vendorId) continue;
                $p = $this->odoo->searchRead('res.partner', [['id','=',$vendorId]], ['id','name','latitude','longitude']);
                $p = $p[0] ?? null;
                if (!$p || !$p['latitude'] || !$p['longitude']) continue;

                $fullWaypoints[] = [
                    'lat' => (float)$p['latitude'],
                    'lon' => (float)$p['longitude'],
                    'load_id' => $l['id'],
                    'partner_id' => $p['id'],
                    'label' => $l['name'],
                ];
            }
        } else {
            // si no se envían loadIds, mantengamos los intermedios existentes (comportamiento antiguo)
            foreach ($existingWaypoints as $wp) {
                if (isset($wp['load_id']) && $wp['load_id'] !== null) {
                    $fullWaypoints[] = $wp;
                }
            }
        }

        // DESTINO (full)
        if ($destId) {
            $p = $this->odoo->searchRead('res.partner', [['id','=', $destId]], ['id','name','latitude','longitude']);
            $dest = $p[0] ?? null;
            if ($dest && $dest['latitude'] && $dest['longitude']) {
                $fullWaypoints[] = [
                    'lat' => (float)$dest['latitude'],
                    'lon' => (float)$dest['longitude'],
                    'partner_id' => $dest['id'],
                    'label' => 'Destino: '.$dest['name'],
                    'type' => 'destination',
                ];
            }
        } elseif ($existingDest) {
            $fullWaypoints[] = $existingDest;
        }

        // Build billing waypoints: same as full but *excluding* waypoints that belong to fake loads
        $billingWaypoints = [];
        foreach ($fullWaypoints as $wp) {
            if (isset($wp['load_id']) && $wp['load_id'] !== null) {
                if (isset($fakeSet[intval($wp['load_id'])])) {
                    // skip fake load for billing route
                    continue;
                }
            }
            $billingWaypoints[] = $wp;
        }

        // If billingWaypoints has < 2 points, distance = 0 (calcularDistanciaKm hace esto ya)
        $distFull = $this->calcularDistanciaKm($fullWaypoints);
        $distBilling = $this->calcularDistanciaKm($billingWaypoints);

        // Calculate kilograms: sum over loads (we fetched rawLoads above)
        $totalKg = 0;
        $kgExcludingFake = 0;
        if (!empty($allRequestedLoadIds) && !empty($rawLoads)) {
            foreach ($rawLoads as $l) {
                $q = floatval($l['total_quantity'] ?? 0);
                $totalKg += $q;
                if (!isset($fakeSet[intval($l['id'])])) {
                    $kgExcludingFake += $q; // kg that contribute to billing kg if needed
                }
            }
        } else {
            // If no explicit loadIds were provided, try to compute from existingWaypoints or existing loads
            $totalKg = 0;
            $kgExcludingFake = 0;
            // try existing loads list
            $existingLoads = $existing['loads'] ?? [];
            foreach ($existingLoads as $l) {
                $q = floatval($l['total_quantity'] ?? 0);
                $totalKg += $q;
                if (!isset($fakeSet[intval($l['id'])])) $kgExcludingFake += $q;
            }
        }

        return [
            'route_id' => $routeId,
            'waypoints' => $fullWaypoints,
            'total_distance_km' => $distFull,
            'billing_distance_km' => $distBilling,
            'total_kg' => $totalKg,
            'kg_excluding_fake' => $kgExcludingFake,
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

        $coords = array_map(fn($w) => $w['lon'] . ',' . $w['lat'], $waypoints);

        $url = 'https://router.project-osrm.org/route/v1/driving/' 
               . implode(';', $coords)
               . '?overview=false&alternatives=false&steps=false';

        try {
            $response = file_get_contents($url);
            if (!$response) return 0;

            $json = json_decode($response, true);
            return ($json['routes'][0]['distance'] ?? 0) / 1000;
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
}

<?php

namespace App\Services\Odoo;

use App\Services\Odoo\OdooJsonRpc;
use App\Services\Odoo\CService;
use Illuminate\Support\Facades\Http;

class RutasService
{
    public function __construct(
        private readonly OdooJsonRpc $odoo,
        private readonly CargasService $cargas
    ) {}

    public function todas(): array
    {
        return $this->odoo->searchRead(
            'logistics.route',
            [],
            ['id','name','status','vehicle_id','driver_id','total_distance_km','total_cost','expected_qnt','total_qnt','cost_per_kg','waypoints','load_ids','expected_qnt','last_recalc']
        );
    }

    public function porId(int $id): ?array
    {
        $routes = $this->odoo->searchRead(
            'logistics.route',
            [['id','=', $id]],
            ['id','name','status','vehicle_id','driver_id','total_distance_km','total_cost','expected_qnt','total_qnt','cost_per_kg','waypoints','load_ids','expected_qnt','last_recalc']
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

    public function actualizarFecha(int $routeId, string $date): bool
    {
        return $this->odoo->write('logistics.route', $routeId, [
            'expected_date' => $date,
        ]);
    }

    public function asignarCargas(
        int $routeId,
        array $loadIds,
        ?int $vehicleId = null,
        ?int $originId = null,
        ?int $destId = null,
        ?float $totalCost = null
    ): array {
        // obtener ruta existente para preservar origen/destino si no se envian nuevos
        $existing = $this->porId($routeId);
        $existingWaypoints = $existing['waypoints'] ?? [];
        $existingOrigin = null;
        $existingDest   = null;

        $previousLoadIds = [];
        if ($existing && !empty($existing['load_ids']) && is_array($existing['load_ids'])) {
            $previousLoadIds = array_map('intval', $existing['load_ids']);
        }

        if (is_array($existingWaypoints) && !empty($existingWaypoints)) {
            $first     = $existingWaypoints[0] ?? null;
            $lastIndex = max(count($existingWaypoints) - 1, 0);
            $last      = $existingWaypoints[$lastIndex] ?? null;

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

        // ---------------- ORIGEN ----------------
        if ($originId) {
            $p = $this->odoo->searchRead(
                'res.partner',
                [['id', '=', $originId]],
                ['id','name','latitude','longitude'],
                1
            );
            $origin = $p[0] ?? null;
            if ($origin && $origin['latitude'] && $origin['longitude']) {
                $waypoints[] = [
                    'lat'        => (float)$origin['latitude'],
                    'lon'        => (float)$origin['longitude'],
                    'partner_id' => $origin['id'],
                    'label'      => 'Origen: '.$origin['name'],
                    'type'       => 'origin',
                ];
            }
        } elseif ($existingOrigin) {
            $waypoints[] = $existingOrigin;
        }

        // ---------------- CARGAS (INTERMEDIOS) ----------------
        // expected_qnt: cantidad esperada en base a pallets y tipo de fruta
        $expectedQnt = null;

        if (!empty($loadIds)) {
            $orderedLoads = [];
            $sumExpected = 0.0;

            // usamos CargasService->porId() para cada carga (misma lógica que /api/cargas/{id})
            foreach ($loadIds as $lid) {
                $carga = $this->cargas->porId((int)$lid);
                if (!$carga) {
                    continue;
                }
                $orderedLoads[] = $carga;

                // calcular esperado de esta carga: por líneas
                $lines = $carga['lines'] ?? [];
                if (is_array($lines)) {
                    foreach ($lines as $line) {
                        $productName = $line['product_name'] ?? '';
                        $nPallets    = $line['n_pallets'] ?? 0;

                        if (!is_numeric($nPallets) || $nPallets <= 0) {
                            continue;
                        }

                        // extraer prefijo numérico de 3 dígitos dentro de corchetes, ej [103122000] -> 103
                        $code = null;
                        if (is_string($productName)) {
                            if (preg_match('/(\d{3})/', $productName, $m)) {
                                $code = $m[1];
                            }
                        }

                        if (!$code || $code[0] !== '1') {
                            continue; // no es fruta conocida
                        }

                        $avgKg = 0;
                        if ($code === '101') {          // arándano
                            $avgKg = 550;
                        } elseif ($code === '102') {   // frambuesa
                            $avgKg = 500;
                        } elseif ($code === '103') {   // frutilla
                            $avgKg = 700;
                        } else {
                            $avgKg = 0; // por ahora sin promedio definido para otros códigos
                        }

                        if ($avgKg > 0) {
                            $sumExpected += ((float)$nPallets * (float)$avgKg);
                        }
                    }
                }
            }
            $expectedQnt = $sumExpected;

            foreach ($orderedLoads as $carga) {
                $partner = $carga['partner'] ?? null;
                if (!$partner) {
                    continue;
                }

                $lat = $partner['latitude']  ?? null;
                $lon = $partner['longitude'] ?? null;

                // saltamos si no hay coords válidas
                if ($lat === null || $lon === null) continue;
                if ($lat == 0 && $lon == 0) continue;

                $waypoints[] = [
                    'lat'        => (float)$lat,
                    'lon'        => (float)$lon,
                    'load_id'    => $carga['id'],
                    'partner_id' => $partner['id'],
                    'label'      => $carga['name'],
                ];
            }
        } else {
            // si no llegaron nuevas cargas, conservamos sólo las existentes con load_id
            foreach ($existingWaypoints as $wp) {
                if (isset($wp['load_id']) && $wp['load_id'] !== null) {
                    $waypoints[] = $wp;
                }
            }
            // Si no llegaron nuevas cargas, conservamos expected_qnt existente
            if (isset($existing['expected_qnt']) && is_numeric($existing['expected_qnt'])) {
                $expectedQnt = (float)$existing['expected_qnt'];
            }
        }

        // ---------------- DESTINO ----------------
        if ($destId) {
            $p = $this->odoo->searchRead(
                'res.partner',
                [['id', '=', $destId]],
                ['id','name','latitude','longitude'],
                1
            );
            $dest = $p[0] ?? null;
            if ($dest && $dest['latitude'] && $dest['longitude']) {
                $waypoints[] = [
                    'lat'        => (float)$dest['latitude'],
                    'lon'        => (float)$dest['longitude'],
                    'partner_id' => $dest['id'],
                    'label'      => 'Destino: '.$dest['name'],
                    'type'       => 'destination',
                ];
            }
        } elseif ($existingDest) {
            $waypoints[] = $existingDest;
        }

        // ---------------- DISTANCIA / COSTOS ----------------
        // La distancia viene calculada desde el frontend (ORS en el navegador)
        $distKm = null;
        if (request()->has('total_distance_km')) {
            $distKm = (float) request()->input('total_distance_km');
        }

        $finalTotalCost = $totalCost !== null ? $totalCost : ($existing['total_cost'] ?? null);
        $costPerKg = null;
        if ($finalTotalCost !== null && $expectedQnt && $expectedQnt > 0) {
            $costPerKg = (float)$finalTotalCost / (float)$expectedQnt;
        }

        // ---------------- GUARDAR EN ODOO ----------------
        $vals = [
            'waypoints' => json_encode($waypoints),
        ];

        if ($distKm !== null) {
            $vals['total_distance_km'] = $distKm;
        }

        $newLoadIds = array_map('intval', $loadIds);

        $vals['load_ids'] = [[6, 0, $newLoadIds]];

        if ($vehicleId)          $vals['vehicle_id']   = $vehicleId;
        if ($totalCost !== null) $vals['total_cost']   = $totalCost;
        // Guardamos cantidad esperada; total_qnt se usará más adelante para la cantidad real
        if ($expectedQnt !== null)  $vals['expected_qnt'] = $expectedQnt;
        if ($costPerKg !== null) $vals['cost_per_kg']  = $costPerKg;

        $this->odoo->write('logistics.route', $routeId, $vals);

        // ---------------- ESTADOS DE LAS CARGAS ----------------
        $removedLoadIds = array_diff($previousLoadIds, $newLoadIds);
        foreach ($removedLoadIds as $lid) {
            $this->odoo->write('logistics.load', $lid, ['state' => 'draft']);
        }

        foreach ($newLoadIds as $lid) {
            $this->odoo->write('logistics.load', $lid, ['state' => 'assigned']);
        }

        return [
            'route_id'         => $routeId,
            'waypoints'        => $waypoints,
            'total_distance_km'=> $distKm,
            'total_cost'       => $totalCost ?? ($existing['total_cost'] ?? null),
            'expected_qnt'     => $expectedQnt ?? ($existing['expected_qnt'] ?? null),
            'cost_per_kg'      => $costPerKg ?? ($existing['cost_per_kg'] ?? null),
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
        //    y calcular cantidad total esperada (expected_qnt) igual que en asignarCargas
        $expectedQnt = null;
        if (!empty($loadIds)) {

            $orderedLoads = [];
            $sumExpected = 0.0;

            foreach ($loadIds as $lid) {
                // Reutilizamos la misma lógica que /api/cargas/{id}
                $carga = $this->cargas->porId((int)$lid);
                if (!$carga) {
                    continue;
                }
                $orderedLoads[] = $carga;

                $lines = $carga['lines'] ?? [];
                if (is_array($lines)) {
                    foreach ($lines as $line) {
                        $productName = $line['product_name'] ?? '';
                        $nPallets    = $line['n_pallets'] ?? 0;

                        if (!is_numeric($nPallets) || $nPallets <= 0) {
                            continue;
                        }

                        $code = null;
                        if (is_string($productName)) {
                            if (preg_match('/(\d{3})/', $productName, $m)) {
                                $code = $m[1];
                            }
                        }

                        if (!$code || $code[0] !== '1') {
                            continue;
                        }

                        $avgKg = 0;
                        if ($code === '101') {          // arándano
                            $avgKg = 550;
                        } elseif ($code === '102') {   // frambuesa
                            $avgKg = 500;
                        } elseif ($code === '103') {   // frutilla
                            $avgKg = 700;
                        } else {
                            $avgKg = 0;
                        }

                        if ($avgKg > 0) {
                            $sumExpected += ((float)$nPallets * (float)$avgKg);
                        }
                    }
                }
            }

            $expectedQnt = $sumExpected;

            foreach ($orderedLoads as $load) {
                $partner = $load['partner'] ?? null;
                if (!$partner) continue;

                $lat = $partner['latitude'] ?? null;
                $lon = $partner['longitude'] ?? null;

                // ignorar si no hay coords válidas
                if ($lat === null || $lon === null) continue;
                if ($lat == 0 && $lon == 0) continue;

                $waypoints[] = [
                    'lat'        => (float)$lat,
                    'lon'        => (float)$lon,
                    'load_id'    => $load['id'],
                    'partner_id' => $partner['id'],
                    'label'      => $load['name'],
                ];
            }
        } else {
            // si no llegaron nuevas cargas, conservamos expected_qnt existente para el preview
            if (isset($existing['expected_qnt']) && is_numeric($existing['expected_qnt'])) {
                $expectedQnt = (float)$existing['expected_qnt'];
            }
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

        // 5. Distancia: viene calculada desde el frontend (ORS en el navegador)
        $distKm = 0.0;
        if (request()->has('distance_km')) {
            $distKm = (float) request()->input('distance_km');
        }

        $totalCost = null;
        if (request()->has('total_cost')) {
            $totalCost = (float) request()->input('total_cost');
        } elseif (isset($existing['total_cost']) && is_numeric($existing['total_cost'])) {
            $totalCost = (float)$existing['total_cost'];
        }

        $costPerKg = null;
        if ($totalCost !== null && $expectedQnt && $expectedQnt > 0) {
            $costPerKg = (float)$totalCost / (float)$expectedQnt;
        }

        return [
            'route_id'          => $routeId,
            'waypoints'         => $waypoints,       // El frontend usará esto para dibujar
            'total_distance_km' => $distKm,          // El frontend usará esto para costos
            'expected_qnt'      => $expectedQnt,     // cantidad total esperada
            'cost_per_kg'       => $costPerKg,       // coste por kg estimado
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
        $orsUrl = env('ORS_DIRECTIONS_URL', 'https://api.openrouteservice.org/v2/directions/driving-hgv');
        $orsKey = env('ORS_API_KEY');

        try {
            if ($orsKey && $orsUrl) {
                $coordinates = [];
                foreach ($waypoints as $w) {
                    if (!isset($w['lat'], $w['lon'])) continue;
                    $coordinates[] = [(float) $w['lon'], (float) $w['lat']];
                }

                if (count($coordinates) < 2) {
                    return 0;
                }

                $res = Http::timeout(20)
                    ->withHeaders([
                        'Authorization' => $orsKey,
                        'Content-Type'  => 'application/json',
                    ])
                    ->post($orsUrl, [
                        'coordinates' => $coordinates,
                    ]);

                if (!$res->ok()) {
                    return 0;
                }
                
                $json   = $res->json();

                    $distM = null;

                    if (isset($json['routes'][0]['summary']['distance'])) {
                        $distM = $json['routes'][0]['summary']['distance'];
                    }

                    if (!is_numeric($distM) && isset($json['summary']['distance'])) {
                        $distM = $json['summary']['distance'];
                    }

                return is_numeric($distM) ? ($distM / 1000.0) : 0;
            }
        } catch (\Throwable $e) {
            return 0;
        }

        return 0;
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

    /**
     * Asigna un conductor (partner) a la ruta. Guarda el partner id en el campo
     * `driver_id` de la ruta (si existe en el modelo de Odoo).
     */
    public function asignarConductor(int $idRuta, int $driverId)
    {
        return $this->odoo->write('logistics.route', $idRuta, [
            'driver_id' => $driverId
        ]);
    }

    public function actualizarEstado(int $id, string $status): bool
    {
        // Actualizar estado de la ruta
        $ok = $this->odoo->write('logistics.route', $id, [
            'status' => $status,
        ]);

        if (!$ok) return false;

        // Si la ruta se finaliza, marcar cargas como 'done'
        if ($status === 'done') {
            $ruta = $this->porId($id);
            $loadIds = $ruta['load_ids'] ?? [];
            if (!empty($loadIds)) {
                foreach ($loadIds as $lid) {
                    // Mejor esfuerzo: continuar aunque alguna falle
                    try {
                        $this->odoo->write('logistics.load', $lid, ['state' => 'done']);
                    } catch (\Throwable $e) {
                        // noop
                    }
                }
            }
        }

        return true;
    }

    public function actualizarTotalQnt(int $routeId, float $totalQnt): bool
    {
        return $this->odoo->write('logistics.route', $routeId, [
            'total_qnt' => $totalQnt,
        ]);
    }
}

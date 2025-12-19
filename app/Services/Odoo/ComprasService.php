<?php

namespace App\Services\Odoo;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ComprasService
{
    // Este servicio crea órdenes de compra en Odoo 16
    // usando como origen los datos de una ruta en Odoo 19.

    private string $url16;
    private string $db16;
    private string $user16;
    private string $apiKey16;
    private int $uid16;

    public function __construct(private readonly OdooJsonRpc $odoo19)
    {
        $this->url16    = env('ODOO16_URL');
        $this->db16     = env('ODOO16_DB');
        $this->user16   = env('ODOO16_USER');
        $this->apiKey16 = env('ODOO16_API_KEY');

        if (!$this->url16 || !$this->db16 || !$this->user16 || !$this->apiKey16) {
            throw new \Exception('Variables ODOO16_* faltan en .env para ComprasService');
        }

        $this->authenticate16();
    }

    private function authenticate16(): void
    {
        $this->uid16 = $this->rawCall16('common', 'login', [
            $this->db16,
            $this->user16,
            $this->apiKey16,
        ]);
    }

    private function rawCall16(string $service, string $method, array $args = [])
    {
        $response = Http::post("{$this->url16}/jsonrpc", [
            'jsonrpc' => '2.0',
            'method'  => 'call',
            'params'  => [
                'service' => $service,
                'method'  => $method,
                'args'    => $args,
            ],
            'id' => time(),
        ]);

        $json = $response->json();
        if (isset($json['error'])) {
            throw new \Exception('Odoo16 JSON-RPC Error: ' . ($json['error']['data']['message'] ?? 'unknown'));
        }
        return $json['result'];
    }

    private function call16(string $service, string $method, array $args = [])
    {
        return $this->rawCall16($service, $method, $args);
    }

    /**
     * Dada una ruta de Odoo 19, resuelve el partner (chofer/empresa)
     * y crea una orden de compra en Odoo 16.
     * Devuelve el ID de purchase.order creado o null si no se pudo.
     */
    public function crearOrdenDesdeRuta(array $ruta): ?int
    {
        try {
            // 1) Si la ruta tiene transportista (carrier_id de Odoo 16), usamos ese partner directamente.
            $partner16Id = null;
            $carrierField = $ruta['carrier_id'] ?? null;

            if ($carrierField !== null && $carrierField !== '') {
                $partner16Id = (int) $carrierField;
            } else {
                // 2) Si no hay carrier_id, resolvemos el partner desde Odoo 19 (driver)
                $partner19 = $this->resolveRoutePartner19($ruta);
                if (!$partner19) {
                    return null;
                }

                $rut       = isset($partner19['vat']) && $partner19['vat'] !== ''
                    ? (string) $partner19['vat']
                    : null;
                $name      = (string) ($partner19['name'] ?? 'Sin nombre');
                $isCompany = (bool) ($partner19['is_company'] ?? false);

                // Creamos/buscamos el partner en Odoo 16 sólo en este caso
                $partner16Id = $this->findOrCreatePartner16($rut, $name, $isCompany);
            }

            if (!$partner16Id || $partner16Id <= 0) {
                return null;
            }

            $rutaName = (string) ($ruta['name'] ?? '');

            $distKm = $ruta['total_distance_km'] ?? 0;
            if (!is_numeric($distKm)) {
                $distKm = 0;
            }
            $qty = round((float) $distKm, 2); // km con 2 decimales

            $poId = $this->createPurchaseOrder16($partner16Id, $rutaName);

            // Crear línea de servicio de flete.
            // Nota: price_unit fijo 1000 CLP por ahora; ajustar a tarifa futura.
            $this->createPurchaseOrderLine16($poId, $qty, 1000);

            return $poId;
        } catch (\Throwable $e) {
            // Logueamos el error para poder depurar sin depender de la consola de Odoo.
            Log::error('Error creando orden de compra en Odoo16 desde ruta', [
                'route_id'      => $ruta['id'] ?? null,
                'route_name'    => $ruta['name'] ?? null,
                'carrier_id'    => $ruta['carrier_id'] ?? null,
                'driver_id'     => $ruta['driver_id'] ?? null,
                'distance_km'   => $ruta['total_distance_km'] ?? null,
                'exception'     => $e->getMessage(),
            ]);

            // Propagamos la excepción para que RutasService pueda incluir el mensaje
            // en la respuesta HTTP (campo purchase.error) y verlo desde el frontend.
            throw $e;
        }
    }

    /**
    * Obtiene el partner (chofer) asociado a la ruta en Odoo 19
    * para el caso en que NO haya transportista (carrier_id).
    * Usa driver_id como origen y devuelve el partner de Odoo 19.
     */
    private function resolveRoutePartner19(array $ruta): ?array
    {
        // Usamos driver_id (partner en Odoo 19)
        $driverField = $ruta['driver_id'] ?? null;
        $partnerId   = null;

        if (is_array($driverField)) {
            $partnerId = $driverField[0] ?? null;
        } elseif (is_int($driverField) || ctype_digit((string) $driverField)) {
            $partnerId = (int) $driverField;
        }

        if (!$partnerId) {
            return null;
        }

        $rows = $this->odoo19->searchRead(
            'res.partner',
            [['id', '=', $partnerId]],
            ['id', 'name', 'vat', 'is_company', 'parent_id'],
            1
        );

        return $rows[0] ?? null;
    }

    /**
     * Busca un partner en Odoo 16 por RUT (vat). Si no existe, lo crea
     * con el nombre e is_company entregados.
     */
    private function findOrCreatePartner16(?string $rut, string $name, bool $isCompany): int
    {
        if ($rut) {
            $rows = $this->call16(
                'object',
                'execute_kw',
                [
                    $this->db16,
                    $this->uid16,
                    $this->apiKey16,
                    'res.partner',
                    'search_read',
                    [[['vat', '=', $rut]]],
                    [
                        'fields' => ['id', 'name', 'vat', 'is_company'],
                        'limit'  => 1,
                    ],
                ]
            );

            if (!empty($rows) && isset($rows[0]['id'])) {
                return (int) $rows[0]['id'];
            }
        }

        $vals = [
            'name'       => $name ?: 'Sin nombre',
            'is_company' => $isCompany,
        ];

        if ($rut) {
            $vals['vat'] = $rut;
        }

        $id = $this->call16(
            'object',
            'execute_kw',
            [
                $this->db16,
                $this->uid16,
                $this->apiKey16,
                'res.partner',
                'create',
                [[$vals]],
            ]
        );

        return (int) $id;
    }

    /**
     * Crea la cabecera de purchase.order en Odoo 16.
     */
    private function createPurchaseOrder16(int $partnerId, string $rutaName = ''): int
    {
        $notes = $rutaName
            ? sprintf('Orden de compra generada automáticamente desde el sistema de logística a partir de la ruta %s.', $rutaName)
            : 'Orden de compra generada automáticamente desde el sistema de logística.';

        $poId = $this->call16(
            'object',
            'execute_kw',
            [
                $this->db16,
                $this->uid16,
                $this->apiKey16,
                'purchase.order',
                'create',
                [[
                    'partner_id'                   => $partnerId,
                    'x_studio_selection_field_yUNPd' => 'RECEPCION',
                    'picking_type_id'              => 151,
                    'notes'                        => $notes,
                ]],
            ]
        );

        return (int) $poId;
    }

    /**
     * Crea una línea de servicio de flete en purchase.order.line.
     */
    private function createPurchaseOrderLine16(int $orderId, float $qtyKm): int
    {
        $lineId = $this->call16(
            'object',
            'execute_kw',
            [
                $this->db16,
                $this->uid16,
                $this->apiKey16,
                'purchase.order.line',
                'create',
                [[
                    'order_id'           => $orderId,
                    'product_template_id'=> 873, // SERVICIO DE FLETE
                    'product_qty'        => $qtyKm,
                    'price_unit'         => 1000,
                ]],
            ]
        );

        return (int) $lineId;
    }

    /**
     * Procesa rutas en Odoo 19 con status 'done' y lines_oc = false,
     * buscando en Odoo 16 una orden de compra asociada para el mismo
     * transportista y la misma ruta (por nombre en notes), y creando
     * la linea de flete si no existe.
     */
    public function syncLinesOcPendientes(): array
    {
        $routes = $this->odoo19->searchRead(
            'logistics.route',
            [
                ['status', '=', 'done'],
                ['lines_oc', '=', false],
            ],
            ['id', 'name', 'carrier_id', 'total_distance_km', 'lines_oc']
        );

        $summary = [
            'total_routes' => count($routes),
            'processed'    => [],
        ];

        foreach ($routes as $route) {
            $routeId   = $route['id'] ?? null;
            $routeName = (string) ($route['name'] ?? '');

            $carrierField = $route['carrier_id'] ?? null;
            $carrierId    = null;
            if (is_array($carrierField)) {
                $carrierId = $carrierField[0] ?? null;
            } elseif (is_int($carrierField) || ctype_digit((string) $carrierField)) {
                $carrierId = (int) $carrierField;
            }

            $distKm = $route['total_distance_km'] ?? 0;
            if (!is_numeric($distKm)) {
                $distKm = 0;
            }
            $qtyKm = round((float) $distKm, 2);

            $entry = [
                'route_id'          => $routeId,
                'route_name'        => $routeName,
                'carrier_id'        => $carrierId,
                'purchase_order_id' => null,
                'purchase_line_id'  => null,
                'action'            => null,
                'error'             => null,
            ];

            if (!$routeId || !$carrierId || $routeName === '') {
                $entry['action'] = 'skipped';
                $entry['error']  = 'missing route_id, carrier_id or name';
                $summary['processed'][] = $entry;
                continue;
            }

            try {
                // 1) Buscar orden de compra en Odoo 16 por partner
                // y notas que contengan el nombre de la ruta
                $orders = $this->call16(
                    'object',
                    'execute_kw',
                    [
                        $this->db16,
                        $this->uid16,
                        $this->apiKey16,
                        'purchase.order',
                        'search_read',
                        [[
                            ['partner_id', '=', $carrierId],
                            ['notes', 'ilike', $routeName],
                        ]],
                        [
                            'fields' => ['id', 'name', 'notes'],
                            'limit'  => 2,
                        ],
                    ]
                );

                if (empty($orders)) {
                    $entry['action'] = 'no_order_found';
                    $summary['processed'][] = $entry;
                    continue;
                }

                if (count($orders) > 1) {
                    $entry['action'] = 'multiple_orders_found';
                    $entry['error']  = 'Más de una orden coincide con partner y notes';
                    $summary['processed'][] = $entry;
                    continue;
                }

                $orderId = (int) ($orders[0]['id'] ?? 0);
                if ($orderId <= 0) {
                    $entry['action'] = 'invalid_order_id';
                    $summary['processed'][] = $entry;
                    continue;
                }

                $entry['purchase_order_id'] = $orderId;

                // 2) Verificar si ya existe una linea de flete para esta orden
                $lines = $this->call16(
                    'object',
                    'execute_kw',
                    [
                        $this->db16,
                        $this->uid16,
                        $this->apiKey16,
                        'purchase.order.line',
                        'search_read',
                        [[
                            ['order_id', '=', $orderId],
                            ['product_template_id', '=', 873],
                        ]],
                        [
                            'fields' => ['id', 'product_template_id'],
                            'limit'  => 1,
                        ],
                    ]
                );

                if (!empty($lines)) {
                    // Ya existe una línea de flete -> solo marcamos lines_oc = true en la ruta
                    $lineId = (int) ($lines[0]['id'] ?? 0);
                    $entry['purchase_line_id'] = $lineId > 0 ? $lineId : null;
                    $entry['action'] = 'marked_existing_line';

                    $this->odoo19->write('logistics.route', $routeId, [
                        'lines_oc' => true,
                    ]);

                    $summary['processed'][] = $entry;
                    continue;
                }

                // 3) No hay linea de flete aún -> la creamos con la distancia de la ruta
                $lineId = $this->createPurchaseOrderLine16($orderId, $qtyKm);
                $entry['purchase_line_id'] = $lineId;
                $entry['action'] = 'created_line';

                // Marcar la ruta como ya asociada a linea de O.C
                $this->odoo19->write('logistics.route', $routeId, [
                    'lines_oc' => true,
                ]);

                $summary['processed'][] = $entry;
            } catch (\Throwable $e) {
                Log::error('Error en syncLinesOcPendientes', [
                    'route_id' => $routeId,
                    'exception'=> $e->getMessage(),
                ]);
                $entry['action'] = 'error';
                $entry['error']  = $e->getMessage();
                $summary['processed'][] = $entry;
            }
        }

        return $summary;
    }
}

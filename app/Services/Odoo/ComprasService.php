<?php

namespace App\Services\Odoo;

use Illuminate\Support\Facades\Http;

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
            $partner19 = $this->resolveRoutePartner19($ruta);
            if (!$partner19) {
                return null;
            }

            $rut       = isset($partner19['vat']) && $partner19['vat'] !== ''
                ? (string) $partner19['vat']
                : null;
            $name      = (string) ($partner19['name'] ?? 'Sin nombre');
            $isCompany = (bool) ($partner19['is_company'] ?? false);

            $partner16Id = $this->findOrCreatePartner16($rut, $name, $isCompany);

            $distKm = $ruta['total_distance_km'] ?? 0;
            if (!is_numeric($distKm)) {
                $distKm = 0;
            }
            $qty = round((float) $distKm, 2); // km con 2 decimales

            $poId = $this->createPurchaseOrder16($partner16Id);

            // Crear línea de servicio de flete.
            // Nota: price_unit fijo 1000 CLP por ahora; ajustar a tarifa futura.
            $this->createPurchaseOrderLine16($poId, $qty, 1000);

            return $poId;
        } catch (\Throwable $e) {
            // No interrumpimos el flujo de negocio si falla la integración.
            return null;
        }
    }

    /**
     * Obtiene desde Odoo 19 el partner asociado a la ruta.
     * Prioridad:
     *  1) company_id (transportista)
     *  2) driver_id (chofer), como fallback
     */
    private function resolveRoutePartner19(array $ruta): ?array
    {
        // 1) Transportista (company_id) si viene informado en la ruta
        $companyField = $ruta['company_id'] ?? null;
        $partnerId    = null;

        if (is_array($companyField)) {
            $partnerId = $companyField[0] ?? null;
        } elseif (is_int($companyField) || ctype_digit((string) $companyField)) {
            $partnerId = (int) $companyField;
        }

        // 2) Si no hay company_id, usamos driver_id como antes
        if (!$partnerId) {
            $driverField = $ruta['driver_id'] ?? null;
            if (is_array($driverField)) {
                $partnerId = $driverField[0] ?? null;
            } elseif (is_int($driverField) || ctype_digit((string) $driverField)) {
                $partnerId = (int) $driverField;
            }
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
    private function createPurchaseOrder16(int $partnerId): int
    {
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
                ]],
            ]
        );

        return (int) $poId;
    }

    /**
     * Crea una línea de servicio de flete en purchase.order.line.
     */
    private function createPurchaseOrderLine16(int $orderId, float $qtyKm, float $priceUnit): void
    {
        $this->call16(
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
                    'name'               => 'SERVICIO DE FLETE',
                    'product_qty'        => $qtyKm,
                    'price_unit'         => $priceUnit,
                ]],
            ]
        );
    }
}

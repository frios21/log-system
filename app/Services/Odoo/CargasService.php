<?php

namespace App\Services\Odoo;

use App\Services\Odoo\OdooJsonRpc;
use App\Services\Odoo\ContactosService;

class CargasService
{
    public function __construct(
        private readonly OdooJsonRpc $odoo,
        private readonly ContactosService $contactos16,
    ) {}

    /**
     * Sincroniza un partner desde Odoo 16 hacia Odoo 19 y devuelve el id en 19.
     * Usa x_odoo16_partner_id si existe para no duplicar.
     */
    private function syncPartnerFromOdoo16(int $partner16Id): ?int
    {
        $c16 = $this->contactos16->porId($partner16Id);
        if (!$c16) {
            return null;
        }

        // 1) Buscar por x_odoo16_partner_id en Odoo 19
        $existing = $this->odoo->searchRead(
            'res.partner',
            [['x_odoo16_partner_id', '=', $partner16Id]],
            ['id'],
            1
        );
        if (!empty($existing)) {
            return (int) $existing[0]['id'];
        }

        // 2) Fallback: buscar por nombre exacto para evitar duplicados
        $partnerId19 = null;
        $byName = $this->odoo->searchRead(
            'res.partner',
            [['name', '=', $c16['name']]],
            ['id'],
            1
        );
        if (!empty($byName)) {
            $partnerId19 = (int) $byName[0]['id'];
        }

        // 3) Construir valores básicos
        $lat = $c16['latitude'] ?? null;
        $lon = $c16['longitude'] ?? null;

        $vals = [
            'name'          => $c16['name'],
            'supplier_rank' => 1,
            'is_company'    => $c16['is_company'] ?? false,
            'x_odoo16_partner_id' => $partner16Id,
        ];

        if (!empty($c16['phone'])) {
            $vals['phone'] = $c16['phone'];
        }
        if (!empty($c16['email'])) {
            $vals['email'] = $c16['email'];
        }
        if (!empty($c16['vat'])) {
            $vals['vat'] = $c16['vat'];
        }
        if (!empty($c16['street'])) {
            $vals['street'] = $c16['street'];
        }
        if (!empty($c16['street2'])) {
            $vals['street2'] = $c16['street2'];
        }
        if (!empty($c16['city'])) {
            $vals['city'] = $c16['city'];
        }
        if (!empty($c16['zip'])) {
            $vals['zip'] = $c16['zip'];
        }

        if ($lat !== null) {
            $vals['latitude'] = (float) $lat;
            $vals['partner_latitude'] = (float) $lat;
        }
        if ($lon !== null) {
            $vals['longitude'] = (float) $lon;
            $vals['partner_longitude'] = (float) $lon;
        }

        // 4) Resolver país y estado por nombre si vienen desde Odoo 16
        $country = $c16['country_id'] ?? null;
        if (is_array($country) && isset($country[1])) {
            $countryName = $country[1];
            $countries19 = $this->odoo->searchRead(
                'res.country',
                [['name', '=', $countryName]],
                ['id'],
                1
            );
            if (!empty($countries19)) {
                $vals['country_id'] = $countries19[0]['id'];
            }
        }

        $state = $c16['state_id'] ?? null;
        if (is_array($state) && isset($state[1]) && !empty($vals['country_id'])) {
            $stateName = $state[1];
            $states19 = $this->odoo->searchRead(
                'res.country.state',
                [
                    ['name', '=', $stateName],
                    ['country_id', '=', $vals['country_id']],
                ],
                ['id'],
                1
            );
            if (!empty($states19)) {
                $vals['state_id'] = $states19[0]['id'];
            }
        }

        // 5) Si tiene padre en Odoo 16, intentar sincronizarlo primero
        $parent = $c16['parent_id'] ?? null;
        if (is_array($parent) && !empty($parent[0])) {
            $parent19Id = $this->syncPartnerFromOdoo16((int) $parent[0]);
            if ($parent19Id) {
                $vals['parent_id'] = $parent19Id;
            }
        }

        // 6) Crear o actualizar en Odoo 19
        if ($partnerId19) {
            $this->odoo->write('res.partner', $partnerId19, $vals);
        } else {
            $partnerId19 = (int) $this->odoo->create('res.partner', $vals);
        }

        return $partnerId19;
    }

    public function todas(): array
    {
        return $this->odoo->searchRead(
            'logistics.load',
            [],
            [
                'name', 'vendor_name', 'total_pallets', 'total_quantity',
                'state', 'date', 'destino', 'priority', 'fleet_assigned',
            ]
        );
    }

    public function porId(int $id): ?array
    {
        $rows = $this->odoo->searchRead(
            'logistics.load',
            [['id', '=', $id]],
            [
                'id',
                'name',
                'vendor_id',
                'vendor_name',
                'destino',
                'date',
                'total_quantity',
                'total_pallets',
                'total_cost',
                'state',
                'line_ids',
            ],
            1
        );

        $load = $rows[0] ?? null;
        if (!$load) {
            return null;
        }

        $load['lines'] = $this->getLoadLines($load['line_ids'] ?? []);

        $vendor     = $load['vendor_id'] ?? null;
        $vendorName = $load['vendor_name'] ?? null;

        // Usamos la misma lógica que en getLoadsWithLines para resolver coordenadas,
        // pasando también el vendorName para que funcione el fallback Odoo 16
        $partner = $this->getPartnerCoordinates($vendor ?? $vendorName, $vendorName);

        if ($partner) {
            $load['partner'] = [
                'id'        => $partner['id'],
                'name'      => $partner['name'],
                'latitude'  => $partner['latitude'],
                'longitude' => $partner['longitude'],
                'street'    => $partner['street'],
            ];
        } else {
            $load['partner'] = null;
        }

        return $load;
    }

    public function getPartnerById(int $id)
    {
        $partner = $this->odoo->searchRead(
            'res.partner',
            [['id', '=', $id]],
            ['id', 'name', 'street', 'latitude', 'longitude']
        );

        return $partner[0] ?? null;
    }

    /**
     * Devuelve un partner con lat/lon:
     * 1) Intenta por ID en Odoo 19.
     * 2) Si no tiene coords, busca por nombre en Odoo 16.
     */
    public function getPartnerCoordinates($vendor, ?string $vendorName = null): ?array
    {
        $partner19 = null;

        // vendor puede venir como [id, "Nombre"]
        if (is_array($vendor) && isset($vendor[0])) {
            $id = (int)$vendor[0];
            $partner19 = $this->getPartnerById($id);
            $vendorName = $vendorName ?? ($vendor[1] ?? null);
        } elseif (is_int($vendor) || ctype_digit((string)$vendor)) {
            $partner19 = $this->getPartnerById((int)$vendor);
        } elseif (is_string($vendor) && !$vendorName) {
            $vendorName = $vendor;
        }

        // Si en Odoo 19 ya tiene lat/lon válidas, usamos eso
        if ($partner19 && $partner19['latitude'] !== null && $partner19['longitude'] !== null && ($partner19['latitude'] != 0 || $partner19['longitude'] != 0)) {
            return $partner19;
        }

        // Fallback: buscar en Odoo 16 por nombre
        $name = $vendorName;
        if ($name) {
            $p16 = $this->contactos16->buscarPorNombre($name);
            if ($p16 && $p16['latitude'] !== null && $p16['longitude'] !== null) {
                return [
                    'id'        => $p16['id'],
                    'name'      => $p16['name'],
                    'latitude'  => $p16['latitude'],
                    'longitude' => $p16['longitude'],
                    'street'    => $p16['street'] ?? null,
                ];
            }
        }

        // Si no encontramos nada mejor, devolvemos lo que tengamos (aunque sea sin coords)
        return $partner19;
    }

    public function getLoadLines(array $ids)
    {
        if (empty($ids)) return [];

        return $this->odoo->searchRead(
            'logistics.load.line',
            [['id', 'in', $ids]],
            ['id', 'product_name', 'quantity', 'n_pallets', 'price_unit', 'price_subtotal']
        );
    }

    public function getLoadsWithLines(?string $state = null): array
    {
        $domain = [];

        if ($state) {
            $domain[] = ['state', '=', $state];
        }

        $loads = $this->odoo->searchRead(
            'logistics.load',
            $domain,
            [
                'id',
                'name',
                'vendor_id',
                'vendor_name',
                'destino',
                'date',
                'total_quantity',
                'total_pallets',
                'total_cost',
                'state',
                'line_ids'
            ]
        );

        foreach ($loads as &$load) {

            // Líneas
            $load['lines'] = $this->getLoadLines($load['line_ids'] ?? []);

            // Partner (coordenadas) usando vendor_id + vendor_name
            $vendor      = $load['vendor_id'] ?? null;      // puede ser [id, name]
            $vendorName  = $load['vendor_name'] ?? null;

            $partner = $this->getPartnerCoordinates($vendor ?? $vendorName, $vendorName);

            if ($partner) {
                $load['partner'] = [
                    'id'        => $partner['id'],
                    'name'      => $partner['name'],
                    'latitude'  => $partner['latitude'],
                    'longitude' => $partner['longitude'],
                    'street'    => $partner['street'] ?? null,
                ];
            } else {
                $load['partner'] = null;
            }
        }

        return $loads;
    }

    public function resetAllToDraft(): void
    {
        $loads = $this->odoo->searchRead(
            'logistics.load',
            [], // sin dominio -> todas
            ['id', 'state']
        );

        foreach ($loads as $load) {
            if (($load['state'] ?? null) === 'draft') {
                continue;
            }

            try {
                $this->odoo->write('logistics.load', $load['id'], [
                    'state' => 'draft',
                ]);
            } catch (\Throwable $e) {
                // ignorar errores individuales
            }
        }
    }

    public function updateTotalPallets(int $id, ?float $totalPallets): void
    {
        $this->odoo->write('logistics.load', $id, [
            'total_pallets' => $totalPallets,
        ]);
    }

    public function updateLinePallets(int $lineId, ?float $nPallets): void
    {
        $this->odoo->write('logistics.load.line', $lineId, [
            'n_pallets' => $nPallets,
        ]);
    }

    /**
     * Actualiza campos simples de una carga (pensado para cargas manuales):
     * name, vendor_name, vendor_id (Odoo16 → se mapea a Odoo19),
     * total_quantity, total_pallets y/o date.
     */
    public function updateSimpleFields(int $id, array $fields): void
    {
        $allowed = ['name', 'vendor_name', 'vendor_id', 'total_quantity', 'total_pallets', 'date'];
        $vals = [];

        foreach ($allowed as $key) {
            if (array_key_exists($key, $fields)) {
                $vals[$key] = $fields[$key];
            }
        }

        // Si viene vendor_id desde el frontend (ID Odoo 16),
        // sincronizamos/creamos el partner en Odoo 19 y reemplazamos
        // por el id real de res.partner en Odoo 19.
        if (array_key_exists('vendor_id', $vals) && $vals['vendor_id']) {
            $partner16Id = (int) $vals['vendor_id'];
            $partner19Id = $this->syncPartnerFromOdoo16($partner16Id);
            if ($partner19Id) {
                $vals['vendor_id'] = $partner19Id;
            } else {
                // Si no pudimos sincronizar, evitamos enviar un id inválido a Odoo 19
                unset($vals['vendor_id']);
            }
        }

        if (!empty($vals)) {
            $this->odoo->write('logistics.load', $id, $vals);
        }
    }

    /**
     * Crea una "carga manual" vacía en Odoo (logistics.load),
     * similar a como se crea una ruta nueva.
     */
    public function crearManual(): array
    {
        $name = 'Carga manual ' . date('Y-m-d');

        $vals = [
            'name'           => $name,
            'state'          => 'draft',
            'total_quantity' => 0,
            'total_pallets'  => 0,
            'date'           => date('Y-m-d H:i:s'),
        ];

        $id = $this->odoo->create('logistics.load', $vals);

        return [
            'id'   => $id,
            'name' => $name,
        ];
    }
}

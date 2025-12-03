<?php

namespace App\Services\Odoo;

use App\Services\Odoo\OdooJsonRpc;
use App\Services\Odoo\ContactosService;

class CargasService
{
    public function __construct(
        private readonly OdooJsonRpc $odoo,
        private readonly ContactosService $contactos16,   // <-- nuevo
    ) {}

    public function todas(): array
    {
        return $this->odoo->searchRead(
            'logistics.load',
            [],
            [
                'name', 'vendor_name', 'total_pallets', 'total_quantity',
                'state', 'date', 'priority', 'fleet_assigned',
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

        $partner = $this->getPartnerCoordinates($vendor ?? $vendorName);

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
}

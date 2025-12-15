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
                'partner', // nuevo campo JSON en Odoo
            ],
            1
        );

        $load = $rows[0] ?? null;
        if (!$load) {
            return null;
        }

        $load['lines'] = $this->getLoadLines($load['line_ids'] ?? []);

        // Resolver partner usando vendor_id/vendor_name y el snapshot JSON en Odoo,
        // sin sobreescribir con null cuando ya no se encuentra.
        $load['partner'] = $this->resolveAndPersistPartnerSnapshot($load);

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
                'line_ids',
                'partner', // snapshot JSON del partner en Odoo
            ]
        );

        foreach ($loads as &$load) {

            // Líneas
            $load['lines'] = $this->getLoadLines($load['line_ids'] ?? []);

            // Partner: usar vendor_id/vendor_name y el snapshot JSON, sin borrar
            // el partner guardado si ya no se encuentra en Odoo 16/19.
            $load['partner'] = $this->resolveAndPersistPartnerSnapshot($load);
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
     * name, vendor_name, total_quantity, total_pallets y/o date.
     */
    public function updateSimpleFields(int $id, array $fields): void
    {
        // No tocamos vendor_id aquí para evitar problemas con IDs de Odoo 16.
        $allowed = ['name', 'vendor_name', 'total_quantity', 'total_pallets', 'date'];
        $vals = [];

        foreach ($allowed as $key) {
            if (array_key_exists($key, $fields)) {
                $vals[$key] = $fields[$key];
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

    public function eliminar(int $id)
    {
        return $this->odoo->call(
            "object",
            "execute_kw",
            [
                $this->odoo->getDb(),
                $this->odoo->getUid(),
                $this->odoo->getPassword(),
                "logistics.load",
                "unlink",
                [[ $id ]]
            ]
        );
    }

    /**
     * Normaliza el snapshot de partner que viene desde Odoo (campo JSON).
     * Si viene como lista vacía o null, devuelve null.
     */
    private function normalizePartnerSnapshot($raw): ?array
    {
        if ($raw === null) {
            return null;
        }

        if (is_array($raw)) {
            if (count($raw) === 0) {
                return null;
            }

            return [
                'id'        => $raw['id']        ?? null,
                'name'      => $raw['name']      ?? null,
                'latitude'  => $raw['latitude']  ?? null,
                'longitude' => $raw['longitude'] ?? null,
                'street'    => $raw['street']    ?? null,
            ];
        }

        return null;
    }

    /**
     * Compara dos partner para saber si cambiaron.
     */
    private function partnerSnapshotChanged(?array $old, array $new): bool
    {
        if ($old === null) {
            return true;
        }

        return (
            ($old['id']        ?? null) !== ($new['id']        ?? null) ||
            ($old['name']      ?? null) !== ($new['name']      ?? null) ||
            ($old['latitude']  ?? null) !== ($new['latitude']  ?? null) ||
            ($old['longitude'] ?? null) !== ($new['longitude'] ?? null) ||
            ($old['street']    ?? null) !== ($new['street']    ?? null)
        );
    }

    /**
     * Resuelve el partner usando vendor_id/vendor_name y, si lo encuentra,
     * actualiza el campo JSON `partner` en logistics.load. Si no lo encuentra,
     * reutiliza el snapshot anterior en vez de sobreescribir con null.
     */
    private function resolveAndPersistPartnerSnapshot(array $load): ?array
    {
        $snapshot = $this->normalizePartnerSnapshot($load['partner'] ?? null);

        $vendor     = $load['vendor_id']   ?? null; // puede ser [id, name]
        $vendorName = $load['vendor_name'] ?? null;

        $resolved = $this->getPartnerCoordinates($vendor ?? $vendorName, $vendorName);

        if ($resolved) {
            $normalized = [
                'id'        => $resolved['id']        ?? null,
                'name'      => $resolved['name']      ?? null,
                'latitude'  => $resolved['latitude']  ?? null,
                'longitude' => $resolved['longitude'] ?? null,
                'street'    => $resolved['street']    ?? null,
            ];

            $id = $load['id'] ?? null;
            if ($id && $this->partnerSnapshotChanged($snapshot, $normalized)) {
                $this->odoo->write('logistics.load', (int) $id, [
                    'partner' => $normalized,
                ]);
            }

            return $normalized;
        }

        return $snapshot;
    }
}

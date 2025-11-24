<?php

namespace App\Services\Odoo;

class CargasService
{
    public function __construct(
        private readonly OdooJsonRpc $odoo
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
    public function getPartnerById(int $id)
    {
        $partner = $this->odoo->searchRead(
            'res.partner',
            [['id', '=', $id]],
            ['id', 'name', 'street', 'latitude', 'longitude']
        );

        return $partner[0] ?? null;
    }

    public function getPartnerCoordinates($vendor)
    {
        // vendor puede venir como ["id", "Nombre"]
        if (is_array($vendor) && isset($vendor[0])) {
            return $this->getPartnerById($vendor[0]);
        }

        return null;
    }


    public function porId(int $id): ?array
    {
        return $this->odoo->searchRead(
            'logistics.load',
            [['id', '=', $id]],
            ['*'],
            1
        )[0] ?? null;
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

            // Partner (coordenadas)
            $vendor = $load['vendor_id'] ?? $load['vendor_name'];

            $partner = $this->getPartnerCoordinates($vendor);

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
        }

        return $loads;
    }
}

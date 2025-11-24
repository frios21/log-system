<?php

namespace App\Services\Odoo;

class VehiculosService
{
    public function __construct(
        private readonly OdooJsonRpc $odoo
    ) {}

    public function todos(): array
    {
        return $this->odoo->searchRead(
            'fleet.vehicle',
            [],
            ['name', 'driver_id', 'license_plate']
        );
    }
}

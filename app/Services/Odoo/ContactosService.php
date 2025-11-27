<?php

namespace App\Services\Odoo;

class ContactosService
{
    public function __construct(
        private readonly OdooJsonRpc $odoo
    ) {}

    public function todos(): array
    {
        return $this->odoo->searchRead(
            'res.partner',
            [['active', '=', true]],
            ['name', 'phone', 'email', 'latitude', 'longitude'], 0
        );
    }
}

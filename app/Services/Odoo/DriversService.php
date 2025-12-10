<?php

namespace App\Services\Odoo;

class DriversService
{
    public function __construct(private readonly OdooJsonRpc $odoo) {}

    /**
     * Devuelve contactos de Odoo 19 que son personas (no empresas).
     * Sin filtros: la búsqueda en frontend se hace sobre este listado.
     */
    public function todos(): array
    {
        $domain = [
            ['active', '=', true],
            ['is_company', '=', false],
        ];

        $rows = $this->odoo->searchRead(
            'res.partner',
            $domain,
            ['id', 'name', 'traccar_device_id'],
            200
        );

        return $rows;
    }
}

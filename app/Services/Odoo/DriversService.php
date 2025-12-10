<?php

namespace App\Services\Odoo;

class DriversService
{
    public function __construct(private readonly OdooJsonRpc $odoo) {}

    /**
     * Devuelve contactos de Odoo 19 que son personas (no empresas).
     * Opcionalmente filtra por nombre usando ilike.
     */
    public function personas(?string $q = null): array
    {
        $domain = [
            ['active', '=', true],
            ['is_company', '=', false],
        ];

        if ($q) {
            $domain[] = ['name', 'ilike', $q];
        }

        $rows = $this->odoo->searchRead(
            'res.partner',
            $domain,
            ['id', 'name', 'email', 'phone', 'mobile'],
            200
        );

        return $rows;
    }
}

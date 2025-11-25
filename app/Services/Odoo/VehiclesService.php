<?php

namespace App\Services\Odoo;

class VehiclesService
{
    public function __construct(private readonly OdooJsonRpc $odoo) {}

    /**
     * Obtener vehículos normalizados
     */
    public function todos(?string $q = null): array
    {
        $domain = [];

        if ($q) {
            $domain = ['|', ['name', 'ilike', $q], ['license_plate', 'ilike', $q]];
        }

        $fields = [
            'id', 'name', 'license_plate', 'model_id', 'driver_id',
            'x_capacidad', 'x_unidad_capacidad', 'x_capacidad_pallets',
            'image_1920'
        ];

        $vehicles = $this->odoo->searchRead(
            'fleet.vehicle',
            $domain,
            $fields,
            200
        );

        $out = [];

        foreach ($vehicles as $v) {
            $out[] = [
                'id'                   => $v['id'],
                'name'                 => $v['name'] ?? '',
                'license_plate'        => $v['license_plate'] ?? '',
                'model'                => is_array($v['model_id']) ? ($v['model_id'][1] ?? '') : null,
                'driver_id'            => is_array($v['driver_id']) ? ($v['driver_id'][0] ?? null) : null,
                'driver_name'          => is_array($v['driver_id']) ? ($v['driver_id'][1] ?? null) : null,
                'x_capacidad'          => $v['x_capacidad'] ?? null,
                'x_unidad_capacidad'   => $v['x_unidad_capacidad'] ?? null,
                'x_capacidad_pallets'  => $v['x_capacidad_pallets'] ?? null,
                'image'                => !empty($v['image_1920'])
                                            ? 'data:image/png;base64,' . $v['image_1920']
                                            : null,
            ];
        }

        return $out;
    }

    /**
     * Obtener un vehículo por ID
     */
    public function porId(int $id): ?array
    {
        $res = $this->odoo->searchRead(
            'fleet.vehicle',
            [['id', '=', $id]],
            [
                'id','name','license_plate','model_id','driver_id',
                'x_capacidad','x_unidad_capacidad','x_capacidad_pallets',
                'image_1920'
            ],
            1
        );

        $v = $res[0] ?? null;
        if (!$v) return null;

        return [
            'id'                   => $v['id'],
            'name'                 => $v['name'] ?? '',
            'license_plate'        => $v['license_plate'] ?? '',
            'model'                => is_array($v['model_id']) ? ($v['model_id'][1] ?? '') : null,
            'driver_id'            => is_array($v['driver_id']) ? ($v['driver_id'][0] ?? null) : null,
            'driver_name'          => is_array($v['driver_id']) ? ($v['driver_id'][1] ?? null) : null,
            'x_capacidad'          => $v['x_capacidad'] ?? null,
            'x_unidad_capacidad'   => $v['x_unidad_capacidad'] ?? null,
            'x_capacidad_pallets'  => $v['x_capacidad_pallets'] ?? null,
            'image'                => !empty($v['image_1920'])
                                        ? 'data:image/png;base64,' . $v['image_1920']
                                        : null,
        ];
    }
}

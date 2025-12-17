<?php

namespace App\Services\Odoo;

use Illuminate\Support\Facades\Http;

class ContactosService
{
    // Este servicio usa Odoo 16 con variables dedicadas ODOO16_*
    // No afecta el resto del sistema que sigue usando ODOO_*

    private string $url16;
    private string $db16;
    private string $user16;
    private string $apiKey16;
    private int $uid16;

    public function __construct()
    {
        $this->url16    = env('ODOO16_URL');
        $this->db16     = env('ODOO16_DB');
        $this->user16   = env('ODOO16_USER');
        $this->apiKey16 = env('ODOO16_API_KEY');

        if (!$this->url16 || !$this->db16 || !$this->user16 || !$this->apiKey16) {
            throw new \Exception('Variables ODOO16_* faltan en .env para ContactosService');
        }

        $this->authenticate16();
    }

    private function authenticate16(): void
    {
        $this->uid16 = $this->rawCall16('common', 'login', [$this->db16, $this->user16, $this->apiKey16]);
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

    public function todos(): array
    {
        $rows = $this->call16(
            'object',
            'execute_kw',
            [
                $this->db16,
                $this->uid16,
                $this->apiKey16,
                'res.partner',
                'search_read',
                [[['active', '=', true]]],
                [
                    // display_name en Odoo ya viene como "Padre, Hijo" cuando aplica
                    'fields' => ['id','name','display_name','phone','email','partner_latitude','partner_longitude','street','is_company','parent_id'],
                    'limit'  => 0,
                ]
            ]
        );

        // Normalizar claves para el frontend (latitude/longitude) y exponer display_name
        return array_map(function ($r) {
            $r['latitude'] = $r['partner_latitude'] ?? ($r['latitude'] ?? null);
            $r['longitude'] = $r['partner_longitude'] ?? ($r['longitude'] ?? null);

            // Aseguramos una clave display_name amigable; si no viene, usamos name
            if (!isset($r['display_name']) || !$r['display_name']) {
                $r['display_name'] = $r['name'] ?? null;
            }

            return $r;
        }, $rows);
    }

    public function buscarPorNombre(string $name): ?array
    {
        $rows = $this->call16(
            'object',
            'execute_kw',
            [
                $this->db16,
                $this->uid16,
                $this->apiKey16,
                'res.partner',
                'search_read',
                // Usamos display_name para poder matchear "Padre, Hijo"
                [[['active', '=', true], ['display_name', 'ilike', $name]]],
                [
                    'fields' => ['id','name','display_name','phone','email','partner_latitude','partner_longitude','street','is_company','parent_id'],
                    'limit'  => 10,
                ]
            ]
        );

        if (empty($rows)) return null;

        // Normalizar y preferir el primer contacto que tenga coordenadas válidas
        $normalized = array_map(function ($r) {
            $r['latitude']  = $r['partner_latitude']  ?? ($r['latitude'] ?? null);
            $r['longitude'] = $r['partner_longitude'] ?? ($r['longitude'] ?? null);
            if (!isset($r['display_name']) || !$r['display_name']) {
                $r['display_name'] = $r['name'] ?? null;
            }
            return $r;
        }, $rows);

        foreach ($normalized as $r) {
            if ($r['latitude'] !== null && $r['longitude'] !== null && ($r['latitude'] != 0 || $r['longitude'] != 0)) {
                return $r;
            }
        }

        // Si ninguno tiene coords, devolvemos el primero igualmente
        return $normalized[0];
    }

    /**
     * Devuelve solo contactos que son personas (no empresas)
     * Utiliza el campo `is_company` de res.partner (Odoo estándar)
     */
    public function personas(): array
    {
        $rows = $this->call16(
            'object',
            'execute_kw',
            [
                $this->db16,
                $this->uid16,
                $this->apiKey16,
                'res.partner',
                'search_read',
                [[['active', '=', true], ['is_company', '=', false]]],
                [
                    'fields' => ['id','name','display_name','phone','email','partner_latitude','partner_longitude','street','is_company','parent_id'],
                    'limit'  => 0,
                ]
            ]
        );

        return array_map(function ($r) {
            $r['latitude'] = $r['partner_latitude'] ?? ($r['latitude'] ?? null);
            $r['longitude'] = $r['partner_longitude'] ?? ($r['longitude'] ?? null);
            if (!isset($r['display_name']) || !$r['display_name']) {
                $r['display_name'] = $r['name'] ?? null;
            }
            return $r;
        }, $rows);
    }

    /**
     * Devuelve contactos que son transportistas en Odoo 16.
     * Por ahora se filtra por category_id = 1.
     */
    public function transportistas(): array
    {
        $rows = $this->call16(
            'object',
            'execute_kw',
            [
                $this->db16,
                $this->uid16,
                $this->apiKey16,
                'res.partner',
                'search_read',
                [[['active', '=', true], ['category_id', 'in', [1]]]],
                [
                    'fields' => ['id','name','display_name','phone','email','partner_latitude','partner_longitude','street','is_company','parent_id','category_id'],
                    'limit'  => 0,
                ]
            ]
        );

        return array_map(function ($r) {
            $r['latitude'] = $r['partner_latitude'] ?? ($r['latitude'] ?? null);
            $r['longitude'] = $r['partner_longitude'] ?? ($r['longitude'] ?? null);
            if (!isset($r['display_name']) || !$r['display_name']) {
                $r['display_name'] = $r['name'] ?? null;
            }
            return $r;
        }, $rows);
    }

    /**
     * Busca un contacto por ID en Odoo 16 y normaliza lat/lon/display_name.
     */
    public function porId(int $id): ?array
    {
        $rows = $this->call16(
            'object',
            'execute_kw',
            [
                $this->db16,
                $this->uid16,
                $this->apiKey16,
                'res.partner',
                'search_read',
                [[['id', '=', $id]]],
                [
                    'fields' => ['id','name','display_name','phone','email','partner_latitude','partner_longitude','street','is_company','parent_id'],
                    'limit'  => 1,
                ]
            ]
        );

        if (empty($rows)) return null;

        $r = $rows[0];
        $r['latitude']  = $r['partner_latitude']  ?? ($r['latitude'] ?? null);
        $r['longitude'] = $r['partner_longitude'] ?? ($r['longitude'] ?? null);
        if (!isset($r['display_name']) || !$r['display_name']) {
            $r['display_name'] = $r['name'] ?? null;
        }

        return $r;
    }
}

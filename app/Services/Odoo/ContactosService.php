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
                    'fields' => ['id','name','phone','email','partner_latitude','partner_longitude','street'],
                    'limit'  => 0,
                ]
            ]
        );

        // Normalizar claves para el frontend (latitude/longitude)
        return array_map(function ($r) {
            $r['latitude'] = $r['partner_latitude'] ?? ($r['latitude'] ?? null);
            $r['longitude'] = $r['partner_longitude'] ?? ($r['longitude'] ?? null);
            return $r;
        }, $rows);
    }
}

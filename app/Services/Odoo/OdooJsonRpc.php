<?php

namespace App\Services\Odoo;

use Illuminate\Support\Facades\Http;

class OdooJsonRpc
{
    private string $url;
    private string $db;
    private string $user;
    private string $password;

    private int $uid;

    public function __construct()
    {
        $this->url      = env('ODOO_URL');
        $this->db       = env('ODOO_DB');
        $this->user     = env('ODOO_USER');
        $this->password = env('ODOO_API_KEY');

        if (!$this->url || !$this->db || !$this->user || !$this->password) {
            throw new \Exception("Variables ODOO_* faltan en .env");
        }

        $this->authenticate();
    }

    /** -------------------------
     *  LOGIN JSON-RPC
     *  ------------------------ */
    private function authenticate(): void
    {
        $this->uid = $this->rawCall(
            "common",
            "login",
            [$this->db, $this->user, $this->password]
        );
    }

    /** -------------------------
     *  LLAMADA PRIVADA
     *  ------------------------ */
    private function rawCall(string $service, string $method, array $args = [])
    {
        $response = Http::post("{$this->url}/jsonrpc", [
            "jsonrpc" => "2.0",
            "method"  => "call",
            "params"  => [
                "service" => $service,
                "method"  => $method,
                "args"    => $args,
            ],
            "id" => time(),
        ]);

        $json = $response->json();

        if (isset($json["error"])) {
            throw new \Exception("Odoo JSON-RPC Error: " . $json["error"]["data"]["message"]);
        }

        return $json["result"];
    }

    /** -------------------------
     *  LLAMADA PUBLICA (para los services)
     *  ------------------------ */
    public function call(string $service, string $method, array $args = [])
    {
        return $this->rawCall($service, $method, $args);
    }

    /** -------------------------
     *  GETTERS
     *  ------------------------ */
    public function getDb(): string
    {
        return $this->db;
    }

    public function getUid(): int
    {
        return $this->uid;
    }

    public function getUser(): string
    {
        return $this->user;
    }

    public function getPassword(): string
    {
        return $this->password;
    }

    public function searchRead(string $model, array $domain = [], array $fields = [], int $limit = 100): array
    {
        return $this->call(
            "object",
            "execute_kw",
            [
                $this->db,
                $this->uid,
                $this->password,
                $model,
                "search_read",
                [$domain],
                [
                    "fields" => $fields,
                    "limit"  => $limit
                ]
            ]
        );
    }

    public function create(string $model, array $values)
    {
        return $this->call(
            "object",
            "execute_kw",
            [
                $this->db,
                $this->uid,
                $this->password,
                $model,
                "create",
                [$values]
            ]
        );
    }

    public function write(string $model, int $id, array $values)
    {
        return $this->call(
            "object",
            "execute_kw",
            [
                $this->db,
                $this->uid,
                $this->password,
                $model,
                "write",
                [[ $id ], $values]
            ]
        );
    }

    public function unlink(string $model, int $id)
    {
        return $this->call(
            "object",
            "execute_kw",
            [
                $this->db,
                $this->uid,
                $this->password,
                $model,
                "unlink",
                [[ $id ]]
            ]
        );
    }
}

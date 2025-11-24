<?php

namespace App\Services\Odoo;

use PhpXmlRpc\Client;
use PhpXmlRpc\Request;
use PhpXmlRpc\Value;

class OdooXmlRpc
{
    private string $url;
    private string $db;
    private string $user;
    private string $password;

    private Client $common;
    private Client $models;

    private int $uid;

    public function __construct()
    {
        // Variables desde .env
        $this->url      = env('ODOO_URL');
        $this->db       = env('ODOO_DB');
        $this->user     = env('ODOO_USER');
        $this->password = env('ODOO_API_KEY');

        // Endpoints XML-RPC
        $this->common = new Client("{$this->url}/xmlrpc/2/common");
        $this->models = new Client("{$this->url}/xmlrpc/2/object");

        $this->authenticate();
    }

    private function authenticate(): void
    {
        $msg = new Request(
            'authenticate',
            [
                new Value($this->db),
                new Value($this->user),
                new Value($this->password),
                new Value([], 'struct'),
            ]
        );

        $resp = $this->common->send($msg);

        $this->uid = (int) $resp->value()->scalarval();
    }

    public function searchRead(string $model, array $domain = []): array
    {
        $msg = new Request(
            'execute_kw',
            [
                new Value($this->db),
                new Value($this->uid),
                new Value($this->password),
                new Value($model),
                new Value('search_read'),
                new Value([$domain], 'array'),
            ]
        );

        $resp = $this->models->send($msg);

        if ($resp->faultCode()) {
            throw new \Exception("Odoo XML-RPC Error: " . $resp->faultString());
        }

        return $resp->value()->scalarval();
    }
}

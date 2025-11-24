<?php

namespace App\Http\Controllers\Api\Odoo;

use App\Http\Controllers\Controller;
use App\Services\Odoo\ContactosService;

class ContactosApiController extends Controller
{
    public function __construct(
        private readonly ContactosService $contactos
    ) {}

    public function index()
    {
        return response()->json(
            $this->contactos->todos()
        );
    }
}

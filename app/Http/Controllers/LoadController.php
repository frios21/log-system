<?php

namespace App\Http\Controllers;

use App\Models\Load;
use Illuminate\Http\Request;
use App\Services\Odoo\CargasService;

class LoadController extends Controller
{

    public function __construct(private CargasService $service) {}

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        $state = $request->query('state');

        return response()->json(
            $this->service->getLoadsWithLines($state)
        );
    }

    public function resetAll(OdooJsonRpc $odoo)
    {
        // obtener todas las cargas
        $loads = $odoo->searchRead(
            'logistics.load',
            [],
            ['id']
        );

        foreach ($loads as $load) {
            try {
                $odoo->write('logistics.load', $load['id'], [
                    'state' => 'draft'
                ]);
            } catch (\Throwable $e) {
                // ignorar errores individuales
            }
        }

        return response()->json(['ok' => true]);
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        //
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        //
    }

    /**
     * Display the specified resource.
     */
    public function show(int $id, CargasService $cargas)
    {
        $carga = $cargas->porId($id);
        return response()->json($carga);
    }


    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Load $load)
    {
        //
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, Load $load)
    {
        //
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Load $load)
    {
        //
    }
}

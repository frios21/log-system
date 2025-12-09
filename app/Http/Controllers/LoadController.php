<?php

namespace App\Http\Controllers;

use App\Models\Load;
use Illuminate\Http\Request;
use App\Services\Odoo\CargasService;

class LoadController extends Controller
{

    public function __construct(private readonly CargasService $service) {}

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

    public function resetAll()
    {
        $this->service->resetAllToDraft();

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
        // No usado (integramos con Odoo vía CargasService)
    }

    /**
     * Actualiza sólo el total de pallets de una carga en Odoo.
     */
    public function updatePallets(int $id, Request $request)
    {
        $validated = $request->validate([
            'total_pallets' => ['nullable', 'numeric', 'min:0'],
        ]);

        $value = $validated['total_pallets'] ?? null;

        try {
            $this->service->updateTotalPallets($id, $value);
            return response()->json(['ok' => true]);
        } catch (\Throwable $e) {
            return response()->json([
                'ok' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Load $load)
    {
        //
    }
}

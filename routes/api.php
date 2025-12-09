<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

use App\Http\Controllers\LoadController;
use App\Http\Controllers\RouteController;
use App\Http\Controllers\Api\Odoo\RutasApiController;
use App\Http\Controllers\Api\Odoo\ContactosApiController;
use App\Http\Controllers\VehiclesController;
use App\Http\Controllers\TraccarController;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Estas rutas son consumidas por React (frontend).
| Todas están bajo /api/... y usan el middleware "api".
|
| Ejemplo:
|   GET /api/cargas
|   GET /api/rutas
|
*/

Route::middleware('api')->group(function () {

    // =====================
    // CARGAS
    // =====================
    Route::get('/cargas', [LoadController::class, 'index']);
    Route::get('/cargas/{id}', [LoadController::class, 'show']);
    Route::patch('/cargas/{id}/pallets', [LoadController::class, 'updatePallets'])->whereNumber('id');
    Route::post('/cargas/reset', [LoadController::class, 'resetAll']);

    // =====================
    // TRACCAR API (colocar antes de /rutas/{id} para evitar colisión)
    // =====================
    Route::get('/rutas/activos-traccar', [TraccarController::class, 'activeDraftPositions']);
    Route::get('/traccar/{deviceId}', [TraccarController::class, 'position']);

    // =====================
    // RUTAS
    // =====================
    Route::get('/rutas', [RouteController::class, 'index']);
    Route::get('/rutas/{id}', [RouteController::class, 'show'])->whereNumber('id');
    Route::post('/rutas', [RouteController::class, 'store']);
    Route::post('/rutas/{id}/assign', [RouteController::class, 'assign'])->whereNumber('id');
    Route::post('/rutas/{id}/preview', [RouteController::class, 'preview'])->whereNumber('id');
    Route::post('/rutas/{id}/distance', [RutasApiController::class, 'actualizarDistancia'])->whereNumber('id');
    Route::patch('/rutas/{id}/update-vehicle', [RutasApiController::class, 'updateVehicle'])->whereNumber('id');
    Route::patch('/rutas/{id}/update-driver', [RutasApiController::class, 'updateDriver'])->whereNumber('id');
    // Unificar PATCH para actualizar nombre o estado
    Route::patch('/rutas/{id}', [RutasApiController::class, 'update'])->whereNumber('id');
    Route::delete('/rutas/{id}', [RouteController::class, 'destroy'])->whereNumber('id');

    Route::post('/rutas/desviacion', [RutasApiController::class, 'evaluarDesviacion']);

    // =====================
    // CONTACTOS (res.partner)
    // =====================
    Route::get('/contactos', [ContactosApiController::class, 'index']);
    Route::get('/contactos/personas', [ContactosApiController::class, 'personas']);

    // =====================
    // VEHÍCULOS (fleet.vehicle)
    // =====================
    Route::get('/vehiculos', [VehiclesController::class, 'index']);
    Route::get('/vehiculos/{id}', [VehiclesController::class, 'show']);


    // =====================
    // TEST API
    // =====================
    Route::get('/ping', function () {
        return ['pong' => true, 'laravel' => app()->version()];
    });

});

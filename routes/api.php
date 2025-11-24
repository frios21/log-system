<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

use App\Http\Controllers\LoadController;
use App\Http\Controllers\RouteController;
use App\Http\Controllers\Api\Odoo\RutasApiController;
use App\Http\Controllers\Api\Odoo\ContactosApiController;
use App\Http\Controllers\VehiculosApiController;
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

    // =====================
    // RUTAS
    // =====================
    Route::get('/rutas', [RouteController::class, 'index']);
    Route::get('/rutas/{id}', [RouteController::class, 'show']);
    Route::post('/rutas', [RouteController::class, 'store']);
    Route::post('/rutas/{id}/assign', [RouteController::class, 'assign']);
    Route::post('/rutas/{id}/distance', [RutasApiController::class, 'actualizarDistancia']);
    Route::patch('/rutas/{id}', [RutasApiController::class, 'actualizarNombre']);
    Route::delete('/rutas/{id}', [RouteController::class, 'destroy']);

    Route::post('/rutas/desviacion', [RutasApiController::class, 'evaluarDesviacion']);

    // =====================
    // CONTACTOS (res.partner)
    // =====================
    Route::get('/contactos', [ContactosApiController::class, 'index']);

    // =====================
    // VEHÍCULOS (fleet.vehicle)
    // =====================
    Route::get('/vehiculos', [VehiculosApiController::class, 'index']);

    // =====================
    // TEST API
    // =====================
    Route::get('/ping', function () {
        return ['pong' => true, 'laravel' => app()->version()];
    });

    // =====================
    // TRACCAR API
    // =====================
    Route::get('/traccar/{deviceId}', [TraccarController::class, 'position']);

});

<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Ruta raíz (/)
|--------------------------------------------------------------------------
| Mantiene la página de bienvenida estándar de Laravel.
*/
Route::get('/', function () {
    return view('welcome');
});

/*
|--------------------------------------------------------------------------
| Entrada a la SPA en /cargas
|--------------------------------------------------------------------------
| Carga tu vista 'app' que incluye la SPA React/Vite.
*/
Route::get('/cargas', function () {
    return view('app');
});

/*
|--------------------------------------------------------------------------
| Catch-all de la SPA
|--------------------------------------------------------------------------
| Todas las rutas internas de React (como /cargas/mapa, /cargas/vehiculos)
| deben volver a cargar la misma vista 'app'.
|
| Restricción:
| - NO intercepta /api o rutas de backend
| - NO intercepta /build ni /storage ni assets
*/
Route::get('/cargas/{any}', function () {
    return view('app');
})->where('any', '.*');

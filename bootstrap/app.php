<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Console\Scheduling\Schedule;
use App\Http\Middleware\OdooGateway;
use App\Services\Odoo\ComprasService;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'odoo' => OdooGateway::class,
        ]);
    })
    ->withSchedule(function (Schedule $schedule): void {
        // cada 3 minutos: sincronizar rutas "done" con sus lineas en Odoo 16.
        $schedule->call(function () {
            app(ComprasService::class)->syncLinesOcPendientes();
        })->everyThreeMinutes()->name('sync-lines-oc');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();

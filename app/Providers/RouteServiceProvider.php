<?php

namespace App\Providers;

use Illuminate\Support\Facades\Route;
use Illuminate\Foundation\Support\Providers\RouteServiceProvider as ServiceProvider;

class RouteServiceProvider extends ServiceProvider
{
    /**
     * Define your route model bindings, pattern filters, and other configuration.
     */
    public function boot(): void
    {
        $this->routes(function () {

            // Rutas API (http://localhost:8000/api/...)
            Route::middleware('api')
                ->prefix('api')
                ->group(base_path('routes/api.php'));

            // Rutas Web (http://localhost:8000/...)
            Route::middleware('web')
                ->group(base_path('routes/web.php'));
        });
    }
}

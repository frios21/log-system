<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

// SPA catch-all, excluye prefijos reservados como /api, /build, /storage, etc.
Route::get('/{any}', function () {
    return view('app');
})->where('any', '^(?!api).*$');


<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Http;

class TraccarController extends Controller
{
    public function position($deviceId)
    {
        $url = env('TRACCAR_URL') . "/positions";

        try {
            $response = Http::withBasicAuth(
                env('TRACCAR_USER'),
                env('TRACCAR_PASS')
            )->timeout(10)->get($url);

            if ($response->failed()) {
                return response()->json([
                    'error' => 'Traccar unreachable',
                    'url' => $url,
                    'status' => $response->status(),
                    'body' => $response->body(),
                ], 500);
            }

            $positions = collect($response->json());
            $pos = $positions->firstWhere('deviceId', (int)$deviceId);

            return $pos
                ? response()->json($pos)
                : response()->json(['error' => 'Device not found'], 404);

        } catch (\Exception $e) {
            return response()->json([
                'error' => 'Exception',
                'msg' => $e->getMessage(),
                'url' => $url,
            ], 500);
        }
    }
}
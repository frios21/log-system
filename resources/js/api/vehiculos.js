import { useQuery } from "@tanstack/react-query";
import { apiClient } from "./client";

// Todos los vehículos (VehiclesService->todos)
export function useVehiculos(query, options = {}) {
    return useQuery({
        queryKey: ["vehiculos", { q: query || "" }],
        queryFn: async () => {
            const params = {};
            if (query) params.q = query;
            const { data } = await apiClient.get("/vehiculos", { params });
            return data;
        },
        staleTime: 5 * 60 * 1000,
        ...options,
    });
}

// Vehículo por ID (VehiclesService->porId)
export function useVehiculo(id, options = {}) {
    return useQuery({
        queryKey: ["vehiculo", id],
        queryFn: async () => {
            const { data } = await apiClient.get(`/vehiculos/${id}`);
            return data;
        },
        enabled: !!id,
        staleTime: 5 * 60 * 1000,
        ...options,
    });
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

// Todas las rutas
export function useRutas(options = {}) {
    return useQuery({
        queryKey: ["rutas"],
        queryFn: async () => {
            const { data } = await apiClient.get("/rutas");
            return data;
        },
        staleTime: 60 * 1000,
        ...options,
    });
}

// Ruta por ID
export function useRuta(id, options = {}) {
    return useQuery({
        queryKey: ["ruta", id],
        queryFn: async () => {
            const { data } = await apiClient.get(`/rutas/${id}`);
            return data;
        },
        enabled: !!id,
        staleTime: 60 * 1000,
        ...options,
    });
}

// Asignar cargas a una ruta
export function useAsignarCargasRuta() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, body }) => {
            const { data } = await apiClient.post(`/rutas/${id}/cargas`, body);
            return data;
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ["rutas"] });
            if (variables?.id) {
                queryClient.invalidateQueries({ queryKey: ["ruta", variables.id] });
            }
        },
    });
}

// Actualizar distancia de una ruta
export function useActualizarDistanciaRuta() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, total_distance_km }) => {
            const { data } = await apiClient.post(`/rutas/${id}/distancia`, {
                total_distance_km,
            });
            return data;
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ["rutas"] });
            if (variables?.id) {
                queryClient.invalidateQueries({ queryKey: ["ruta", variables.id] });
            }
        },
    });
}

// Actualizar nombre de ruta
export function useActualizarNombreRuta() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, name }) => {
            const { data } = await apiClient.patch(`/rutas/${id}/nombre`, { name });
            return data;
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ["rutas"] });
            if (variables?.id) {
                queryClient.invalidateQueries({ queryKey: ["ruta", variables.id] });
            }
        },
    });
}

// Actualizar vehículo asignado a la ruta
export function useAsignarVehiculoRuta() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, vehicle_id }) => {
            const { data } = await apiClient.post(`/rutas/${id}/vehiculo`, {
                vehicle_id,
            });
            return data;
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ["rutas"] });
            if (variables?.id) {
                queryClient.invalidateQueries({ queryKey: ["ruta", variables.id] });
            }
        },
    });
}

// Actualizar conductor asignado a la ruta
export function useAsignarConductorRuta() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, driver_id }) => {
            const { data } = await apiClient.post(`/rutas/${id}/conductor`, {
                driver_id,
            });
            return data;
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ["rutas"] });
            if (variables?.id) {
                queryClient.invalidateQueries({ queryKey: ["ruta", variables.id] });
            }
        },
    });
}

// Actualizar estado de una ruta
export function useActualizarEstadoRuta() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, status }) => {
            const { data } = await apiClient.post(`/rutas/${id}/estado`, { status });
            return data;
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ["rutas"] });
            if (variables?.id) {
                queryClient.invalidateQueries({ queryKey: ["ruta", variables.id] });
            }
        },
    });
}

// Actualizar cantidad total (total_qnt) de una ruta
export function useUpdateRutaTotalQnt() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, total_qnt }) => {
            const { data } = await apiClient.patch(`/rutas/${id}/total-qnt`, { total_qnt });
            return data;
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ["rutas"] });
            if (variables?.id) {
                queryClient.invalidateQueries({ queryKey: ["ruta", variables.id] });
            }
        },
    });
}

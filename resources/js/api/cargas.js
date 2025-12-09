import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

export function useCargas(options = {}) {
    return useQuery({
        queryKey: ["cargas"],
        queryFn: async () => {
            const { data } = await apiClient.get("/cargas");
            return data;
        },
        staleTime: 60 * 1000,
        ...options,
    });
}

export function useCarga(id, options = {}) {
    return useQuery({
        queryKey: ["carga", id],
        queryFn: async () => {
            const { data } = await apiClient.get(`/cargas/${id}`);
            return data;
        },
        enabled: !!id,
        staleTime: 60 * 1000,
        ...options,
    });
}

export function useUpdateCargaPallets() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, total_pallets }) => {
            const { data } = await apiClient.patch(`/cargas/${id}/pallets`, {
                total_pallets,
            });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["cargas"] });
        },
    });
}

export function useUpdateCargaLinePallets() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ lineId, n_pallets }) => {
            const { data } = await apiClient.patch(`/cargas/lineas/${lineId}/pallets`, {
                n_pallets,
            });
            return data;
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ["cargas"] });
            if (variables?.cargaId) {
                queryClient.invalidateQueries({ queryKey: ["carga", variables.cargaId] });
            }
        },
    });
}

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "./client";

// Todos los contactos (ContactosService->todos)
export function useContactos(options = {}) {
    return useQuery({
        queryKey: ["contactos"],
        queryFn: async () => {
            const { data } = await apiClient.get("/contactos");
            return data;
        },
        staleTime: 5 * 60 * 1000,
        ...options,
    });
}

// Solo personas (ContactosService->personas)
export function useContactosPersonas(options = {}) {
    return useQuery({
        queryKey: ["contactos", "personas"],
        queryFn: async () => {
            const { data } = await apiClient.get("/contactos/personas");
            return data;
        },
        staleTime: 5 * 60 * 1000,
        ...options,
    });
}

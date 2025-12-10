import { useEffect, useState } from "react";
import { useContactos } from "../../api/contactos";
import CircleLoader from "../common/CircleLoader";

// Componente que lista los contactos 
// y permite verlos en el mapa

export default function ContactsList() {
    const { data: contactosData = [], isLoading, isFetching } = useContactos();
    const [search, setSearch] = useState("");

    const contactos = Array.isArray(contactosData) ? contactosData : [];

    useEffect(() => {
        // cuando cambian contactos, actualizamos marcadores del mapa
        window.dispatchEvent(new Event("contacts-markers-clear"));
        window.dispatchEvent(new CustomEvent("contacts-markers-show", { detail: contactos }));

        return () => {
            window.dispatchEvent(new Event("contacts-markers-clear"));
        };
    }, [contactos]);

    function focus(id) {
        window.dispatchEvent(new CustomEvent('focus-client', { detail: id }));
    }

    // ---- FILTRO ----
    const filtered = contactos.filter(c => {
        if (!search.trim()) return true;
        const s = search.toLowerCase();
        return (
            (c.name && c.name.toLowerCase().includes(s)) ||
            (c.street && c.street.toLowerCase().includes(s)) ||
            (c.city && c.city.toLowerCase().includes(s)) ||
            (c.id && String(c.id).includes(s))
        );
    });

    return (
        <div>

            {/* Campo de búsqueda */}
            <input
                type="text"
                placeholder="Buscar contacto..."
                className="form-control"
                style={{ marginBottom: 10 }}
                value={search}
                onChange={e => setSearch(e.target.value)}
            />

            {isLoading || isFetching ? (
                <CircleLoader size={32} />
            ) : filtered.length === 0 ? (
                <div className="empty">Sin resultados</div>
            ) : null}

            {filtered.map(c => (
                <div key={c.id} className="card" style={{ padding: 10, marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div className="card-title">{c.name}</div>

                        {(c.latitude && c.longitude) && (
                            <button
                                className="btn btn-primary"
                                onClick={() => {
                                    window.dispatchEvent(
                                        new CustomEvent("focus-contact", { detail: c })
                                    );
                                }}
                            >
                                Ver
                            </button>
                        )}
                    </div>

                    {(c.street || c.city) && (
                        <div className="text-small" style={{ marginTop: 6 }}>
                            {c.street} {c.city}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

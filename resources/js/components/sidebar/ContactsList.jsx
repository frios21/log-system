import { useEffect, useState } from "react";

// Componente que lista los contactos 
// y permite verlos en el mapa

export default function ContactsList() {
    const [contactos, setContactos] = useState([]);
    const [search, setSearch] = useState("");

    useEffect(() => {
        let cancelled = false;
        fetch('/api/contactos')
            .then(r => r.json())
            .then(data => {
                if (cancelled) return;
                setContactos(data);

                // pedir al mapa que dibuje marcadores
                window.dispatchEvent(new Event("contacts-markers-clear"));
                window.dispatchEvent(new CustomEvent("contacts-markers-show", { detail: data }));
            })
            .catch(console.error);

        return () => {
            cancelled = true;
            // limpiar marcadores al salir de la pestaña
            window.dispatchEvent(new Event('contacts-markers-clear'));
        };
    }, []);

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

            {filtered.length === 0 && <div className="empty">Sin resultados</div>}

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

import { useEffect, useState } from "react";

export default function ContactsList() {
    const [contactos, setContactos] = useState([]);

    useEffect(() => {
        let cancelled = false;
        fetch('/api/contactos')
            .then(r => r.json())
            .then(data => {
                if (cancelled) return;
                setContactos(data);
                // pedir al mapa que dibuje marcadores
                window.dispatchEvent(new CustomEvent('contacts-markers-show', { detail: data }));
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

    return (
        <div>
            {contactos.length === 0 && <div className="empty">Cargando contactos...</div>}
            {contactos.map(c => (
                <div key={c.id} className="card" style={{ padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div className="card-title">{c.name}</div>
                        {(c.latitude && c.longitude) && (
                            <button
                                className="btn btn-primary"
                                onClick={() => {
                                    window.dispatchEvent(
                                    new CustomEvent("focus-contact", {
                                        detail: c
                                    })
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

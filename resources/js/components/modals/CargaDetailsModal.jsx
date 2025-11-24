export default function CargaDetailsModal({ carga, onClose }) {
    const items = carga.lines || [];

    const totalPallets = items.reduce((acc, i) => acc + i.n_pallets, 0);
    const subtotal = items.reduce((acc, i) => acc + i.price_subtotal, 0);
    const iva = subtotal * 0.19;
    const total = carga.total_cost;

    return (
        <div className="modal-backdrop">
            <div className="modal">

                <h2 style={{ marginTop: 0 }}>Detalles de la compra</h2>

                <table style={{ width: "100%", marginBottom: "20px" }}>
                    <thead>
                        <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                            <th style={{ textAlign: "left" }}>Producto</th>
                            <th>Cant</th>
                            <th>Pallets</th>
                            <th>Subtotal</th>
                        </tr>
                    </thead>

                    <tbody>
                        {items.map(item => (
                            <tr key={item.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                                <td><strong>{item.product_name}</strong></td>
                                <td>{item.quantity} kg</td>
                                <td>{item.n_pallets}</td>
                                <td>${item.price_subtotal.toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div>
                    <strong>Total pallets:</strong> {totalPallets} <br />
                    <strong>Subtotal:</strong> ${subtotal.toLocaleString()} <br />
                    <strong>IVA (19%):</strong> ${iva.toLocaleString()} <br /><br />
                    <strong style={{ fontSize: "18px" }}>
                        Total compra: ${total.toLocaleString()}
                    </strong>
                </div>

                <div style={{ textAlign: "right", marginTop: "20px" }}>
                    <button className="btn btn-outlined" onClick={onClose}>
                        Cerrar
                    </button>
                </div>

            </div>
        </div>
    );
}

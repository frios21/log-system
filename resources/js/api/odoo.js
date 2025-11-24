export async function getCargas() {
    const res = await fetch("/api/cargas");
    return res.json();
}

export async function getRutas() {
    const res = await fetch("/api/rutas");
    return res.json();
}

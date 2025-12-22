import xmlrpc.client
import argparse
import time
import sys

"""
Script de sincronización de líneas de O.C. (purchase.order.line)
para rutas en Odoo 19.

Hace lo mismo que la función syncLinesOcPendientes de Laravel:

1. Busca rutas en Odoo19 con status = 'done' y lines_oc = False.
2. Para cada ruta:
   - Usa carrier_id como partner en Odoo16.
   - Busca purchase.order en Odoo16 donde:
       partner_id == carrier_id
       notes ILIKE nombre de la ruta (RTXXXXX)
   - Si encuentra 1 orden:
       * Si ya tiene línea de flete (product_template_id=873), marca lines_oc=True en la ruta.
       * Si no la tiene, crea la línea con la distancia (total_distance_km) y marca lines_oc=True.

Puedes ejecutar este script a mano o dejarlo en un cron aparte.
"""

# ========= CONFIG ODOO 19 (para rutas) =========
ODOO_URL = "https://rio-futuro-procesos-2-24380554.dev.odoo.com"
ODOO_DB = "rio-futuro-procesos-2-24380554"
ODOO_USER = "frios@riofuturo.cl"
ODOO_API_KEY = "ffa8bee3bd631e477a83506755f4704130d95748"

# ========= CONFIG ODOO 16 (para compras) ========
ODOO16_URL = "https://riofuturo.server98c6e.oerpondemand.net"
ODOO16_DB = "riofuturo-master"
ODOO16_USER = "frios@riofuturo.cl"
ODOO16_API_KEY = "243b395a51f60b6bf320191614fc2db842b93402"

# Producto de servicio de flete en Odoo16
FLETE_PRODUCT_ID_CONFIG = 873  # id configurado (product.product)
FLETE_PRICE_UNIT = 1000


def resolve_flete_product(models16, uid16, api_key, db, configured_id=None):
    """
    Intenta resolver un product.product válido para el servicio de flete.
    Orden de intentos:
      1) Si `configured_id` está presente, intenta leerlo directamente.
      2) Buscar product.product con nombre que contenga 'flete' o 'servicio'.
      3) Buscar product.template con 'flete' y luego variante product.product.
    Devuelve product_id (int) o None si no encuentra nada.
    """
    try:
        # 0) Buscar exacto por nombre 'SERVICIO DE FLETE' (tal cual)
        try:
            exact = models16.execute_kw(
                db, uid16, api_key,
                'product.product', 'search_read',
                [[['name', '=', 'SERVICIO DE FLETE']]],
                {'fields': ['id', 'name'], 'limit': 1}
            )
            if exact:
                return int(exact[0]['id'])
        except Exception:
            # no detener si esta consulta falla; seguir con el resto
            pass

        if configured_id:
            try:
                rows = models16.execute_kw(
                    db, uid16, api_key,
                    'product.product', 'search_read',
                    [[[['id', '=', int(configured_id)]]]],
                    {'fields': ['id', 'name'], 'limit': 1}
                )
                if rows:
                    return int(rows[0]['id'])
            except Exception:
                # ignorar y pasar al siguiente método de búsqueda
                pass

        # 2) Buscar product.product por nombre
        candidates = models16.execute_kw(
            db, uid16, api_key,
            'product.product', 'search_read',
            [[['name', 'ilike', 'SERVICIO DE FLETE']]],
            {'fields': ['id', 'name'], 'limit': 5}
        )
        if candidates:
            # preferir nombre que contenga 'servicio' o exacto 'SERVICIO DE FLETE'
            for c in candidates:
                name = (c.get('name') or '').lower()
                if 'servicio' in name or 'flete' in name:
                    return int(c['id'])
            return int(candidates[0]['id'])

        # 3) Buscar product.template que contenga 'flete'
        tmpl = models16.execute_kw(
            db, uid16, api_key,
            'product.template', 'search_read',
            [[['name', 'ilike', 'flete']]],
            {'fields': ['id', 'name'], 'limit': 1}
        )
        if tmpl:
            tmpl_id = int(tmpl[0]['id'])
            variants = models16.execute_kw(
                db, uid16, api_key,
                'product.product', 'search_read',
                [[['product_tmpl_id', '=', tmpl_id]]],
                {'fields': ['id', 'name'], 'limit': 1}
            )
            if variants:
                return int(variants[0]['id'])

    except Exception as e:
        print(f"⚠️ Error buscando producto de flete: {e}")

    return None


def connect_odoo(url, db, user, api_key):
    """Devuelve (uid, models_proxy) para un servidor Odoo (XML-RPC)."""
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common")
    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object")

    uid = common.authenticate(db, user, api_key, {})
    if not uid:
        raise Exception(f"❌ Error de autenticación en {url} para {user}")

    return uid, models


def process_once(models19, uid19, models16, uid16):
    # 1) Buscar rutas en Odoo19 con status 'done' y lines_oc = False
    routes = models19.execute_kw(
        ODOO_DB, uid19, ODOO_API_KEY,
        'logistics.route', 'search_read',
        [[
            ['status', '=', 'done'],
            ['lines_oc', '=', False],
        ]],
        {
            'fields': ['id', 'name', 'carrier_id', 'total_distance_km', 'lines_oc'],
        }
    )

    print(f"\n🔎 Rutas pendientes (done & lines_oc=False): {len(routes)}")

    for route in routes:
        route_id = route.get('id')
        route_name = route.get('name') or ''

        # carrier_id puede venir como [id, name] o como entero
        carrier_field = route.get('carrier_id')
        carrier_id = None
        if isinstance(carrier_field, list) and carrier_field:
            carrier_id = carrier_field[0]
        elif isinstance(carrier_field, int):
            carrier_id = carrier_field

        dist_km = route.get('total_distance_km') or 0
        try:
            dist_km = float(dist_km)
        except (TypeError, ValueError):
            dist_km = 0.0
        qty_km = round(dist_km, 2)

        print("\n----------------------------------------")
        print(f"Ruta: {route_name} (ID {route_id}), carrier_id={carrier_id}, km={qty_km}")

        if not route_id or not carrier_id or not route_name:
            print("⚠️  Ruta omitida (falta id, carrier o nombre)")
            continue

        try:
            # 2) Buscar orden de compra en Odoo16 por partner y notes ILIKE nombre de ruta
            orders = models16.execute_kw(
                ODOO16_DB, uid16, ODOO16_API_KEY,
                'purchase.order', 'search_read',
                [[
                    ['partner_id', '=', carrier_id],
                    ['notes', 'ilike', route_name],
                ]],
                {
                    'fields': ['id', 'name', 'notes'],
                    'limit': 2,
                }
            )

            if not orders:
                print("❌ No se encontró ninguna orden de compra en Odoo16 para esta ruta")
                continue

            if len(orders) > 1:
                print("⚠️ Se encontraron múltiples órdenes para este partner y notes; se omite para evitar ambigüedad")
                continue

            order_id = orders[0]['id']
            print(f"✅ Orden de compra encontrada en Odoo16: ID {order_id} ({orders[0]['name']})")
            # Resolver product.product para flete (valida configurado y busca alternativas)
            product_id = resolve_flete_product(models16, uid16, ODOO16_API_KEY, ODOO16_DB, FLETE_PRODUCT_ID_CONFIG)
            if not product_id:
                print("❌ No se pudo resolver un producto de flete válido en Odoo16; omitiendo ruta")
                continue

            # 3) Verificar si ya existe una línea de flete para esta orden (por product_id)
            lines = models16.execute_kw(
                ODOO16_DB, uid16, ODOO16_API_KEY,
                'purchase.order.line', 'search_read',
                [[
                    ['order_id', '=', order_id],
                    ['product_id', '=', product_id],
                ]],
                {
                    'fields': ['id', 'product_id'],
                    'limit': 1,
                }
            )

            if lines:
                line_id = lines[0]['id']
                print(f"ℹ️  La orden ya tiene línea de flete (line_id={line_id}), marcando lines_oc=True en la ruta")
                # Marcar la ruta en Odoo19
                models19.execute_kw(
                    ODOO_DB, uid19, ODOO_API_KEY,
                    'logistics.route', 'write',
                    [[route_id], {'lines_oc': True}]
                )
                continue

            # 4) Crear la línea de flete en Odoo16 usando product_id
            line_id = models16.execute_kw(
                ODOO16_DB, uid16, ODOO16_API_KEY,
                'purchase.order.line', 'create',
                [[{
                    # Descripción de la línea (campo obligatorio "name")
                    'name':        'SERVICIO DE FLETE',
                    'order_id':    order_id,
                    'product_id':  product_id,
                    'product_qty': qty_km,
                    'x_studio_kg_promedio_por_bandeja': 1.0,
                    'price_unit':  FLETE_PRICE_UNIT,
                }]]
            )

            print(f"✅ Línea de flete creada en Odoo16 (line_id={line_id}), marcando lines_oc=True en la ruta")

            # 5) Marcar la ruta como ya asociada a línea de O.C.
            models19.execute_kw(
                ODOO_DB, uid19, ODOO_API_KEY,
                'logistics.route', 'write',
                [[route_id], {'lines_oc': True}]
            )

        except Exception as e:
            print(f"❌ Error procesando ruta {route_name} (ID {route_id}): {e}")


def main():
    parser = argparse.ArgumentParser(description='Sync purchase.order.lines for completed routes')
    parser.add_argument('--once', action='store_true', help='Run one iteration and exit')
    parser.add_argument('--interval', type=int, default=180, help='Polling interval in seconds when running continuously')
    args = parser.parse_args()

    # Conectar a Odoo 19 (rutas)
    uid19, models19 = connect_odoo(ODOO_URL, ODOO_DB, ODOO_USER, ODOO_API_KEY)
    print(f"✅ Conectado a Odoo19 como {ODOO_USER} (UID={uid19})")

    # Conectar a Odoo 16 (compras)
    uid16, models16 = connect_odoo(ODOO16_URL, ODOO16_DB, ODOO16_USER, ODOO16_API_KEY)
    print(f"✅ Conectado a Odoo16 como {ODOO16_USER} (UID={uid16})")

    # Mostrar el ID del producto de flete resuelto (busca 'SERVICIO DE FLETE' tal cual)
    try:
        resolved = resolve_flete_product(models16, uid16, ODOO16_API_KEY, ODOO16_DB, FLETE_PRODUCT_ID_CONFIG)
        if resolved:
            print(f"🔎 Producto de flete resuelto: ID {resolved}")
        else:
            print("🔎 No se resolvió ningún producto de flete (BUSCAR 'SERVICIO DE FLETE')")
    except Exception as e:
        print(f"⚠️ Error resolviendo producto de flete: {e}")

    if args.once:
        process_once(models19, uid19, models16, uid16)
        return

    print(f"Running continuous mode: interval={args.interval}s. Press Ctrl+C to stop.")
    try:
        while True:
            process_once(models19, uid19, models16, uid16)
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print('\nInterrupted by user, exiting')
        sys.exit(0)


if __name__ == "__main__":
    main()


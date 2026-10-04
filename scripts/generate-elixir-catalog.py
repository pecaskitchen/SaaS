import json
import re
import unicodedata
from pathlib import Path

import openpyxl

SOURCE = Path(r"C:\Users\LENOVO\Downloads\Catalogo_Charly_caracteristicas.xlsx")
OUTPUT = Path(__file__).resolve().parents[1] / "seed" / "elixir-parfum.json"
SQL_OUTPUT = Path(__file__).resolve().parents[1] / "seed" / "elixir-parfum.sql"
TENANT_ID = "biz_elixir_parfum_mty"


def slug(value):
    normalized = unicodedata.normalize("NFD", str(value).lower())
    ascii_value = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", ascii_value))


def split_values(value):
    return [part.strip() for part in str(value or "").split(";") if part.strip()]


workbook = openpyxl.load_workbook(SOURCE, data_only=True, read_only=True)
sheet = workbook["Catalogo"]
rows = list(sheet.iter_rows(min_row=6, values_only=True))
products = []
featured_by_category = {"Dama": 0, "Caballero": 0, "Unisex": 0}

for row in rows:
    if not row or not row[0] or not row[1]:
        continue
    source_id, name, section, designer, reference, gender, accords, notes, occasions, status, observations, page, _, source_url = (list(row) + [None] * 14)[:14]
    display_gender = "Unisex" if "unisex" in str(gender or "").lower() else str(section or gender or "Unisex").strip()
    category = slug(display_gender)
    featured = featured_by_category.get(display_gender, 0) < (3 if display_gender in ("Dama", "Caballero") else 0)
    if featured:
        featured_by_category[display_gender] += 1
    products.append({
        "id": f"fragancia-{int(source_id):03d}-{slug(name)}",
        "name": str(name).strip().title(),
        "category": category,
        "type": "perfume",
        "price": 70,
        "badge": "Favorito" if featured else "",
        "description": f"Inspirado en {reference or name}.",
        "ingredients": ", ".join(split_values(notes)),
        "image": "/elixir/bottle.png",
        "unavailable": False,
        "customProduct": True,
        "metadata": {
            "sourceId": int(source_id),
            "designer": str(designer or "").strip(),
            "inspiredBy": str(reference or name).strip(),
            "gender": display_gender,
            "accords": split_values(accords),
            "notes": split_values(notes),
            "occasions": split_values(occasions),
            "identificationStatus": str(status or "").strip(),
            "observations": str(observations or "").strip(),
            "sourcePage": page,
            "sourceUrl": str(source_url or "").strip(),
            "featured": featured,
            "variants": [
                {"id": "30-ml", "label": "30 ml", "price": 70},
                {"id": "60-ml", "label": "60 ml", "price": 120},
            ],
            "addOns": [{"id": "feromonas", "label": "Feromonas", "price": 10}],
        },
    })

categories = [
    {"id": "dama", "label": "Dama", "emoji": "", "description": "Florales, frutales y envolventes.", "customCategory": True},
    {"id": "caballero", "label": "Caballero", "emoji": "", "description": "Frescos, intensos y sofisticados.", "customCategory": True},
    {"id": "unisex", "label": "Unisex", "emoji": "", "description": "Aromas sin etiquetas, para todos.", "customCategory": True},
]

payload = {
    "tenant": {
        "slug": "elixir-parfum-mty",
        "name": "Elixir Parfúm",
        "domain": "elixirparfummty.omdexa.com",
        "brand": {
            "themePreset": "boutique",
            "displayName": "Elixir Parfúm",
            "pageTitle": "Elixir Parfúm MTY · Perfumes para cada estilo",
            "metaDescription": "Encuentra perfumes para cada estilo y ocasión. Presentaciones de 30 y 60 ml en Monterrey.",
            "logoUrl": "/elixir/logo.png",
            "heroImageUrl": "/elixir/bottle.png",
            "heroEyebrow": "Elixir Parfúm · Monterrey",
            "heroTitle": "Tu próximo aroma favorito está aquí.",
            "heroText": "Perfumes para cada estilo y ocasión.",
            "primaryActionLabel": "Ver catálogo",
            "secondaryActionLabel": "Encuentra mi perfume",
            "orderMessageIntro": "Hola Elixir Parfúm, quiero hacer un pedido:",
            "primaryColor": "#161513",
            "accentColor": "#bd8b2f",
        },
        "settings": {
            "businessType": "retail",
            "storefrontTemplate": "perfume",
            "whatsappNumber": "",
            "instagramUrl": "",
            "supportEmail": "",
            "paymentMethods": ["Mercado Pago", "WhatsApp"],
            "fulfillmentTypes": ["Recoger", "Entrega a domicilio"],
            "promotions": {
                "eyebrow": "Precios especiales",
                "title": "Más perfumes, mejor precio.",
                "presentations": [
                    {
                        "label": "Perfumes 30 ml",
                        "regularPrice": 70,
                        "offers": [
                            {"label": "Promoción", "value": "2 × $120"},
                            {"label": "A partir de 10 piezas", "value": "$55 c/u"},
                            {"label": "A partir de 20 piezas", "value": "$50 c/u"},
                        ],
                    },
                    {
                        "label": "Perfumes 60 ml",
                        "regularPrice": 120,
                        "offers": [
                            {"label": "A partir de 10 piezas", "value": "$110 c/u"},
                            {"label": "A partir de 20 piezas", "value": "$100 c/u"},
                        ],
                    },
                ],
                "addOn": {"label": "Agrega feromonas", "value": "+ $10", "detail": "por perfume"},
            },
            "faq": [
                {"question": "¿Qué tamaños manejan?", "answer": "Todas las fragancias están disponibles en presentaciones de 30 ml y 60 ml."},
                {"question": "¿Qué formas de pago aceptan?", "answer": "Puedes pagar en línea de forma segura con Mercado Pago o acordar tu pedido por WhatsApp."},
                {"question": "¿Realizan entregas y envíos?", "answer": "Contáctanos por WhatsApp para confirmar cobertura, costo y tiempo de entrega según tu ubicación."},
                {"question": "¿Puedo agregar feromonas?", "answer": "Sí. Puedes agregarlas a cualquier perfume por $10 adicionales."},
            ],
        },
    },
    "catalog": {
        "extraCategories": categories,
        "extraProducts": products,
        "categoryOrder": [item["id"] for item in categories],
        "productOrder": [item["id"] for item in products],
        "categoryHidden": {},
    },
}

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def sql(value):
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"


now = "2026-10-04T03:00:00.000Z"
tenant = payload["tenant"]
brand_json = json.dumps(tenant["brand"], ensure_ascii=False, separators=(",", ":"))
settings_json = json.dumps(tenant["settings"], ensure_ascii=False, separators=(",", ":"))
statements = [
    f"INSERT INTO saas_tenants (id,slug,name,status,plan,domain,subdomain,brand_json,settings_json,notes,created_at_utc,updated_at_utc) VALUES ({sql(TENANT_ID)},{sql(tenant['slug'])},{sql(tenant['name'])},'active','starter',{sql(tenant['domain'])},{sql('elixirparfummty')},{sql(brand_json)},{sql(settings_json)},{sql('Catálogo importado desde Catalogo_Charly_caracteristicas.xlsx')},{sql(now)},{sql(now)}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,status=excluded.status,domain=excluded.domain,subdomain=excluded.subdomain,brand_json=excluded.brand_json,settings_json=excluded.settings_json,notes=excluded.notes,updated_at_utc=excluded.updated_at_utc;",
    f"INSERT INTO saas_tenant_domains (id,tenant_id,hostname,kind,status,ssl_status,created_at_utc,updated_at_utc) VALUES ('dom_elixirparfummty_omdexa_com',{sql(TENANT_ID)},{sql(tenant['domain'])},'subdomain','active','active',{sql(now)},{sql(now)}) ON CONFLICT(hostname) DO UPDATE SET tenant_id=excluded.tenant_id,status='active',updated_at_utc=excluded.updated_at_utc;",
]
for index, category in enumerate(categories):
    statements.append(
        "INSERT INTO menu_categories (tenant_id,category_key,label,emoji,description,sort_order,is_visible,is_active,created_at_utc,updated_at_utc) "
        f"VALUES ({sql(TENANT_ID)},{sql(category['id'])},{sql(category['label'])},'',{sql(category['description'])},{index},1,1,{sql(now)},{sql(now)}) "
        "ON CONFLICT(tenant_id,category_key) DO UPDATE SET label=excluded.label,description=excluded.description,sort_order=excluded.sort_order,is_visible=1,is_active=1,updated_at_utc=excluded.updated_at_utc;"
    )
for index, product in enumerate(products):
    meta_json = json.dumps(product["metadata"], ensure_ascii=False, separators=(",", ":"))
    statements.append(
        "INSERT INTO menu_products (tenant_id,product_key,category_key,name,product_type,price,badge,description,ingredients,image,is_published,is_active,metadata_json,sort_order,created_at_utc,updated_at_utc) "
        f"VALUES ({sql(TENANT_ID)},{sql(product['id'])},{sql(product['category'])},{sql(product['name'])},{sql(product['type'])},{product['price']},{sql(product['badge'])},{sql(product['description'])},{sql(product['ingredients'])},{sql(product['image'])},1,1,{sql(meta_json)},{index},{sql(now)},{sql(now)}) "
        "ON CONFLICT(tenant_id,product_key) DO UPDATE SET category_key=excluded.category_key,name=excluded.name,product_type=excluded.product_type,price=excluded.price,badge=excluded.badge,description=excluded.description,ingredients=excluded.ingredients,image=excluded.image,is_published=1,is_active=1,metadata_json=excluded.metadata_json,sort_order=excluded.sort_order,updated_at_utc=excluded.updated_at_utc;"
    )
statements.append(f"UPDATE menu_products SET is_active=0 WHERE tenant_id={sql(TENANT_ID)} AND product_key NOT IN ({','.join(sql(product['id']) for product in products)});")
SQL_OUTPUT.write_text("\n".join(statements) + "\n", encoding="utf-8")
print(f"Generados {OUTPUT} y {SQL_OUTPUT} con {len(products)} perfumes.")

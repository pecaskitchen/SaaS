-- Limpia datos de demostración de Lilians y aísla el tenant de pruebas.
UPDATE saas_tenants
SET name = 'Florería Lilians',
    settings_json = json_set(
      COALESCE(settings_json, '{}'),
      '$.businessType', 'floral',
      '$.modules', json('{"inicio":true,"pedidos":true,"caja":true,"cobranza":false,"clientes":true,"menu":true,"inventario":true,"recetas":false,"reportes":true,"historial":true,"negocio":true,"integraciones":true,"usuarios":true}')
    ),
    brand_json = json('{"logoUrl":"","primaryColor":"#7c3aed","accentColor":"#ec4899","displayName":"Florería Lilians","tagline":"Flores para cada ocasión","heroEyebrow":"Florería","heroTitle":"Flores para cada ocasión","heroText":"Arreglos florales para momentos especiales.","primaryActionLabel":"Ver catálogo","secondaryActionLabel":"Ver carrito","orderMessageIntro":"Hola Florería Lilians, quiero hacer un pedido:","menuEyebrow":"Catálogo","menuTitle":"Elige un arreglo","emptyCatalogTitle":"Catálogo en preparación","emptyCatalogText":"Estamos preparando nuestros arreglos. Contáctanos por WhatsApp para hacer tu pedido.","themePreset":"floral","heroImageUrl":""}')
WHERE id = 'biz_7ec4028e4b5a47bcaf';

UPDATE app_settings
SET value_json = json('{"overrides":{},"extraCategories":[],"extraProducts":[],"categoryOrder":[],"productOrder":[],"categoryHidden":{},"promotion":null,"branchPromotions":{},"businessHours":null,"branchSettings":{"multiBranchEnabled":false,"defaultBranchId":"principal","branches":[{"id":"principal","name":"Principal","active":true,"ordersPassword":"","stockPassword":"","cashierPassword":"","whatsappNumber":"528120005880","businessHours":null,"soldOut":{}}]},"baseCatalogEnabled":false}')
WHERE key = 'biz_7ec4028e4b5a47bcaf:menu_overrides';

UPDATE saas_tenants SET status = 'paused' WHERE id = 'biz_ddc854b649484697be';
UPDATE saas_tenant_domains SET status = 'inactive' WHERE tenant_id = 'biz_ddc854b649484697be';

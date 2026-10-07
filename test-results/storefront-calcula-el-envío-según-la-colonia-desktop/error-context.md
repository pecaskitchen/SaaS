# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: storefront.spec.js >> calcula el envío según la colonia
- Location: e2e\storefront.spec.js:55:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.selectOption: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('#cart select').filter({ has: locator('option[value="Entrega a domicilio"]') })

```

# Page snapshot

```yaml
- main [ref=e3]:
  - generic [ref=e4]:
    - navigation [ref=e5]:
      - generic [ref=e6]:
        - generic [ref=e7]:
          - img "Pecas" [ref=e9]
          - generic [ref=e10]:
            - generic [ref=e11]: Pecas
            - generic [ref=e12]: Cocina y Cafe
        - generic [ref=e13]:
          - generic "Idioma" [ref=e14]:
            - button "ES" [ref=e15] [cursor=pointer]
            - button "EN" [ref=e16] [cursor=pointer]
          - button "Ingresar" [ref=e17] [cursor=pointer]
          - generic [ref=e18]: Abierto · cerramos 12:00 AM
      - link "1 · $30" [ref=e19] [cursor=pointer]:
        - /url: "#cart"
    - generic [ref=e24]:
      - heading "Antojos bien hechos." [level=1] [ref=e25]
      - paragraph [ref=e26]: Envíos gratis a partir de $250.
      - paragraph [ref=e27]: Comida, café y antojos en un solo pedido.
      - generic [ref=e28]:
        - link "Ordenar ahora" [ref=e29] [cursor=pointer]:
          - /url: "#menu"
        - link "Ver promociones" [ref=e33] [cursor=pointer]:
          - /url: /promos
  - region "Novedades" [ref=e34]:
    - generic [ref=e35]:
      - generic [ref=e36]:
        - generic "Elegir banner" [ref=e37]:
          - button "Ver banner 1:" [ref=e38] [cursor=pointer]
          - button "Ver banner 2:" [ref=e39] [cursor=pointer]
        - heading "Algo especial para ti" [level=2] [ref=e40]
      - generic [ref=e41]:
        - button "Banner anterior; detiene el cambio automático" [ref=e42] [cursor=pointer]
        - button "Siguiente banner; detiene el cambio automático" [ref=e45] [cursor=pointer]
    - article [ref=e49]
  - region "Promociones de venta" [ref=e52]:
    - generic [ref=e53]:
      - generic [ref=e54]:
        - generic [ref=e55]: Promociones
        - heading "Aprovecha estas ofertas" [level=2] [ref=e56]
      - generic [ref=e57]:
        - strong [ref=e58]: 1 de 2
        - generic [ref=e59]:
          - button "Promoción anterior" [ref=e60] [cursor=pointer]
          - button "Siguiente promoción" [ref=e63] [cursor=pointer]
    - article [ref=e67]:
      - img "Combo cena" [ref=e70]
      - generic [ref=e71]:
        - heading "Combo cena" [level=2] [ref=e72]
        - paragraph [ref=e73]: 2 paninis de tu elección + 1 ensalada fresa y nuez + 2 coca colas
        - generic [ref=e74]:
          - generic [ref=e75]:
            - generic [ref=e76]: Elige tu opción 1
            - combobox "Elige tu opción 1" [ref=e77]:
              - option "Panini Jamón & Queso" [selected]
              - option "Panini Pollo BBQ"
              - option "Panini Pollo Chipotle"
              - option "Panini Pizza"
          - generic [ref=e78]:
            - generic [ref=e79]: Elige tu opción 2
            - combobox "Elige tu opción 2" [ref=e80]:
              - option "Panini Pollo Chipotle" [selected]
              - option "Panini Pollo BBQ"
              - option "Panini Pizza"
              - option "Panini Jamón & Queso"
              - option "Panini Pollo Chipotle"
          - generic [ref=e81]:
            - generic [ref=e82]: Elige tu opción 4
            - combobox "Elige tu opción 4" [ref=e83]:
              - option "Coca-Cola" [selected]
              - option "Coca-Cola Light"
          - generic [ref=e84]:
            - generic [ref=e85]: Elige tu opción 5
            - combobox "Elige tu opción 5" [ref=e86]:
              - option "Coca-Cola" [selected]
              - option "Coca-Cola Light"
        - generic [ref=e87]:
          - strong [ref=e88]: $300
          - generic [ref=e89]:
            - button "Extras" [ref=e90] [cursor=pointer]
            - button "Agregar promo" [ref=e91] [cursor=pointer]
  - generic [ref=e93]:
    - generic [ref=e94]:
      - generic [ref=e95]:
        - generic [ref=e96]: Menú
        - heading "¿Qué se te antoja hoy?" [level=2] [ref=e97]
      - generic [ref=e98]:
        - button "paninis" [ref=e99] [cursor=pointer]
        - button "wraps" [ref=e100] [cursor=pointer]
        - button "ensaladas" [ref=e101] [cursor=pointer]
        - button "crepas" [ref=e102] [cursor=pointer]
        - button "🌶️ chilaquiles" [ref=e103] [cursor=pointer]:
          - generic [ref=e104]: 🌶️
          - text: chilaquiles
        - button "cafe" [ref=e105] [cursor=pointer]
        - button "bebidas" [ref=e106] [cursor=pointer]
        - button "📦 conceptos-historicos" [ref=e107] [cursor=pointer]:
          - generic [ref=e108]: 📦
          - text: conceptos-historicos
      - generic [ref=e109]:
        - article [ref=e110]:
          - img "Coca-Cola" [ref=e113]
          - generic [ref=e114]:
            - generic [ref=e115]:
              - heading "Coca-Cola" [level=3] [ref=e117]
              - strong [ref=e118]: $30
            - paragraph [ref=e119]: Refresco frío 600 ml.
            - generic [ref=e120]:
              - button "Personalizar" [ref=e121] [cursor=pointer]
              - button "Agregar" [active] [ref=e122] [cursor=pointer]
        - article [ref=e124]:
          - img "Coca-Cola Light" [ref=e127]
          - generic [ref=e128]:
            - generic [ref=e129]:
              - heading "Coca-Cola Light" [level=3] [ref=e131]
              - strong [ref=e132]: $30
            - paragraph [ref=e133]: Refresco frío 600ml.
            - generic [ref=e134]:
              - button "Personalizar" [ref=e135] [cursor=pointer]
              - button "Agregar" [ref=e136] [cursor=pointer]
        - article [ref=e138]:
          - img "Agua" [ref=e141]
          - generic [ref=e142]:
            - generic [ref=e143]:
              - heading "Agua" [level=3] [ref=e145]
              - strong [ref=e146]: $25
            - paragraph [ref=e147]: Botella de agua.
            - generic [ref=e148]:
              - button "Personalizar" [ref=e149] [cursor=pointer]
              - button "Agregar" [ref=e150] [cursor=pointer]
        - article [ref=e152]:
          - img "Peñafiel 296 ml" [ref=e155]
          - generic [ref=e156]:
            - generic [ref=e157]:
              - heading "Peñafiel 296 ml" [level=3] [ref=e159]
              - strong [ref=e160]: $15
            - paragraph
            - generic [ref=e161]:
              - button "Personalizar" [ref=e162] [cursor=pointer]
              - button "Agregar" [ref=e163] [cursor=pointer]
    - complementary [ref=e165]:
      - generic [ref=e166]:
        - generic [ref=e167]:
          - generic [ref=e168]: Tu pedido
          - heading "Carrito" [level=2] [ref=e169]
        - generic [ref=e170]: "1"
      - generic [ref=e175]:
        - generic [ref=e176]:
          - strong [ref=e177]: Coca-Cola
          - generic [ref=e178]: $30 c/u
          - list
        - generic [ref=e179]:
          - button [ref=e180] [cursor=pointer]
          - generic [ref=e182]: "1"
          - button [ref=e183] [cursor=pointer]
          - button [ref=e185] [cursor=pointer]
      - generic [ref=e189]:
        - heading "Datos para enviar por WhatsApp" [level=3] [ref=e190]
        - paragraph [ref=e191]: Puedes guardar tus datos para futuros pedidos. Se guardan solo en este celular/navegador.
        - textbox "Nombre" [ref=e192]
        - textbox "Direccion" [ref=e193]
        - textbox "Colonia" [ref=e194]
        - textbox "Sector" [ref=e195]
        - combobox [ref=e196]:
          - option "Forma de pago" [selected]
          - option "Transferencia"
          - option "Efectivo"
          - option "Tarjeta"
          - option "Mercado Pago"
        - textbox "Nota" [ref=e197]
        - generic [ref=e198]:
          - button "Guardar mis datos" [ref=e199] [cursor=pointer]
          - button "Borrar datos" [ref=e200] [cursor=pointer]
      - generic [ref=e201]:
        - heading "Código de Pecas Club" [level=3] [ref=e202]
        - generic [ref=e203]:
          - textbox "PEC-XXXXXX" [ref=e204]
          - button "Aplicar" [ref=e205] [cursor=pointer]
      - generic [ref=e206]:
        - generic [ref=e207]:
          - generic [ref=e208]: Subtotal de productos
          - strong [ref=e209]: $30
        - generic [ref=e210]:
          - generic [ref=e211]: Total
          - strong [ref=e212]: $30
        - button "Enviar pedido por WhatsApp" [ref=e213] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test('la portada carga banners, promociones y menú', async ({ page }) => {
  4  |   await page.goto('/');
  5  |   await expect(page.locator('#banners')).toBeVisible();
  6  |   await expect(page.locator('#banners img')).toHaveAttribute('src', /pecasclub\.png$/);
  7  |   await expect.poll(() => page.locator('#banners img').evaluate((image) => image.currentSrc)).toMatch(/pecasclub\.webp$/);
  8  |   await expect(page.locator('#promociones')).toBeVisible();
  9  |   await expect(page.getByRole('heading', { name: /qué se te antoja hoy/i })).toBeVisible();
  10 |   await expect(page.getByText('Envíos gratis a partir de $250.', { exact: true })).toBeVisible();
  11 | });
  12 | 
  13 | test('muestra Mi cuenta cuando el cliente ya inició sesión', async ({ page }) => {
  14 |   await page.addInitScript(() => window.localStorage.setItem('pecas_club_token', 'sesion-de-prueba'));
  15 |   await page.goto('/');
  16 |   await expect(page.getByRole('button', { name: 'Mi cuenta', exact: true })).toBeVisible();
  17 | });
  18 | 
  19 | test('el banner principal abre el registro de Pecas Club', async ({ page }) => {
  20 |   await page.goto('/');
  21 |   await page.locator('#banners a[href="/club/registro"]').click();
  22 |   await expect(page).toHaveURL(/\/club\/registro$/);
  23 | });
  24 | 
  25 | test('el carrusel cambia y se detiene al usar una flecha', async ({ page }) => {
  26 |   await page.goto('/');
  27 |   const dots = page.locator('#banners .promo-carousel-dots button');
  28 |   await expect(dots).toHaveCount(2);
  29 |   await page.getByRole('button', { name: /siguiente banner/i }).click();
  30 |   await expect(dots.nth(1)).toHaveAttribute('aria-current', 'true');
  31 |   await page.waitForTimeout(8500);
  32 |   await expect(dots.nth(1)).toHaveAttribute('aria-current', 'true');
  33 | });
  34 | 
  35 | test('la API pública no expone secretos de sucursal', async ({ request }) => {
  36 |   const response = await request.get('/api/menu');
  37 |   expect(response.ok()).toBeTruthy();
  38 |   const body = await response.json();
  39 |   expect(JSON.stringify(body.branchSettings)).not.toMatch(/ordersPassword|stockPassword|cashierPassword/i);
  40 |   expect(body.branchSettings.branches.every((branch) => branch.active !== false)).toBeTruthy();
  41 | });
  42 | 
  43 | test('agrega un producto y actualiza el subtotal del carrito', async ({ page }) => {
  44 |   await page.goto('/');
  45 |   const bebidas = page.getByRole('button', { name: /bebidas/i }).first();
  46 |   await expect(bebidas).toBeVisible();
  47 |   await bebidas.click();
  48 |   const card = page.locator('.product-card').filter({ hasText: 'Coca-Cola' }).first();
  49 |   await expect(card).toBeVisible();
  50 |   await card.getByRole('button', { name: /agregar/i }).click();
  51 |   await expect(page.locator('.cart-pill')).toContainText('1');
  52 |   await expect(page.locator('#cart')).toContainText('Coca-Cola');
  53 | });
  54 | 
  55 | test('calcula el envío según la colonia', async ({ page }) => {
  56 |   await page.goto('/');
  57 |   await page.getByRole('button', { name: /bebidas/i }).first().click();
  58 |   const card = page.locator('.product-card').filter({ hasText: 'Coca-Cola' }).first();
  59 |   await card.getByRole('button', { name: /agregar/i }).click();
  60 |   const fulfillment = page.locator('#cart select').filter({ has: page.locator('option[value="Entrega a domicilio"]') });
> 61 |   await fulfillment.selectOption('Entrega a domicilio');
     |                     ^ Error: locator.selectOption: Test timeout of 30000ms exceeded.
  62 |   const neighborhood = page.locator('#cart input[placeholder*="Colonia" i]');
  63 |   await neighborhood.fill('Centro');
  64 |   await expect(page.locator('#cart .delivery-cost-row')).toContainText('$15');
  65 |   await neighborhood.fill('Adara');
  66 |   await expect(page.locator('#cart .delivery-cost-row')).toContainText('$0');
  67 | });
  68 | 
```
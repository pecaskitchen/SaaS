import { test, expect } from '@playwright/test';

test('la portada carga banners, promociones y menú', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#banners')).toBeVisible();
  await expect(page.locator('#banners img')).toHaveAttribute('src', /pecasclub\.png$/);
  await expect.poll(() => page.locator('#banners img').evaluate((image) => image.currentSrc)).toMatch(/pecasclub\.webp$/);
  await expect(page.locator('#promociones')).toBeVisible();
  await expect(page.getByRole('heading', { name: /qué se te antoja hoy/i })).toBeVisible();
  await expect(page.getByText('Envíos gratis a partir de $250.', { exact: true })).toBeVisible();
});

test('muestra Mi cuenta cuando el cliente ya inició sesión', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('pecas_club_token', 'sesion-de-prueba'));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Mi cuenta', exact: true })).toBeVisible();
});

test('el banner principal abre el registro de Pecas Club', async ({ page }) => {
  await page.goto('/');
  await page.locator('#banners a[href="/club/registro"]').click();
  await expect(page).toHaveURL(/\/club\/registro$/);
});

test('el carrusel cambia y se detiene al usar una flecha', async ({ page }) => {
  await page.goto('/');
  const dots = page.locator('#banners .promo-carousel-dots button');
  await expect(dots).toHaveCount(2);
  await page.getByRole('button', { name: /siguiente banner/i }).click();
  await expect(dots.nth(1)).toHaveAttribute('aria-current', 'true');
  await page.waitForTimeout(8500);
  await expect(dots.nth(1)).toHaveAttribute('aria-current', 'true');
});

test('la API pública no expone secretos de sucursal', async ({ request }) => {
  const response = await request.get('/api/menu');
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(JSON.stringify(body.branchSettings)).not.toMatch(/ordersPassword|stockPassword|cashierPassword/i);
  expect(body.branchSettings.branches.every((branch) => branch.active !== false)).toBeTruthy();
});

test('agrega un producto y actualiza el subtotal del carrito', async ({ page }) => {
  await page.goto('/');
  const bebidas = page.getByRole('button', { name: /bebidas/i }).first();
  await expect(bebidas).toBeVisible();
  await bebidas.click();
  const card = page.locator('.product-card').filter({ hasText: 'Coca-Cola' }).first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /agregar/i }).click();
  await expect(page.locator('.cart-pill')).toContainText('1');
  await expect(page.locator('#cart')).toContainText('Coca-Cola');
});

test('calcula el envío según la colonia', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /bebidas/i }).first().click();
  const card = page.locator('.product-card').filter({ hasText: 'Coca-Cola' }).first();
  await card.getByRole('button', { name: /agregar/i }).click();
  const fulfillment = page.locator('#cart select').filter({ has: page.locator('option[value="Entrega a domicilio"]') });
  await fulfillment.selectOption('Entrega a domicilio');
  const neighborhood = page.locator('#cart input[placeholder*="Colonia" i]');
  await neighborhood.fill('Centro');
  await expect(page.locator('#cart .delivery-cost-row')).toContainText('$15');
  await neighborhood.fill('Adara');
  await expect(page.locator('#cart .delivery-cost-row')).toContainText('$0');
});

import { expect, test } from '@playwright/test';

test('abre o aplicativo web e exibe a tela de login', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle(/GEMN/i);
  await expect(page.getByText('Bem-vindo ao GEMN')).toBeVisible();
  await expect(page.getByPlaceholder('voce@email.com')).toBeVisible();
  await expect(page.getByPlaceholder('Sua senha')).toBeVisible();
});

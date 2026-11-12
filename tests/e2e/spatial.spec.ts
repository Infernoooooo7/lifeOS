import { expect, test } from '@playwright/test';
import { restoreSample, startLocal, trackErrors } from './helpers';

test('spatial mode renders a WebGL scene from live data and its controls work', async ({ page }) => {
  const errors = trackErrors(page);
  await startLocal(page);
  await restoreSample(page);
  await page.getByRole('button', { name: 'Spatial', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/spatial$/);
  const canvas = page.getByTestId('spatial-root').locator('canvas');
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(2500);
  // the canvas has real size and has actually drawn something other than a blank frame
  const box = await canvas.boundingBox();
  expect(box!.width).toBeGreaterThan(600);
  expect(box!.height).toBeGreaterThan(400);
  // a blank frame compresses to a couple of kilobytes; a drawn scene (stars, glows, cards, labels) is far larger
  expect((await canvas.screenshot()).byteLength).toBeGreaterThan(25_000);

  // the list panel mirrors the scene and is the keyboard-accessible way to act on it
  const panel = page.getByRole('complementary', { name: 'Items in this view' });
  await expect(panel.getByText('Write homepage copy')).toBeVisible();
  await panel.getByRole('button', { name: 'Review pull requests' }).click();
  await expect(panel.getByRole('button', { name: 'Review pull requests' }).locator('.line-through')).toBeVisible();
  // views
  for (const view of ['Tasks', 'Goals', 'Projects', 'Knowledge']) {
    await page.getByRole('radio', { name: view }).click();
    await page.waitForTimeout(500);
  }
  await expect(panel.getByText(/notes · \d+ links/)).toBeVisible();
  // orbit with the mouse, then go back to the 2D interface
  await page.mouse.move(box!.x + 300, box!.y + 300);
  await page.mouse.down();
  await page.mouse.move(box!.x + 420, box!.y + 340, { steps: 6 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Standard mode' }).click();
  await expect(page).toHaveURL(/\/app$/);
  expect(errors).toEqual([]);
});

test('falls back to a 2D overview when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await startLocal(page);
  await restoreSample(page);
  await page.goto('/app/spatial');
  await expect(page.getByText('3D is not available on this device')).toBeVisible();
  await expect(page.getByTestId('spatial-fallback').getByText('Write homepage copy')).toBeVisible();
  await page.getByRole('button', { name: 'Back to Standard mode' }).click();
  await expect(page).toHaveURL(/\/app$/);
});

test('reduced motion renders on demand instead of animating continuously', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startLocal(page);
  await page.goto('/app/spatial');
  await expect(page.getByTestId('spatial-root').locator('canvas')).toBeVisible();
  await page.waitForTimeout(1500);
  const frames = await page.evaluate(() => new Promise<number>((resolve) => {
    const canvas = document.querySelector('canvas')!;
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext;
    let draws = 0;
    const original = gl.clear.bind(gl);
    gl.clear = (mask: number) => { draws++; original(mask); };
    setTimeout(() => resolve(draws), 1500);
  }));
  expect(frames).toBeLessThan(30); // a continuously animating scene would draw ~90 frames in this window (a few settle after load)
});

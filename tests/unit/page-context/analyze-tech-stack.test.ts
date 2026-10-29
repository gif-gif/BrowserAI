import { describe, expect, it } from 'vitest';
import { analyzePageTechStack } from '../../../core/page-context/analyze-tech-stack';

function page(head: string, body: string): Document {
  const result = document.implementation.createHTMLDocument('Tech page');
  result.head.innerHTML = head;
  result.body.innerHTML = body;
  return result;
}

describe('analyzePageTechStack', () => {
  it('detects frameworks, CMS, analytics, and monitoring from bounded static signals', () => {
    const input = page(
      '<meta name="generator" content="WordPress 6.8">'
        + '<script src="/_next/static/chunks/app.js"></script>'
        + '<script src="https://www.googletagmanager.com/gtm.js"></script>'
        + '<script src="https://browser.sentry-cdn.com/8/bundle.min.js"></script>',
      '<div id="__next"></div><link rel="stylesheet" href="/wp-content/theme.css">',
    );
    input.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="/wp-content/theme.css">');

    const result = analyzePageTechStack(input, 123);

    expect(result.capturedAt).toBe(123);
    expect(result.technologies).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Next.js', confidence: 'high' }),
      expect.objectContaining({ name: 'WordPress', confidence: 'high' }),
      expect.objectContaining({ name: 'Google Analytics / Tag Manager', confidence: 'high' }),
      expect.objectContaining({ name: 'Sentry' }),
    ]));
  });

  it('detects Nuxt, Vue, Shopify, and UI libraries from DOM and resource markers', () => {
    const input = page(
      '<script src="/_nuxt/app.js"></script><script src="https://cdn.shopify.com/store.js"></script><link rel="stylesheet" href="/bootstrap.min.css">',
      '<div id="__nuxt" data-v-app><button class="ant-btn">Buy</button></div>',
    );

    const result = analyzePageTechStack(input);

    expect(result.technologies).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Nuxt', confidence: 'high' }),
      expect.objectContaining({ name: 'Vue.js', confidence: 'high' }),
      expect.objectContaining({ name: 'Shopify', confidence: 'high' }),
      expect.objectContaining({ name: 'Bootstrap', confidence: 'high' }),
      expect.objectContaining({ name: 'Ant Design', confidence: 'medium' }),
    ]));
  });

  it('never includes inline scripts, cookies, storage, page text, or input values', () => {
    const input = page(
      '<script>window.secret = "inline-secret"</script><script src="/jquery.min.js"></script>',
      '<input value="input-secret"><p>private page body</p>',
    );

    const serialized = JSON.stringify(analyzePageTechStack(input));

    expect(serialized).toContain('/jquery.min.js');
    expect(serialized).not.toContain('inline-secret');
    expect(serialized).not.toContain('input-secret');
    expect(serialized).not.toContain('private page body');
  });

  it('caps collected resource URLs and reports truncation', () => {
    const scripts = Array.from({ length: 90 }, (_, index) => `<script src="/assets/${index}.js"></script>`).join('');
    const result = analyzePageTechStack(page(scripts, ''));

    expect(result.scripts).toHaveLength(80);
    expect(result.truncated).toBe(true);
  });
});

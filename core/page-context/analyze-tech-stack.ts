import type {
  PageTechStackEvidence,
  PageTechnologyFinding,
  TechnologyCategory,
  TechnologyConfidence,
} from '../../shared/types/tech-stack';

const MAX_RESOURCE_URLS = 80;
const MAX_META_NAMES = 50;
const MAX_MARKERS = 80;
const MAX_TECHNOLOGIES = 40;
const MAX_EVIDENCE_PER_TECHNOLOGY = 8;
const MAX_VALUE_LENGTH = 1_000;

const confidenceRank: Record<TechnologyConfidence, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

function limited(value: string, max = MAX_VALUE_LENGTH): string {
  return value.trim().slice(0, max);
}

function collectAttributes(document: Document): Record<string, string> {
  const result: Record<string, string> = {};
  const candidates: Array<[string, string | null]> = [
    ['html.lang', document.documentElement.getAttribute('lang')],
    ['html.dir', document.documentElement.getAttribute('dir')],
    ['html.ng-version', document.documentElement.getAttribute('ng-version')],
    ['html.data-wf-page', document.documentElement.getAttribute('data-wf-page')],
    ['html.data-wf-site', document.documentElement.getAttribute('data-wf-site')],
    ['html.data-sveltekit-preload-data', document.documentElement.getAttribute('data-sveltekit-preload-data')],
  ];
  for (const [name, value] of candidates) {
    if (value) result[name] = limited(value, 300);
  }
  return result;
}

function elementHasRuntimeProperty(element: Element | null, prefixes: string[]): boolean {
  if (!element) return false;
  return Object.getOwnPropertyNames(element).some((name) => prefixes.some((prefix) => name.startsWith(prefix)));
}

export function analyzePageTechStack(document: Document, capturedAt = Date.now()): PageTechStackEvidence {
  let truncated = false;
  const take = (values: string[], maximum: number) => {
    if (values.length > maximum) truncated = true;
    return values.slice(0, maximum);
  };
  const uniqueValues = (values: string[]) => [...new Set(values.map((value) => limited(value)).filter(Boolean))];

  const allScripts = uniqueValues(Array.from(document.querySelectorAll('script[src]'))
    .map((element) => element.getAttribute('src') ?? ''));
  const allStylesheets = uniqueValues(Array.from(document.querySelectorAll('link[rel~="stylesheet"][href]'))
    .map((element) => element.getAttribute('href') ?? ''));
  const allMetaNames = uniqueValues(Array.from(document.querySelectorAll('meta[name], meta[property]'))
    .map((element) => element.getAttribute('name') ?? element.getAttribute('property') ?? ''));
  const scripts = take(allScripts, MAX_RESOURCE_URLS);
  const stylesheets = take(allStylesheets, MAX_RESOURCE_URLS);
  const metaNames = take(allMetaNames, MAX_META_NAMES);
  const resourceText = [...scripts, ...stylesheets].join('\n').toLowerCase();
  const generator = limited(document.querySelector('meta[name="generator" i]')?.getAttribute('content') ?? '', 300) || undefined;
  const generatorLower = generator?.toLowerCase() ?? '';
  const windowObject = document.defaultView as (Window & Record<string, unknown>) | null;
  const findings = new Map<string, PageTechnologyFinding>();
  const markers: string[] = [];

  const addMarker = (marker: string) => {
    if (markers.includes(marker)) return;
    if (markers.length >= MAX_MARKERS) {
      truncated = true;
      return;
    }
    markers.push(marker);
  };
  const add = (
    name: string,
    category: TechnologyCategory,
    confidence: TechnologyConfidence,
    evidence: string,
  ) => {
    const key = name.toLowerCase();
    const current = findings.get(key);
    if (!current) {
      if (findings.size >= MAX_TECHNOLOGIES) {
        truncated = true;
        return;
      }
      findings.set(key, { name, category, confidence, evidence: [limited(evidence, 500)] });
      return;
    }
    if (confidenceRank[confidence] > confidenceRank[current.confidence]) current.confidence = confidence;
    const nextEvidence = limited(evidence, 500);
    if (!current.evidence.includes(nextEvidence) && current.evidence.length < MAX_EVIDENCE_PER_TECHNOLOGY) {
      current.evidence.push(nextEvidence);
    }
  };
  const hasResource = (pattern: RegExp) => pattern.test(resourceText);

  if (document.querySelector('#__next') || hasResource(/\/_next\//)) {
    add('Next.js', 'framework', 'high', document.querySelector('#__next') ? 'DOM contains #__next' : 'Resource URL contains /_next/');
    addMarker('nextjs');
  }
  if (document.querySelector('#__nuxt') || hasResource(/\/_nuxt\//)) {
    add('Nuxt', 'framework', 'high', document.querySelector('#__nuxt') ? 'DOM contains #__nuxt' : 'Resource URL contains /_nuxt/');
    addMarker('nuxt');
  }
  const reactRuntime = elementHasRuntimeProperty(document.documentElement, ['__reactContainer$', '__reactFiber$'])
    || elementHasRuntimeProperty(document.body, ['__reactContainer$', '__reactFiber$']);
  if (document.querySelector('[data-reactroot]') || reactRuntime || hasResource(/(?:^|[/._-])react(?:[-./]|$)/)) {
    add('React', 'framework', reactRuntime || document.querySelector('[data-reactroot]') ? 'high' : 'medium', reactRuntime ? 'React runtime marker found on a root element' : 'React DOM or resource marker found');
    addMarker('react');
  }
  const vueRoot = document.querySelector('[data-v-app], #app');
  const vueRuntime = Boolean(vueRoot && (vueRoot as Element & { __vue_app__?: unknown }).__vue_app__);
  if (document.querySelector('[data-v-app]') || vueRuntime || hasResource(/(?:^|[/._-])vue(?:[-./]|$)/)) {
    add('Vue.js', 'framework', document.querySelector('[data-v-app]') || vueRuntime ? 'high' : 'medium', vueRuntime ? 'Vue runtime marker found on the app root' : 'Vue DOM or resource marker found');
    addMarker('vue');
  }
  if (document.querySelector('[ng-version], app-root') || hasResource(/(?:^|[/._-])angular(?:[-./]|$)/)) {
    add('Angular', 'framework', document.querySelector('[ng-version]') ? 'high' : 'medium', document.querySelector('[ng-version]') ? 'DOM contains ng-version' : 'Angular root or resource marker found');
    addMarker('angular');
  }
  if (document.querySelector('[data-sveltekit-preload-data], [data-sveltekit-preload-code]') || hasResource(/\/_app\/immutable\//)) {
    add('SvelteKit', 'framework', 'high', 'SvelteKit DOM or /_app/immutable/ resource marker found');
    addMarker('sveltekit');
  } else if (hasResource(/(?:^|[/._-])svelte(?:[-./]|$)/)) {
    add('Svelte', 'framework', 'medium', 'Svelte resource marker found');
    addMarker('svelte');
  }
  if (document.querySelector('astro-island, astro-slot')) {
    add('Astro', 'framework', 'high', 'DOM contains Astro custom elements');
    addMarker('astro');
  }
  if (document.querySelector('#___gatsby') || hasResource(/\/page-data\//)) {
    add('Gatsby', 'framework', 'high', 'Gatsby root or page-data resource marker found');
    addMarker('gatsby');
  }
  if (windowObject?.jQuery || hasResource(/(?:^|[/._-])jquery(?:[-./]|$)/)) {
    add('jQuery', 'library', windowObject?.jQuery ? 'high' : 'medium', windowObject?.jQuery ? 'window.jQuery is present' : 'jQuery resource marker found');
  }

  if (generatorLower.includes('wordpress') || hasResource(/\/wp-(?:content|includes)\//)) {
    add('WordPress', 'cms', 'high', generatorLower.includes('wordpress') ? `Generator: ${generator}` : 'Resource URL contains /wp-content/ or /wp-includes/');
  }
  if (generatorLower.includes('drupal') || windowObject?.Drupal || resourceText.includes('/sites/default/files/')) {
    add('Drupal', 'cms', windowObject?.Drupal || generatorLower.includes('drupal') ? 'high' : 'medium', generatorLower ? `Generator: ${generator}` : 'Drupal runtime or resource marker found');
  }
  if (resourceText.includes('cdn.shopify.com') || windowObject?.Shopify) {
    add('Shopify', 'commerce', 'high', windowObject?.Shopify ? 'window.Shopify is present' : 'Resource URL uses cdn.shopify.com');
  }
  if (resourceText.includes('static.wixstatic.com') || generatorLower.includes('wix')) add('Wix', 'cms', 'high', 'Wix generator or resource marker found');
  if (resourceText.includes('static1.squarespace.com') || generatorLower.includes('squarespace')) add('Squarespace', 'cms', 'high', 'Squarespace generator or resource marker found');
  if (document.querySelector('[data-wf-page], [data-wf-site]') || resourceText.includes('webflow.')) add('Webflow', 'cms', 'high', 'Webflow DOM or resource marker found');

  if (hasResource(/bootstrap(?:\.min)?\.(?:css|js)/)) add('Bootstrap', 'ui', 'high', 'Bootstrap CSS or JavaScript resource found');
  if (hasResource(/tailwind(?:\.min)?\.css|cdn\.tailwindcss\.com/)) {
    add('Tailwind CSS', 'ui', 'high', 'Tailwind CSS resource found');
  } else {
    const utilityMatches = Array.from(document.querySelectorAll('[class]')).slice(0, 300).reduce((count, element) => {
      const classes = (element.getAttribute('class') ?? '').split(/\s+/);
      return count + classes.filter((name) => /^(?:sm:|md:|lg:|xl:)?(?:flex|grid|hidden|block|items-|justify-|gap-|p[trblxy]?-(?:\w|\[)|m[trblxy]?-(?:\w|\[)|text-|bg-|rounded)/.test(name)).length;
    }, 0);
    if (utilityMatches >= 12) add('Tailwind CSS', 'ui', 'low', `${utilityMatches} Tailwind-like utility class occurrences found`);
  }
  if (document.querySelector('[class*="Mui"]')) add('Material UI', 'ui', 'medium', 'DOM contains Mui-prefixed classes');
  if (document.querySelector('[class^="ant-"], [class*=" ant-"]')) add('Ant Design', 'ui', 'medium', 'DOM contains ant-prefixed classes');
  if (document.querySelector('[class^="el-"], [class*=" el-"]')) add('Element UI / Element Plus', 'ui', 'medium', 'DOM contains el-prefixed classes');

  if (hasResource(/googletagmanager\.com\/(?:gtag\/js|gtm\.js)|google-analytics\.com/)) add('Google Analytics / Tag Manager', 'analytics', 'high', 'Google analytics or tag-manager resource found');
  if (hasResource(/(?:^|[./_-])sentry(?:[./_-]|$)/) || windowObject?.Sentry) add('Sentry', 'monitoring', windowObject?.Sentry ? 'high' : 'medium', 'Sentry runtime or resource marker found');
  if (hasResource(/cdn\.segment\.com|segment\.io/)) add('Segment', 'analytics', 'high', 'Segment resource found');
  if (hasResource(/static\.hotjar\.com|script\.hotjar\.com/)) add('Hotjar', 'analytics', 'high', 'Hotjar resource found');
  if (hasResource(/clarity\.ms/)) add('Microsoft Clarity', 'analytics', 'high', 'Microsoft Clarity resource found');
  if (hasResource(/static\.cloudflareinsights\.com/)) add('Cloudflare Web Analytics', 'analytics', 'high', 'Cloudflare Insights resource found');

  if (hasResource(/(?:^|\.)vercel\.app|vercel-insights/)) add('Vercel', 'hosting', 'medium', 'Vercel resource or host marker found');
  if (hasResource(/(?:^|\.)netlify\.(?:app|com)/)) add('Netlify', 'hosting', 'medium', 'Netlify resource or host marker found');
  if (hasResource(/cdnjs\.cloudflare\.com|static\.cloudflareinsights\.com/)) add('Cloudflare', 'cdn', 'medium', 'Cloudflare-hosted resource found');
  if (hasResource(/cdn\.jsdelivr\.net/)) add('jsDelivr', 'cdn', 'high', 'Resource URL uses cdn.jsdelivr.net');
  if (hasResource(/unpkg\.com/)) add('unpkg', 'cdn', 'high', 'Resource URL uses unpkg.com');

  return {
    url: limited(document.location?.href ?? '', 2_000),
    title: limited(document.title ?? '', 500),
    ...(generator ? { generator } : {}),
    scripts,
    stylesheets,
    metaNames,
    htmlAttributes: collectAttributes(document),
    frameworkMarkers: markers,
    technologies: Array.from(findings.values()),
    truncated,
    capturedAt,
  };
}

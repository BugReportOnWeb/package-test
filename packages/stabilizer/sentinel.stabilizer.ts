import { Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

export interface StabilizerOptions {
  /** Path to a sentinel.masks.json file. (default: Project's root) */
  masksPath?: string

  /**
   * Additional CSS selectors to mask on top of the defaults in sentinel.masks.json.
   * e.g. ['#live-chat', '.promo-ticker'] (default: [])
   */
  additionalMasks?: string[];

  /** The full URL of the current page to evaluate page-specific masking rules. */
  pageUrl?: string;

  /** Whether to mock the browser clock to a fixed time (default: true). */
  mockClock?: boolean;

  /** Whether to scroll through the page to trigger lazy-loaded content (default: true). */
  triggerLazyLoad?: boolean;

  /** Scroll step in pixels for triggering lazy load (default: 300). */
  scrollStep?: number;

  /** Delay in ms between scroll steps (default: 100). */
  scrollDelay?: number;
}

interface MaskEntry {
  selector: string;
  description: string;
}

interface MaskingRule {
  pattern: string;
  description: string;
  selectors: string[];
}

interface MasksConfig {
  globalMasks: MaskEntry[];
  maskingRules?: MaskingRule[];
}

/**
 * Loads global mask selectors from sentinel.masks.json,
 * then appends any page-specific selectors whose rule pattern matches pageUrl.
 */
function loadMaskSelectors(
  additionalMasks: string[] = [],
  pageUrl?: string,
  masksPath?: string
): string[] {
  try {
    const resolvedPath = masksPath ?? join(process.cwd(), 'sentinel.masks.json');
    const raw = readFileSync(resolvedPath, 'utf-8');
    const config: MasksConfig = JSON.parse(raw);

    const globalSelectors = config.globalMasks.map((m) => m.selector);

    const pageSpecificSelectors: string[] = [];
    if (pageUrl && Array.isArray(config.maskingRules)) {
      for (const rule of config.maskingRules) {
        try {
          const regex = new RegExp(rule.pattern, 'i');
          if (regex.test(pageUrl)) {
            console.log(
              `[sentinel:stabilizer] Applying page-specific masks for pattern "${rule.pattern}" (${rule.description})`
            );
            pageSpecificSelectors.push(...rule.selectors);
          }
        } catch {
          console.warn(
            `[sentinel:stabilizer] Invalid regex pattern in maskingRules: "${rule.pattern}". Skipping.`
          );
        }
      }
    }

    return [
      ...new Set([...globalSelectors, ...pageSpecificSelectors, ...additionalMasks]),
    ];
  } catch {
    console.warn(
      '[sentinel:stabilizer] Could not load sentinel.masks.json. Using additionalMasks only.'
    );
    return additionalMasks;
  }
}

/** Injects CSS that kills all animations/transitions and masks dynamic elements with pink blocks. */
async function injectStabilizingCSS(
  page: Page,
  maskSelectors: string[]
): Promise<void> {
  const maskRules =
    maskSelectors.length > 0
      ? `
${maskSelectors.join(',\n')} {
  background-color: #FF00FF !important;
  color: transparent !important;
  border: none !important;
}
`
      : '';

  await page.addStyleTag({
    content: `
*,
*::before,
*::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  animation-iteration-count: 1 !important;
  animation-play-state: paused !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
  scroll-behavior: auto !important;
}

video {
  animation-play-state: paused !important;
}

${maskRules}
    `.trim(),
  });
}

/** Freezes the browser clock to 1970-01-01T00:00:00 for deterministic timestamps. */
async function mockBrowserClock(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date('1970-01-01T00:00:00'));
}

/** Scrolls top-to-bottom in steps to trigger lazy-loaded content, then scrolls back up. */
async function triggerLazyLoadScroll(
  page: Page,
  scrollStep: number,
  scrollDelay: number
): Promise<void> {
  const pageHeight = await page.evaluate(() => document.body.scrollHeight);

  let currentPosition = 0;
  while (currentPosition < pageHeight) {
    currentPosition = Math.min(currentPosition + scrollStep, pageHeight);
    await page.evaluate((pos) => window.scrollTo(0, pos), currentPosition);
    await page.waitForTimeout(scrollDelay);
  }

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForLoadState('networkidle');
}

/**
 * Stabilizes a page for deterministic screenshots.
 * Call after page.goto() and page.waitForLoadState(), before taking a screenshot.
 *
 * 1. Mocks the browser clock (optional, default: true)
 * 2. Kills animations and applies masks:
 *    - Global masks from sentinel.masks.json (always applied)
 *    - Page-specific masks from maskingRules whose pattern matches pageUrl
 *    - Any additionalMasks passed directly
 * 3. Scrolls to trigger lazy-loaded images (optional, default: true)
 *
 * @example
 * await page.goto('/blog/my-post');
 * await page.waitForLoadState('networkidle');
 * await stabilizePage(page, {
 *   masksPath: 'path/to/sentinel.masks.json',     // optional custom path. Defaults to project root 
 *   pageUrl: page.url(),                          // enables page-specific masking
 *   additionalMasks: ['#live-chat'],              // one-off extra masks
 * });
 * await expect(page).toHaveScreenshot('blog-post.png', { fullPage: true });
 */
export async function stabilizePage(
  page: Page,
  options: StabilizerOptions = {}
): Promise<void> {
  const {
    additionalMasks = [],
    pageUrl,
    masksPath,
    mockClock = true,
    triggerLazyLoad = true,
    scrollStep = 300,
    scrollDelay = 100,
  } = options;

  if (mockClock) {
    await mockBrowserClock(page);
  }

  const maskSelectors = loadMaskSelectors(additionalMasks, pageUrl, masksPath);
  await injectStabilizingCSS(page, maskSelectors);

  if (triggerLazyLoad) {
    await triggerLazyLoadScroll(page, scrollStep, scrollDelay);
  }
}

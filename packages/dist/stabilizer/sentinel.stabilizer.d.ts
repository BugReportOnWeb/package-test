import { Page } from '@playwright/test';
export interface StabilizerOptions {
    /** Path to a sentinel.masks.json file. (default: Project's root) */
    masksPath?: string;
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
export declare function stabilizePage(page: Page, options?: StabilizerOptions): Promise<void>;

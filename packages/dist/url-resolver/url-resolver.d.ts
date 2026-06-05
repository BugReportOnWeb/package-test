/** A single page for visual regression testing. */
export interface VisualPage {
    /** Relative path from the base URL, e.g. "/about" */
    path: string;
    /** Used as the screenshot filename stem, e.g. "about" > "about.desktop.png" */
    name: string;
}
/** A URL pair for migration comparison testing. */
export interface MigrationPair {
    /** Full URL of the source (old) site page */
    sourceUrl: string;
    /** Full URL of the target (new) site page */
    targetUrl: string;
    /** Used as the screenshot filename stem */
    name: string;
}
/**
 * Resolves the list of pages to test for visual regression.
 *
 * Priority: sitemap > CSV > config.visual.pages
 *
 * @param configPath - Optional path to the sentinel.config.json file. If not provided, defaults to the project's root directly.
 *
 * @returns An array of VisualPage objects containing path and name for each page.
 */
export declare function resolveVisualUrls(configPath?: string): Promise<VisualPage[]>;
/**
 * Resolves the list of URL pairs to test for migration comparison.
 *
 * Priority: sitemaps > CSV > config.migration.pairs
 *
 * @param configPath - Optional path to the sentinel.config.json file. If not provided, defaults to the project's root directly.
 *
 * @returns An array of MigrationPair objects containing sourceUrl, targetUrl, and name for each pair.
 */
export declare function resolveMigrationUrls(configPath?: string): Promise<MigrationPair[]>;

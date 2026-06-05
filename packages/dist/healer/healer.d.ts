import { Page, Locator } from '@playwright/test';
export interface HealerOptions {
    /** Human-readable description of the element being sought */
    description: string;
    /** The origin selector string that broke */
    originalSelector: string;
    /** Absolute path to .spec file containing the broken selector */
    specFilePath?: string;
    /**
     * - 'auto': rewrites the locator call in the spec file in place
     * - 'suggest': writes a .patch.json file next to the spec for review
     * - 'none': heals the test run only, no file changes
     */
    patchMode?: 'auto' | 'suggest' | 'none';
    /**
     * Path to the AI healing prompt file.
     * Defaults to .github/prompts/healing.md relative to project root.
     */
    promptPath?: string;
    /**
     * AI's API key. Defaults to process.env.GEMINI_API_KEY for now (using Gemini).
     */
    apiKey?: string;
}
export interface HealResult {
    healed: boolean;
    locator: Locator | null;
    newSelector: string | null;
    confidence: number;
    reasoning: string;
}
/**
 * Attempts to find an element using AI vision when a selector has broken.
 * Optionally patches the spec file with the new selector.
 */
export declare function healLocator(page: Page, options: HealerOptions): Promise<HealResult>;
/**
 * Wraps a Playwright action with automatic self-healing.
 * Tries the original locator first. If it fails, calls healLocator and retries.
 */
export declare function withHealing(page: Page, locator: Locator, action: (locator: Locator) => Promise<void>, options: HealerOptions): Promise<void>;

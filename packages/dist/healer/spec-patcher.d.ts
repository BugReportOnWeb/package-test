export interface PatchOptions {
    /** Absolute path to the .spec.ts file to patch */
    specFilePath: string;
    /** The original broken selector string as it appears in the spec file */
    originalSelector: string;
    /** The new Playwright locator code returned by Gemini e.g. getByRole('button', { name: 'Submit' }) */
    newLocatorCode: string;
    /**
     * 'auto': rewrites the spec file in place immediately
     * 'suggest': writes a .patch.json file next to the spec for developer review
     */
    mode: 'auto' | 'suggest';
    /** Human-readable description of the element */
    description?: string;
    /** AI confidence score */
    confidence?: number;
    /** AI reasoning */
    reasoning?: string;
}
export interface PatchSuggestion {
    specFilePath: string;
    originalSelector: string;
    newLocatorCode: string;
    description: string;
    confidence: number;
    reasoning: string;
    generatedAt: string;
    howToApply: string;
}
/**
 * Auto mode: rewrites the spec file in place.
 * Suggest mode: writes a .patch.json next to the spec for review.
 */
export declare function patchSpecFile(options: PatchOptions): Promise<void>;

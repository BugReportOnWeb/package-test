export interface HealingRecord {
    /** ISO timestamp of when the healing attempt occurred */
    timestamp: string;
    /** Human-readable description of the element */
    description: string;
    /** The original selector that broke */
    originalSelector: string;
    /** The new selector Gemini suggested (null if healing failed) */
    newSelector: string | null;
    /** The type of locator used: getByRole, getByText, etc. */
    locatorType: string | null;
    /** Gemini confidence score 0.0 to 1.0 */
    confidence: number;
    /** Gemini's reasoning for the selector choice */
    reasoning: string;
    /** Whether the healing was successful */
    healed: boolean;
    /** Path to the spec file that was patched (null if not patched) */
    specFilePath: string | null;
    /** The patch mode used */
    patchMode: 'auto' | 'suggest' | 'none';
}
/**
 * Reads all healing records from healing-audit.json.
 * Returns an empty array if the file doesn't exist yet.
 */
export declare function readHealingAudit(): HealingRecord[];
/**
 * Appends a single healing record to healing-audit.json.
 * Creates the file if it doesn't exist.
 */
export declare function appendHealingRecord(record: HealingRecord): Promise<void>;
/**
 * Prints a summary of the healing audit to the console.
 * Useful to call at the end of a test run.
 */
export declare function printHealingSummary(): void;
//# sourceMappingURL=healing-audit.d.ts.map
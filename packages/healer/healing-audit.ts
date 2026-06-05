import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// Audit log lives at the project root
const AUDIT_FILE_PATH = join(process.cwd(), 'healing-audit.json');

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
export function readHealingAudit(): HealingRecord[] {
  if (!existsSync(AUDIT_FILE_PATH)) {
    return [];
  }
  try {
    const content = readFileSync(AUDIT_FILE_PATH, 'utf-8');
    return JSON.parse(content) as HealingRecord[];
  } catch {
    console.warn('[sentinel:audit] Could not read healing-audit.json. Starting fresh.');
    return [];
  }
}

/**
 * Appends a single healing record to healing-audit.json.
 * Creates the file if it doesn't exist.
 */
export async function appendHealingRecord(record: HealingRecord): Promise<void> {
  const existing = readHealingAudit();
  existing.push(record);
  writeFileSync(AUDIT_FILE_PATH, JSON.stringify(existing, null, 2), 'utf-8');

  const status = record.healed ? '✅ healed' : '❌ failed';
  console.log(
    `[sentinel:audit] ${status} - "${record.originalSelector}" to "${record.newSelector ?? 'none'}" ` +
    `(confidence: ${Math.round(record.confidence * 100)}%)`
  );
}

/**
 * Prints a summary of the healing audit to the console.
 * Useful to call at the end of a test run.
 */
export function printHealingSummary(): void {
  const records = readHealingAudit();

  if (records.length === 0) {
    console.log('\n[sentinel:audit] No healing events recorded in this run.');
    return;
  }

  const healed = records.filter((r) => r.healed);
  const failed = records.filter((r) => !r.healed);

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║        Sentinel Self-Healing Audit           ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Total healing attempts : ${String(records.length).padEnd(18)}║`);
  console.log(`║  Successfully healed    : ${String(healed.length).padEnd(18)}║`);
  console.log(`║  Failed to heal         : ${String(failed.length).padEnd(18)}║`);
  console.log('╠══════════════════════════════════════════════╣');

  for (const r of records) {
    const status = r.healed ? '✅' : '❌';
    console.log(`║  ${status} "${r.originalSelector}"`);
    if (r.newSelector) {
      console.log(`║     to page.${r.newSelector}`);
    }
    console.log(`║     Confidence: ${Math.round(r.confidence * 100)}% | Mode: ${r.patchMode}`);
  }

  console.log('╚══════════════════════════════════════════════╝\n');
}

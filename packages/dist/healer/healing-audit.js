import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
// Audit log lives at the project root
const AUDIT_FILE_PATH = join(process.cwd(), 'healing-audit.json');
/**
 * Reads all healing records from healing-audit.json.
 * Returns an empty array if the file doesn't exist yet.
 */
export function readHealingAudit() {
    if (!existsSync(AUDIT_FILE_PATH)) {
        return [];
    }
    try {
        const content = readFileSync(AUDIT_FILE_PATH, 'utf-8');
        return JSON.parse(content);
    }
    catch {
        console.warn('[sentinel:audit] Could not read healing-audit.json. Starting fresh.');
        return [];
    }
}
/**
 * Appends a single healing record to healing-audit.json.
 * Creates the file if it doesn't exist.
 */
export async function appendHealingRecord(record) {
    const existing = readHealingAudit();
    existing.push(record);
    writeFileSync(AUDIT_FILE_PATH, JSON.stringify(existing, null, 2), 'utf-8');
    const status = record.healed ? '✅ healed' : '❌ failed';
    console.log(`[sentinel:audit] ${status} - "${record.originalSelector}" to "${record.newSelector ?? 'none'}" ` +
        `(confidence: ${Math.round(record.confidence * 100)}%)`);
}
/**
 * Prints a summary of the healing audit to the console.
 * Useful to call at the end of a test run.
 */
export function printHealingSummary() {
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

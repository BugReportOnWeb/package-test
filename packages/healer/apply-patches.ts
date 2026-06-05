/**
 * Reads .patch.json files and applies suggested selector replacements.
 * Usage: npx tsx packages/healer/apply-patches.ts [--dir=e2e]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const args = process.argv.slice(2);
const dirArg = args.find((a) => a.startsWith('--dir='));
const SCAN_DIR = dirArg
  ? join(process.cwd(), dirArg.replace('--dir=', ''))
  : join(__dirname, '../../demo/e2e');

interface PatchSuggestion {
  specFilePath: string;
  originalSelector: string;
  newLocatorCode: string;
  description: string;
  confidence: number;
  reasoning: string;
  generatedAt: string;
}

function applyReplacement(
  content: string,
  originalSelector: string,
  newLocatorCode: string
): { result: string; count: number } {
  let result = content;
  let count = 0;
  const escaped = originalSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Pattern A/B: direct locator call - page.locator('#broken') or locator('#broken')
  const directPattern = new RegExp(
    `(page\\.)?locator\\((['"\`])${escaped}\\2\\)`,
    'g'
  );
  result = result.replace(directPattern, () => {
    count++;
    return `page.${newLocatorCode}`;
  });

  if (count > 0) return { result, count };

  // Pattern C: selector stored in a variable, variable used in locator()
  const varNamePattern = new RegExp(
    `(?:const|let|var)\\s+(\\w+)\\s*=\\s*(['"\`])${escaped}\\2`,
    'g'
  );
  const varNames: string[] = [];
  let match;
  while ((match = varNamePattern.exec(content)) !== null) {
    varNames.push(match[1]);
  }

  for (const varName of varNames) {
    const usagePattern = new RegExp(`(page\\.)?locator\\(${varName}\\)`, 'g');
    result = result.replace(usagePattern, () => {
      count++;
      return `page.${newLocatorCode}`;
    });
  }

  return { result, count };
}

async function main() {
  console.log(`\n Scanning for .patch.json files in: ${SCAN_DIR}\n`);

  if (!existsSync(SCAN_DIR)) {
    console.error(`Directory not found: ${SCAN_DIR}`);
    process.exit(1);
  }

  const patchFiles = readdirSync(SCAN_DIR)
    .filter((f) => f.endsWith('.patch.json'))
    .map((f) => join(SCAN_DIR, f));

  if (patchFiles.length === 0) {
    console.log('No .patch.json files found. Nothing to apply.\n');
    return;
  }

  let totalApplied = 0;
  let totalSkipped = 0;

  for (const patchFile of patchFiles) {
    console.log(`\n📄 Processing: ${basename(patchFile)}`);

    let suggestions: PatchSuggestion[] = [];
    try {
      suggestions = JSON.parse(readFileSync(patchFile, 'utf-8'));
    } catch {
      console.warn(`  ⚠️  Could not parse ${basename(patchFile)} (skipping)`);
      continue;
    }

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      console.log(`  ℹ️  No suggestions in ${basename(patchFile)} (skipping)`);
      continue;
    }

    for (const suggestion of suggestions) {
      const { specFilePath, originalSelector, newLocatorCode, confidence, reasoning } = suggestion;

      console.log(`\n  Selector : "${originalSelector}"`);
      console.log(`  Replace  : page.${newLocatorCode}`);
      console.log(`  Confidence: ${Math.round(confidence * 100)}%`);
      console.log(`  Reasoning: ${reasoning}`);

      if (!existsSync(specFilePath)) {
        console.warn(`  ⚠️  Spec file not found: ${specFilePath} (skipping)`);
        totalSkipped++;
        continue;
      }

      const content = readFileSync(specFilePath, 'utf-8');
      const { result, count } = applyReplacement(content, originalSelector, newLocatorCode);

      if (count === 0) {
        console.warn(
          `  ⚠️  Could not find "${originalSelector}" in ${basename(specFilePath)} ` +
          `(it may already have been patched)`
        );
        totalSkipped++;
        continue;
      }

      writeFileSync(specFilePath, result, 'utf-8');
      console.log(`  ✅ Applied: replaced ${count} occurrence(s) in ${basename(specFilePath)}`);
      totalApplied++;
    }

    // Delete the patch file after applying all its suggestions.
    rmSync(patchFile);
    console.log(`\n Deleted: ${basename(patchFile)}`);
  }

  console.log('\n══════════════════════════════════════');
  console.log(`  Applied : ${totalApplied}`);
  console.log(`  Skipped : ${totalSkipped}`);
  console.log('══════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('apply-patches failed:', err);
  process.exit(1);
});

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { basename } from 'path';
/**
 * Replaces broken selector usages in spec file content.
 */
function applyReplacement(content, originalSelector, newLocatorCode) {
    let result = content;
    let replacementCount = 0;
    const escaped = originalSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Pattern A/B: direct locator call [page.locator('#broken') or locator('#broken')]
    const directPattern = new RegExp(`(page\\.)?locator\\((['"\`])${escaped}\\2\\)`, 'g');
    const afterDirect = result.replace(directPattern, (_match, pagePrefix) => {
        replacementCount++;
        return `page.${newLocatorCode}`;
    });
    if (replacementCount > 0) {
        return { result: afterDirect, replacementCount };
    }
    // Pattern C: selector stored in a variable, variable used in locator()
    const varNamePattern = new RegExp(`(?:const|let|var)\\s+(\\w+)\\s*=\\s*(['"\`])${escaped}\\2`, 'g');
    const varNames = [];
    let match;
    while ((match = varNamePattern.exec(content)) !== null) {
        varNames.push(match[1]);
    }
    if (varNames.length === 0) {
        return { result, replacementCount: 0 };
    }
    // Replace page.locator(VAR_NAME) with page.newLocatorCode
    for (const varName of varNames) {
        const varUsagePattern = new RegExp(`(page\\.)?locator\\(${varName}\\)`, 'g');
        result = result.replace(varUsagePattern, (_match) => {
            replacementCount++;
            return `page.${newLocatorCode}`;
        });
    }
    return { result, replacementCount };
}
/**
 * Auto mode: rewrites the spec file in place.
 * Suggest mode: writes a .patch.json next to the spec for review.
 */
export async function patchSpecFile(options) {
    const { specFilePath, originalSelector, newLocatorCode, mode, description = '', confidence = 0, reasoning = '', } = options;
    if (!existsSync(specFilePath)) {
        console.warn(`[sentinel:patcher] Spec file not found: ${specFilePath}`);
        return;
    }
    const content = readFileSync(specFilePath, 'utf-8');
    if (mode === 'auto') {
        const { result, replacementCount } = applyReplacement(content, originalSelector, newLocatorCode);
        if (replacementCount === 0) {
            console.warn(`[sentinel:patcher] Could not find "${originalSelector}" in ${basename(specFilePath)}. ` +
                `Check the selector string matches exactly what is in the file.`);
            return;
        }
        writeFileSync(specFilePath, result, 'utf-8');
        console.log(`[sentinel:patcher] ✅ AUTO-PATCHED ${basename(specFilePath)}: ` +
            `replaced ${replacementCount} occurrence(s) of "${originalSelector}" ` +
            `to page.${newLocatorCode}`);
    }
    else {
        const patchFilePath = specFilePath.replace(/\.ts$/, '.patch.json');
        const suggestion = {
            specFilePath,
            originalSelector,
            newLocatorCode,
            description,
            confidence,
            reasoning,
            generatedAt: new Date().toISOString(),
            howToApply: [
                `In ${basename(specFilePath)}, find all uses of "${originalSelector}"`,
                `and replace page.locator('${originalSelector}') with page.${newLocatorCode}`,
                ``,
                `Or run:  npx tsx packages/healer/apply-patches.ts`,
                `to apply all pending suggestions automatically.`,
            ].join('\n'),
        };
        let existingPatches = [];
        if (existsSync(patchFilePath)) {
            try {
                existingPatches = JSON.parse(readFileSync(patchFilePath, 'utf-8'));
            }
            catch {
                existingPatches = [];
            }
        }
        // Avoid dupliate entries
        const alreadyLogged = existingPatches.some((p) => p.originalSelector === originalSelector);
        if (!alreadyLogged) {
            existingPatches.push(suggestion);
            writeFileSync(patchFilePath, JSON.stringify(existingPatches, null, 2), 'utf-8');
            console.log(`[sentinel:patcher] SUGGESTED: patch for "${originalSelector}" ` +
                `written to ${basename(patchFilePath)}`);
        }
    }
}

import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFileSync } from 'fs';
import { join } from 'path';
import { appendHealingRecord } from './healing-audit.js';
/** Takes a screenshot, sends it to Gemini with the element description, returns a suggested selector. */
async function askGeminiForSelector(page, description, originalSelector, promptPath, apiKey) {
    const screenshotBuffer = await page.screenshot({ fullPage: false });
    const base64Screenshot = screenshotBuffer.toString('base64');
    const promptContent = readFileSync(promptPath, 'utf-8');
    const userMessage = [
        promptContent,
        '',
        '## Element to Find',
        `Description: ${description}`,
        `Original selector (no longer works): ${originalSelector}`,
        '',
        'The screenshot below shows the current state of the page.',
        'Please identify the element and return a stable Playwright locator for it.',
    ].join('\n');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
    const result = await model.generateContent([
        { text: userMessage },
        {
            inlineData: {
                mimeType: 'image/png',
                data: base64Screenshot,
            },
        },
    ]);
    const responseText = result.response.text();
    try {
        const cleaned = responseText
            .replace(/^```json\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();
        return JSON.parse(cleaned);
    }
    catch {
        console.warn('[sentinel:healer] Could not parse Gemini response:', responseText);
        return {
            found: false,
            locatorType: null,
            locatorCode: null,
            confidence: 0,
            reasoning: `Failed to parse Gemini response: ${responseText.slice(0, 200)}`,
            fallbackLocatorCode: null,
        };
    }
}
/** Converts a Gemini locatorCode string into an actual Playwright Locator. */
function resolveLocator(page, locatorCode) {
    try {
        const fn = new Function('page', `return page.${locatorCode};`);
        return fn(page);
    }
    catch (err) {
        console.warn(`[sentinel:healer] Could not resolve locator "${locatorCode}":`, err);
        return null;
    }
}
/**
 * Attempts to find an element using AI vision when a selector has broken.
 * Optionally patches the spec file with the new selector.
 */
export async function healLocator(page, options) {
    const { description, originalSelector, specFilePath, patchMode = 'auto', promptPath, apiKey = process.env.GEMINI_API_KEY, } = options;
    if (!apiKey) {
        throw new Error('[sentinel:healer] GEMINI_API_KEY is not set. ' +
            'Set it in your environment or pass it via options.apiKey.');
    }
    const resolvedPromptPath = promptPath ??
        join(process.cwd(), '.github/prompts/healing.md');
    console.log(`\n[sentinel:healer] Healing broken selector: "${originalSelector}"`);
    console.log(`[sentinel:healer] Element description: "${description}"`);
    console.log(`[sentinel:healer] Calling Gemini vision...`);
    const geminiResponse = await askGeminiForSelector(page, description, originalSelector, resolvedPromptPath, apiKey);
    if (!geminiResponse.found || !geminiResponse.locatorCode) {
        console.warn('[sentinel:healer] ❌ Gemini could not find the element on the page.');
        await appendHealingRecord({
            timestamp: new Date().toISOString(),
            description,
            originalSelector,
            newSelector: null,
            locatorType: null,
            confidence: 0,
            reasoning: geminiResponse.reasoning,
            healed: false,
            specFilePath: specFilePath ?? null,
            patchMode,
        });
        return {
            healed: false,
            locator: null,
            newSelector: null,
            confidence: 0,
            reasoning: geminiResponse.reasoning,
        };
    }
    console.log(`[sentinel:healer] ✅ Gemini found element: ${geminiResponse.locatorCode}`);
    console.log(`[sentinel:healer] Confidence: ${geminiResponse.confidence}`);
    console.log(`[sentinel:healer] Reasoning: ${geminiResponse.reasoning}`);
    // Try primary locator, fall back if it matches 0 elements
    let resolvedLocator = resolveLocator(page, geminiResponse.locatorCode);
    let usedLocatorCode = geminiResponse.locatorCode;
    if (resolvedLocator) {
        const count = await resolvedLocator.count();
        if (count === 0 && geminiResponse.fallbackLocatorCode) {
            console.warn(`[sentinel:healer] Primary matched 0 elements, trying fallback: ${geminiResponse.fallbackLocatorCode}`);
            const fallback = resolveLocator(page, geminiResponse.fallbackLocatorCode);
            if (fallback && (await fallback.count()) > 0) {
                resolvedLocator = fallback;
                usedLocatorCode = geminiResponse.fallbackLocatorCode;
            }
        }
    }
    await appendHealingRecord({
        timestamp: new Date().toISOString(),
        description,
        originalSelector,
        newSelector: usedLocatorCode,
        locatorType: geminiResponse.locatorType,
        confidence: geminiResponse.confidence,
        reasoning: geminiResponse.reasoning,
        healed: true,
        specFilePath: specFilePath ?? null,
        patchMode,
    });
    if (specFilePath && patchMode !== 'none') {
        const { patchSpecFile } = await import('./spec-patcher.js');
        await patchSpecFile({
            specFilePath,
            originalSelector,
            newLocatorCode: usedLocatorCode,
            mode: patchMode,
            description,
            confidence: geminiResponse.confidence,
            reasoning: geminiResponse.reasoning,
        });
    }
    return {
        healed: true,
        locator: resolvedLocator,
        newSelector: usedLocatorCode,
        confidence: geminiResponse.confidence,
        reasoning: geminiResponse.reasoning,
    };
}
/**
 * Wraps a Playwright action with automatic self-healing.
 * Tries the original locator first. If it fails, calls healLocator and retries.
 */
export async function withHealing(page, locator, action, options) {
    try {
        const count = await locator.count();
        if (count === 0) {
            throw new Error(`Locator matched 0 elements: ${options.originalSelector}`);
        }
        await action(locator);
    }
    catch (originalError) {
        console.warn(`[sentinel:healer] Original locator failed: "${options.originalSelector}"`, originalError instanceof Error ? originalError.message : originalError);
        const healResult = await healLocator(page, options);
        if (!healResult.healed || !healResult.locator) {
            throw new Error(`[sentinel:healer] Could not heal broken selector "${options.originalSelector}". ` +
                `Gemini reasoning: ${healResult.reasoning}`);
        }
        console.log(`[sentinel:healer] Retrying action with healed locator: ${healResult.newSelector}`);
        await action(healResult.locator);
    }
}

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
// [Config Loader Section]
/**
 * Recursively removes keys starting with "_" from an object.
 * This allows us to include comments in the JSON config by prefixing keys with "_".
 *
 * @param obj - The object to process.
 *
 * @returns A new object with all keys starting with "_" removed.
 */
function removeCommentKeys(obj) {
    if (Array.isArray(obj)) {
        return obj.map(removeCommentKeys);
    }
    if (obj && typeof obj === 'object') {
        return Object.fromEntries(Object.entries(obj)
            .filter(([key]) => !key.startsWith('_'))
            .map(([key, value]) => [key, removeCommentKeys(value)]));
    }
    return obj;
}
/**
 * Loads and parses the sentinel.config.json file.
 *
 * @returns The parsed SentinelConfig object.
 */
function loadConfig(configPath) {
    const resolvedPath = configPath ?? join(process.cwd(), 'sentinel.config.json');
    if (!existsSync(resolvedPath)) {
        throw new Error(`[sentinel:resolver] sentinel.config.json not found at ${resolvedPath}.`);
    }
    try {
        const raw = readFileSync(resolvedPath, 'utf-8');
        const parsed = JSON.parse(raw);
        return removeCommentKeys(parsed);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`[sentinel:resolver] Failed to parse sentinel.config.json: ${msg}`);
    }
}
// [Other Utils Section]
/**
 * Converts a full URL to a relative path and a name suitable for a filename.
 *
 * @example
 * urlToPage("https://example.com/") > { path: "/", name: "homepage" }
 * urlToPage("https://example.com/about") > { path: "/about", name: "about" }
 *
 * @param fullUrl - The full URL to convert.
 *
 * @returns An object containing the relative path and a name for the page.
 */
function urlToPage(fullUrl) {
    const parsed = new URL(fullUrl);
    const path = parsed.pathname || '/';
    const normalizedPath = path.length > 1 ? path.replace(/\/$/, '') : path;
    const name = normalizedPath === '/' ? 'homepage' : normalizedPath.replace(/^\//, '').replace(/\//g, '-');
    return { path: normalizedPath, name };
}
// [XML Sitemap Parser Section]
/**
 * Reads sitemap content from a local file or a URL.
 *
 * @param pathOrUrl - The file path or URL of the sitemap.
 *
 * @returns The raw XML content of the sitemap.
 */
async function readSitemapContent(pathOrUrl) {
    const auth = process.env.HTTP_AUTH_USER && process.env.HTTP_AUTH_PASSWORD
        ? {
            username: process.env.HTTP_AUTH_USER,
            password: process.env.HTTP_AUTH_PASSWORD,
        }
        : undefined;
    if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
        console.log(`[sentinel:resolver] Fetching sitemap from URL: ${pathOrUrl}`);
        const headers = {};
        if (auth) {
            const credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
            headers['Authorization'] = `Basic ${credentials}`;
        }
        const response = await fetch(pathOrUrl, { headers });
        if (!response.ok) {
            throw new Error(`[sentinel:resolver] Failed to fetch sitemap URL: ${pathOrUrl} (status ${response.status})`);
        }
        return await response.text();
    }
    const resolvedPath = existsSync(pathOrUrl) ? pathOrUrl : join(process.cwd(), pathOrUrl);
    if (!existsSync(resolvedPath)) {
        throw new Error(`[sentinel:resolver] Sitemap file not found: ${resolvedPath}`);
    }
    console.log(`[sentinel:resolver] Reading sitemap from file: ${resolvedPath}`);
    return readFileSync(resolvedPath, 'utf-8');
}
/**
 * Recursively resolves all <loc> URLs from a sitemap, including nested sitemaps.
 *
 * @param pathOrUrl - The file path or URL of the sitemap.
 * @param visited - A set of already visited sitemap URLs to prevent infinite loops.
 *
 * @returns An array of all resolved URLs found in the sitemap and its nested sitemaps.
 */
async function resolveSitemap(pathOrUrl, visited = new Set()) {
    if (visited.has(pathOrUrl)) {
        console.warn(`[sentinel:resolver] Already visited ${pathOrUrl}, skipping`);
        return [];
    }
    visited.add(pathOrUrl);
    let content = await readSitemapContent(pathOrUrl);
    const matches = [...content.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)];
    const locs = matches.map((m) => m[1].trim()).filter(Boolean);
    const results = [];
    for (const loc of locs) {
        if (/\.xml(\?|$)/i.test(loc)) {
            results.push(...await resolveSitemap(loc, visited));
        }
        else {
            results.push(loc);
        }
    }
    return [...new Set(results)];
}
/**
 * Parses a sitemap and returns all URLs found within it.
 *
 * @param pathOrUrl - The file path or URL of the sitemap.
 *
 * @returns An array of all URLs found in the sitemap.
 */
async function parseSitemap(pathOrUrl) {
    const urls = await resolveSitemap(pathOrUrl);
    if (urls.length === 0) {
        throw new Error(`[sentinel:resolver] No <loc> entries found in sitemap: ${pathOrUrl}`);
    }
    console.log(`[sentinel:resolver] Found ${urls.length} URL(s) in sitemap - ${pathOrUrl}`);
    return urls;
}
/**
 * Pairs source and target sitemap URLs by matching their path components.
 * Logs a warning for any paths that exist in one sitemap but not the other.
 *
 * @param sourceUrls - The list of URLs from the source sitemap.
 * @param targetUrls - The list of URLs from the target sitemap.
 *
 * @returns An array of MigrationPair objects for URLs that have matching paths in both sitemaps.
 */
function pairSitemapUrls(sourceUrls, targetUrls) {
    const targetMap = new Map();
    for (const url of targetUrls) {
        const path = new URL(url).pathname;
        targetMap.set(path, url);
    }
    const pairs = [];
    const unmatched = [];
    for (const sourceUrl of sourceUrls) {
        const path = new URL(sourceUrl).pathname;
        const targetUrl = targetMap.get(path);
        if (targetUrl) {
            const name = path === '/' ? 'homepage' : path.replace(/^\//, '').replace(/\//g, '-').replace(/\/$/, '');
            pairs.push({ sourceUrl, targetUrl, name });
        }
        else {
            unmatched.push(path);
        }
    }
    if (unmatched.length > 0) {
        console.warn(`[sentinel:resolver] ${unmatched.length} path(s) in source sitemap have no match in target sitemap:\n` +
            unmatched.map((p) => `  ${p}`).join('\n'));
    }
    console.log(`[sentinel:resolver] Paired ${pairs.length} URL(s) for migration comparison.`);
    return pairs;
}
// [CSV Parser Section]
/**
 * Minimal CSV parser — handles quoted fields and commas within fields.
 * Returns rows as arrays of trimmed string values.
 *
 * @param content - The raw CSV content as a string.
 *
 * @returns An array of rows, where each row is an array of field values.
 */
function parseCSV(content) {
    const rows = [];
    for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        // Skip blank lines and comment lines
        if (!line || line.startsWith('#'))
            continue;
        const fields = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            }
            else if (char === ',' && !inQuotes) {
                fields.push(current.trim());
                current = '';
            }
            else {
                current += char;
            }
        }
        fields.push(current.trim());
        rows.push(fields);
    }
    return rows;
}
function readCSV(csvPath) {
    const resolvedPath = existsSync(csvPath) ? csvPath : join(process.cwd(), csvPath);
    if (!existsSync(resolvedPath)) {
        throw new Error(`[sentinel:resolver] CSV file not found: ${resolvedPath}`);
    }
    console.log(`[sentinel:resolver] Reading CSV from: ${resolvedPath}`);
    const content = readFileSync(resolvedPath, 'utf-8');
    const rows = parseCSV(content);
    if (rows.length === 0) {
        throw new Error(`[sentinel:resolver] CSV file is empty: ${resolvedPath}`);
    }
    const headers = rows[0];
    const dataRows = rows.slice(1);
    console.log(`[sentinel:resolver] Found ${dataRows.length} row(s) in CSV.`);
    return { headers, rows: dataRows };
}
// [Main Public API Section]
/**
 * Resolves the list of pages to test for visual regression.
 *
 * Priority: sitemap > CSV > config.visual.pages
 *
 * @param configPath - Optional path to the sentinel.config.json file. If not provided, defaults to the project's root directly.
 *
 * @returns An array of VisualPage objects containing path and name for each page.
 */
export async function resolveVisualUrls(configPath) {
    const config = loadConfig(configPath);
    const { sitemap, csv, pages } = config.visual;
    // Priority 1: Sitemap
    if (sitemap.enabled) {
        console.log('[sentinel:resolver] Source: sitemap (visual)');
        const urls = await parseSitemap(sitemap.path);
        return urls.map((url) => urlToPage(url));
    }
    // Priority 2: CSV
    if (csv.enabled) {
        console.log('[sentinel:resolver] Source: CSV (visual)');
        const { headers, rows } = readCSV(csv.path);
        const colIndex = headers.indexOf(csv.column);
        if (colIndex === -1) {
            throw new Error(`[sentinel:resolver] Column "${csv.column}" not found in CSV headers: [${headers.join(', ')}]`);
        }
        return rows
            .map((row) => row[colIndex])
            .filter(Boolean)
            .map((url) => urlToPage(url));
    }
    // Priority 3: Config fallback
    console.log(`[sentinel:resolver] Source: config fallback (${pages.length} page(s))`);
    return pages;
}
/**
 * Resolves the list of URL pairs to test for migration comparison.
 *
 * Priority: sitemaps > CSV > config.migration.pairs
 *
 * @param configPath - Optional path to the sentinel.config.json file. If not provided, defaults to the project's root directly.
 *
 * @returns An array of MigrationPair objects containing sourceUrl, targetUrl, and name for each pair.
 */
export async function resolveMigrationUrls(configPath) {
    const config = loadConfig(configPath);
    const { sitemaps, csv, pairs } = config.migration;
    // Priority 1: Sitemaps
    if (sitemaps.enabled) {
        console.log('[sentinel:resolver] Source: sitemaps (migration)');
        const [sourceUrls, targetUrls] = await Promise.all([
            parseSitemap(sitemaps.sourcePath),
            parseSitemap(sitemaps.targetPath),
        ]);
        return pairSitemapUrls(sourceUrls, targetUrls);
    }
    // Priority 2: CSV
    if (csv.enabled) {
        console.log('[sentinel:resolver] Source: CSV (migration)');
        const { headers, rows } = readCSV(csv.path);
        const sourceColIndex = headers.indexOf(csv.sourceColumn);
        const targetColIndex = headers.indexOf(csv.targetColumn);
        if (sourceColIndex === -1) {
            throw new Error(`[sentinel:resolver] Source column "${csv.sourceColumn}" not found in CSV headers: [${headers.join(', ')}]`);
        }
        if (targetColIndex === -1) {
            throw new Error(`[sentinel:resolver] Target column "${csv.targetColumn}" not found in CSV headers: [${headers.join(', ')}]`);
        }
        return rows
            .filter((row) => row[sourceColIndex] && row[targetColIndex])
            .map((row) => {
            const sourceUrl = row[sourceColIndex];
            const targetUrl = row[targetColIndex];
            const path = new URL(sourceUrl).pathname;
            const name = path === '/' ? 'homepage' : path.replace(/^\//, '').replace(/\//g, '-').replace(/\/$/, '');
            return { sourceUrl, targetUrl, name };
        });
    }
    // Priority 3: Config fallback
    console.log(`[sentinel:resolver] Source: config fallback (${pairs.length} pair(s))`);
    return pairs;
}

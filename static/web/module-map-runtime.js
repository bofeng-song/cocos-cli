/* global fetch, URL, console */

// QuickPack placeholders are ordinary scoped imports, not proof of missing source files.
export function findPackMapping(map, specifier, importer, baseURL) {
    const scopes = Object.entries(map.scopes || {})
        .map(([scope, imports]) => [new URL(scope, baseURL).href, imports])
        .filter(([scope]) => importer === scope || (scope.endsWith('/') && importer.startsWith(scope)))
        .sort((a, b) => b[0].length - a[0].length);
    for (const [, imports] of scopes) {
        if (Object.prototype.hasOwnProperty.call(imports, specifier)) {
            return typeof imports[specifier] === 'string' ? new URL(imports[specifier], baseURL).href : undefined;
        }
    }
    return undefined;
}

export function installModuleMapDiagnostics(system, serverURL) {
    if (system.__pinkModuleMapDiagnostics) return;
    system.__pinkModuleMapDiagnostics = true;
    const resolve = system.resolve;
    let pending;
    const freshMap = () => {
        if (!pending) {
            pending = fetch(new URL('/scripting/x/pack-import-map-url', serverURL), { cache: 'no-store' })
                .then(response => {
                    if (!response.ok) throw new Error('Import map HTTP ' + response.status);
                    return response.json();
                }).finally(() => { pending = undefined; });
        }
        return pending;
    };
    system.resolve = async function (specifier, importer, ...rest) {
        try {
            return await resolve.call(this, specifier, importer, ...rest);
        } catch (original) {
            if (!/^__unresolved_\d+$/.test(specifier) || typeof importer !== 'string') throw original;
            let mapped;
            try {
                const map = await freshMap();
                mapped = findPackMapping(map, specifier, importer, new URL('/', serverURL).href);
            } catch (error) {
                console.warn('[ScriptModuleRuntimeError] Could not refresh import map:', error);
            }
            let diagnostic;
            try {
                const url = new URL('/scripting/module-diagnostic', serverURL);
                url.searchParams.set('chunk', importer);
                url.searchParams.set('specifier', specifier);
                const response = await fetch(url, { cache: 'no-store' });
                if (response.ok) diagnostic = await response.json();
            } catch { /* Preserve the original error if diagnostics are unavailable. */ }
            const details = diagnostic
                ? `\nSource: ${diagnostic.source}\nImport: ${diagnostic.import}\nLocation: ${diagnostic.line || '?'}:${diagnostic.column || '?'}`
                : `\nChunk: ${importer}\nSpecifier: ${specifier}`;
            if (mapped) {
                console.warn('[ScriptModuleMapRecovered] Resolution failed with the active map; the latest server map contains the mapping.' + details);
                return mapped;
            }
            const error = new Error(String(original && original.message || original) + '\n[ScriptModuleRuntimeError]' + details);
            error.cause = original;
            throw error;
        }
    };
}

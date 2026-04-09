const { rollup } = require('rollup');
const commonjs = require('@rollup/plugin-commonjs');
const { nodeResolve } = require('@rollup/plugin-node-resolve');
const virtual = require('@rollup/plugin-virtual');
const json = require('@rollup/plugin-json');
const path = require('path');

async function buildSceneBundle() {
    const workspaceDir = path.join(__dirname, '..');
    const sceneProcessDir = path.join(workspaceDir, 'dist', 'core', 'scene', 'scene-process').replace(/\\/g, '/');
    const serviceDir = path.join(sceneProcessDir, 'service').replace(/\\/g, '/');
    const indexFile = path.join(serviceDir, 'index.js').replace(/\\/g, '/');
    const managerFile = path.join(serviceDir, 'service-manager.js').replace(/\\/g, '/');
    const decoratorFile = path.join(serviceDir, 'core', 'decorator.js').replace(/\\/g, '/');
    const editorExtendsFile = path.join(workspaceDir, 'dist', 'core', 'engine', 'editor-extends', 'index.js').replace(/\\/g, '/');

    console.log('[Build] Bundling scene services for preview...');

    const bundle = await rollup({
        input: 'entry',
        external: (id) => {
            if (id === 'cc') return true;
            return false;
        },
        plugins: [
            json(),
            virtual({
                'setup-globals': `
                    import * as EditorExtendsLocal from '${editorExtendsFile}';
                    globalThis.EditorExtends = EditorExtendsLocal;
                    export { EditorExtendsLocal };
                `,
                entry: `
                    import { EditorExtendsLocal as EditorExtends } from 'setup-globals';
                    import { serviceManager } from '${managerFile}';
                    import { Service as DecoratorService } from '${decoratorFile}';
                    import '${indexFile}';

                    export { serviceManager, EditorExtends };
                    export const Service = DecoratorService;

                    export async function startup(config) {
                        const { enginePath, projectPath, serverURL, defaultConfig, modules } = config;
                        serviceManager.initialize(serverURL);

                        const requiredModules = [
                                                    'cc',
                                                    'cc/editor/populate-internal-constants',
                                                    'cc/editor/serialization',
                                                    'cc/editor/new-gen-anim',
                                                    'cc/editor/embedded-player',
                                                    'cc/editor/reflection-probe',
                                                    'cc/editor/lod-group-utils',
                                                    'cc/editor/material',
                                                    'cc/editor/2d-misc',
                                                    'cc/editor/offline-mappings',
                                                    'cc/editor/custom-pipeline',
                                                    'cc/editor/animation-clip-migration',
                                                    'cc/editor/exotic-animation',
                                                    'cc/editor/color-utils',
                                                ];
                        // IMPORTANT: We must NOT use import() here because Rollup's
                        // resolveId hook aliases cc/editor/* to a cc re-export stub,
                        // which means the real engine side-effect modules never load
                        // (e.g. cc.deserialize._macros never gets populated).
                        //
                        // We also cannot use System.import() directly because it lacks
                        // the correct parentURL context for import-map resolution.
                        //
                        // Solution: use __moduleImport(id), a placeholder that the
                        // renderChunk plugin replaces with module.import(id) — the
                        // SystemJS module-scoped import that has the right resolution
                        // context and bypasses Rollup's resolveId entirely.
                        for (const mod of requiredModules) {
                            try {
                                await __moduleImport(mod);
                            } catch (e) {
                                console.error('Failed to load engine module:', mod, 'e:', e);
                            }
                        }

                        const baseUrl = import.meta.url.substring(0, import.meta.url.lastIndexOf('/static/preview'));
                        const webAdapter = new URL('/scripting/engine/bin/.editor/web-adapter.js', baseUrl).href;
                       // await import(webAdapter);
                        const engineAdapter = new URL('/scripting/engine/bin/.editor/engine-adapter.js', baseUrl).href;
                       // await import(engineAdapter);

                        // EditorExtends is already on globalThis now
                        if (EditorExtends.UuidUtils) {
                            EditorExtends.UuidUtils.compressUuid = EditorExtends.UuidUtils.compressUUID;
                        }
                        globalThis.cce = globalThis.cce || {};
                        globalThis.cce.Script = DecoratorService.Script;

                       // await DecoratorService.Engine.init();
                        if (EditorExtends.init) {
                            await EditorExtends.init();
                        }

                        await System.import('cc');
                        cc.physics.selector.runInEditor = true;
                        await cc.game.init(defaultConfig);
                        
                        let backend = 'builtin';
                        const Backends = {
                            'physics-cannon': 'cannon.js',
                            'physics-ammo': 'bullet',
                            'physics-builtin': 'builtin',
                            'physics-physx': 'physx',
                        };
                        modules.forEach((m) => {
                            if (m in Backends) {
                                backend = Backends[m];
                            }
                        });

                        // 切换物理引擎
                        cc.physics.selector.switchTo(backend);

                        await cc.game.run(async () => {
                            cc.game.pause();
                        });
                    }
                `
            }),
            {
                // Provide a dummy __moduleImport function that Rollup can resolve.
                // The renderChunk plugin below replaces calls to it with module.import()
                // in the final SystemJS output.
                name: 'module-import-placeholder',
                resolveId(id) {
                    if (id === '__moduleImport') return '\0__moduleImport';
                    return null;
                },
                load(id) {
                    if (id === '\0__moduleImport') {
                        return 'export default function __moduleImport(id) { return import(id); }';
                    }
                    return null;
                },
            },
            {
                name: 'smart-node-builtins',
                resolveId(id) {
                    const stubs = [
                        'fs', 'node:fs', 'fs-extra', 'lodash', 'package.json', '@cocos/asset-db', 
                        '@cocos/creator-programming-quick-pack', '@cocos/creator-programming-quick-pack/lib/loader',
                        'constants', 'stream', 'assert', 'crypto', 'child_process', 'vm', 'buffer', 
                        'tty', 'zlib', 'http', 'https', 'net', 'tls', 'dns', 'readline', 'punycode', 
                        'cc/mods-mgr', 'inherits', 'sys'
                    ];
                    if (stubs.includes(id)) {
                        return '\0smart-' + id;
                    }
                    if (['cc/preload', 'cc/editor/populate-internal-constants', 'cc/editor/serialization', 'cc/env', 'cce.env'].includes(id)) {
                        return '\0alias-cc-' + id;
                    }
                    
                    const polyfills = {
                        events: path.join(workspaceDir, 'node_modules', 'events', 'events.js'),
                        path: path.join(workspaceDir, 'node_modules', 'path-browserify', 'index.js'),
                        url: path.join(workspaceDir, 'node_modules', 'url', 'url.js'),
                        util: path.join(workspaceDir, 'node_modules', 'util', 'util.js'),
                        os: path.join(workspaceDir, 'node_modules', 'os-browserify', 'main.js'),
                        'reflect-metadata': path.join(workspaceDir, 'node_modules', 'reflect-metadata', 'Reflect.js')
                    };
                    if (polyfills[id]) {
                        return polyfills[id];
                    }

                    if (id.endsWith('/package.json')) {
                        return '\0smart-' + id;
                    }
                    return null;
                },
                load(id) {
                    if (id.startsWith('\0smart-')) {
                        const originalId = id.substring('\0smart-'.length);
                        return `
                            let realMod = {};
                            const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';
                            const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
                            // Allow explicit override via global flag
                            const useRealNode = (isNode && !isBrowser && globalThis.__ENABLE_NODE_BUILTINS__ !== false) || globalThis.__ENABLE_NODE_BUILTINS__ === true;
                            
                            if (useRealNode) {
                                // Dynamic require to hide it from static analysis
                                const req = typeof require !== 'undefined' ? require : (typeof _cc_require !== 'undefined' ? _cc_require : null);
                                if (req) {
                                    try {
                                        const modName = '${originalId.startsWith('node:') ? originalId.substring(5) : originalId}';
                                        realMod = req(modName);
                                    } catch(e) {
                                        console.warn('Smart polyfill: failed to require ${originalId}');
                                    }
                                }
                            }
                            
                            export const existsSync = realMod.existsSync || function() { return false; };
                            export const readFileSync = realMod.readFileSync || function() { return ''; };
                            export const writeFileSync = realMod.writeFileSync || function() {};
                            export const remove = realMod.remove || async function() {};
                            export const readJSON = realMod.readJSON || async function() { return {}; };
                            export const statSync = realMod.statSync || function() { return { isFile: () => false, isDirectory: () => false }; };
                            
                            export default new Proxy({}, {
                                get(target, prop) {
                                    if (prop === 'existsSync') return existsSync;
                                    if (prop === 'readFileSync') return readFileSync;
                                    if (prop === 'writeFileSync') return writeFileSync;
                                    if (prop === 'remove') return remove;
                                    if (prop === 'readJSON') return readJSON;
                                    if (prop === 'statSync') return statSync;
                                    
                                    if (realMod && prop in realMod) {
                                        return realMod[prop];
                                    }
                                    
                                    // Fallback for missing methods
                                    if (typeof prop === 'string') {
                                        return function() {};
                                    }
                                    return undefined;
                                }
                            });
                        `;
                    }
                    if (id.startsWith('\0alias-cc-')) {
                        return `import * as cc from 'cc';\nexport * from 'cc';\nexport default cc;`;
                    }
                    return null;
                }
            },
            {
                // Post-process: fix default import interop for external ESM modules (like cc)
                // that are loaded via SystemJS but don't have a "default" export.
                // Rollup emits: `require$$0__default = module["default"]`
                // but cc's SystemJS registration has no default export.
                // Fix: `module["default"] || module`
                name: 'fix-external-default-interop',
                renderChunk(code) {
                    let fixed = code.replace(/= module\["default"\];/g, '= module["default"] || module;');
                    // Fix url polyfill missing the URL constructor
                    fixed = fixed.replace(/url_1\.URL/g, 'window.URL');
                    // Replace __moduleImport(x) placeholder with module.import(x).
                    // Rollup inlines the placeholder as a regular function, but we
                    // need the SystemJS module-scoped import for correct resolution.
                    // Match patterns like: __moduleImport$1(mod) or __moduleImport(mod)
                    fixed = fixed.replace(/\b__moduleImport(?:\$\d+)?\s*\(/g, 'module.import(');
                    return { code: fixed, map: null };
                }
            },
            nodeResolve({
                preferBuiltins: true,
                browser: true,
            }),
            commonjs(),
        ],
    });

    const bundleOutputFile = path.join(workspaceDir, 'static', 'preview', 'scene-bundle.js');
    await bundle.write({
        file: bundleOutputFile,
        format: 'system',
        sourcemap: true,
    });

    console.log('[Build] Successfully bundled to', bundleOutputFile);
}

buildSceneBundle().catch(err => {
    console.error('Failed to bundle scene services:', err);
    process.exit(1);
});

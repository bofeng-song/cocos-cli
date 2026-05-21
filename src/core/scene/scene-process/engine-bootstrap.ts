import * as EditorExtends from '../../engine/editor-extends';
import { Rpc } from './rpc';
import { serviceManager } from './service/service-manager';
import { Service as DecoratorService } from './service/core/decorator';
import { ServiceEvents } from './service/core/global-events';

import './service';

// Patch UuidUtils for casing compatibility
if (EditorExtends.UuidUtils) {
    const U = EditorExtends.UuidUtils as any;
    U.decompressUuid = U.decompressUuid || U.decompressUUID;
    U.compressUuid = U.compressUuid || U.compressUUID;
    U.isUuid = U.isUuid || U.isUUID;
    U.uuid = U.uuid || U.generate;
}

(globalThis as any).EditorExtends = EditorExtends;

export { serviceManager, EditorExtends };
export const Service = DecoratorService;

declare const cc: any;

export async function startup(options: {
    serverURL: string;
}) {
    const defaultConfig = await fetch('/scripting/engine/game-config');
    const config = await defaultConfig.json();
    const modules = await fetch('/scripting/engine/modules');
    const features = (await modules.json()) as string[];
    const { serverURL } = options;

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
    // which means the real engine side-effect modules never load.
    // We use the __moduleImport placeholder which is replaced with SystemJS's module.import().
    for (const mod of requiredModules) {
        try {
            await System.import(mod);
        } catch (e) {
            console.error('Failed to load engine module:', mod, 'e:', e);
        }
    }

    // Get decodeCCONBinary for CCONB binary format support (.bin library files)
    let decodeCCONBinary: ((bytes: Uint8Array) => any) | null = null;
    try {
        const cconModule: any = await System.import('cc/editor/serialization');
        decodeCCONBinary = cconModule?.decodeCCONBinary ?? null;
    } catch { /* module may not be available */ }

    // ---- hack creator 使用的一些 engine 参数
    await import('cc/polyfill/engine');
    // overwrite
    const overwrite = await import('cc/overwrite');
    const handle = overwrite.default || overwrite;
    if (typeof handle === 'function') {
        handle(cc);
    }

    (globalThis as any).cce = (globalThis as any).cce || {};
    (globalThis as any).cce.Script = DecoratorService.Script;
    (globalThis as any).cli = {};
    (globalThis as any).cli.Scene = DecoratorService;
    (globalThis as any).cli.SceneEvents = ServiceEvents;

    if (EditorExtends.init) {
        await EditorExtends.init();
    }
    await Rpc.startup({ serverURL });

    cc.physics.selector.runInEditor = true;

    await cc.game.init(config);

    let backend = 'builtin';
    const Backends: Record<string, string> = {
        'physics-cannon': 'cannon.js',
        'physics-ammo': 'bullet',
        'physics-builtin': 'builtin',
        'physics-physx': 'physx',
    };
    features.forEach((m: string) => {
        if (m in Backends) {
            backend = Backends[m];
        }
    });

    // 切换物理引擎
    cc.physics.selector.switchTo(backend);
    const dr = config?.overrideSettings?.screen?.designResolution;
    const drWidth = dr?.width ?? 1280;
    const drHeight = dr?.height ?? 720;
    let drPolicy = cc.ResolutionPolicy.SHOW_ALL;
    if (dr) {
        const fw = dr.fitWidth !== false;
        const fh = dr.fitHeight === true;
        if (fw && !fh) drPolicy = cc.ResolutionPolicy.FIXED_WIDTH;
        else if (!fw && fh) drPolicy = cc.ResolutionPolicy.FIXED_HEIGHT;
    }
    cc.view.setDesignResolutionSize(drWidth, drHeight, drPolicy);

    await cc.game.run();
    // Stop the engine's built-in mainLoop immediately — it would render frames
    // without a loaded scene, causing FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT.
    // Our own edit-mode tick loop (Engine.startTick) takes over later.
    cc.game.pause();

    // Load and register all effect assets so materials (e.g. builtin-standard)
    // are available before preview services initialize.
    await (async () => {
        try {
            const res = await fetch('/query-asset-infos/cc.EffectAsset');
            if (!res.ok) return;
            const effectInfos: any[] = await res.json();
            if (!effectInfos.length) return;
            const classFinder = (id: string): any => cc.js?.getClassById?.(id) ?? null;
            await Promise.all(effectInfos.map(async (info: any) => {
                try {
                    const uuid: string = info.uuid;
                    if (!uuid) return;
                    const lib = info.library;
                    if (!lib || (!lib['.json'] && !lib['.bin'])) return;

                    const encodedUuid = encodeURIComponent(uuid);
                    const ext = (lib['.bin'] && !lib['.json']) ? 'bin' : 'json';

                    const r = await fetch(`/import/${encodedUuid}.${ext}?isBrowser=true`);
                    if (!r.ok) return;

                    const isBinary = ext === 'bin';
                    let deserializeData: any;
                    if (isBinary && decodeCCONBinary) {
                        deserializeData = decodeCCONBinary(new Uint8Array(await r.arrayBuffer()));
                    } else {
                        deserializeData = await r.json();
                    }

                    const asset = cc.deserialize(deserializeData, undefined, { classFinder });
                    asset._uuid = uuid;
                    cc.assetManager.assets.add(uuid, asset);
                    try {
                        if (asset.onLoaded) asset.onLoaded();
                    } catch (e) {
                        console.warn(`[Effects] onLoaded failed for ${asset._name || uuid}:`, e);
                        try { cc.EffectAsset.register(asset); } catch {}
                    }
                } catch { /* skip individual effect */ }
            }));
            const count = Object.keys(cc.EffectAsset.getAll()).length;
            console.log(`[Effects] Registered ${count} effects`);
        } catch (e: any) {
            console.warn('[Effects] Failed to load effects:', e);
        }
    })();

    function stripNullComponents(node: any) {
        if (node._components) {
            node._components = node._components.filter((c: any) => c != null);
        }
        if (node._children) {
            for (const child of node._children) {
                stripNullComponents(child);
            }
        }
    }

    const origRunSceneImmediate = cc.director.runSceneImmediate.bind(cc.director);
    cc.director.runSceneImmediate = function (scene: any, ...args: any[]) {
        stripNullComponents(scene);
        return origRunSceneImmediate(scene, ...args);
    };

    await DecoratorService.Engine.init();
    // Pause the custom tick loop during service initialization — preview
    // services create cameras that would otherwise render on mainWindow
    // before any scene is loaded, causing FRAMEBUFFER_INCOMPLETE errors.
    DecoratorService.Engine.pause();
    await serviceManager.initAllServices();

    // Override assetManager.loadAny to fetch project assets from the server
    // when they aren't found in any loaded bundle (e.g., main bundle not loaded).
    const am = cc.assetManager;
    const origLoadAny = am.loadAny.bind(am);

    function tryDecompress(uuid: string): string {
        if (uuid.includes('-')) return uuid;
        try {
            return (EditorExtends.UuidUtils as any)?.decompressUuid?.(uuid) ?? uuid;
        } catch { return uuid; }
    }

    function isUuidInBundles(uuid: string): boolean {
        const variants = [uuid, uuid.split('@')[0]];
        const dec = tryDecompress(uuid);
        if (dec !== uuid) variants.push(dec, dec.split('@')[0]);

        let found = false;
        am.bundles.forEach((bundle: any) => {
            if (found) return;
            for (const v of variants) {
                if (bundle.getAssetInfo(v)) { found = true; return; }
            }
        });
        return found;
    }

    const silentClassFinder = (id: string) => cc.js?.getClassById?.(id) ?? cc._MissingScript ?? null;

    async function loadNativeAsset(asset: any, uuid: string): Promise<void> {
        const nativeExt: string | undefined = asset._native;
        if (!nativeExt) return;

        const encodedUuid = encodeURIComponent(uuid);
        const isSubAsset = nativeExt.length > 0 && nativeExt[0] !== '.';
        const nativeUrl = isSubAsset
            ? `/native/${encodedUuid}/${nativeExt}?isBrowser=true`
            : `/native/${encodedUuid}${nativeExt}?isBrowser=true`;

        try {
            const res = await fetch(nativeUrl);
            if (!res.ok) return;

            const ext = nativeExt.split('.').pop()?.toLowerCase() ?? '';
            const imageExts = ['png', 'jpg', 'jpeg', 'bmp', 'webp', 'gif'];

            if (imageExts.includes(ext)) {
                const blob = await res.blob();
                const img = new Image();
                img.crossOrigin = 'anonymous';
                await new Promise<void>((resolve, reject) => {
                    img.onload = () => resolve();
                    img.onerror = reject;
                    img.src = URL.createObjectURL(blob);
                });
                asset._nativeAsset = img;
            } else {
                asset._nativeAsset = await res.arrayBuffer();
            }
        } catch { /* native data unavailable */ }
    }

    async function loadFromServer(uuid: string, onComplete: any) {
        try {
            const encodedUuid = encodeURIComponent(uuid);

            // Query the correct file extension — assets may be stored as
            // binary (.bin/cconb) instead of .json.
            let ext = 'json';
            try {
                const extRes = await fetch(`/query-extname/${encodedUuid}`);
                const queryExt = (await extRes.text()).trim();
                if (queryExt === '.cconb') ext = 'bin';
            } catch { /* default to json */ }

            const res = await fetch(`/import/${encodedUuid}.${ext}?isBrowser=true`);
            if (!res.ok) throw new Error(`Asset fetch failed (${res.status}): ${uuid}`);

            const isBinary = ext === 'bin';
            let deserializeInput: any;
            if (isBinary) {
                const rawBytes = new Uint8Array(await res.arrayBuffer());
                if (decodeCCONBinary) {
                    deserializeInput = decodeCCONBinary(rawBytes);
                } else {
                    console.warn(`[loadFromServer] decodeCCONBinary not available, cannot decode CCONB for ${uuid}`);
                    onComplete?.(new Error('decodeCCONBinary not available'), null);
                    return;
                }
            } else {
                deserializeInput = await res.json();
            }

            const Details = cc.deserialize?.Details;
            let asset;
            const deserializeOpts = { classFinder: silentClassFinder };

            if (Details) {
                const details = Details.pool?.get?.() ?? new Details();
                if (details.reset) details.reset();
                asset = cc.deserialize(deserializeInput, details, deserializeOpts);

                const uuidList = details.uuidList;
                if (uuidList && uuidList.length > 0) {
                    const depMap: Record<string, any> = {};
                    await Promise.all(
                        uuidList
                            .filter((id: any) => typeof id === 'string')
                            .map((depUuid: string) => new Promise<void>((resolve) => {
                                am.loadAny(depUuid, (err: any, depAsset: any) => {
                                    if (!err && depAsset) depMap[depUuid] = depAsset;
                                    resolve();
                                });
                            })),
                    );
                    if (details.assignAssetsBy) {
                        details.assignAssetsBy((depUuid: string) => depMap[depUuid] ?? null);
                    }
                }
                Details.pool?.put?.(details);
            } else {
                asset = cc.deserialize(deserializeInput, undefined, deserializeOpts);
            }

            asset._uuid = uuid;
            am.assets.add(uuid, asset);
            stripNullComponents(asset);
            if (asset.data) stripNullComponents(asset.data);
            await loadNativeAsset(asset, uuid);
            try { if (asset.onLoaded) asset.onLoaded(); } catch { /* some assets need specific native data */ }
            onComplete?.(null, asset);
        } catch (e: any) {
            console.warn(`[AssetFallback] load failed for ${uuid}:`, e);
            onComplete?.(e, null);
        }
    }

    am.loadAny = function (requests: any, options: any, onComplete: any) {
        if (typeof options === 'function') {
            onComplete = options;
            options = null;
        }
        const uuid = typeof requests === 'string' ? requests
            : Array.isArray(requests) ? requests[0]
            : requests?.uuid || requests;

        if (typeof uuid === 'string' && !isUuidInBundles(uuid)) {
            const dec = tryDecompress(uuid);
            const cached = am.assets.get(uuid) ?? am.assets.get(dec);
            if (cached) {
                onComplete?.(null, cached);
                return;
            }
            loadFromServer(uuid, onComplete);
            return;
        }
        origLoadAny(requests, options, onComplete);
    };

    const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement | null;
    if (canvas && DecoratorService.Operation) {
        await new Promise<void>((resolve, reject) => {
            const s = document.createElement('script');
            s.src = '/static/web/input-bridge.js';
            s.onload = () => resolve();
            s.onerror = reject;
            document.head.appendChild(s);
        });
        (globalThis as any).setupInputBridge({
            canvas,
            operation: DecoratorService.Operation,
            engine: DecoratorService.Engine,
        });
    }
}

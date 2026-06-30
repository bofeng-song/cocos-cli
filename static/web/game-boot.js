/* global window, document, System, globalThis, fetch, location */

/**
 * 浏览器游戏预览运行时引导。
 *
 * 前半段（SystemJS + import-map + 引擎加载）与场景编辑器的 scene-editor-boot.js 一致；
 * 区别在于结尾：这里调用 cc.game.init(settings) 并运行启动场景，而不是加载场景编辑器 bundle。
 * 流程对齐编辑器 preview-app/src/main.ts。
 */
export default async function gameBoot() {
    const showError = (e) => {
        const el = document.getElementById('error');
        if (el) {
            el.style.display = 'block';
            el.textContent = (e && (e.stack || e.message)) || String(e);
        }
    };

    try {
        const env = window.WebEnv;
        const envRes = await fetch(`${env.serverURL}/scripting/web-env`);
        Object.assign(env, await envRes.json());

        await import('/static/web/polyfills.bundle.js');
        await import('/scripting/systemjs/system.js');
        await import('/scripting/systemjs/extras/named-register.js');

        // 注入 import map。动态注入外部 src import-map 存在时序问题（System.import 可能
        // 在其 fetch 完成前就解析 'cc'），因此先 fetch 再以内联方式注入，保证同步解析就绪。
        const sources = [
            '/scripting/engine-dist/import-map.json',
            '/scripting/x/pack-import-map-url',
            '/scripting/import-map-global'
        ];
        for (const src of sources) {
            const res = await fetch(new URL(src, env.serverURL));
            const text = await res.text();
            const script = document.createElement('script');
            script.type = 'systemjs-importmap';
            script.textContent = text;
            document.head.appendChild(script);
        }

        System.setResolutionDetailMapCallback(function () {
            const url = new URL('/scripting/x/resolution-detail-map', env.serverURL);
            return fetch(url).then((response) => response.json()).then((json) => ({ json, url: url.href }));
        });

        await import('/static/web/editor-stub-preload.js');
        // 游戏预览必须以 PREVIEW 模式运行，而不是编辑器编辑模式。
        // editor-stub-preload 会设置 window.CC_EDITOR=true（场景编辑器预览需要），
        // 但在游戏预览里这会让引擎 internal:constants 解析出 EDITOR=true，
        // 进而 physics-selector 的 runInEditor=!EDITOR=false，导致物理世界不被创建
        // （PhysicsSystem.physicsWorld 为 null，setDefaultPhysicsMaterial 崩溃）。
        // 这里在引擎加载前覆盖为 PREVIEW 模式：EDITOR=false / PREVIEW=true。
        window.CC_EDITOR = false;
        window.CC_PREVIEW = true;
        await import('/static/web/editor-extends.bundle.js');
        await import('/scripting/engine-dist/bundled/index.js');

        const _originalSystem = System;
        const cc = await System.import('cc');
        globalThis.System = _originalSystem;

        // 监听热重载（脚本/资源变化后服务端广播 browser:reload）
        try {
            if (window.io) {
                const socket = window.io(env.serverURL);
                socket.on('browser:reload', () => location.reload());
            }
        } catch (e) {
            console.warn('[Game Preview] live-reload socket unavailable:', e);
        }

        const settings = window._CCSettings || {};
        let launchScene = (settings.launch && settings.launch.launchScene) || '';
        // 启动场景以浏览器地址栏的 ?scene= 为准（uuid 或 db:// url）；
        // 其次用服务端注入的 __launchSceneQuery；都没有时回退到 settings 里的默认场景。
        const sceneOverride = new URLSearchParams(window.location.search).get('scene')
            || new URLSearchParams(window.__launchSceneQuery || '').get('scene');
        if (sceneOverride) {
            launchScene = sceneOverride;
        }

        // 构建引擎启动选项：以 settings 为基础，覆盖资源路径与启动场景（对齐编辑器 main.ts）
        const option = {
            debugMode: (cc.debug && cc.debug.DebugMode && cc.debug.DebugMode.INFO) || 1,
            overrideSettings: Object.assign({}, settings),
        };
        option.overrideSettings.assets = Object.assign({}, option.overrideSettings.assets, {
            // 资源全部由预览服务器动态托管，覆盖掉项目构建配置里可能存在的远程 server 地址
            server: env.serverURL,
            importBase: 'assets/general/import',
            nativeBase: 'assets/general/native',
            remoteBundles: [],
            subpackages: [],
        });
        option.overrideSettings.launch = Object.assign({}, option.overrideSettings.launch, {
            launchScene: '',
        });
        // 强制使用 WebGL 渲染（LegacyRenderMode.WEBGL = 2）。
        // 预览运行在 PREVIEW 模式（EDITOR=false），引擎 device-manager 在 AUTO 模式下
        // 会优先选 WebGPU（!EDITOR && supportWebGPU），而 dev-cli 引擎的 WebGPU 路径存在
        // 管线/绑定问题（vertex UBO 超 12 上限、cubemap 绑到 2D 槽）导致黑屏。
        // 编辑器预览同样走 WebGL，这里与之对齐。
        option.overrideSettings.rendering = Object.assign({}, option.overrideSettings.rendering, {
            renderMode: 2,
        });

        await cc.game.init(option);

        await cc.game.run(async () => {
            cc.game.pause();
            const json = await (await fetch(`${env.serverURL}/scene/${encodeURIComponent(launchScene)}.json`)).json();
            try {
                launchScene = json[1]._id;
            } catch (e) {
                // ignore
            }
            cc.assetManager.loadWithJson(
                json,
                { assetId: launchScene },
                () => { /* progress */ },
                (err, sceneAsset) => {
                    if (err) {
                        showError(err);
                        cc.error(err);
                        return;
                    }
                    const scene = sceneAsset.scene;
                    scene._name = sceneAsset._name;
                    cc.director.runSceneImmediate(scene, () => {
                        cc.game.resume();
                    });
                }
            );
        });

        console.log('Cocos game preview started');
    } catch (err) {
        console.error('Failed to start game preview:', err.stack || err);
        showError(err);
    }
}

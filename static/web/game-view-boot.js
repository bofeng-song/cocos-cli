/* global window, document, System, globalThis, fetch, location */

/**
 * 编辑器内运行视图（GameView）运行时引导。
 *
 * 引擎初始化与浏览器游戏预览 game-boot.js 完全一致（CC_EDITOR=false / CC_PREVIEW=true），
 * 因此运行视图的性能特征与真预览完全一致。区别在于：
 *   - 初始化后不自动加载启动场景，进入「待命」（pause）；
 *   - 通过 socket 事件 `gameview:play` 接收「编辑器 realm 序列化的当前场景快照」并运行；
 *   - `gameview:stop` 整页重载回到待命，丢弃运行副作用。
 */
export default async function gameViewBoot() {
    const showError = (e) => {
        const el = document.getElementById('error');
        if (el) {
            el.style.display = 'block';
            el.textContent = (e && (e.stack || e.message)) || String(e);
        }
    };
    const setIdle = (visible) => {
        const el = document.getElementById('idle');
        if (el) {
            el.style.display = visible ? 'flex' : 'none';
        }
    };

    try {
        const env = window.WebEnv;
        const envRes = await fetch(`${env.serverURL}/scripting/web-env`);
        Object.assign(env, await envRes.json());

        await import('/static/web/polyfills.bundle.js');
        await import('/scripting/systemjs/system.js');
        await import('/scripting/systemjs/extras/named-register.js');

        // 注入 import map（与 game-boot 一致）：先 fetch 再内联注入，保证同步解析就绪
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
        // 运行视图必须以 PREVIEW 模式运行（EDITOR=false / PREVIEW=true），与真预览一致，
        // 由此 EDITOR_NOT_IN_PREVIEW 恒为 false，性能特征与发布版/真预览完全一致。
        window.CC_EDITOR = false;
        window.CC_PREVIEW = true;
        await import('/static/web/editor-extends.bundle.js');
        await import('/scripting/engine-dist/bundled/index.js');

        const _originalSystem = System;
        const cc = await System.import('cc');
        globalThis.System = _originalSystem;

        // 构建引擎启动选项（与 game-boot 一致：资源由预览服务器动态托管，强制 WebGL）
        const settings = window._CCSettings || {};
        const option = {
            debugMode: (cc.debug && cc.debug.DebugMode && cc.debug.DebugMode.INFO) || 1,
            overrideSettings: Object.assign({}, settings),
        };
        option.overrideSettings.assets = Object.assign({}, option.overrideSettings.assets, {
            // 资源由预览服务器在根路径动态托管（与浏览器游戏预览一致）；GameView 中间件在场景中间件之前注册以优先匹配
            server: env.serverURL,
            importBase: 'assets/general/import',
            nativeBase: 'assets/general/native',
            remoteBundles: [],
            subpackages: [],
        });
        option.overrideSettings.launch = Object.assign({}, option.overrideSettings.launch, {
            launchScene: '',
        });
        // 强制 WebGL（LegacyRenderMode.WEBGL = 2），与 game-boot 对齐，规避 WebGPU 黑屏
        option.overrideSettings.rendering = Object.assign({}, option.overrideSettings.rendering, {
            renderMode: 2,
        });

        await cc.game.init(option);
        // 启动主循环但不加载任何场景，进入待命
        await cc.game.run();
        cc.game.pause();
        setIdle(true);

        // uuid → 运行场景节点 的映射，用于实时增量同步（编辑器拖动 → 运行视图）
        let sceneNodeMap = new Map();
        const buildNodeMap = (root) => {
            sceneNodeMap = new Map();
            const walk = (n) => {
                if (!n) return;
                if (n.uuid) sceneNodeMap.set(n.uuid, n);
                const children = n.children || [];
                for (let i = 0; i < children.length; i++) walk(children[i]);
            };
            walk(root);
        };
        const applySync = (nodes) => {
            if (!Array.isArray(nodes)) return;
            for (const d of nodes) {
                // PREVIEW 运行时节点不带编辑器 uuid，主用层级路径匹配（cc.find），uuid 作兜底
                let node = (d.path && cc.find(d.path)) || (d.uuid && sceneNodeMap.get(d.uuid));
                if (!node || !node.isValid) {
                    continue;
                }
                if (d.pos) node.setPosition(d.pos[0], d.pos[1], d.pos[2]);
                if (d.rot) node.setRotationFromEuler(d.rot[0], d.rot[1], d.rot[2]);
                if (d.scale) node.setScale(d.scale[0], d.scale[1], d.scale[2]);
                if (typeof d.active === 'boolean') node.active = d.active;
            }
        };

        // 运行编辑器 realm 推送的场景快照
        const playScene = (sceneJson) => {
            if (!sceneJson) {
                return;
            }
            let json;
            try {
                json = typeof sceneJson === 'string' ? JSON.parse(sceneJson) : sceneJson;
            } catch (e) {
                showError(e);
                return;
            }
            let assetId = '';
            try {
                assetId = json[1]._id;
            } catch (e) {
                // ignore
            }
            setIdle(true);
            const idleEl = document.getElementById('idle');
            if (idleEl) {
                idleEl.textContent = 'Loading…';
            }
            cc.assetManager.loadWithJson(
                json,
                { assetId },
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
                        setIdle(false);
                        cc.game.resume();
                        buildNodeMap(cc.director.getScene());
                    });
                }
            );
        };

        // socket：接收编辑器 realm 的 Play/Stop；脚本/资源变化（browser:reload）整页重置
        try {
            if (window.io) {
                const socket = window.io(env.serverURL);
                socket.on('connect', () => {
                    // 向编辑器 realm 宣告就绪：若是 Play 时新开的标签，编辑器据此补发当前快照
                    socket.emit('gameview:hello');
                });
                socket.on('gameview:play', (data) => playScene(data && data.sceneJson));
                socket.on('gameview:sync', (data) => applySync(data && data.nodes));
                socket.on('gameview:stop', () => location.reload());
                socket.on('browser:reload', () => location.reload());
            }
        } catch (e) {
            console.warn('[GameView] live socket unavailable:', e);
        }

    } catch (err) {
        console.error('Failed to start GameView:', err.stack || err);
        showError(err);
    }
}

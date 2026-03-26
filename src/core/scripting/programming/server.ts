import http from 'http';
import ps, { join } from 'path';
import express from 'express';
import ejs from 'ejs';
import { ProgrammingFacet } from './Facet';
import { GlobalPaths } from '../../../global';
import fs from 'fs-extra';
import { StatsQuery } from '@cocos/ccbuild';

export interface IPreviewServerOptions {
    projectPath: string;
    enginePath?: string;
    port?: number;
}

export class PreviewServer {
    private app: express.Express;
    private server: http.Server | null = null;
    private options: Required<IPreviewServerOptions>;
    private facet: ProgrammingFacet | null = null;
    private features: string[] = [];

    constructor(options: IPreviewServerOptions) {
        this.options = {
            projectPath: ps.resolve(options.projectPath),
            enginePath: options.enginePath ? ps.resolve(options.enginePath) : GlobalPaths.enginePath,
            port: options.port || 9527,
        };
        this.app = express();
    }

    async start() {
        console.log(`🚀 Starting Preview Server...`);
        console.log(`📂 Project: ${this.options.projectPath}`);
        console.log(`⚙️ Engine: ${this.options.enginePath}`);
        console.log(`📌 GlobalPaths.enginePath: ${GlobalPaths.enginePath}`);
        console.log(`🌐 Port: ${this.options.port}`);

        const statsQuery = await StatsQuery.create(this.options.enginePath);
        this.features = statsQuery.getFeatures();

        this.setupEditorMock();
        await this.initializeFacet();
        this.setupRoutes();

        this.server = http.createServer(this.app);

        return new Promise<void>((resolve) => {
            this.server?.listen(this.options.port, () => {
                console.log(`✅ Preview Server started at http://localhost:${this.options.port}`);
                resolve();
            });
        });
    }

    async stop() {
        if (this.server) {
            return new Promise<void>((resolve, reject) => {
                this.server?.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        this.server = null;
                        resolve();
                    }
                });
            });
        }
    }

    private setupEditorMock() {
        if (typeof Editor === 'undefined') {
            (globalThis as any).Editor = {
                Message: {
                    request: async (pkg: string, message: string, ...args: any[]) => {
                        console.log(`[Preview Server Editor Mock] Requesting ${pkg}:${message}`);

                        if (pkg === 'engine' && message === 'query-engine-info') {
                            const nativePath = ps.join(this.options.enginePath, 'native');
                            return {
                                typescript: {
                                    path: this.options.enginePath,
                                },
                                native: {
                                    path: nativePath,
                                }
                            };
                        }

                        if (pkg === 'engine' && message === 'query-engine-modules-profile') {
                            return { includeModules: this.features };
                        }

                        if (pkg === 'programming' && message === 'packer-driver/get-loader-context') {
                            try {
                                const { default: scriptManager } = await import('../index');
                                await scriptManager.initialize(this.options.projectPath, this.options.enginePath, this.features);

                                // Ensure scripts are compiled at least once
                                if (!scriptManager.isTargetReady('preview')) {
                                    console.log(`[Preview Server Editor Mock] Target 'preview' not ready, scanning for scripts...`);
                                    const assetsDir = ps.join(this.options.projectPath, 'assets');
                                    if (await fs.pathExists(assetsDir)) {
                                        const { AssetActionEnum } = await import('@cocos/asset-db/libs/asset');
                                        const scripts: string[] = [];
                                        const scanDir = async (dir: string) => {
                                            const entries = await fs.readdir(dir, { withFileTypes: true });
                                            for (const entry of entries) {
                                                const res = ps.resolve(dir, entry.name);
                                                if (entry.isDirectory()) {
                                                    await scanDir(res);
                                                } else if (entry.isFile() && (res.endsWith('.ts') || res.endsWith('.js'))) {
                                                    scripts.push(res);
                                                }
                                            }
                                        };
                                        await scanDir(assetsDir);
                                        console.log(`[Preview Server Editor Mock] Found ${scripts.length} scripts in assets.`);

                                        for (const scriptPath of scripts) {
                                            const metaPath = `${scriptPath}.meta`;
                                            let assetUuid = ps.basename(scriptPath, ps.extname(scriptPath));
                                            if (await fs.pathExists(metaPath)) {
                                                try {
                                                    const meta = await fs.readJson(metaPath);
                                                    assetUuid = meta.uuid || assetUuid;
                                                } catch (e) {
                                                    console.warn(`[Preview Server Editor Mock] Failed to read meta for ${scriptPath}:`, e);
                                                }
                                            }

                                            scriptManager.dispatchAssetChange({
                                                type: AssetActionEnum.add,
                                                uuid: assetUuid,
                                                filePath: scriptPath,
                                                importer: scriptPath.endsWith('.ts') ? 'typescript' : 'javascript',
                                                userData: {},
                                            });
                                        }
                                    }

                                    console.log(`[Preview Server Editor Mock] Starting initial compilation...`);
                                    await scriptManager.compileScripts();
                                    console.log(`[Preview Server Editor Mock] Initial compilation finished.`);
                                }

                                const ctx = scriptManager.getPackerDriverLoaderContext(args[0]);
                                if (ctx && (ctx as any).importMap) {
                                    console.log(`[Preview Server Editor Mock] Loader context imports for ${args[0]}:`, JSON.stringify((ctx as any).importMap.imports, null, 2).substring(0, 500));
                                }
                                return ctx;
                            } catch (err) {
                                console.warn(`[Preview Server Editor Mock] Failed to get loader context: ${err}`);
                                return {};
                            }
                        }

                        return {};
                    }
                },
                Project: {
                    path: this.options.projectPath,
                    tmpDir: ps.join(this.options.projectPath, 'temp'),
                }
            };
        }
    }

    private async initializeFacet() {
        this.facet = await ProgrammingFacet.create(
            {
                root: this.options.enginePath,
                distRoot: ps.join(this.options.enginePath, 'bin', '.cache', 'dev-cli', 'web'),
                baseUrl: '/scripting/engine',
                features: this.features,
            },
            this.options.projectPath
        );
    }

    private setupRoutes() {
        const app = this.app;
        const facet = this.facet!;
        const { projectPath, enginePath } = this.options;

        app.get('/', async (req, res, next) => {
            try {
                const engineDistRelPath = ps.relative(enginePath, facet.engineDistRoot).replace(/\\/g, '/');
                const renderData = {
                    title: `Cocos Creator Preview - ${ps.basename(projectPath)}`,
                    settingsJs: '/settings.js',
                    packImportMapURL: `/scripting/x/${facet.packImportMapURL}`,
                    packResolutionDetailMapURL: `/scripting/x/${facet.packResolutionDetailMapURL}`,
                    engineDistPath: `/scripting/engine/${engineDistRelPath}`,
                    globalImportMap: await facet.getGlobalImportMap(),
                };
                const templatePath = ps.join(__dirname, 'index.ejs');
                const html = await ejs.renderFile(templatePath, renderData);
                res.status(200).send(html);
            } catch (err) {
                next(err);
            }
        });

        app.get('/engine_external/', async (req, res, next) => {
            const url = req.query['url'];
            const externalProtocol = 'external:';
            if (typeof url === 'string' && url.startsWith(externalProtocol)) {
                const nativeEnginePath = (await Editor.Message.request('engine', 'query-engine-info')).native.path;
                const externalFilePath = url.replace(externalProtocol, join(nativeEnginePath, 'external/'));
                const arrayBuffer = await fs.readFile(externalFilePath);
                res.send(arrayBuffer);
            } else {
                next(new Error(`请求 external 资源失败，请使用 external 协议: ${url}`));
            }
        });

        app.get('/settings.js', (req, res) => {
            res.status(200).send('window._CCSettings = { "debug": true };');
        });

        app.get('/scripting/import-map-global', async (req, res) => {
            const importMap = await facet.getGlobalImportMap();
            console.log(`[Preview Server] Global import map:`, JSON.stringify(importMap, null, 2).substring(0, 500));
            res.json(importMap);
        });

        app.use('/scripting/x', async (req, res, next) => {
            const urlPath = req.path.startsWith('/') ? req.path.substring(1) : req.path;
            if (urlPath === '' || urlPath === '/') {
                return next();
            }

            // Forward query string
            const query = Object.keys(req.query).length === 0 ? '' : `?${new URLSearchParams(req.query as any).toString()}`;
            const url = urlPath + query;

            console.log(`[Preview Server] Packing resource requested: ${url}`);
            try {
                const packResource = await facet.loadPackResource(url);
                if (packResource.type === 'json') {
                    res.json(packResource.json);
                } else if (packResource.type === 'chunk') {
                    res.sendFile(packResource.chunk.path);
                } else {
                    console.warn(`[Preview Server] Unknown pack resource type for ${url}:`, packResource);
                    next(new Error('Unknown pack resource type'));
                }
            } catch (err) {
                console.error(`[Preview Server] Failed to load pack resource ${url}:`, err);
                next(err);
            }
        });

        // Engine resources
        app.use('/scripting/engine', async (req, res, next) => {
            let urlPath = req.path.startsWith('/') ? req.path.substring(1) : req.path;
            try {
                urlPath = decodeURIComponent(urlPath);
            } catch {
                // Ignore error
            }
            let resourcePath = ps.join(facet.engineRoot, urlPath);
            if (!(await fs.pathExists(resourcePath))) {
                resourcePath = `${resourcePath}.js`;
            }
            if (!(await fs.pathExists(resourcePath))) {
                // Fallback to searching in engineRoot/bin/.cache/dev/preview if the path is relative to the preview dist
                // Actually, Creator's server.ts just joins with engineRoot.
                // If the request is already /bin/.cache/dev/preview/..., then ps.join(facet.engineRoot, urlPath) works.
                return next();
            }

            if (await fs.pathExists(resourcePath) && (await fs.stat(resourcePath)).isFile()) {
                res.sendFile(resourcePath, { dotfiles: 'allow' });
            } else {
                next();
            }
        });

        // Static files
        app.use('/static/preview', express.static(ps.join(GlobalPaths.workspace, 'static', 'preview')));
        app.use('/scripting/systemjs', express.static(ps.join(facet.systemJsHomeDir)));
        app.use('/cocos', express.static(ps.join(enginePath, 'cocos')));
        app.use('/core', express.static(ps.join(enginePath, 'cocos', 'core')));
        app.use('/pal', express.static(ps.join(enginePath, 'pal')));
        app.use('/editor', express.static(ps.join(enginePath, 'editor')));
        app.use('/exports', express.static(ps.join(enginePath, 'exports')));

        // Default error handler
        app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
            console.error(`[Preview Server] Unexpected Error:`, err);
            if (req.path.startsWith('/scripting/') || req.headers.accept?.includes('application/json')) {
                res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
            } else {
                res.status(err.status || 500).send(`<h1>Error</h1><pre>${err.stack || err}</pre>`);
            }
        });
    }
}

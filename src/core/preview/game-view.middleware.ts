import type { IMiddlewareContribution } from '../../server/interfaces';
import { Request, Response, NextFunction } from 'express';
import { basename, join } from 'path';
import ejs from 'ejs';
import { GlobalPaths } from '../../global';
import { gamePreviewResourceRoutes } from './game-preview.middleware';

/**
 * 编辑器内运行视图（GameView）中间件。
 *
 * 运行视图是一个独立 JS realm（VS Code 里是独立 webview 面板），以 PREVIEW 模式（CC_EDITOR=false）
 * 跑游戏，性能特征与真预览完全一致；初始化后待命，由 socket 事件 `gameview:play` 携带「当前编辑场景快照」驱动。
 *
 * 资源走与浏览器游戏预览相同的根路径路由（settings / 资源 / bundle config / index / 场景 JSON），
 * 因为引擎对 bundle 的加载是「相对文档根」解析的（如 assets/internal/index.js），无法用子路径命名空间承接。
 * 关键：本中间件需在 initScene 之前注册，使这些根路由优先于「场景编辑器中间件的宽泛路由」(`/:dir/:uuid.:ext` 等)，
 * 否则后者会把 /preview/settings.js、/assets/<bundle>/config.json 吞成 404。
 * 这些 handler 在「非游戏预览的 bundle/资源」时会 next() 放行，因此不影响场景编辑器自身的资源请求。
 * 引擎/脚本（external/scripting/static）仍由 SceneScripting 的 scriptingRoutes 在根路径提供。
 */
export default {
    get: [
        {
            // 运行视图入口（GameView realm）
            url: /^\/game-view\/?$/,
            async handler(req: Request, res: Response, next: NextFunction) {
                try {
                    if (!req.path.endsWith('/')) {
                        return res.redirect(302, '/game-view/');
                    }
                    const { default: scripting } = await import('../../core/scripting');
                    const serverBaseUrl = `${req.protocol}://${req.get('host')}`;
                    const renderData = {
                        title: `Cocos Creator GameView - ${basename(scripting.projectPath)}`,
                        serverURL: serverBaseUrl,
                        // 与浏览器预览复用同一份 settings 路由（PREVIEW 模式，性能一致）
                        settingsJs: '/preview/settings.js',
                    };
                    const templatePath = join(GlobalPaths.workspace, 'static', 'web', 'game-view.ejs');
                    const html = await ejs.renderFile(templatePath, renderData);
                    res.set('Cache-Control', 'no-store');
                    res.status(200).send(html);
                } catch (err) {
                    next(err);
                }
            },
        },
        // 复用游戏运行时共享资源路由（settings / 资源 / bundle / 场景 JSON），根路径
        ...gamePreviewResourceRoutes,
    ],
    post: [],
    staticFiles: [],
    socket: {
        // 中转编辑器 realm → 运行 realm 的 Play/Stop/快照/实时同步。
        connection: (socket: any) => {
            socket.on('gameview:play', (data: any) => {
                socket.broadcast.emit('gameview:play', data);
            });
            socket.on('gameview:stop', () => {
                socket.broadcast.emit('gameview:stop');
            });
            // 运行视图就绪后回告编辑器，使「Play 时新开的标签」在连上后能收到当前快照
            socket.on('gameview:hello', () => {
                socket.broadcast.emit('gameview:hello');
            });
            // 实时增量同步：编辑器拖动节点时把 transform 增量转发给运行视图（按路径应用，不重载场景）
            socket.on('gameview:sync', (data: any) => {
                socket.broadcast.emit('gameview:sync', data);
            });
        },
        disconnect: (_socket: any) => { },
    },
} as IMiddlewareContribution;

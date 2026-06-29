import type { IMiddlewareContribution } from '../../server/interfaces';
import { Request, Response, NextFunction } from 'express';
import { basename, join } from 'path';
import ejs from 'ejs';
import { GlobalPaths } from '../../global';
import { scriptingRoutes } from '../preview/scripting-routes';

export default {
    get: [
        {
            url: '/',
            async handler(req: Request, res: Response, next: NextFunction) {
                try {
                    const { default: scripting } = await import('../../core/scripting');
                    const serverBaseUrl = `${req.protocol}://${req.get('host')}`;
                    const renderData = {
                        title: `Cocos Creator Preview - ${basename(scripting.projectPath)}`,
                        serverURL: serverBaseUrl
                    };
                    const templatePath = join(GlobalPaths.workspace, 'static', 'web', 'index.ejs');
                    const html = await ejs.renderFile(templatePath, renderData);
                    res.status(200).send(html);
                } catch (err) {
                    next(err);
                }
            },
        },
        // 共享的引擎 / 脚本 / SystemJS / import-map 等动态资源路由
        ...scriptingRoutes,
    ],
    post: [],
    staticFiles: [],
    socket: {
        connection: (_socket: any) => { },
        disconnect: (_socket: any) => { }
    },
} as IMiddlewareContribution;

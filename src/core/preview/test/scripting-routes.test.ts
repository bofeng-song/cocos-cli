const mockGetModules = jest.fn();
const mockGetGameConfig = jest.fn();
const mockGetConfigPath = jest.fn();
const mockPathExists = jest.fn();
const mockReadJSON = jest.fn();

jest.mock('../../engine', () => ({
    Engine: {
        getModules: mockGetModules,
        getGameConfig: mockGetGameConfig,
    },
}));

jest.mock('../../configuration', () => ({
    configurationManager: {
        getConfigPath: mockGetConfigPath,
    },
}));

jest.mock('fs-extra', () => ({
    pathExists: mockPathExists,
    readJSON: mockReadJSON,
    stat: jest.fn(),
    readFile: jest.fn(),
}));

import { scriptingRoutes } from '../scripting-routes';

describe('preview scripting routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetModules.mockReturnValue(['base', 'custom-pipeline']);
        mockGetGameConfig.mockResolvedValue({
            overrideSettings: {
                rendering: {
                    customPipeline: false,
                },
            },
        });
        mockGetConfigPath.mockResolvedValue('E:/project/settings/cocos.config.json');
        mockPathExists.mockResolvedValue(true);
    });

    it('normalizes disk graphics settings when serving engine modules', async () => {
        mockReadJSON.mockResolvedValue({
            engine: {
                globalConfigKey: 'default',
                configs: {
                    default: {
                        includeModules: ['base', 'custom-pipeline', 'custom-pipeline-post-process'],
                    },
                },
                graphics: {
                    pipeline: 'legacy-pipeline',
                    'custom-pipeline-post-process': true,
                },
            },
        });
        const route = scriptingRoutes.find((item) => item.url === '/scripting/engine/modules');
        const res = {
            json: jest.fn(),
        };

        expect(route).toBeDefined();

        await route!.handler({} as any, res as any, jest.fn());

        expect(res.json).toHaveBeenCalledWith(['base', 'legacy-pipeline']);
    });

    it('normalizes disk graphics settings when serving game config', async () => {
        mockReadJSON.mockResolvedValue({
            engine: {
                globalConfigKey: 'default',
                configs: {
                    default: {
                        includeModules: ['base', 'custom-pipeline'],
                    },
                },
            },
        });
        const route = scriptingRoutes.find((item) => item.url === '/scripting/engine/game-config');
        const req = {
            protocol: 'http',
            get: jest.fn().mockReturnValue('localhost:7456'),
        };
        const res = {
            json: jest.fn(),
        };

        expect(route).toBeDefined();

        await route!.handler(req as any, res as any, jest.fn());

        expect(res.json).toHaveBeenCalledWith({
            overrideSettings: {
                rendering: {
                    customPipeline: true,
                    effectSettingsPath: 'http://localhost:7456/scripting/engine/effect-settings',
                },
            },
        });
    });
});

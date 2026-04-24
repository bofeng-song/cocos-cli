import { configurationRegistry, ConfigurationScope, IBaseConfiguration } from '../configuration';

export interface ICameraConfig {
    color: number[];
    fov: number;
    far: number;
    near: number;
    wheelSpeed: number;
    wanderSpeed: number;
    enableAcceleration: boolean;
}

export interface ISceneConfig {
    /**
     * 是否循环
     */
    tick: boolean;
    /**
     * 编辑器相机配置，与 cocos-editor scene/package.json profile 一致
     */
    camera: ICameraConfig;
}

class SceneConfig {
    private defaultConfig: ISceneConfig = {
        tick: false,
        camera: {
            color: [48, 48, 48, 255],
            fov: 45,
            far: 10000,
            near: 0.01,
            wheelSpeed: 0.01,
            wanderSpeed: 10,
            enableAcceleration: true,
        },
    };

    private configInstance!: IBaseConfiguration;

    async init() {
        this.configInstance = await configurationRegistry.register('scene', this.defaultConfig);
    }

    public get<T>(path?: string, scope?: ConfigurationScope): Promise<T> {
        return this.configInstance.get(path, scope);
    }

    public set(path: string, value: any, scope?: ConfigurationScope) {
        return this.configInstance.set(path, value, scope);
    }
}

export const sceneConfigInstance = new SceneConfig();
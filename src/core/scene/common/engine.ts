import type { IServiceEvents } from '../scene-process/service/core';

export interface ICustomLayerConfig {
    name: string;
    value: number;
}

export interface IEngineEvents {
    'engine:update': [];
    'engine:ticked': [];
}

export interface IPublicEngineService extends Omit<IEngineService, 'initCustomLayer' | keyof IServiceEvents> {}

export interface IEngineService extends IServiceEvents {
    /**
     * 初始化引擎服务，目前是暂时引擎 mainLoop
     */
    init(): Promise<void>;

    /**
     * 让引擎执行一帧
     */
    repaintInEditMode(): Promise<void>;

    /**
     * 渲染调试视图（DebugView）控制：单一通道调试 / 组合光照项开关 / 纯光照带固有色 / 级联阴影染色。
     * @param key 'single' | 'composite' | 'LIGHTING_WITH_BASE_COLOR' | 'CSM_LAYER_COLORATION'
     * @param value single: DebugViewSingleType 数值；composite: { key: number(10000=ALL), value: boolean }；其余: boolean
     */
    changeDebugOption(key: string, value: any): Promise<void>;

    /**
     * 初始化自定义 Layer 配置
     */
    initCustomLayer(layers?: ICustomLayerConfig[]): Promise<void>;
}

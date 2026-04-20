'use strict';

import { EventEmitter } from 'events';

export interface IResolutionData {
    width: number;
    height: number;
}

class SceneViewData extends EventEmitter {
    private _targetResolution: IResolutionData = { width: 960, height: 640 };
    private _targetAspect: number = 960 / 640;
    private _isSceneLightOn = true;

    get targetResolution(): IResolutionData {
        return this._targetResolution;
    }

    set targetResolution(value: IResolutionData) {
        this._targetResolution = value;
        this._targetAspect = value.width / value.height;
        this.emit('target-resolution-changed', value);
    }

    get targetAspect(): number {
        return this._targetAspect;
    }

    get targetWidth(): number {
        return this._targetResolution.width;
    }

    get targetHeight(): number {
        return this._targetResolution.height;
    }

    get isSceneLightOn(): boolean {
        return this._isSceneLightOn;
    }

    set isSceneLightOn(value: boolean) {
        this._isSceneLightOn = value;
        this.emit('is-scene-light-on', value);
    }

    async initFromConfig(): Promise<void> {
        // CLI stub: no persisted config
    }

    async saveConfig(): Promise<void> {
        // CLI stub: no persisted config
    }
}

export const sceneViewData = new SceneViewData();

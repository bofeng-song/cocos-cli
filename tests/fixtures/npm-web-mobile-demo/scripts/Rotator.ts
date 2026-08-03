import { _decorator, Component } from 'cocos';

const { ccclass } = _decorator;

@ccclass('Rotator')
export class Rotator extends Component {
    public speed = 90;

    private _angle = 0;

    start() {
        globalThis.__cocosDemoState.customComponent.started = true;
        document.documentElement.dataset.cocosCustomComponentStarted = 'true';
    }

    update(dt: number) {
        this._angle += dt * this.speed;
        this.node.setRotationFromEuler(20, this._angle, 0);

        const state = globalThis.__cocosDemoState;
        state.frame += 1;
        state.angle = this._angle;
        state.customComponent.updates += 1;
        document.documentElement.dataset.cocosCustomComponentUpdates = String(state.customComponent.updates);
    }
}

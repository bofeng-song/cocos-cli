import { Quat, Vec3 } from 'cc';
import ModeBase3D from './mode-base-3d';
import { CameraMoveMode } from '../utils';
import { AnimVec3 } from '../animate-value';
import type { ISceneMouseEvent, ISceneKeyboardEvent } from '../../operation/types';
import type { CameraController3D } from '../camera-controller-3d';

class WanderMode extends ModeBase3D {
    private _curMouseDX = 0;
    private _curMouseDY = 0;
    private _rotateSpeed = 0.002;
    private _movingSpeedShiftScale = 10;
    private _damping = 0.6;
    private _wanderSpeed = 10;
    private _flyAcceleration = 2;
    private _shiftKey = false;
    private _velocity = new Vec3();
    private _wanderKeyDown = false;
    private _destPos = new Vec3();
    private _destRot = new Quat();
    private _wanderSpeedTarget = 0;
    private _wanderAnim = new AnimVec3(new Vec3());
    private _enableAcceleration = true;

    // scratch variables to avoid per-frame allocations
    private _euler = new Vec3();
    private _targetVel = new Vec3();
    private _right = new Vec3();
    private _up = new Vec3(0, 1, 0);
    private _forward = new Vec3();
    private _movement = new Vec3();

    constructor(cameraCtrl: CameraController3D) {
        super(cameraCtrl, CameraMoveMode.WANDER);
    }

    public get wanderSpeed() {
        return this._wanderSpeed;
    }

    public set wanderSpeed(value: number) {
        this._wanderSpeed = value;
    }

    public get enableAcceleration() {
        return this._enableAcceleration;
    }

    public set enableAcceleration(value: boolean) {
        this._enableAcceleration = value;
    }

    public async enter() {
        const node = this._cameraCtrl.node;
        node.getWorldPosition(this._curPos);
        node.getWorldRotation(this._curRot);

        this._curMouseDX = 0;
        this._curMouseDY = 0;
        this._velocity.set(0, 0, 0);
        this._wanderKeyDown = false;
        this._shiftKey = false;
        this._wanderSpeedTarget = 0;
        this._wanderAnim.value = new Vec3();

        Vec3.copy(this._destPos, this._curPos);
        Quat.copy(this._destRot, this._curRot);

        try {
            const { Service } = require('../../core/decorator');
            Service.Operation?.requestPointerLock?.();
        } catch (e) {
            // Operation may not be ready
        }

        this._cameraCtrl.emit('camera-move-mode', CameraMoveMode.WANDER);

        try {
            const { Service } = require('../../core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
    }

    public async exit() {
        try {
            const { Service } = require('../../core/decorator');
            Service.Operation?.exitPointerLock?.();
        } catch (e) {
            // Operation may not be ready
        }

        this._cameraCtrl.updateViewCenterByDist(-this._cameraCtrl.viewDist);

        try {
            const { Service } = require('../../core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
    }

    onMouseMove(event: ISceneMouseEvent): boolean {
        this._curMouseDX += event.moveDeltaX;
        this._curMouseDY += event.moveDeltaY;
        return false;
    }

    onMouseWheel(event: ISceneMouseEvent) {
        const step = 0.1; // fixed step, no Editor.Profile in CLI
        const delta = event.wheelDeltaY || event.deltaY;
        if (delta > 0) {
            this._wanderSpeed = Math.max(0.01, this._wanderSpeed - step);
        } else if (delta < 0) {
            this._wanderSpeed = Math.min(100, this._wanderSpeed + step);
        }
    }

    onKeyDown(event: ISceneKeyboardEvent) {
        const key = event.key.toLowerCase();
        this._shiftKey = event.shiftKey;

        switch (key) {
            case 'd':
                this._velocity.x = 1;
                this._wanderKeyDown = true;
                break;
            case 'a':
                this._velocity.x = -1;
                this._wanderKeyDown = true;
                break;
            case 'e':
                this._velocity.y = 1;
                this._wanderKeyDown = true;
                break;
            case 'q':
                this._velocity.y = -1;
                this._wanderKeyDown = true;
                break;
            case 's':
                this._velocity.z = 1;
                this._wanderKeyDown = true;
                break;
            case 'w':
                this._velocity.z = -1;
                this._wanderKeyDown = true;
                break;
        }
    }

    onKeyUp(event: ISceneKeyboardEvent) {
        const key = event.key.toLowerCase();
        this._shiftKey = event.shiftKey;

        switch (key) {
            case 'd':
                if (this._velocity.x > 0) this._velocity.x = 0;
                break;
            case 'a':
                if (this._velocity.x < 0) this._velocity.x = 0;
                break;
            case 'e':
                if (this._velocity.y > 0) this._velocity.y = 0;
                break;
            case 'q':
                if (this._velocity.y < 0) this._velocity.y = 0;
                break;
            case 's':
                if (this._velocity.z > 0) this._velocity.z = 0;
                break;
            case 'w':
                if (this._velocity.z < 0) this._velocity.z = 0;
                break;
        }

        // 如果所有方向键都已释放
        if (this._velocity.x === 0 && this._velocity.y === 0 && this._velocity.z === 0) {
            this._wanderKeyDown = false;
        }
    }

    onUpdate(deltaTime: number) {
        // 旋转处理：根据鼠标累积偏移旋转摄像机
        const dx = this._curMouseDX;
        const dy = this._curMouseDY;
        this._curMouseDX *= (1 - this._damping);
        this._curMouseDY *= (1 - this._damping);

        // 如果鼠标偏移足够小则归零
        if (Math.abs(this._curMouseDX) < 0.01) this._curMouseDX = 0;
        if (Math.abs(this._curMouseDY) < 0.01) this._curMouseDY = 0;

        const rot = this._destRot;
        Quat.rotateX(rot, rot, -dy * this._rotateSpeed);
        Quat.rotateAround(rot, rot, Vec3.UNIT_Y, -dx * this._rotateSpeed);

        // 清除 Z 旋转
        Quat.toEuler(this._euler, rot);
        Quat.fromEuler(rot, this._euler.x, this._euler.y, 0);

        this._cameraCtrl.node.setWorldRotation(rot);

        // 移动处理：根据速度和方向移动摄像机
        let speed = this._wanderSpeed;
        if (this._shiftKey) {
            speed *= this._movingSpeedShiftScale;
        }

        // 计算方向向量 (reuse scratch vars)
        Vec3.transformQuat(this._right, Vec3.UNIT_X, rot);
        Vec3.transformQuat(this._forward, Vec3.UNIT_Z, rot);
        Vec3.normalize(this._right, this._right);
        Vec3.normalize(this._forward, this._forward);
        this._up.set(0, 1, 0);

        if (this._enableAcceleration) {
            this._targetVel.set(
                this._velocity.x * speed,
                this._velocity.y * speed,
                this._velocity.z * speed,
            );
            this._wanderAnim.target = this._targetVel;
            this._wanderAnim.defaultSpeed = this._flyAcceleration;
            this._wanderAnim.update(deltaTime);
            const smoothVel = this._wanderAnim.value;

            Vec3.multiplyScalar(this._movement, this._right, smoothVel.x * deltaTime);
            Vec3.scaleAndAdd(this._movement, this._movement, this._up, smoothVel.y * deltaTime);
            Vec3.scaleAndAdd(this._movement, this._movement, this._forward, smoothVel.z * deltaTime);
        } else {
            Vec3.multiplyScalar(this._movement, this._right, this._velocity.x * speed * deltaTime);
            Vec3.scaleAndAdd(this._movement, this._movement, this._up, this._velocity.y * speed * deltaTime);
            Vec3.scaleAndAdd(this._movement, this._movement, this._forward, this._velocity.z * speed * deltaTime);
        }

        this._cameraCtrl.node.getWorldPosition(this._destPos);
        Vec3.add(this._destPos, this._destPos, this._movement);

        this._cameraCtrl.node.setWorldPosition(this._destPos);
        this._cameraCtrl.updateGrid();

        // 只要有输入就请求重绘
        if (this._wanderKeyDown || this._curMouseDX !== 0 || this._curMouseDY !== 0) {
            try {
                const { Service } = require('../../core/decorator');
                Service.Engine?.repaintInEditMode?.();
            } catch (e) {
                // Engine may not be ready
            }
        }
    }
}

export default WanderMode;

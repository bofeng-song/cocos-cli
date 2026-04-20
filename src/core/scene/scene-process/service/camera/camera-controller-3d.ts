import { Camera, Color, MeshRenderer, Node, Quat, Vec3, ISizeLike } from 'cc';
import CameraControllerBase, { EditorCameraInfo } from './camera-controller-base';
import { CameraMoveMode, CameraUtils } from './utils';
import FiniteStateMachine from '../utils/state-machine/finite-state-machine';
import LinearTicks from './grid/linear-ticks';
import { tweenPosition, tweenRotation, tweenNumber } from './tween';
import IdleMode from './modes/idle-mode';
import OrbitMode from './modes/orbit-mode';
import PanMode from './modes/pan-mode';
import WanderMode from './modes/wander-mode';
import type ModeBase3D from './modes/mode-base-3d';
import type { ISceneMouseEvent, ISceneKeyboardEvent } from '../operation/types';

// ---------- node utility helpers ----------

function getCenterWorldPos3D(nodes: Node[]): Vec3 {
    if (nodes.length === 0) return new Vec3();
    if (nodes.length === 1) return nodes[0].getWorldPosition();
    const center = new Vec3();
    for (const node of nodes) {
        Vec3.add(center, center, node.getWorldPosition());
    }
    Vec3.multiplyScalar(center, center, 1 / nodes.length);
    return center;
}

function getWorldPosition3D(node: Node): Vec3 {
    return node.getWorldPosition();
}

function getMaxRangeOfNodes(nodes: Node[]): number {
    if (nodes.length === 0) return 1;
    let maxRange = 0;
    const center = getCenterWorldPos3D(nodes);
    for (const node of nodes) {
        const dist = Vec3.distance(center, node.getWorldPosition());
        maxRange = Math.max(maxRange, dist);
    }
    return Math.max(maxRange, 1);
}

function makeVec3InRange(v: Vec3, min: number, max: number): void {
    v.x = Math.min(max, Math.max(min, v.x));
    v.y = Math.min(max, Math.max(min, v.y));
    v.z = Math.min(max, Math.max(min, v.z));
}

// ---------- smooth mouse wheel helper ----------

export function smoothMouseWheelScale(delta: number): number {
    return (delta > 0 ? 1 : -1) * (Math.pow(2, Math.abs(delta) * 0.02) - 1) * 10;
}

// ---------- constants ----------

const _maxTicks = 100;

export class CameraController3D extends CameraControllerBase {
    protected _wheelSpeed = 0.01;
    protected _near = 0.1;
    protected _far = 10000;

    private _orthoScale = 0.1;
    private _minScalar = 0.1;

    public homePos = new Vec3(50, 50, 50);
    public homeRot: Quat;

    public sceneViewCenter = new Vec3();
    public viewDist = 20;
    public forward = new Vec3(Vec3.UNIT_Z);

    private _curRot = new Quat();
    private _curEye = new Vec3();

    private _lineColor = new Color(255, 255, 255, 50);

    public lastMouseWheelDeltaY = 0;
    public maxMouseWheelDeltaY = 1000;

    private _modeFSM!: FiniteStateMachine<ModeBase3D>;
    private _idleMode!: IdleMode;
    private _orbitMode!: OrbitMode;
    private _panMode!: PanMode;
    private _wanderMode!: WanderMode;

    public view?: number;
    private hTicks!: LinearTicks;
    private vTicks!: LinearTicks;

    public shiftKey?: boolean;
    public altKey?: boolean;
    public mousePressing = false;

    public lastFocusNodeUUID: string[] = [];

    // 动画状态
    private _posAnim: any = null;
    private _rotAnim: any = null;
    private _distAnim: any = null;

    constructor() {
        super();

        // 计算 homeRot：从 homePos 朝向原点
        const lookDir = new Vec3();
        Vec3.subtract(lookDir, new Vec3(0, 0, 0), this.homePos);
        Vec3.normalize(lookDir, lookDir);

        this.homeRot = new Quat();
        Quat.fromViewUp(this.homeRot, lookDir, Vec3.UNIT_Y);
    }

    init(camera: Camera) {
        super.init(camera);

        // 创建网格
        const parentNode = this.node.parent || this.node;
        this._gridMeshComp = CameraUtils.createGrid('internal/editor/grid', parentNode);

        // 初始化原点轴
        this.initOriginAxis();

        // 初始化模式状态机
        this._initMode();

        // 初始化线性刻度
        this._initLinearTick();

        // 重置相机位置
        this.reset();

        // 初始更新网格
        this.updateGrid();
    }

    // ---------- 原点轴 ----------

    private initOriginAxis() {
        const parentNode = this.node.parent || this.node;
        this._originAxisHorizontalMeshComp = CameraUtils.createGrid('internal/editor/grid', parentNode);
        this._originAxisVerticalMeshComp = CameraUtils.createGrid('internal/editor/grid', parentNode);

        // 默认不显示原点轴 (与 base class 默认值一致)
        if (this._originAxisHorizontalMeshComp.node) {
            this._originAxisHorizontalMeshComp.node.active = false;
        }
        if (this._originAxisVerticalMeshComp.node) {
            this._originAxisVerticalMeshComp.node.active = false;
        }
    }

    updateOriginAxisByConfig(config: { x?: boolean; y?: boolean; z?: boolean }, update = true) {
        if (config.x !== undefined) this.originAxisX_Visible = config.x;
        if (config.y !== undefined) this.originAxisY_Visible = config.y;
        if (config.z !== undefined) this.originAxisZ_Visible = config.z;

        const showHorizontal = this.originAxisX_Visible || this.originAxisZ_Visible;
        const showVertical = this.originAxisY_Visible;

        if (this._originAxisHorizontalMeshComp?.node) {
            this._originAxisHorizontalMeshComp.node.active = showHorizontal;
        }
        if (this._originAxisVerticalMeshComp?.node) {
            this._originAxisVerticalMeshComp.node.active = showVertical;
        }

        if (update) {
            this.updateOriginAxis();
        }
    }

    getOriginAxisData() {
        const pos = new Vec3();
        this.node.getWorldPosition(pos);

        // 根据摄像机位置计算可见范围
        const dist = Math.abs(pos.y) + this._far;
        return {
            minH: pos.x - dist,
            maxH: pos.x + dist,
            minV: pos.z - dist,
            maxV: pos.z + dist,
            yDist: dist,
        };
    }

    updateOriginAxisHorizontal() {
        if (!this._originAxisHorizontalMeshComp?.node?.active) return;

        const { minH, maxH, minV, maxV } = this.getOriginAxisData();
        const positions: number[] = [];
        const colors: number[] = [];
        const indices: number[] = [];
        let idx = 0;

        // X 轴 (水平红线)
        if (this.originAxisX_Visible) {
            positions.push(minH, 0, 0, maxH, 0, 0);
            const r = this.originAxisX_Color.r / 255;
            const g = this.originAxisX_Color.g / 255;
            const b = this.originAxisX_Color.b / 255;
            colors.push(r, g, b, 1, r, g, b, 1);
            indices.push(idx, idx + 1);
            idx += 2;
        }

        // Z 轴 (水平蓝线)
        if (this.originAxisZ_Visible) {
            positions.push(0, 0, minV, 0, 0, maxV);
            const r = this.originAxisZ_Color.r / 255;
            const g = this.originAxisZ_Color.g / 255;
            const b = this.originAxisZ_Color.b / 255;
            colors.push(r, g, b, 1, r, g, b, 1);
            indices.push(idx, idx + 1);
            idx += 2;
        }

        // 补齐到 _maxTicks * _maxTicks
        while (positions.length / 2 < _maxTicks * _maxTicks) {
            positions.push(0, 0);
            colors.push(0, 0, 0, 0);
        }
        while (indices.length < _maxTicks * _maxTicks) {
            indices.push(0);
        }

        CameraUtils.updateVBAttr(this._originAxisHorizontalMeshComp, 'a_position', positions);
        CameraUtils.updateIB(this._originAxisHorizontalMeshComp, indices);
    }

    updateOriginAxisVertical() {
        if (!this._originAxisVerticalMeshComp?.node?.active) return;

        const { minH, maxH, yDist } = this.getOriginAxisData();
        const positions: number[] = [];
        const colors: number[] = [];
        const indices: number[] = [];

        // Y 轴 (垂直绿线)
        if (this.originAxisY_Visible) {
            positions.push(0, -yDist, 0, yDist);
            const r = this.originAxisY_Color.r / 255;
            const g = this.originAxisY_Color.g / 255;
            const b = this.originAxisY_Color.b / 255;
            colors.push(r, g, b, 1, r, g, b, 1);
            indices.push(0, 1);
        }

        // 补齐
        while (positions.length / 2 < _maxTicks * _maxTicks) {
            positions.push(0, 0);
            colors.push(0, 0, 0, 0);
        }
        while (indices.length < _maxTicks * _maxTicks) {
            indices.push(0);
        }

        CameraUtils.updateVBAttr(this._originAxisVerticalMeshComp, 'a_position', positions);
        CameraUtils.updateIB(this._originAxisVerticalMeshComp, indices);
    }

    updateOriginAxis() {
        this.updateOriginAxisHorizontal();
        this.updateOriginAxisVertical();
    }

    // ---------- 模式状态机 ----------

    private _initMode() {
        this._idleMode = new IdleMode(this);
        this._orbitMode = new OrbitMode(this);
        this._panMode = new PanMode(this);
        this._wanderMode = new WanderMode(this);

        const modes = [this._idleMode, this._orbitMode, this._panMode, this._wanderMode];
        this._modeFSM = new FiniteStateMachine<ModeBase3D>(modes);

        // 添加所有模式之间的转换 (排除自身到自身)
        const modeNames = ['idle', 'orbit', 'pan', 'wander'];
        for (let i = 0; i < modes.length; i++) {
            for (let j = 0; j < modes.length; j++) {
                if (i !== j) {
                    this._modeFSM.addTransition(modes[i], modes[j], modeNames[j]);
                }
            }
        }

        this._modeFSM.Begin(this._idleMode);
    }

    private _initLinearTick() {
        this.hTicks = new LinearTicks();
        this.vTicks = new LinearTicks();
        this.hTicks.initTicks([2, 5], 0.001, 1000).spacing(10, 80);
        this.vTicks.initTicks([2, 5], 0.001, 1000).spacing(10, 80);
    }

    // ---------- active ----------

    set active(value: boolean) {
        if (value) {
            // 激活时更新投影、位置
            this.showGrid(true);
        } else {
            this.showGrid(false);
        }
    }

    // ---------- 模式切换 ----------

    async changeMode(command: string) {
        await this._modeFSM.issueCommand(command);
        this.emit('mode', command);
    }

    // ---------- 重置 ----------

    reset() {
        this.node.setWorldPosition(this.homePos);
        this.node.setWorldRotation(this.homeRot);

        // 更新 sceneViewCenter
        this.updateViewCenterByDist(-this.viewDist);
    }

    // ---------- viewCenter ----------

    updateViewCenterByDist(viewDist: number) {
        this.node.getWorldRotation(this._curRot);

        const fwd = new Vec3(0, 0, -1);
        Vec3.transformQuat(fwd, fwd, this._curRot);
        Vec3.normalize(fwd, fwd);

        this.node.getWorldPosition(this._curEye);
        Vec3.multiplyScalar(fwd, fwd, -viewDist);
        Vec3.add(this.sceneViewCenter, this._curEye, fwd);
    }

    // ---------- 缩放 ----------

    scale(delta: number) {
        if (this.isOrtho()) {
            // 正交模式：调整 orthoHeight
            let height = this._camera.orthoHeight;
            height -= delta * height * this._orthoScale;
            height = Math.max(this._minScalar, height);
            this.setOrthoHeight(height);
        } else {
            // 透视模式：沿前方向移动
            this.node.getWorldPosition(this._curEye);
            this.node.getWorldRotation(this._curRot);

            const fwd = new Vec3(0, 0, -1);
            Vec3.transformQuat(fwd, fwd, this._curRot);
            Vec3.normalize(fwd, fwd);

            Vec3.multiplyScalar(fwd, fwd, delta * this.viewDist * this._orthoScale);
            Vec3.add(this._curEye, this._curEye, fwd);

            makeVec3InRange(this._curEye, -1e6, 1e6);

            this.node.setWorldPosition(this._curEye);
            this.viewDist = Vec3.distance(this._curEye, this.sceneViewCenter);
        }
        this.updateGrid();
    }

    smoothScale(delta: number) {
        this.scale(smoothMouseWheelScale(delta));
    }

    // ---------- 焦点 ----------

    focusByNode(nodes: Node[], notChangeDist = false, immediate = false) {
        if (nodes.length === 0) return;

        // 判定 pivot 模式
        let pivot = 'center';
        try {
            const { Service } = require('../core/decorator');
            pivot = Service.Gizmo?.transformToolData?.pivot ?? 'center';
        } catch (e) {
            // Gizmo may not be initialized
        }

        let targetPos: Vec3;
        if (pivot === 'pivot' && nodes.length === 1) {
            targetPos = getWorldPosition3D(nodes[0]);
        } else {
            targetPos = getCenterWorldPos3D(nodes);
        }

        const range = getMaxRangeOfNodes(nodes);
        let targetDist = this.viewDist;
        if (!notChangeDist) {
            targetDist = Math.max(range * 2.5, 1);
        }

        // 计算目标相机位置
        this.node.getWorldRotation(this._curRot);
        const fwd = new Vec3(0, 0, 1);
        Vec3.transformQuat(fwd, fwd, this._curRot);
        Vec3.normalize(fwd, fwd);

        const targetCamPos = new Vec3();
        Vec3.multiplyScalar(targetCamPos, fwd, targetDist);
        Vec3.add(targetCamPos, targetPos, targetCamPos);

        if (immediate) {
            this.node.setWorldPosition(targetCamPos);
            Vec3.copy(this.sceneViewCenter, targetPos);
            this.viewDist = targetDist;
            this.updateGrid();
        } else {
            const startPos = this.node.getWorldPosition().clone();
            const startDist = this.viewDist;

            this._posAnim = tweenPosition(startPos, targetCamPos, 300);
            this._posAnim.step((pos: Vec3) => {
                this.node.setWorldPosition(pos);
                this.updateGrid();
            });

            this._distAnim = tweenNumber(startDist, targetDist, 300);
            this._distAnim.step((dist: number) => {
                this.viewDist = dist;
                this.updateViewCenterByDist(-dist);
            });
        }

        try {
            const { Service } = require('../core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
    }

    focus(nodeUuids: string[], editorCameraInfo?: EditorCameraInfo, immediate = false) {
        if (editorCameraInfo) {
            // 使用提供的相机信息
            if (editorCameraInfo.position) {
                this.node.setWorldPosition(editorCameraInfo.position);
            }
            if (editorCameraInfo.rotation) {
                this.node.setWorldRotation(editorCameraInfo.rotation);
            }
            if (editorCameraInfo.viewCenter) {
                Vec3.copy(this.sceneViewCenter, editorCameraInfo.viewCenter);
            }
            if (editorCameraInfo.viewDist !== undefined) {
                this.viewDist = editorCameraInfo.viewDist;
            }
            this.updateGrid();
            try {
                const { Service } = require('../core/decorator');
                Service.Engine?.repaintInEditMode?.();
            } catch (e) {
                // Engine may not be ready
            }
            return;
        }

        if (!nodeUuids || nodeUuids.length === 0) return;

        // 通过 UUID 查找节点
        const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
        if (!EditorExtends) return;

        const nodes: Node[] = [];
        for (const uuid of nodeUuids) {
            const node = EditorExtends.Node.getNode(uuid);
            if (node) {
                nodes.push(node);
            }
        }

        if (nodes.length === 0) return;

        this.lastFocusNodeUUID = nodeUuids.slice();
        this.focusByNode(nodes, false, immediate);
    }

    focusByXY(hitPoint: Vec3, immediate = false) {
        if (!hitPoint) return;

        const targetPos = hitPoint.clone();
        const targetDist = this.viewDist;

        this.node.getWorldRotation(this._curRot);
        const fwd = new Vec3(0, 0, 1);
        Vec3.transformQuat(fwd, fwd, this._curRot);
        Vec3.normalize(fwd, fwd);

        const targetCamPos = new Vec3();
        Vec3.multiplyScalar(targetCamPos, fwd, targetDist);
        Vec3.add(targetCamPos, targetPos, targetCamPos);

        if (immediate) {
            this.node.setWorldPosition(targetCamPos);
            Vec3.copy(this.sceneViewCenter, targetPos);
            this.updateGrid();
        } else {
            const startPos = this.node.getWorldPosition().clone();
            this._posAnim = tweenPosition(startPos, targetCamPos, 300);
            this._posAnim.step((pos: Vec3) => {
                this.node.setWorldPosition(pos);
                this.updateViewCenterByDist(-this.viewDist);
                this.updateGrid();
            });
        }

        try {
            const { Service } = require('../core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
    }

    // ---------- 对齐 ----------

    alignNodeToSceneView(nodeUuids: string[]) {
        if (!nodeUuids || nodeUuids.length === 0) return;

        const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
        if (!EditorExtends) return;

        const nodes: Node[] = [];
        for (const uuid of nodeUuids) {
            const node = EditorExtends.Node.getNode(uuid);
            if (node) {
                nodes.push(node);
            }
        }
        if (nodes.length === 0) return;

        // 开始撤销记录
        let undoId: string | undefined;
        try {
            const { Service } = require('../core/decorator');
            undoId = Service.Undo?.beginRecording?.(nodeUuids);
        } catch (e) {
            // Undo may not be ready
        }

        const camPos = this.node.getWorldPosition();
        const camRot = this.node.getWorldRotation();

        for (const node of nodes) {
            node.setWorldPosition(camPos);
            node.setWorldRotation(camRot);

            // 同步相机组件的正交高度
            const cameras = node.getComponents(Camera as any) as Camera[];
            this.alignCameraOrthoHeightToNode(cameras);
        }

        // 结束撤销记录
        if (undoId) {
            try {
                const { Service } = require('../core/decorator');
                Service.Undo?.endRecording?.(undoId);
            } catch (e) {
                // Undo may not be ready
            }
        }

        try {
            const { Service } = require('../core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
    }

    alignCameraOrthoHeightToNode(cameras: Camera[]) {
        if (!cameras || cameras.length === 0) return;
        for (const cam of cameras) {
            if (cam && this._camera) {
                cam.orthoHeight = this._camera.orthoHeight;
            }
        }
    }

    alignSceneViewToNode(nodeUuids: string[]) {
        if (!nodeUuids || nodeUuids.length === 0) return;

        const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
        if (!EditorExtends) return;

        const node = EditorExtends.Node.getNode(nodeUuids[0]);
        if (!node) return;

        const targetPos = node.getWorldPosition();
        const targetRot = node.getWorldRotation();

        this.node.setWorldPosition(targetPos);
        this.node.setWorldRotation(targetRot);
        this.updateViewCenterByDist(-this.viewDist);
        this.updateGrid();

        try {
            const { Service } = require('../core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
    }

    // ---------- 鼠标/键盘事件 ----------

    isMoving(): boolean {
        return this._modeFSM.currentState !== this._idleMode;
    }

    onMouseDBlDown(event: ISceneMouseEvent) {
        const currentMode = this._modeFSM.currentState as ModeBase3D;
        currentMode.onMouseDBlDown(event);
    }

    onMouseDown(event: ISceneMouseEvent) {
        this.mousePressing = true;
        this.shiftKey = event.shiftKey;
        this.altKey = event.altKey;

        // 根据按键组合切换模式
        if (event.rightButton) {
            // 右键：进入漫游模式
            void this.changeMode('wander');
        } else if (event.middleButton) {
            // 中键：进入平移模式
            void this.changeMode('pan');
        } else if (event.leftButton && event.altKey) {
            // Alt + 左键：进入旋转模式
            void this.changeMode('orbit');
        }

        const currentMode = this._modeFSM.currentState as ModeBase3D;
        currentMode.onMouseDown(event);
    }

    onMouseMove(event: ISceneMouseEvent) {
        this.shiftKey = event.shiftKey;
        this.altKey = event.altKey;

        const currentMode = this._modeFSM.currentState as ModeBase3D;
        currentMode.onMouseMove(event);

        try {
            const { Service } = require('../core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
    }

    onMouseUp(event: ISceneMouseEvent) {
        this.mousePressing = false;

        const currentMode = this._modeFSM.currentState as ModeBase3D;
        currentMode.onMouseUp(event);

        // 松开按键后返回空闲模式
        if (this._modeFSM.currentState !== this._idleMode) {
            void this.changeMode('idle');
        }
    }

    onMouseWheel(event: ISceneMouseEvent) {
        const currentMode = this._modeFSM.currentState as ModeBase3D;
        if (currentMode.modeName === CameraMoveMode.WANDER) {
            // 漫游模式下滚轮调节速度
            currentMode.onMouseWheel(event);
        } else {
            // 普通模式下滚轮缩放
            const delta = event.wheelDeltaY || event.deltaY;
            this.smoothScale(delta);
        }

        try {
            const { Service } = require('../core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
    }

    onKeyDown(event: ISceneKeyboardEvent) {
        const currentMode = this._modeFSM.currentState as ModeBase3D;
        currentMode.onKeyDown(event);
    }

    onKeyUp(event: ISceneKeyboardEvent) {
        const currentMode = this._modeFSM.currentState as ModeBase3D;
        currentMode.onKeyUp(event);
    }

    onUpdate(deltaTime: number) {
        const currentMode = this._modeFSM.currentState as ModeBase3D;
        currentMode.onUpdate(deltaTime);
    }

    onResize(size: ISizeLike) {
        this.updateGrid();
        try {
            const { Service } = require('../core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
    }

    // ---------- 网格 ----------

    private _updateGridData(
        positions: number[],
        colors: number[],
        lineColor: Color,
        lineEnd: number,
    ) {
        const camPos = new Vec3();
        this.node.getWorldPosition(camPos);

        const viewRange = this.viewDist * 4;
        this.hTicks.range(camPos.x - viewRange, camPos.x + viewRange, 1000);
        this.vTicks.range(camPos.z - viewRange, camPos.z + viewRange, 1000);

        const r = lineColor.r / 255;
        const g = lineColor.g / 255;
        const b = lineColor.b / 255;

        let idx = 0;

        for (let level = this.hTicks.minTickLevel; level <= this.hTicks.maxTickLevel; level++) {
            const ticks = this.hTicks.ticksAtLevel(level, true);
            const ratio = this.hTicks.tickRatios[level];
            const alpha = (lineColor.a / 255) * ratio;

            for (const tick of ticks) {
                if (idx + 2 > _maxTicks * _maxTicks) break;
                // 竖线：固定 x，从 minV 到 maxV
                positions[idx * 2] = tick;
                positions[idx * 2 + 1] = camPos.z - viewRange;
                colors[idx * 4] = r;
                colors[idx * 4 + 1] = g;
                colors[idx * 4 + 2] = b;
                colors[idx * 4 + 3] = alpha;
                idx++;

                positions[idx * 2] = tick;
                positions[idx * 2 + 1] = camPos.z + viewRange;
                colors[idx * 4] = r;
                colors[idx * 4 + 1] = g;
                colors[idx * 4 + 2] = b;
                colors[idx * 4 + 3] = alpha;
                idx++;
            }
        }

        for (let level = this.vTicks.minTickLevel; level <= this.vTicks.maxTickLevel; level++) {
            const ticks = this.vTicks.ticksAtLevel(level, true);
            const ratio = this.vTicks.tickRatios[level];
            const alpha = (lineColor.a / 255) * ratio;

            for (const tick of ticks) {
                if (idx + 2 > _maxTicks * _maxTicks) break;
                // 横线：固定 z，从 minH 到 maxH
                positions[idx * 2] = camPos.x - viewRange;
                positions[idx * 2 + 1] = tick;
                colors[idx * 4] = r;
                colors[idx * 4 + 1] = g;
                colors[idx * 4 + 2] = b;
                colors[idx * 4 + 3] = alpha;
                idx++;

                positions[idx * 2] = camPos.x + viewRange;
                positions[idx * 2 + 1] = tick;
                colors[idx * 4] = r;
                colors[idx * 4 + 1] = g;
                colors[idx * 4 + 2] = b;
                colors[idx * 4 + 3] = alpha;
                idx++;
            }
        }

        // 填充剩余为零
        while (idx < _maxTicks * _maxTicks) {
            positions[idx * 2] = 0;
            positions[idx * 2 + 1] = 0;
            colors[idx * 4] = 0;
            colors[idx * 4 + 1] = 0;
            colors[idx * 4 + 2] = 0;
            colors[idx * 4 + 3] = 0;
            idx++;
        }

        return idx;
    }

    updateGrid() {
        if (!this._gridMeshComp) return;

        const totalPoints = _maxTicks * _maxTicks;
        const positions: number[] = new Array(totalPoints * 2).fill(0);
        const colors: number[] = new Array(totalPoints * 4).fill(0);
        const indices: number[] = [];

        const count = this._updateGridData(positions, colors, this._lineColor, totalPoints);

        for (let i = 0; i < totalPoints; i++) {
            indices.push(i);
        }

        CameraUtils.updateVBAttr(this._gridMeshComp, 'a_position', positions);
        CameraUtils.updateIB(this._gridMeshComp, indices);

        this.updateOriginAxis();
    }

    refresh() {
        this.updateGrid();
        try {
            const { Service } = require('../core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
    }

    // ---------- 旋转相机到指定方向 ----------

    rotateCameraToDir(dir: Vec3, rotateByViewDist: boolean) {
        const startRot = this.node.getWorldRotation().clone();
        const startPos = this.node.getWorldPosition().clone();

        // 计算目标旋转
        const normalizedDir = new Vec3();
        Vec3.normalize(normalizedDir, dir);

        const targetRot = new Quat();
        Quat.fromViewUp(targetRot, normalizedDir, Vec3.UNIT_Y);

        // 计算目标位置
        const targetPos = new Vec3();
        if (rotateByViewDist) {
            const offset = new Vec3();
            Vec3.multiplyScalar(offset, normalizedDir, -this.viewDist);
            Vec3.add(targetPos, this.sceneViewCenter, offset);
        } else {
            Vec3.copy(targetPos, startPos);
        }

        this._rotAnim = tweenRotation(startRot, targetRot, 300);
        this._rotAnim.step((rot: Quat) => {
            this.node.setWorldRotation(rot);
        });

        this._posAnim = tweenPosition(startPos, targetPos, 300);
        this._posAnim.step((pos: Vec3) => {
            this.node.setWorldPosition(pos);
            this.updateViewCenterByDist(-this.viewDist);
            this.updateGrid();
        });

        try {
            const { Service } = require('../core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
    }

    // ---------- 投影相关 ----------

    getDepthSize(): number {
        if (this.isOrtho()) {
            return this._camera.orthoHeight * 2;
        }
        const fovRad = this._camera.fov * Math.PI / 180;
        return 2 * this.viewDist * Math.tan(fovRad / 2);
    }

    calcCameraPosInOrtho(): Vec3 {
        // 在正交模式下计算等效的透视位置
        const depthSize = this._camera.orthoHeight;
        const fovRad = this._camera.fov * Math.PI / 180;
        const halfFov = Math.tan(fovRad / 2);
        const dist = halfFov > 0 ? depthSize / halfFov : this.viewDist;

        this.node.getWorldRotation(this._curRot);
        const fwd = new Vec3(0, 0, 1);
        Vec3.transformQuat(fwd, fwd, this._curRot);
        Vec3.normalize(fwd, fwd);

        const pos = new Vec3();
        Vec3.multiplyScalar(fwd, fwd, dist);
        Vec3.add(pos, this.sceneViewCenter, fwd);
        return pos;
    }

    isOrtho(): boolean {
        return this._camera.projection === Camera.ProjectionType.ORTHO;
    }

    setOrthoHeight(newOrthoHeight: number) {
        newOrthoHeight = Math.max(this._minScalar, newOrthoHeight);
        this._camera.orthoHeight = newOrthoHeight;

        // 尝试同步到 Gizmo
        try {
            const { Service } = require('../core/decorator');
            if (Service.Gizmo?.transformToolData) {
                Service.Gizmo.transformToolData.cameraOrthoHeight = newOrthoHeight;
            }
        } catch (e) {
            // Gizmo may not be initialized
        }
    }

    changeProjection() {
        if (this.isOrtho()) {
            // 正交 -> 透视
            const pos = this.calcCameraPosInOrtho();
            this._camera.projection = Camera.ProjectionType.PERSPECTIVE;
            this.node.setWorldPosition(pos);
            this.viewDist = Vec3.distance(pos, this.sceneViewCenter);
        } else {
            // 透视 -> 正交
            this._camera.projection = Camera.ProjectionType.ORTHO;
            const fovRad = this._camera.fov * Math.PI / 180;
            const halfFov = Math.tan(fovRad / 2);
            this._camera.orthoHeight = this.viewDist * halfFov;
        }

        this.updateGrid();

        try {
            const { Service } = require('../core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
    }

    // ---------- 缩放快捷键 ----------

    zoomUp() {
        this.scale(this._wheelSpeed * this._wheelBaseScale * 100);
    }

    zoomDown() {
        this.scale(-this._wheelSpeed * this._wheelBaseScale * 100);
    }

    zoomReset() {
        this.reset();
    }

    onDesignResolutionChange() {
        this.updateGrid();
    }
}

export default CameraController3D;

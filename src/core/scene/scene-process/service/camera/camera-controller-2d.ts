import { Camera, Color, ISizeLike, Node, Quat, Rect, Vec3, MeshRenderer, UITransform } from 'cc';
import CameraControllerBase, { EditorCameraInfo } from './camera-controller-base';
import { CameraMoveMode, CameraUtils } from './utils';
import FiniteStateMachine from '../utils/state-machine/finite-state-machine';
import Grid from './grid';
import { ModeBase2D } from './modes/mode-base-2d';
import { IdleMode2D } from './modes/idle-mode-2d';
import { PanMode2D } from './modes/pan-mode-2d';
import { tweenPosition } from './tween';
import type { ISceneMouseEvent, ISceneKeyboardEvent } from '../operation/types';

const _defaultMarginPercentage = 30;
const _scales = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 3, 4, 5];
const _maxTicks = 100;

function clamp(val: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, val));
}

enum ModeCommand {
    ToIdle = 'toIdle',
    ToPan = 'toPan',
}

export class CameraController2D extends CameraControllerBase {
    private _size: ISizeLike = { width: 1920, height: 1080 };
    private _modeFSM!: FiniteStateMachine<ModeBase2D>;
    private _idleMode!: IdleMode2D;
    private _panMode!: PanMode2D;
    private _lineColor = cc.color().fromHEX('#555555');
    private _grid!: Grid;
    private _contentRect!: Rect;
    private _scale2D = 1;

    protected _wheelSpeed = 6;
    protected _near = 1;
    protected _far = 10000;

    // 空格键跟踪，用于切换平移模式
    private _spaceKeyHeld = false;

    // 动画状态
    private _posAnim: any = null;

    isMoving(): boolean {
        return this._modeFSM.currentState !== this._idleMode;
    }

    get lineColor() { return this._lineColor; }
    set lineColor(value: Color) { this._lineColor = value; }
    get grid() { return this._grid; }
    get contentRect(): Rect { return this._contentRect; }
    get scale2D(): number { return this._scale2D; }

    /**
     * 同步 scale2D 到 Gizmo（如果可用）
     */
    private setScale2D(value: number) {
        this._scale2D = value;
        try {
            const { Service } = require('../core/decorator');
            if (Service.Gizmo?.transformToolData) {
                Service.Gizmo.transformToolData.scale2D = value;
            }
        } catch (e) {
            // Gizmo not ready
        }
    }

    showGrid(visible: boolean) {
        super.showGrid(visible);
        if (this._originAxisHorizontalMeshComp?.node) {
            this._originAxisHorizontalMeshComp.node.active = visible;
        }
    }

    init(camera: Camera) {
        super.init(camera);
        this._contentRect = new Rect(0, 0, this._size.width, this._size.height);
        this._gridMeshComp = CameraUtils.createGrid('internal/editor/grid-2d', this.node.parent!);
        this._gridMeshComp.node.active = false;
        this._initGrid();
        this._initMode();
        this.initOriginAxis();
    }

    // ---------- 模式状态机 ----------

    private _initMode() {
        this._idleMode = new IdleMode2D(this);
        this._panMode = new PanMode2D(this);

        const modes = [this._idleMode, this._panMode];
        this._modeFSM = new FiniteStateMachine<ModeBase2D>(modes);

        // idle <-> pan 双向转换
        this._modeFSM.addTransition(this._idleMode, this._panMode, ModeCommand.ToPan);
        this._modeFSM.addTransition(this._panMode, this._idleMode, ModeCommand.ToIdle);

        this._modeFSM.Begin(this._idleMode);
    }

    // ---------- 网格初始化 ----------

    private _initGrid() {
        const width = this._size.width;
        const height = this._size.height;

        this._grid = new Grid(width, height);
        this._grid.setScaleH([1, 2, 5, 10], 0.001, 1000);
        this._grid.setScaleV([1, 2, 5, 10], 0.001, 1000);
        this._grid.setMappingH(-0.5, 0.5, 1);
        this._grid.setMappingV(-0.5, 0.5, 1);
        this._grid.setAnchor(0.5, 0.5);
    }

    // ---------- active ----------

    set active(value: boolean) {
        if (value) {
            // 正交投影
            this._camera.projection = Camera.ProjectionType.ORTHO;
            // 重置旋转为单位四元数
            this.node.setWorldRotation(Quat.IDENTITY);
            this._camera.near = this._near;
            this._camera.far = this._far;
            this.onResize(this._size);
            this.showGrid(true);
        } else {
            this.showGrid(false);
        }
    }

    // ---------- 调整到中心 ----------

    private _adjustToCenter() {
        const width = this._size.width;
        const height = this._size.height;

        // 根据内容矩形计算缩放
        const contentW = this._contentRect.width || width;
        const contentH = this._contentRect.height || height;
        const scale = this.getSizeScale(
            { width: contentW, height: contentH },
            { width, height },
        );

        // 同步网格
        const halfW = width / 2;
        const halfH = height / 2;
        this._grid.xAxisSync(halfW - (this._contentRect.x + contentW / 2) * scale, scale);
        this._grid.yAxisSync(halfH - (this._contentRect.y + contentH / 2) * scale, scale);

        this.adjustCamera();

        // 更新 contentRect 为当前视口范围
        this._contentRect = new Rect(
            this._grid.left,
            this._grid.bottom,
            this._grid.right - this._grid.left,
            this._grid.top - this._grid.bottom,
        );
    }

    // ---------- adjustCamera ----------

    adjustCamera(immediate = true) {
        if (!this._camera) return;

        const width = this._size.width;
        const height = this._size.height;

        // 从网格状态计算相机位置
        const centerX = (this._grid.left + this._grid.right) / 2;
        const centerY = (this._grid.top + this._grid.bottom) / 2;

        const targetPos = new Vec3(centerX, centerY, 1000);

        if (immediate) {
            this.node.setWorldPosition(targetPos);
        } else {
            const startPos = this.node.getWorldPosition().clone();
            this._posAnim = tweenPosition(startPos, targetPos, 300);
            this._posAnim.step((pos: Vec3) => {
                this.node.setWorldPosition(pos);
            });
        }

        // 更新正交高度
        this._updateOrthoHeight(height);

        // 更新 scale2D
        const curScale = this._grid.xAxisScale;
        this.setScale2D(curScale);

        try {
            const { Service } = require('../core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
    }

    // ---------- 更新正交高度 ----------

    private _updateOrthoHeight(height: number) {
        const scale = this._grid.yAxisScale;
        if (scale > 0) {
            this._camera.orthoHeight = height / 2 / scale;
        }
    }

    // ---------- 网格数据更新 ----------

    private _updateGridData() {
        this._grid.updateRange();

        const positions: number[] = [];
        const colors: number[] = [];
        const indices: number[] = [];

        const left = this._grid.left;
        const right = this._grid.right;
        const top = this._grid.top;
        const bottom = this._grid.bottom;

        const r = this._lineColor.r / 255;
        const g = this._lineColor.g / 255;
        const b = this._lineColor.b / 255;
        const baseAlpha = this._lineColor.a / 255;

        let idx = 0;

        // 竖线 (hTicks)
        if (this._grid.hTicks) {
            for (let level = this._grid.hTicks.minTickLevel; level <= this._grid.hTicks.maxTickLevel; level++) {
                const ticks = this._grid.hTicks.ticksAtLevel(level, true);
                const ratio = this._grid.hTicks.tickRatios[level];
                const alpha = baseAlpha * ratio;

                for (const tick of ticks) {
                    if (idx + 2 > _maxTicks * _maxTicks) break;
                    // 竖线：固定 x，从 bottom 到 top
                    positions.push(tick, bottom);
                    colors.push(r, g, b, alpha);
                    idx++;

                    positions.push(tick, top);
                    colors.push(r, g, b, alpha);
                    idx++;
                }
            }
        }

        // 横线 (vTicks)
        if (this._grid.vTicks) {
            for (let level = this._grid.vTicks.minTickLevel; level <= this._grid.vTicks.maxTickLevel; level++) {
                const ticks = this._grid.vTicks.ticksAtLevel(level, true);
                const ratio = this._grid.vTicks.tickRatios[level];
                const alpha = baseAlpha * ratio;

                for (const tick of ticks) {
                    if (idx + 2 > _maxTicks * _maxTicks) break;
                    // 横线：固定 y，从 left 到 right
                    positions.push(left, tick);
                    colors.push(r, g, b, alpha);
                    idx++;

                    positions.push(right, tick);
                    colors.push(r, g, b, alpha);
                    idx++;
                }
            }
        }

        // 填充剩余为零
        while (idx < _maxTicks * _maxTicks) {
            positions.push(0, 0);
            colors.push(0, 0, 0, 0);
            idx++;
        }

        // 构建索引
        for (let i = 0; i < _maxTicks * _maxTicks; i++) {
            indices.push(i);
        }

        return { positions, colors, indices };
    }

    updateGrid() {
        if (!this._gridMeshComp) return;

        const { positions, colors, indices } = this._updateGridData();

        CameraUtils.updateVBAttr(this._gridMeshComp, 'a_position', positions);
        CameraUtils.updateIB(this._gridMeshComp, indices);

        this.updateOriginAxis();
    }

    // ---------- 原点轴 ----------

    private initOriginAxis() {
        const parentNode = this.node.parent || this.node;
        this._originAxisHorizontalMeshComp = CameraUtils.createGrid('internal/editor/grid-2d', parentNode);

        // 默认不显示
        if (this._originAxisHorizontalMeshComp?.node) {
            this._originAxisHorizontalMeshComp.node.active = false;
        }
    }

    updateOriginAxisByConfig(config: { x?: boolean; y?: boolean }, update = true) {
        if (config.x !== undefined) this.originAxisX_Visible = config.x;
        if (config.y !== undefined) this.originAxisY_Visible = config.y;

        const showAxis = this.originAxisX_Visible || this.originAxisY_Visible;
        if (this._originAxisHorizontalMeshComp?.node) {
            this._originAxisHorizontalMeshComp.node.active = showAxis;
        }

        if (update) {
            this.updateOriginAxis();
        }
    }

    updateOriginAxis() {
        if (!this._originAxisHorizontalMeshComp?.node?.active) return;

        const left = this._grid.left;
        const right = this._grid.right;
        const top = this._grid.top;
        const bottom = this._grid.bottom;

        const positions: number[] = [];
        const colors: number[] = [];
        const indices: number[] = [];
        let idx = 0;

        // X 轴 (水平红线, y=0)
        if (this.originAxisX_Visible) {
            positions.push(left, 0, right, 0);
            const r = this.originAxisX_Color.r / 255;
            const g = this.originAxisX_Color.g / 255;
            const b = this.originAxisX_Color.b / 255;
            colors.push(r, g, b, 1, r, g, b, 1);
            indices.push(idx, idx + 1);
            idx += 2;
        }

        // Y 轴 (垂直绿线, x=0)
        if (this.originAxisY_Visible) {
            positions.push(0, bottom, 0, top);
            const r = this.originAxisY_Color.r / 255;
            const g = this.originAxisY_Color.g / 255;
            const b = this.originAxisY_Color.b / 255;
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

    // ---------- 焦点 ----------

    focus(nodeUuids: string[], editorCameraInfo?: EditorCameraInfo, immediate = false) {
        if (editorCameraInfo) {
            if (editorCameraInfo.position) {
                this.node.setWorldPosition(editorCameraInfo.position);
            }
            this.updateGrid();
            this.adjustCamera();
            try {
                const { Service } = require('../core/decorator');
                Service.Engine?.repaintInEditMode?.();
            } catch (e) {
                // Engine may not be ready
            }
            return;
        }

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

        // 尝试通过 UITransform 或 MeshRenderer 计算包围盒
        let focusRect: Rect | null = null;

        for (const node of nodes) {
            const uiTransform = node.getComponent(UITransform) as UITransform | null;
            if (uiTransform) {
                const rect = uiTransform.getBoundingBoxToWorld();
                if (focusRect) {
                    Rect.union(focusRect, focusRect, rect);
                } else {
                    focusRect = rect.clone();
                }
                continue;
            }

            const meshRenderer = node.getComponent(MeshRenderer) as MeshRenderer | null;
            if (meshRenderer && meshRenderer.model) {
                const worldBounds = meshRenderer.model.worldBounds;
                if (worldBounds) {
                    const min = worldBounds.center.clone();
                    Vec3.subtract(min, min, worldBounds.halfExtents);
                    const max = worldBounds.center.clone();
                    Vec3.add(max, max, worldBounds.halfExtents);
                    const rect = new Rect(min.x, min.y, max.x - min.x, max.y - min.y);
                    if (focusRect) {
                        Rect.union(focusRect, focusRect, rect);
                    } else {
                        focusRect = rect.clone();
                    }
                    continue;
                }
            }

            // 使用世界坐标作为最终回退
            const worldPos = node.getWorldPosition();
            const fallbackRect = new Rect(worldPos.x - 50, worldPos.y - 50, 100, 100);
            if (focusRect) {
                Rect.union(focusRect, focusRect, fallbackRect);
            } else {
                focusRect = fallbackRect.clone();
            }
        }

        if (!focusRect) return;

        this.fitSize(focusRect);
    }

    // ---------- 缩放 ----------

    smoothScale(delta: number, curScale: number): number {
        return Math.pow(2, delta * 0.002) * curScale;
    }

    scale(delta: number, offsetX?: number, offsetY?: number) {
        const width = this._size.width;
        const height = this._size.height;

        const curScaleX = this._grid.xAxisScale;
        const curScaleY = this._grid.yAxisScale;

        let newScale = this.smoothScale(delta, curScaleX);

        // 限制缩放范围
        if (this._grid.hTicks) {
            newScale = clamp(newScale, this._grid.hTicks.minValueScale, this._grid.hTicks.maxValueScale);
        }

        const px = offsetX !== undefined ? offsetX : width / 2;
        const py = offsetY !== undefined ? offsetY : height / 2;

        this._grid.xAxisScaleAt(px, newScale);
        this._grid.yAxisScaleAt(py, newScale);

        this.updateGrid();
        this.adjustCamera();
    }

    // ---------- fitSize ----------

    fitSize(rect: Rect) {
        const width = this._size.width;
        const height = this._size.height;

        const margin = _defaultMarginPercentage / 100;
        const availW = width * (1 - margin);
        const availH = height * (1 - margin);

        const scaleX = availW / (rect.width || 1);
        const scaleY = availH / (rect.height || 1);
        const scale = Math.min(scaleX, scaleY);

        // 限制范围
        let finalScale = scale;
        if (this._grid.hTicks) {
            finalScale = clamp(finalScale, this._grid.hTicks.minValueScale, this._grid.hTicks.maxValueScale);
        }

        const centerX = rect.x + rect.width / 2;
        const centerY = rect.y + rect.height / 2;

        const halfW = width / 2;
        const halfH = height / 2;

        this._grid.xAxisSync(halfW - centerX * finalScale, finalScale);
        this._grid.yAxisSync(halfH - centerY * finalScale, finalScale);

        this.updateGrid();
        this.adjustCamera();
    }

    getSizeScale(contentSize: ISizeLike, viewSize: ISizeLike): number {
        const scaleX = viewSize.width / (contentSize.width || 1);
        const scaleY = viewSize.height / (contentSize.height || 1);
        return Math.min(scaleX, scaleY);
    }

    // ---------- 鼠标/键盘事件 ----------

    onMouseDown(event: ISceneMouseEvent) {
        // 中键或右键 → 进入平移模式
        if (event.middleButton || event.rightButton) {
            void this._modeFSM.issueCommand(ModeCommand.ToPan);
        }

        const currentMode = this._modeFSM.currentState as ModeBase2D;
        currentMode.onMouseDown(event);
    }

    onMouseMove(event: ISceneMouseEvent) {
        const currentMode = this._modeFSM.currentState as ModeBase2D;
        currentMode.onMouseMove(event);

        try {
            const { Service } = require('../core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
    }

    onMouseUp(event: ISceneMouseEvent) {
        const currentMode = this._modeFSM.currentState as ModeBase2D;
        currentMode.onMouseUp(event);

        // 松开按键后返回空闲模式（如果不是空格保持平移）
        if (this._modeFSM.currentState !== this._idleMode && !this._spaceKeyHeld) {
            void this._modeFSM.issueCommand(ModeCommand.ToIdle);
        }
    }

    onMouseWheel(event: ISceneMouseEvent) {
        const delta = event.wheelDeltaY || event.deltaY;
        this.scale(delta, event.x, event.y);

        try {
            const { Service } = require('../core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
    }

    onMouseDBlDown(event: ISceneMouseEvent) {
        const currentMode = this._modeFSM.currentState as ModeBase2D;
        currentMode.onMouseDBlDown(event);
    }

    onKeyDown(event: ISceneKeyboardEvent) {
        // 空格键切换到平移模式
        if (event.key === ' ' || event.code === 'Space') {
            this._spaceKeyHeld = true;
            void this._modeFSM.issueCommand(ModeCommand.ToPan);
        }

        const currentMode = this._modeFSM.currentState as ModeBase2D;
        currentMode.onKeyDown(event);
    }

    onKeyUp(event: ISceneKeyboardEvent) {
        // 释放空格键返回空闲模式
        if (event.key === ' ' || event.code === 'Space') {
            this._spaceKeyHeld = false;
            void this._modeFSM.issueCommand(ModeCommand.ToIdle);
        }

        const currentMode = this._modeFSM.currentState as ModeBase2D;
        currentMode.onKeyUp(event);
    }

    onUpdate(deltaTime: number) {
        const currentMode = this._modeFSM.currentState as ModeBase2D;
        currentMode.onUpdate(deltaTime);
    }

    // ---------- onResize ----------

    onResize(size?: ISizeLike) {
        if (size) {
            this._size = size;
        }
        const width = this._size.width;
        const height = this._size.height;
        this._grid.resize(width, height);
        this.updateGrid();
        this.adjustCamera();
    }

    // ---------- refresh ----------

    refresh() {
        this.updateGrid();
        this.adjustCamera();
        try {
            const { Service } = require('../core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
    }

    // ---------- 缩放快捷键 ----------

    zoomTo(scaleValue: number) {
        const width = this._size.width;
        const height = this._size.height;
        const px = width / 2;
        const py = height / 2;

        let finalScale = scaleValue;
        if (this._grid.hTicks) {
            finalScale = clamp(finalScale, this._grid.hTicks.minValueScale, this._grid.hTicks.maxValueScale);
        }

        this._grid.xAxisScaleAt(px, finalScale);
        this._grid.yAxisScaleAt(py, finalScale);

        this.updateGrid();
        this.adjustCamera();
    }

    zoomUp() {
        const curScale = this._grid.xAxisScale;
        // 找到下一个更大的缩放档位
        for (const s of _scales) {
            if (s > curScale + 0.001) {
                this.zoomTo(s);
                return;
            }
        }
        // 已达最大
        this.zoomTo(_scales[_scales.length - 1]);
    }

    zoomDown() {
        const curScale = this._grid.xAxisScale;
        // 找到下一个更小的缩放档位
        for (let i = _scales.length - 1; i >= 0; i--) {
            if (_scales[i] < curScale - 0.001) {
                this.zoomTo(_scales[i]);
                return;
            }
        }
        // 已达最小
        this.zoomTo(_scales[0]);
    }

    zoomReset() {
        this.zoomTo(1);
        this._adjustToCenter();
    }

    onDesignResolutionChange() {
        this.updateGrid();
        this.adjustCamera();
    }
}

export default CameraController2D;

'use strict';

import { CCObject, Color, Layers, Mat4, Node, Quat, Size, UITransform, Vec2, Vec3 } from 'cc';
import type { GizmoMouseEvent } from '../utils/defines';
import TransformBaseGizmo from './transform-base';
import { RectangleController, RectHandleType as HandleType } from './rectangle-controller';
import { getRaycastResultNodes } from '../utils/node-utils';

function getService(): any {
    try {
        const { Service } = require('../../core/decorator');
        return Service;
    } catch (e) {
        return null;
    }
}

function toPrecision(val: number, n: number): number {
    const f = Math.pow(10, n);
    return Math.round(val * f) / f;
}

function makeVec3InPrecision(v: Vec3, p: number): Vec3 {
    const f = Math.pow(10, p);
    v.x = Math.round(v.x * f) / f;
    v.y = Math.round(v.y * f) / f;
    v.z = Math.round(v.z * f) / f;
    return v;
}

const tempVec2 = new Vec2();
const tempVec3 = new Vec3();
const tempMat4 = new Mat4();
const tempQuat_a = new Quat();

let _controller: RectangleController | null = null;

class RectGizmo extends TransformBaseGizmo {
    declare protected _controller: RectangleController;

    private _worldPosList: Vec3[] = [];
    private _localPosList: Vec3[] = [];
    private _sizeList: Size[] = [];
    private _anchorList: Vec2[] = [];
    private _validTarget: UITransform[] = [];
    private _altKey = false;
    private _shiftKey = false;

    init() {
        this.createController();
    }

    layer() {
        return 'foreground';
    }

    isNodePositionLocked(node: Node) {
        if (!node) {
            return false;
        }
        return node.components.some((component: any) => component._objFlags & CCObject.Flags.IsPositionLocked);
    }

    isNodeAnchorLocked(node: Node) {
        if (!node) {
            return false;
        }
        return node.components.some((component: any) => component._objFlags & CCObject.Flags.IsAnchorLocked);
    }

    isNodeContentSizeLocked(node: Node) {
        if (!node) {
            return false;
        }
        return node.components.some((component: any) => component._objFlags & CCObject.Flags.IsSizeLocked);
    }

    onTargetUpdate(): void {
        if (_controller) {
            this._controller = _controller;
            _controller.onControllerMouseDown = this.onControllerMouseDown.bind(this);
            _controller.onControllerMouseMove = this.onControllerMouseMove.bind(this);
            _controller.onControllerMouseUp = this.onControllerMouseUp.bind(this);
        }
        if (this._controller) {
            this._controller.editable = !!this.target;
        }
        super.onTargetUpdate();
    }

    createController() {
        if (_controller) {
            this._controller = _controller;
        } else {
            const gizmoRoot = this.getGizmoRoot();
            const rectCtrl = new RectangleController(gizmoRoot, { needAnchor: true });
            this._controller = _controller = rectCtrl;
        }

        this._controller.setColor(new Color(0, 153, 255));
        this._controller.setEditHandlesColor(new Color(0, 153, 255));

        this._controller.onControllerMouseDown = this.onControllerMouseDown.bind(this);
        this._controller.onControllerMouseMove = this.onControllerMouseMove.bind(this);
        this._controller.onControllerMouseUp = this.onControllerMouseUp.bind(this);

        this._controller.editable = !!this.target;
    }

    onControllerMouseDown() {
        if (this._controller && this.nodes.length) {
            this._controller.contentSizeLocked = this.nodes.some(node => this.isNodeContentSizeLocked(node));
            this._controller.anchorLocked = this.nodes.some(node => this.isNodeAnchorLocked(node));
        }
        this._worldPosList.length = 0;
        this._localPosList.length = 0;
        this._sizeList.length = 0;
        this._anchorList.length = 0;
        // 可能有不含 ui transform component 的 node 被选中，剔除掉
        this._validTarget.length = 0;

        const nodes = this.nodes;
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const uiTransComp = node.getComponent(UITransform);
            if (uiTransComp) {
                this._validTarget.push(uiTransComp);
                this._worldPosList.push(node.getWorldPosition());
                this._localPosList.push(node.getPosition());
                this._sizeList.push(uiTransComp.contentSize.clone());
                this._anchorList.push(uiTransComp.anchorPoint.clone());
            }
        }
    }

    onControllerMouseMove() {
        this.updateDataFromController();
    }

    onControllerMouseUp(event: GizmoMouseEvent) {
        if (this._controller.updated) {
            this.onControlEnd('position');
        } else {
            const svc = getService();
            const selected: string[] = svc?.Selection?.query?.() ?? [];
            if (selected.length === 1) {
                const camera = svc?.Camera?.getCamera?.()?.camera;
                const mask = Layers.makeMaskExclude([Layers.Enum.GIZMOS, Layers.Enum.SCENE_GIZMO]);
                const results = getRaycastResultNodes(camera, event.x, event.y, mask);
                const firstSelection = selected[0];
                for (let i = 0; i < results.length; i++) {
                    if (results[i] && firstSelection === results[i].uuid) {
                        if (i === results.length - 1) {
                            svc?.Selection?.unselect?.(firstSelection);
                            svc?.Selection?.select?.(results[0].uuid);
                        } else if (results[i + 1]?.uuid) {
                            svc?.Selection?.unselect?.(firstSelection);
                            svc?.Selection?.select?.(results[i + 1].uuid);
                        }
                        break;
                    }
                }
            }
        }
    }

    onKeyDown(event: any) {
        this._altKey = event.altKey;
        this._shiftKey = event.shiftKey;
        return super.onKeyDown(event);
    }

    onKeyUp(event: any) {
        const curType = this._controller.getCurHandleType();
        const curHandleIsCorner = this._controller.isCorner(curType) || this._controller.isBorder(curType);
        const isAltTurnToFalse = this._altKey && !event.altKey;
        if (isAltTurnToFalse && curHandleIsCorner) {
            this._controller.reset();
        }
        this._altKey = event.altKey;
        this._shiftKey = event.shiftKey;

        return super.onKeyUp(event);
    }

    handleAreaMove(delta: Vec3) {
        for (let i = 0; i < this._validTarget.length; i++) {
            const node = this._validTarget[i].node;

            if (this.isNodePositionLocked(node)) {
                continue;
            }

            const worldPos = this._worldPosList[i];
            const rectToolPos = new Vec3();
            Vec3.add(rectToolPos, worldPos, delta);

            rectToolPos.x = toPrecision(rectToolPos.x, 3);
            rectToolPos.y = toPrecision(rectToolPos.y, 3);
            node.setWorldPosition(rectToolPos);
        }
    }

    handleAnchorMove(delta: Vec3) {
        // 不处理多UI选择的anchor编辑
        if (this._validTarget.length > 1) {
            return;
        }

        const uiTransComp = this._validTarget[0];
        const node = uiTransComp.node;
        const size = this._sizeList[0];
        const oldAnchor = this._anchorList[0];
        const worldPos = this._worldPosList[0];

        const posDelta = delta.clone();
        makeVec3InPrecision(posDelta, 3);
        tempVec3.set(worldPos);
        tempVec3.add(posDelta);
        node.setWorldPosition(tempVec3);

        // 转换到局部坐标
        node.getWorldMatrix(tempMat4);
        Mat4.invert(tempMat4, tempMat4);
        tempMat4.m12 = tempMat4.m13 = 0;
        Vec3.transformMat4(posDelta, posDelta, tempMat4);

        tempVec2.x = posDelta.x / size.width;
        tempVec2.y = posDelta.y / size.height;

        tempVec2.add(oldAnchor);
        uiTransComp.anchorPoint = tempVec2;
    }

    modifyPosDeltaWithAnchor(type: any, posDelta: Vec3, sizeDelta: Vec2, anchor: Vec2, keepCenter: boolean) {
        if (type === HandleType.Right ||
            type === HandleType.TopRight ||
            type === HandleType.BottomRight) {
            if (keepCenter) {
                sizeDelta.x /= (1 - anchor.x);
            }
            posDelta.x = sizeDelta.x * anchor.x;
        } else {
            if (keepCenter) {
                sizeDelta.x /= anchor.x;
            }
            posDelta.x = -sizeDelta.x * (1 - anchor.x);
        }

        if (type === HandleType.Bottom ||
            type === HandleType.BottomRight ||
            type === HandleType.BottomLeft) {
            if (keepCenter) {
                sizeDelta.y /= anchor.y;
            }
            posDelta.y = -sizeDelta.y * (1 - anchor.y);
        } else {
            if (keepCenter) {
                sizeDelta.y /= (1 - anchor.y);
            }
            posDelta.y = sizeDelta.y * anchor.y;
        }
    }

    // 用于size宽高大小的delta变化映射到边框坐标点的delta变化
    formatSizeDelta(type: HandleType, sizeDelta: Vec2) {
        if (type === HandleType.Left ||
            type === HandleType.TopLeft ||
            type === HandleType.BottomLeft) {
            sizeDelta.x = -sizeDelta.x;
        }

        if (type === HandleType.Bottom ||
            type === HandleType.BottomRight ||
            type === HandleType.BottomLeft) {
            sizeDelta.y = -sizeDelta.y;
        }
    }

    handleOneTargetSize(type: HandleType, delta: Vec3, keepCenter: boolean, keepScale: boolean) {
        const size = this._sizeList[0];

        const posDelta = delta.clone();
        const sizeDelta = new Vec2(delta.x, delta.y);
        const localPos = this._localPosList[0];
        const uiTransComp = this._validTarget[0];
        const node = uiTransComp.node;
        const anchor = this._anchorList[0];

        sizeDelta.x = toPrecision(sizeDelta.x, 3);
        sizeDelta.y = toPrecision(sizeDelta.y, 3);
        this.modifyPosDeltaWithAnchor(type, posDelta, sizeDelta, anchor, keepCenter);
        // 转换到基于父节点的局部坐标系
        if (node.parent) {
            node.parent.getWorldMatrix(tempMat4);
            Mat4.invert(tempMat4, tempMat4);
            tempMat4.m12 = tempMat4.m13 = 0;
            Vec3.transformMat4(posDelta, posDelta, tempMat4);
        }

        if (!keepCenter) {
            // 乘上当前节点的旋转
            const localRot = tempQuat_a;
            node.getRotation(localRot);
            Vec3.transformQuat(posDelta, posDelta, localRot);
            posDelta.z = 0;
            tempVec3.set(localPos);
            tempVec3.add(posDelta);
            node.setPosition(tempVec3);
        }

        // contentSize 受到scale 影响
        const worldScale = new Vec3();
        node.getWorldScale(worldScale);
        sizeDelta.x = sizeDelta.x / worldScale.x;
        sizeDelta.y = sizeDelta.y / worldScale.y;

        let height = size.height;
        let width = size.width;
        if (keepScale) {
            if (sizeDelta.x) {
                width = size.width + sizeDelta.x;
                if (size.width) {
                    const scale = width / size.width;
                    height = scale * size.height;
                } else {
                    height = width;
                }
            } else if (sizeDelta.y) {
                height = size.height + sizeDelta.y;
                if (size.height) {
                    const scale = height / size.height;
                    width = scale * size.width;
                } else {
                    width = height;
                }
            }
        } else {
            height = size.height + sizeDelta.y;
            width = size.width + sizeDelta.x;
        }

        uiTransComp.contentSize = new Size(width, height);
    }

    updateDataFromController() {
        if (this._controller.updated) {
            this.onControlUpdate('position');

            const rectCtrl = this._controller as RectangleController;
            const handleType = rectCtrl.getCurHandleType();
            const deltaSize = rectCtrl.getDeltaSize();
            if (handleType === HandleType.Area) {
                this.handleAreaMove(deltaSize);
            } else if (handleType === HandleType.Anchor) {
                this.handleAnchorMove(deltaSize);
            } else {
                const keepCenter: boolean = this._altKey;
                const keepScale: boolean = this._shiftKey;
                this.handleOneTargetSize(handleType, deltaSize, keepCenter, keepScale);
            }
        }
    }

    updateControllerTransform() {
        this._controller.editable = !!this.target;
        this.updateControllerData();
    }

    updateControllerData() {
        if (!this._isInitialized || !this.nodes || this.nodes.length === 0) {
            return;
        }

        const rectCtrl = this._controller as RectangleController;
        rectCtrl.checkEdit();

        const length = this.nodes.length;
        if (length === 1) {
            const node = this.nodes[0];

            const worldPos = node.getWorldPosition();
            const worldRot = tempQuat_a;
            node.getWorldRotation(worldRot);
            const worldScale = node.getWorldScale();

            rectCtrl.setPosition(worldPos);
            rectCtrl.setRotation(worldRot);
            rectCtrl.setScale(worldScale);

            const uiTransComp = node.getComponent(UITransform);
            if (uiTransComp) {
                const size = uiTransComp.contentSize;
                const anchor = uiTransComp.anchorPoint;
                const center = new Vec3();
                center.x = (0.5 - anchor.x) * size.width;
                center.y = (0.5 - anchor.y) * size.height;
                rectCtrl.updateSize(center, new Vec2(size.width, size.height));
            } else {
                rectCtrl.hide();
            }
        } else {
            // 多选时简化：取第一个节点的位置
            const node = this.nodes[0];
            const worldPos = node.getWorldPosition();
            rectCtrl.setPosition(worldPos);
            rectCtrl.setRotation(Quat.IDENTITY);
            rectCtrl.setScale(new Vec3(1, 1, 1));
            const uiTransComp = node.getComponent(UITransform);
            if (uiTransComp) {
                const size = uiTransComp.contentSize;
                rectCtrl.updateSize(new Vec3(), new Vec2(size.width, size.height));
            }
        }
    }
}

export default RectGizmo;

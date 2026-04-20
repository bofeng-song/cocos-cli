'use strict';

import { CCObject, Layers, Node, Vec3 } from 'cc';
import { OperationPriority } from '../operation/types';
import type { ISceneMouseEvent, ISceneKeyboardEvent } from '../operation/types';
import type { GizmoMouseEvent } from './utils/defines';
import { getRaycastResultsByNodes } from './utils/engine-utils';
import { getRaycastResultNodes, getRegionNodes } from './utils/node-utils';

function getService(): any {
    try {
        const { Service } = require('../core/decorator');
        return Service;
    } catch (e) {
        return null;
    }
}

function getServiceProp(name: string): any {
    try {
        return getService()?.[name];
    } catch (e) {
        return null;
    }
}

/**
 * Create a GizmoMouseEvent from an ISceneMouseEvent
 * Note: Our GizmoMouseEvent is a plain data class, NOT extending CCEvent
 */
function createGizmoMouseEvent(type: string, event: ISceneMouseEvent): GizmoMouseEvent {
    const { GizmoMouseEvent: GME } = require('./utils/defines');
    const gme = new GME();
    gme.type = type;
    gme.x = event.x;
    gme.y = event.y;
    gme.ctrlKey = event.ctrlKey;
    gme.shiftKey = event.shiftKey;
    gme.altKey = event.altKey;
    gme.metaKey = event.metaKey;
    gme.leftButton = event.leftButton;
    gme.middleButton = event.middleButton;
    gme.rightButton = event.rightButton;
    gme.moveDeltaX = event.moveDeltaX;
    gme.moveDeltaY = -(event.moveDeltaY); // invert Y
    gme.button = event.button;
    gme.buttons = event.buttons;
    return gme;
}

class GizmoOperation {
    private _regionSelecting = false;
    private _gizmoMoved = false;
    private _hoverInNodeMap: Map<Node, boolean> = new Map();
    private _curMouseDownInfos: { node: Node; hitPoint: Vec3 }[] = [];
    private _gizmoMouseDownEvent: ISceneMouseEvent | null = null;
    private _noGizmoMouseDownEvent: ISceneMouseEvent | null = null;
    private _mouseDownRaycastGizmos: any[] = [];
    private _anyKeyDown = false;

    /**
     * Raycast against gizmo nodes
     */
    private raycastGizmos(x: number, y: number): any[] {
        const gizmoSvc = getServiceProp('Gizmo');
        const gizmoRoot = gizmoSvc?.gizmoRootNode;
        if (!gizmoRoot) return [];

        const results = getRaycastResultsByNodes(
            [gizmoRoot], x, y, Infinity, false, Layers.Enum.IGNORE_RAYCAST,
        );
        return results;
    }

    private _emitEventToNode(node: Node, event: GizmoMouseEvent) {
        if (event.type) {
            node.emit(event.type, event);
            getServiceProp('Engine')?.repaintInEditMode?.();
        }
    }

    // --- Not-on-gizmo handlers ---

    private _onNotGizmoMouseDown(_event: GizmoMouseEvent) {
        // placeholder for region select start
    }

    private _onNotGizmoMouseUp(event: GizmoMouseEvent): boolean {
        const isViewMode = getServiceProp('Gizmo')?.transformToolData?.viewMode === 'view';
        if (event.leftButton && !isViewMode) {
            if (this._regionSelecting) {
                this._regionSelecting = false;
            } else {
                this._selectNode(event);
            }
        }
        return true;
    }

    private _onNotGizmoMouseMove(event: GizmoMouseEvent): boolean | undefined {
        if (this._anyKeyDown) return true;

        const downEvent = this._noGizmoMouseDownEvent;
        const isViewMode = getServiceProp('Gizmo')?.transformToolData?.viewMode === 'view';
        if (event.leftButton && downEvent && !isViewMode) {
            const dx = event.x - downEvent.x;
            const dy = event.y - downEvent.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < 10) return false;
            this._regionSelecting = true;
            const revertX = downEvent.x > event.x;
            const revertY = downEvent.y < event.y;
            const left = revertX ? event.x : downEvent.x;
            const right = revertX ? downEvent.x : event.x;
            const bottom = revertY ? downEvent.y : event.y;
            const top = revertY ? event.y : downEvent.y;
            this._regionSelectNode(left, right, top, bottom, event.metaKey || event.ctrlKey);
            return false;
        }
        return undefined;
    }

    // --- Gizmo-hit handlers ---

    private _onGizmoMouseDown(event: GizmoMouseEvent, results: any[]): boolean {
        if (event.leftButton) {
            for (const info of results) {
                const backInfo = {
                    node: info.node,
                    hitPoint: info.hitPoint ? info.hitPoint.clone() : new Vec3(),
                };
                this._curMouseDownInfos.push(backInfo);
                event.hitPoint = backInfo.hitPoint;
                this._emitEventToNode(info.node, event);
                if (event.propagationStopped) break;
            }
            return false;
        }
        return true;
    }

    private _onGizmoMouseUp(event: GizmoMouseEvent): boolean {
        if (this._curMouseDownInfos.length > 0) {
            for (const info of this._curMouseDownInfos) {
                event.hitPoint = info.hitPoint;
                this._emitEventToNode(info.node, event);
                if (event.propagationStopped) break;
            }
            this._curMouseDownInfos.length = 0;
            return false;
        }
        return true;
    }

    private _onGizmoMouseMove(event: GizmoMouseEvent, results: any[]) {
        if (this._curMouseDownInfos.length > 0) {
            const map = new Map<Node, Vec3>();
            results.forEach((info: any) => map.set(info.node, info.hitPoint || new Vec3()));
            for (const info of this._curMouseDownInfos) {
                event.hitPoint = map.get(info.node) || new Vec3();
                this._emitEventToNode(info.node, event);
                if (event.propagationStopped) break;
            }
        }
    }

    // --- Main event handlers ---

    public onMouseDown(event: ISceneMouseEvent): boolean | void {
        this._gizmoMoved = false;
        this._anyKeyDown = event.altKey || event.ctrlKey || event.shiftKey || event.metaKey;

        const customEvent = createGizmoMouseEvent('mouseDown', event);
        const results = this.raycastGizmos(customEvent.x, customEvent.y);
        this._mouseDownRaycastGizmos = results;

        if (results.length > 0) {
            this._gizmoMouseDownEvent = event;
            return this._onGizmoMouseDown(customEvent, results);
        } else {
            this._noGizmoMouseDownEvent = event;
            this._onNotGizmoMouseDown(customEvent);
        }
    }

    public onMouseUp(event: ISceneMouseEvent): boolean | void {
        this._anyKeyDown = false;
        const customEvent = createGizmoMouseEvent('mouseUp', event);

        if (this._mouseDownRaycastGizmos.length > 0) {
            if (!this._gizmoMouseDownEvent) return true;
            this._gizmoMouseDownEvent = null;
            return this._onGizmoMouseUp(customEvent);
        } else {
            if (!this._noGizmoMouseDownEvent) return true;
            this._noGizmoMouseDownEvent = null;
            return this._onNotGizmoMouseUp(customEvent);
        }
    }

    public onMouseMove(event: ISceneMouseEvent): boolean | void {
        this._gizmoMoved = true;
        const customEvent = createGizmoMouseEvent('mouseMove', event);
        const results = this.raycastGizmos(customEvent.x, customEvent.y);

        if (this._mouseDownRaycastGizmos.length > 0) {
            if (!this._gizmoMouseDownEvent) {
                return this._changeMouseHover(customEvent, results);
            }
            this._onGizmoMouseMove(customEvent, results);
            return false;
        } else {
            if (!this._noGizmoMouseDownEvent) {
                return this._changeMouseHover(customEvent, results);
            }
            return this._onNotGizmoMouseMove(customEvent);
        }
    }

    public onMouseWheel() {}

    private _changeMouseHover(event: GizmoMouseEvent, results: any[]): boolean {
        if (this._anyKeyDown) return true;

        let hoverInNode: Node | null = null;
        const tempSet: Set<Node> = new Set();

        if (results.length > 0) {
            for (const info of results) {
                event.hitPoint = info.hitPoint;
                info.node.emit(event.type, event);
            }

            for (const info of results) {
                tempSet.add(info.node);
                if (!this._hoverInNodeMap.has(info.node)) {
                    hoverInNode = info.node;
                    this._hoverInNodeMap.set(info.node, event.propagationStopped);
                }
                if (this._hoverInNodeMap.get(info.node)) break;
            }
        }

        // hoverOut
        this._hoverInNodeMap.forEach((_bool, node) => {
            if (!tempSet.has(node)) {
                event.type = 'hoverOut';
                (event as any).customData = { hoverInNodeMap: this._hoverInNodeMap };
                this._emitEventToNode(node, event);
                this._hoverInNodeMap.delete(node);
            }
        });

        // hoverIn after hoverOut
        if (hoverInNode) {
            event.type = 'hoverIn';
            this._emitEventToNode(hoverInNode, event);
        }

        return true;
    }

    // --- Node selection ---

    private _selectNode(event: GizmoMouseEvent) {
        const camera = getServiceProp('Camera')?.getCamera?.()?.camera;
        if (!camera) return;

        const mask = Layers.makeMaskExclude([
            Layers.Enum.GIZMOS,
            Layers.Enum.SCENE_GIZMO,
            Layers.Enum.EDITOR,
            Layers.Enum.IGNORE_RAYCAST,
        ]);
        const nodes = getRaycastResultNodes(camera, event.x, event.y, mask);
        const selection = getServiceProp('Selection');

        if (nodes.length > 0) {
            let resultNode: Node | null = null;
            for (const checkNode of nodes) {
                if (checkNode._objFlags & CCObject.Flags.LockedInEditor) continue;
                resultNode = checkNode;
                break;
            }
            if (!resultNode) return;

            if (!event.ctrlKey && !event.shiftKey) {
                selection?.clear?.();
            }

            if (event.ctrlKey) {
                const selected = selection?.query?.() ?? [];
                if (selected.includes(resultNode.uuid)) {
                    selection?.unselect?.(resultNode.uuid);
                } else {
                    selection?.select?.(resultNode.uuid);
                }
            } else {
                selection?.select?.(resultNode.uuid);
            }
        } else {
            if (event.leftButton && !event.ctrlKey && !event.shiftKey) {
                selection?.clear?.();
            }
        }
    }

    private _regionSelectNode(
        left: number, right: number, top: number, bottom: number, multiple: boolean,
    ) {
        const camera = getServiceProp('Camera')?.getCamera?.()?.camera;
        if (!camera) return;

        const mask = Layers.makeMaskExclude([
            Layers.Enum.GIZMOS,
            Layers.Enum.SCENE_GIZMO,
            Layers.Enum.EDITOR,
        ]);
        const nodes = getRegionNodes(camera, left, right, top, bottom, mask);
        const selection = getServiceProp('Selection');

        const selectSet = new Set<string>(selection?.query?.() ?? []);
        nodes.forEach((node: Node) => {
            if (!selectSet.has(node.uuid)) {
                selection?.select?.(node.uuid);
            }
            selectSet.delete(node.uuid);
        });
        if (!multiple) {
            for (const uuid of selectSet.keys()) {
                selection?.unselect?.(uuid);
            }
        }
    }

    // --- Keyboard ---

    public onKeyDown(event: ISceneKeyboardEvent): boolean | void {
        if (this._regionSelecting) return false;

        const selection = getServiceProp('Selection');
        const uuids: string[] = selection?.query?.() ?? [];
        if (uuids.length > 0) {
            const node = getServiceProp('Scene')?.getNodeByUuid?.(uuids[0]);
            if (node) {
                const res = getServiceProp('Gizmo')?.callAllGizmoFuncOfNode?.(node, 'onKeyDown', event);
                return res;
            }
        }
        return true;
    }

    public onKeyUp(event: ISceneKeyboardEvent): boolean | void {
        const selection = getServiceProp('Selection');
        const uuids: string[] = selection?.query?.() ?? [];
        if (uuids.length > 0) {
            const node = getServiceProp('Scene')?.getNodeByUuid?.(uuids[0]);
            if (node) {
                const res = getServiceProp('Gizmo')?.callAllGizmoFuncOfNode?.(node, 'onKeyUp', event);
                return res;
            }
        }
        return true;
    }

    // --- Lifecycle ---

    public init() {
        const operationMgr = getServiceProp('Operation');
        if (operationMgr) {
            operationMgr.addListener('mousedown', this.onMouseDown.bind(this), OperationPriority.Gizmo);
            operationMgr.addListener('mousemove', this.onMouseMove.bind(this), OperationPriority.Gizmo);
            operationMgr.addListener('mouseup', this.onMouseUp.bind(this), OperationPriority.Gizmo);
            operationMgr.addListener('mousewheel', this.onMouseWheel.bind(this), OperationPriority.Gizmo);
            operationMgr.addListener('keydown', this.onKeyDown.bind(this), OperationPriority.Gizmo);
            operationMgr.addListener('keyup', this.onKeyUp.bind(this), OperationPriority.Gizmo);
        }
    }

    public clear() {
        this._gizmoMouseDownEvent = null;
        this._noGizmoMouseDownEvent = null;
        this._hoverInNodeMap.clear();
        this._curMouseDownInfos.length = 0;
    }
}

export default GizmoOperation;

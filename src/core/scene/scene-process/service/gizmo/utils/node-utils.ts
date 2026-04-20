'use strict';

import { CCObject, geometry, Layers, Node, Vec3, director } from 'cc';
import { ray } from './engine-utils';

/**
 * 判断是否编辑器节点
 */
export function isEditorNode(node: Node): boolean {
    if (node.layer & Layers.Enum.GIZMOS) return true;
    if (node.layer & Layers.Enum.SCENE_GIZMO) return true;
    if (node.layer & Layers.Enum.EDITOR) return true;
    return false;
}

/**
 * 对场景节点做射线检测，排除编辑器层和锁定节点
 * Returns array of nodes sorted by distance
 */
export function getRaycastResultNodes(
    camera: any,
    x: number,
    y: number,
    mask: number = ~Layers.Enum.SCENE_GIZMO,
): Node[] {
    if (!camera) return [];

    camera.screenPointToRay(ray, x, y);
    const scene = director.getScene()?.renderScene;
    if (!scene) return [];

    const resultNodes: Node[] = [];

    // Simple raycast against scene models
    const models = scene.models;
    if (!models) return resultNodes;

    const results: { node: Node; distance: number }[] = [];
    for (let i = 0; i < models.length; i++) {
        const model = models[i];
        if (!model || !model.node || !model.enabled) continue;

        // Check layer mask
        if (!(model.node.layer & mask)) continue;

        // Check world bounds
        const worldBounds = model.worldBounds;
        if (!worldBounds) continue;

        const dist = geometry.intersect.rayAABB(ray, worldBounds);
        if (dist > 0) {
            results.push({ node: model.node, distance: dist });
        }
    }

    results.sort((a, b) => a.distance - b.distance);

    for (const result of results) {
        const node = result.node;
        // Skip editor nodes
        if (isEditorNode(node)) continue;
        // Skip locked/hidden nodes
        if (node._objFlags & CCObject.Flags.LockedInEditor) continue;
        if (node._objFlags & CCObject.Flags.HideInHierarchy) continue;
        resultNodes.push(node);
    }

    return resultNodes;
}

/**
 * 框选：获取矩形区域内的节点
 * Simplified for CLI — iterates scene models and checks if their screen-space position is within the region
 */
export function getRegionNodes(
    camera: any,
    left: number,
    right: number,
    top: number,
    bottom: number,
    mask: number = ~Layers.Enum.SCENE_GIZMO,
): Node[] {
    if (!camera) return [];

    const scene = director.getScene()?.renderScene;
    if (!scene) return [];

    const resultNodes: Node[] = [];
    const models = scene.models;
    if (!models) return resultNodes;

    const screenPos = new Vec3();
    for (let i = 0; i < models.length; i++) {
        const model = models[i];
        if (!model || !model.node || !model.enabled) continue;
        if (!(model.node.layer & mask)) continue;
        if (isEditorNode(model.node)) continue;
        if (model.node._objFlags & CCObject.Flags.LockedInEditor) continue;
        if (model.node._objFlags & CCObject.Flags.HideInHierarchy) continue;

        // Project world position to screen space
        const worldPos = model.node.getWorldPosition();
        camera.worldToScreen(screenPos, worldPos);

        if (screenPos.x >= left && screenPos.x <= right &&
            screenPos.y >= bottom && screenPos.y <= top) {
            if (!resultNodes.includes(model.node)) {
                resultNodes.push(model.node);
            }
        }
    }

    return resultNodes;
}

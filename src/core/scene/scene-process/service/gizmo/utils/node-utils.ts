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
 * 2D 节点命中检测：用射线与节点所在 z 平面求交，再判断交点是否落在 UITransform 的世界包围盒内
 * 遍历顺序为逆序深度优先（后渲染的节点优先命中），与编辑器一致
 */
function collect2DHits(
    node: Node,
    r: geometry.Ray,
    mask: number,
    results: { node: Node; distance: number }[],
): void {
    if (!node || isEditorNode(node)) return;
    if (node._objFlags & CCObject.Flags.LockedInEditor) return;
    if (node._objFlags & CCObject.Flags.HideInHierarchy) return;

    // 逆序遍历子节点（后渲染的优先）
    const children = node.children;
    for (let i = children.length - 1; i >= 0; i--) {
        collect2DHits(children[i], r, mask, results);
    }

    if (!(node.layer & mask)) return;

    const uiTransform = node.getComponent('cc.UITransform') as any;
    if (!uiTransform || !uiTransform.getBoundingBoxToWorld) return;

    const bbox = uiTransform.getBoundingBoxToWorld();
    if (!bbox) return;

    // 射线与节点 z 平面求交
    if (Math.abs(r.d.z) < 1e-6) return;
    const t = (node.worldPosition.z - r.o.z) / r.d.z;
    if (t < 0) return;

    const hitX = r.o.x + r.d.x * t;
    const hitY = r.o.y + r.d.y * t;

    if (hitX >= bbox.x && hitX <= bbox.x + bbox.width &&
        hitY >= bbox.y && hitY <= bbox.y + bbox.height) {
        results.push({ node, distance: t });
    }
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
    const allResults: { node: Node; distance: number }[] = [];

    // 3D: raycast against scene models (MeshRenderer)
    const models = scene.models;
    if (models) {
        for (let i = 0; i < models.length; i++) {
            const model = models[i];
            if (!model || !model.node || !model.enabled) continue;

            // Check layer mask
            if (!(model.node.layer & mask)) continue;

            // Skip UI_2D layer — batched 2D nodes appear as a single model (Canvas/batch root),
            // individual UI nodes are detected by the 2D check below
            if (model.node.layer & Layers.Enum.UI_2D) continue;

            // Check world bounds
            const worldBounds = model.worldBounds;
            if (!worldBounds) continue;

            const dist = geometry.intersect.rayAABB(ray, worldBounds);
            if (dist > 0) {
                allResults.push({ node: model.node, distance: dist });
            }
        }
    }

    // 2D: UITransform-based hit detection (Sprite/Label 等通过 Batcher2D 渲染，不在 scene.models 中)
    // Always run — editor combines 3D and 2D results via raycastAll
    const sceneNode = director.getScene();
    if (sceneNode) {
        collect2DHits(sceneNode, ray, mask, allResults);
    }

    allResults.sort((a, b) => a.distance - b.distance);

    for (const result of allResults) {
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
    const seenNodes: Set<Node> = new Set();
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
            if (!seenNodes.has(model.node)) {
                seenNodes.add(model.node);
                resultNodes.push(model.node);
            }
        }
    }

    return resultNodes;
}

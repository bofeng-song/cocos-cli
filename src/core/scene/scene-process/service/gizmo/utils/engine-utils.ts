'use strict';

declare module 'cc' {
    interface Node {
        modelComp?: MeshRenderer;
        modelColor?: Color;
    }
    interface RenderingSubMesh {
        iBuffer?: ArrayBuffer;
        vBuffer?: ArrayBuffer;
    }
}

import {
    Camera, CCObject, Color, geometry, gfx, IVec3Like, math, MeshRenderer, Node,
    primitives, utils, Vec2, Vec3, Material, Mesh, Layers, Vec4,
} from 'cc';
import type { IAddMeshToNodeOption, ICreateMeshOption, IMeshPrimitive, DynamicMeshPrimitive } from './defines';

const flat = (arr: any, fn: any) => {
    return arr.map(fn).reduce((acc: any, val: any) => acc.concat(val), []);
};

const cmp = (a: any, b: any) => a.distance - b.distance;
export const ray = geometry.Ray.create();
const triangles = gfx.PrimitiveMode.TRIANGLE_LIST;

// 这边理论上用WeakMap更好，但是在场景原生化中会有问题，所以先用Map
const vbMap = new Map();
const ibMap = new Map();

export const ProjectionType = Camera.ProjectionType;
export const CullMode = gfx.CullMode;
export const PrimitiveMode = gfx.PrimitiveMode;
export const FOVAxis = Camera.FOVAxis;
export const AttributeName = gfx.AttributeName;

export enum HighlightFace {
    NONE,
    UP,
    DOWN,
    LEFT,
    RIGHT,
    FRONT,
    BACK,
}

function setNodeMaterialProperty(node: Node, propName: string, value: any) {
    if (node && node.modelComp && node.modelComp.material) {
        node.modelComp.material.setProperty(propName, value);
    }
}

/**
 * 获取编辑器摄像机（惰性访问，避免循环依赖）
 */
function getEditorCamera(): any {
    try {
        const { Service } = require('../../core/decorator');
        return Service.Camera?.getCamera?.();
    } catch (e) {
        return null;
    }
}

export function create3DNode(name?: string): Node {
    const node = new (cc as any).Node(name);
    node._layer = (cc as any).Layers.Enum.GIZMOS;
    node._objFlags |= CCObject.Flags.DontSave;
    node.modelColor = (cc as any).color();
    return node;
}

export function createMesh(primitive: IMeshPrimitive, opts: ICreateMeshOption = {}): Mesh {
    // prepare data
    const primitiveData: primitives.IGeometry = {
        primitiveMode: primitive.primitiveType,
        positions: flat(primitive.positions, (v: Vec3) => [v.x, v.y, v.z]),
        indices: primitive.indices,
        minPos: primitive.minPos,
        maxPos: primitive.maxPos,
    };

    if (primitive.normals) {
        primitiveData.normals = flat(primitive.normals, (v: Vec3) => [v.x, v.y, v.z]);
    }
    if (primitive.uvs) {
        primitiveData.uvs = flat(primitive.uvs, (v: Vec2) => [v.x, v.y]);
    }

    let customAttributes = primitiveData.customAttributes;
    if (opts.dashed) {
        if (!customAttributes) {
            customAttributes = [];
        }

        const lineDistances: number[] = [];
        for (let i = 0; i < primitive.positions.length; i += 2) {
            const start = primitive.positions[i];
            const end = primitive.positions[i + 1];
            lineDistances[i] = (i === 0) ? 0 : lineDistances[i - 1];
            lineDistances[i + 1] = lineDistances[i] + Vec3.distance(start as Vec3, end as Vec3);
        }

        customAttributes.push({
            attr: new gfx.Attribute('a_lineDistance', gfx.Format.R32F),
            values: lineDistances,
        });
    }
    primitiveData.customAttributes = customAttributes;

    // create
    const mesh = utils.createMesh(primitiveData);
    // set double sided flag for raycast
    const subMesh = mesh.renderingSubMeshes[0];
    const info = subMesh.geometricInfo;
    if (info) {
        info.doubleSided = primitive.doubleSided;
    }
    // cache vb buffer for vb update
    const vbInfo = mesh.struct.vertexBundles[0].view;

    if (vbInfo) {
        subMesh.vBuffer = mesh.data.buffer instanceof ArrayBuffer
            ? mesh.data.buffer.slice(vbInfo.offset, vbInfo.offset + vbInfo.length)
            : undefined;
        vbMap.set(subMesh, subMesh.vBuffer);
    }

    const ibInfo = mesh.struct.primitives[0].indexView;
    if (ibInfo) {
        subMesh.iBuffer = mesh.data.buffer instanceof ArrayBuffer
            ? mesh.data.buffer.slice(ibInfo.offset, ibInfo.offset + ibInfo.length)
            : undefined;
        ibMap.set(subMesh, subMesh.iBuffer);
    }

    return mesh;
}

export function createDynamicMesh(primitive: DynamicMeshPrimitive, opts: (primitives.ICreateDynamicMeshOptions & ICreateMeshOption)): Mesh {
    // prepare data
    const primitiveData: primitives.IDynamicGeometry = primitive.transformToDynamicGeometry();

    if (primitive.normals) {
        primitiveData.normals = Float32Array.from(flat(primitive.normals, (v: Vec3) => [v.x, v.y, v.z]));
    }
    if (primitive.uvs) {
        primitiveData.uvs = Float32Array.from(flat(primitive.uvs, (v: Vec2) => [v.x, v.y]));
    }

    let customAttributes = primitiveData.customAttributes;
    if (opts?.dashed) {
        if (!customAttributes) {
            customAttributes = [];
        }

        const lineDistances: number[] = [];
        for (let i = 0; i < primitive.positions.length; i += 2) {
            const start = primitive.positions[i];
            const end = primitive.positions[i + 1];
            lineDistances[i] = (i === 0) ? 0 : lineDistances[i - 1];
            lineDistances[i + 1] = lineDistances[i] + Vec3.distance(start as Vec3, end as Vec3);
        }

        customAttributes.push({
            attr: new gfx.Attribute('a_lineDistance', gfx.Format.R32F),
            values: Float32Array.from(lineDistances),
        });
    }

    primitiveData.customAttributes = customAttributes;

    // create
    const mesh = (utils as any).MeshUtils.createDynamicMesh(0, primitiveData, undefined, opts);

    // set double sided flag for raycast
    const subMesh = mesh.renderingSubMeshes[0];
    const info = subMesh.geometricInfo;
    if (info) {
        info.doubleSided = primitive.doubleSided;
    }
    // cache vb buffer for vb update
    const vbInfo = mesh.struct.vertexBundles[0].view;

    if (vbInfo) {
        // @ts-ignore
        subMesh.vBuffer = mesh.data.buffer.slice(vbInfo.offset, vbInfo.offset + vbInfo.length);
        // @ts-ignore
        vbMap.set(subMesh, subMesh.vBuffer);
    }

    const ibInfo = mesh.struct.primitives[0].indexView;
    if (ibInfo) {
        // @ts-ignore
        subMesh.iBuffer = mesh.data.buffer.slice(ibInfo.offset, ibInfo.offset + ibInfo.length);
        // @ts-ignore
        ibMap.set(subMesh, subMesh.iBuffer);
    }

    return mesh;
}

export function updateDynamicMesh(meshRenderer: MeshRenderer, subIndex: number, primitive: DynamicMeshPrimitive) {
    const primitiveData: primitives.IDynamicGeometry = primitive.transformToDynamicGeometry();
    meshRenderer.mesh?.updateSubMesh(subIndex, primitiveData);
}

export function addMeshToNode(node: Node, mesh: any, opts: IAddMeshToNodeOption = {}, reuseMaterial?: Material) {
    const model = node.addComponent(MeshRenderer);
    const defines: any = {};
    if (opts.forwardPipeline) {
        defines.USE_FORWARD_PIPELINE = true;
    }

    if (opts.dashed) {
        defines.USE_DASHED_LINE = true;
    }

    if (opts.instancing) {
        defines.USE_INSTANCING = true;
    }

    if (opts.useLightProbe) {
        defines.CC_USE_LIGHT_PROBE = true;
    }

    model.mesh = mesh;
    const cb = model.onEnable.bind(model);
    model.onEnable = () => {
        cb();
    }; // don't show on preview cameras
    const pm = mesh.renderingSubMeshes[0].primitiveMode;
    let technique = 0;
    let effectName = 'internal/editor/gizmo';
    if (opts.effectName) {
        effectName = opts.effectName;
    } else if (opts.technique) {
        technique = opts.technique;
    } else {
        if (opts.unlit) {
            technique = 1;
        } else if (opts.texture) {
            technique = 3;
        } else {
            if (pm < triangles) {
                technique = opts.noDepthTestForLines ? 1 : 2; // unlit
            } else {
                technique = opts.depthTestForTriangles ? 4 : 0;
            }
        }
    }

    const mtl = reuseMaterial ?? new Material();
    const states: any = {};
    if (opts.cullMode) {
        states.rasterizerState = { cullMode: opts.cullMode };
    }
    if (pm !== triangles) {
        states.primitive = pm;
    }
    if (opts.priority) {
        states.priority = opts.priority;
    }

    // 未初始化的材质hash值为0
    if (mtl.hash === 0) {
        mtl.initialize({ effectName, technique, states, defines });
    }
    if (opts.alpha !== undefined) {
        if (node.modelColor) {
            node.modelColor.a = opts.alpha;
        }
    }
    mtl.setProperty('mainColor', (node as any).modelColor);
    model.material = mtl;
    node.modelComp = model;
}

export function setMeshColor(node: Node, c: Color) {
    let alpha = c.a;
    if (node.modelColor) {
        alpha = node.modelColor.a;
    }
    node.modelColor = c.clone();
    node.modelColor.a = alpha;
    setNodeMaterialProperty(node, 'mainColor', node.modelColor);
}

export function getMeshColor(node: Node): Color | undefined {
    return node.modelColor;
}

export function setNodeOpacity(node: Node, opacity: number) {
    if (node.modelColor) {
        node.modelColor.a = opacity;
    }
    setNodeMaterialProperty(node, 'mainColor', node.modelColor);
}

export function getNodeOpacity(node: Node) {
    return node.modelColor?.a ?? 0;
}

export function setMaterialProperty(node: Node, propName: string, value: any) {
    setNodeMaterialProperty(node, propName, value);
}

export function getModel(node: Node) {
    return node.getComponent(MeshRenderer);
}

export function updatePositions(comp: MeshRenderer, data: IVec3Like[]) {
    const model = comp.model && comp.model.subModels[0];
    if (!model || !model.inputAssembler || !model.subMesh) {
        return;
    }
    const { subMesh } = model;

    const points = flat(data, (v: Vec3) => [v.x, v.y, v.z]);
    updateVBAttr(comp, gfx.AttributeName.ATTR_POSITION, points);

    // sync to raycast data
    if (subMesh.geometricInfo) {
        if (subMesh.geometricInfo.positions.length >= points.length) {
            subMesh.geometricInfo.positions.set(points);
        } else {
            subMesh.geometricInfo.positions = new Float32Array(points);
        }
    }
}

export function updateVBAttr(comp: MeshRenderer, attr: string, data: number[]) {
    const model = comp.model && comp.model.subModels[0];
    if (!model || !model.inputAssembler || !model.subMesh) {
        return;
    }
    const { inputAssembler, subMesh } = model;
    let vBuffer = subMesh.vBuffer as ArrayBuffer;
    // update vb
    let offset = 0;
    let format = gfx.Format.UNKNOWN;
    for (const a of inputAssembler.attributes) {
        if (a.name === attr) {
            format = a.format;
            break;
        }
        offset += gfx.FormatInfos[a.format].size;
    }
    const vb = inputAssembler.vertexBuffers[0];
    if (!format || !vb) {
        return;
    }

    const newSize = vb.stride * data.length / gfx.FormatInfos[format].count;
    // 需要扩大VB的大小
    if (vBuffer.byteLength < newSize) {
        vBuffer = new ArrayBuffer(newSize);
        vbMap.set(subMesh, vBuffer);
        vb.resize(newSize);
    }
    utils.writeBuffer(new DataView(vBuffer), data, format, offset, vb.stride);

    vb.update(vBuffer);
}

export function updateIB(comp: MeshRenderer, data: number[]): void {
    const model = comp.model && comp.model.subModels[0];
    if (!model || !model.inputAssembler || !model.subMesh) {
        return;
    }
    const { inputAssembler, subMesh } = model;

    let iBuffer = ibMap.get(subMesh) as ArrayBuffer;
    // update ib
    const ib: gfx.Buffer | null = inputAssembler.indexBuffer;
    if (!ib) {
        return;
    }

    if (inputAssembler.indexCount === data.length) {
        new Uint16Array(iBuffer as ArrayBuffer).set(data);
        ib.update(iBuffer);
        // sync to raycast data
        if (subMesh.geometricInfo && subMesh.geometricInfo.indices) {
            subMesh.geometricInfo.indices.set(data);
        }
    } else {
        const newSize = data.length * ib.stride;
        // 需要扩大IB的大小
        if (newSize > iBuffer.byteLength) {
            // @ts-ignore
            iBuffer = new ArrayBuffer(newSize);
            ibMap.set(subMesh, iBuffer);
            ib.resize(newSize);
        }
        new Uint16Array(iBuffer as ArrayBuffer).set(data);
        ib.update(iBuffer);
        inputAssembler.indexCount = data.length;
        // sync to raycast data
        if (subMesh.geometricInfo && subMesh.geometricInfo.indices) {
            const indicesData = new Uint16Array(data);
            subMesh.geometricInfo.indices = indicesData;
        }
    }
}

export function updateBoundingBox(meshComp: MeshRenderer, minPos?: math.Vec3, maxPos?: math.Vec3) {
    const model = meshComp.model;
    if (!model) {
        return;
    }

    model.createBoundingShape(minPos, maxPos);
}

/**
 * 简化的射线检测：通过节点列表检测
 * 编辑器版本使用 raycastUtil，此处使用内联的简化实现
 */
export function getRaycastResultsByNodes(nodes: Node[], x: number, y: number, distance = Infinity, forSnap = false, excludeMask?: number): any[] {
    const results: any[] = [];
    const camera = getEditorCamera();
    if (!camera || !camera.camera) {
        return results;
    }

    camera.camera.screenPointToRay(ray, x, y);

    const walkAllModels = (node: Node, cb: (mr: MeshRenderer) => void) => {
        if (!node.activeInHierarchy) return;
        const modelComponents = node.getComponents(MeshRenderer);
        modelComponents.forEach(e => cb(e));
        if (node.children.length > 0) {
            node.children.forEach(child => {
                walkAllModels(child, cb);
            });
        }
    };

    nodes.forEach(node => {
        walkAllModels(node, (mr: MeshRenderer) => {
            if (!mr.model) return;
            if (excludeMask && mr.node.layer & excludeMask) return;
            // Skip non-triangle meshes: editor narrowphase naturally rejects
            // line/point primitives; we only have broadphase (AABB) so filter here
            const subMeshes = mr.mesh?.renderingSubMeshes;
            if (subMeshes && subMeshes.length > 0) {
                const pm = subMeshes[0].primitiveMode;
                if (pm === gfx.PrimitiveMode.LINE_LIST ||
                    pm === gfx.PrimitiveMode.LINE_STRIP ||
                    pm === gfx.PrimitiveMode.LINE_LOOP ||
                    pm === gfx.PrimitiveMode.POINT_LIST) {
                    return;
                }
            }
            const worldBounds = mr.model.worldBounds;
            if (worldBounds) {
                const hit = geometry.intersect.rayAABB(ray, worldBounds);
                if (hit > 0 && hit <= distance) {
                    const hitPoint = new Vec3();
                    Vec3.scaleAndAdd(hitPoint, ray.o, ray.d, hit);
                    results.push({
                        node: mr.node,
                        distance: hit,
                        hitPoint,
                    });
                }
            }
        });
    });

    results.sort(cmp);
    return results;
}

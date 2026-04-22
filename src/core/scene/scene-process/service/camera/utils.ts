import { Camera, Color, gfx, Layers, MeshRenderer, Node, utils, CCObject } from 'cc';

const _maxTicks = 100;
const vbMap = new Map();
const ibMap = new Map();

export enum CameraMoveMode {
    IDLE = 0,
    ORBIT = 1,
    PAN = 2,
    ZOOM = 3,
    WANDER = 4,
}

export class CameraUtils {
    static updateVBAttr(comp: MeshRenderer | null, attr: string, data: number[]) {
        const model = comp && comp.model && comp.model.subModels[0];
        if (!model || !model.inputAssembler || !model.subMesh) {
            console.warn('[CameraUtils] updateVBAttr: model not ready', attr, {
                hasComp: !!comp,
                hasModel: !!(comp && comp.model),
                subModelCount: comp?.model?.subModels?.length,
            });
            return;
        }
        const { inputAssembler, subMesh } = model;
        const vbuffer = vbMap.get(subMesh) as ArrayBuffer;
        if (!vbuffer) {
            console.error(subMesh, vbuffer);
            return;
        }
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
        if (!format || !vb) return;
        utils.writeBuffer(new DataView(vbuffer as ArrayBuffer), data, format, offset, vb.stride);
        vb.update(vbuffer, vb.stride * vb.count);
        if (subMesh.geometricInfo && attr === gfx.AttributeName.ATTR_POSITION) {
            subMesh.geometricInfo.positions.set(data);
        }
    }

    static updateIB(comp: MeshRenderer | null, data: number[]) {
        const model = comp && comp.model && comp.model.subModels[0];
        if (!model || !model.inputAssembler || !model.subMesh) {
            console.warn('[CameraUtils] updateIB: model not ready', {
                hasComp: !!comp,
                hasModel: !!(comp && comp.model),
                subModelCount: comp?.model?.subModels?.length,
            });
            return;
        }
        const { inputAssembler, subMesh } = model;
        const ibuffer = ibMap.get(subMesh) as ArrayBuffer;
        if (!ibuffer) {
            console.error(subMesh, ibuffer);
            return;
        }
        const count = inputAssembler.indexCount;
        const ib = inputAssembler.indexBuffer;
        if (!count || !ib) return;
        // @ts-ignore
        const format = gfx.Format[`R${ib.stride * 8}UI`];
        utils.writeBuffer(new DataView(ibuffer as ArrayBuffer), data, format);
        ib.update(ibuffer, ib.stride * ib.count);
        inputAssembler.indexCount = data.length;
    }

    static grid(width: number, length: number, segw: number, segl: number) {
        const positions: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];
        const hw = width * 0.5;
        const hl = length * 0.5;
        const dw = width / segw;
        const dl = length / segl;
        const minPos = cc.v3(-hw, -0.1, -hl);
        const maxPos = cc.v3(hw, 0.1, hl);

        function addLine(x1: number, z1: number, x2: number, z2: number) {
            const idx = positions.length / 3;
            if (x1 === x2) {
                positions.push(x1 + 0.01, 0, z1);
                uvs.push(1, 0);
                positions.push(x1 - 0.01, 0, z1);
                uvs.push(0, 0);
                positions.push(x1 + 0.01, 0, z2);
                uvs.push(1, 0);
                positions.push(x1 - 0.01, 0, z2);
                uvs.push(0, 0);
            } else {
                positions.push(x1, 0, z1 - 0.01);
                uvs.push(0, 1);
                positions.push(x1, 0, z1 + 0.01);
                uvs.push(1, 1);
                positions.push(x2, 0, z1 - 0.01);
                uvs.push(0, 1);
                positions.push(x2, 0, z1 + 0.01);
                uvs.push(1, 1);
            }
            indices.push(idx, idx + 1, idx + 2, idx + 2, idx + 1, idx + 3);
        }

        for (let x = -hw; x <= hw; x += dw) {
            addLine(x, -hl, x, hl);
        }
        for (let z = -hl; z <= hl; z += dl) {
            addLine(-hw, z, hw, z);
        }
        return { positions, uvs, indices, minPos, maxPos };
    }

    static createStrokeGrid(w: number, l: number, parentNode: Node) {
        const node = new cc.Node('Editor Grid');
        node.layer = cc.Layers.Enum.EDITOR | cc.Layers.Enum.IGNORE_RAYCAST;
        node._objFlags |= CCObject.Flags.DontSave;
        node.parent = parentNode;
        const model = node.addComponent(MeshRenderer) as MeshRenderer;
        model.mesh = utils.createMesh(CameraUtils.grid(w, l, w, l));
        const cb = model.onEnable.bind(model);
        model.onEnable = () => { cb(); };
        const mtl = new cc.Material();
        mtl.initialize({ effectName: 'internal/editor/grid-stroke' });
        if (mtl.passes && mtl.passes.length > 0) {
            model.material = mtl;
        }
        return model;
    }

    static createGrid(effectName: string, parentNode: Node) {
        const node = new cc.Node(effectName);
        node.layer = cc.Layers.Enum.EDITOR | cc.Layers.Enum.IGNORE_RAYCAST;
        node._objFlags |= CCObject.Flags.DontSave;
        node.parent = parentNode;
        node.setWorldPosition(cc.v3(0, 0, 0));
        const model = node.addComponent(MeshRenderer) as MeshRenderer;
        const cb = model.onEnable.bind(model);
        model.onEnable = () => { cb(); };

        const positions = [];
        const colors = [];
        const indices = [];
        for (let i = 0; i < _maxTicks * _maxTicks; i++) {
            positions.push(0, 0);
            colors.push(1, 1, 1, 1);
        }
        for (let i = 0; i < positions.length; i += 2) {
            indices.push(i / 2);
        }
        const primitiveMode = gfx.PrimitiveMode.LINE_LIST;
        const attributes = [
            { name: gfx.AttributeName.ATTR_POSITION, format: gfx.Format.RG32F },
            { name: gfx.AttributeName.ATTR_COLOR, format: gfx.Format.RGBA32F },
        ];
        const mesh = cc.utils.createMesh({ positions, indices, colors, primitiveMode, attributes });
        const subMesh = mesh.renderingSubMeshes[0];
        const vbInfo = mesh.struct.vertexBundles[0].view;
        const vbuffer = mesh.data.buffer.slice(vbInfo.offset, vbInfo.offset + vbInfo.length);
        vbMap.set(subMesh, vbuffer);
        const ibInfo = mesh.struct.primitives[0].indexView;
        const ibuffer = mesh.data.buffer.slice(ibInfo!.offset, ibInfo!.offset + ibInfo!.length);
        ibMap.set(subMesh, ibuffer);
        model.mesh = mesh;
        const mtl = new cc.Material();
        mtl.initialize({ effectName, states: { primitive: primitiveMode } });
        if (mtl.passes && mtl.passes.length > 0) {
            model.material = mtl;
        }
        return model;
    }

    static createCamera(color: Color, parentNode: Node, componentClass: typeof Camera = Camera) {
        const node = new cc.Node('Editor Camera');
        node.layer = cc.Layers.Enum.EDITOR;
        node._objFlags |= CCObject.Flags.DontSave;
        node.parent = parentNode;
        const camera = node.addComponent(componentClass) as Camera;
        camera.clearFlags = Camera.ClearFlag.SKYBOX | gfx.ClearFlagBit.COLOR;
        camera.clearColor = color;
        camera.visibility = Layers.makeMaskExclude([Layers.BitMask.PROFILER, Layers.Enum.GIZMOS, Layers.Enum.SCENE_GIZMO]);
        camera.far = 100000;
        camera.near = 0.1;
        return camera;
    }
}

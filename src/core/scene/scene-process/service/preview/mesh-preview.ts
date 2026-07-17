import { InteractivePreview, getBoundaryOfMeshNodes } from './interactive-preview';
import { DirectionalLight, EffectAsset, Material, Mesh, MeshRenderer, Scene, Node, assetManager } from 'cc';

function createPreviewMaterial(effectName: string): Material | null {
    const effect = EffectAsset.get(effectName);
    if (!effect) {
        console.warn(`[MeshPreview] Effect is not registered: ${effectName}`);
        return null;
    }
    const material = new Material();
    material.initialize({ effectName });
    if (!material.passes.length) {
        console.warn(`[MeshPreview] Effect has no usable passes: ${effectName}`);
        return null;
    }
    return material;
}

export class MeshPreview extends InteractivePreview {
    private lightComp: DirectionalLight | any;
    private _modelComp!: MeshRenderer;
    private _defaultMat: Material | null = null;

    public createNodes(scene: Scene) {
        this.lightComp = new Node('Mesh Preview Light').addComponent(DirectionalLight);
        this.lightComp.node.setRotationFromEuler(-45, -45, 0);
        this.lightComp.node.parent = scene;

        this._modelNode = new Node('Mesh Preview Mesh');
        this._modelNode.parent = scene;
        this._modelComp = this._modelNode.addComponent(MeshRenderer);
        this._defaultMat = createPreviewMaterial('builtin-standard');
        if (this._defaultMat) {
            this._modelComp.material = this._defaultMat;
        } else {
            this._modelComp.enabled = false;
        }
    }

    public async setMesh(uuid: string) {
        if (!uuid) {
            console.warn(`Failed to set mesh in Mesh preview, by uuid: ${uuid}`);
            return null;
        }

        try {
            assetManager.assets.remove(uuid);
            const meshAsset = await new Promise<Mesh>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error(`Load mesh timeout: ${uuid}`)), 10000);
                assetManager.loadAny(uuid, (err: any, asset: any) => {
                    clearTimeout(timeout);
                    if (err) reject(err);
                    else resolve(asset);
                });
            });

            if (!this._defaultMat || !this._defaultMat.passes.length) {
                this._defaultMat = createPreviewMaterial('builtin-standard');
            }
            if (!this._defaultMat || !this._defaultMat.passes.length) {
                console.warn('[MeshPreview] Cannot preview mesh before builtin-standard is available.');
                return null;
            }
            this._modelComp.enabled = true;
            this._modelComp.mesh = meshAsset;
            this._modelNode!.parent = this.scene;

            for (let i = 0; i < this._modelComp.mesh!.struct.primitives.length; i++) {
                this._modelComp.setMaterial(this._defaultMat, i);
            }
            this.cameraComp.enabled = true;
            this.resetCameraView();
        } catch (e) {
            console.warn(e);
        }
    }

    public resetCameraView() {
        if (this._modelNode) {
            this.resetCamera(this._modelNode);
            this.perfectCameraView(getBoundaryOfMeshNodes([this._modelNode]));
        }
    }
}

import { InteractivePreview, getBoundaryOfMeshNodes } from './interactive-preview';
import { DirectionalLight, Scene, Node, Prefab, assetManager, instantiate } from 'cc';
import { Service } from '../core/decorator';
import { Rpc } from '../../rpc';

export class ModelPreview extends InteractivePreview {
    private lightComp: DirectionalLight | any;

    public createNodes(scene: Scene) {
        this.lightComp = new Node('Model Preview Light').addComponent(DirectionalLight);
        this.lightComp.node.setRotationFromEuler(-45, -45, 0);
        this.lightComp.node.parent = scene;
    }

    // For gltf/fbx root assets, resolve to the Prefab sub-asset UUID
    // (the root asset has no .json library file — only sub-assets do)
    private async resolvePrefabUuid(uuid: string): Promise<string> {
        try {
            const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [uuid, ['subAssets']]);
            if (assetInfo?.subAssets) {
                for (const name of Object.keys(assetInfo.subAssets)) {
                    const sub = assetInfo.subAssets[name];
                    if (sub.importer === 'gltf-scene' || sub.type === 'cc.Prefab') {
                        return sub.uuid;
                    }
                }
            }
        } catch (e) {
            console.warn('[ModelPreview] Failed to resolve prefab sub-asset:', e);
        }
        return uuid;
    }

    public async setModel(uuid: string) {
        if (!uuid) {
            console.warn(`Failed to set model in Model preview, by uuid: ${uuid}`);
            return null;
        }

        const prefabUuid = await this.resolvePrefabUuid(uuid);

        assetManager.assets.remove(prefabUuid);
        const prefabAsset = await new Promise<Prefab>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error(`Load model prefab timeout: ${prefabUuid}`)), 10000);
            assetManager.loadAny(prefabUuid, { reloadAsset: true }, (err: any, result: any) => {
                clearTimeout(timeout);
                if (err) reject(err);
                else if (!result) reject(new Error(`Load model prefab failed: ${prefabUuid}`));
                else resolve(result);
            });
        });

        this.enablePreviewCamera();

        if (this._modelNode) {
            this.scene.removeChild(this._modelNode);
            if (this._modelNode.isValid) {
                this._modelNode.destroy();
            }
        }

        this._modelNode = instantiate(prefabAsset) as Node;
        this._modelNode.parent = this.scene;

        return await new Promise((resolve) => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                this.perfectCameraView(getBoundaryOfMeshNodes([this._modelNode!]));
                resolve(null);
            };
            cc.director.once(cc.Director.EVENT_AFTER_DRAW, () => {
                finish();
            });
            this.resetCamera(this._modelNode!);
            Service.Engine.repaintInEditMode();
            setTimeout(finish, 1000);
        });
    }

    public resetCameraView() {
        if (this._modelNode) {
            this.resetCamera(this._modelNode);
            this.perfectCameraView(getBoundaryOfMeshNodes([this._modelNode]));
        }
    }

    public setLightEnable(enable: boolean) {
        if (this.lightComp.enabled !== enable) {
            this.lightComp.enabled = enable;
        }
    }
}

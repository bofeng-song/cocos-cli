import { PreviewBase } from './preview-base';
import { scenePreview, ScenePreview } from './scene-preview';
import { MiniPreview } from './mini-preview';
import { MaterialPreview } from './material-preview';
import { ModelPreview } from './model-preview';
import { MeshPreview } from './mesh-preview';
import { SkeletonPreview } from './skeleton-preview';
import { PrefabPreview } from './prefab-preview';
import { SpinePreview } from './spine-preview';
import { BaseService, register } from '../core';
import type { IPreviewService, IPreviewEvents } from '../../../common/preview';

@register('Preview')
export class PreviewService extends BaseService<IPreviewEvents> implements IPreviewService {
    private _previewMap: Map<string, PreviewBase> = new Map();
    private _initialized = false;

    scenePreview = scenePreview;
    materialPreview = new MaterialPreview();
    miniPreview = new MiniPreview();
    modelPreview = new ModelPreview();
    meshPreview = new MeshPreview();
    skeletonPreview = new SkeletonPreview();
    prefabPreview = new PrefabPreview();
    spinePreview = new SpinePreview();

    init() {
        if (this._initialized) return;
        this._initialized = true;
        this.initPreview('scene:preview', 'query-preview-data', this.scenePreview);
        this.initPreview('scene:mini-preview', 'query-mini-preview-data', this.miniPreview);
        this.initPreview('scene:material-preview', 'query-material-preview-data', this.materialPreview);
        this.initPreview('scene:model-preview', 'query-model-preview-data', this.modelPreview);
        this.initPreview('scene:mesh-preview', 'query-mesh-preview-data', this.meshPreview);
        this.initPreview('scene:skeleton-preview', 'query-skeleton-preview-data', this.skeletonPreview);
        this.initPreview('scene:prefab-preview', 'query-prefab-preview-data', this.prefabPreview);
        this.initPreview('scene:spine-preview', 'query-spine-preview-data', this.spinePreview);
        console.log('[Preview] PreviewService initialized');
    }

    private initPreview(registerName: string, queryName: string, mgr: PreviewBase) {
        this._previewMap.set(registerName, mgr);
        mgr.init(registerName, queryName);
    }

    public async callPreviewFunction(previewName: string, funcName: string, ...args: any[]) {
        if (this._previewMap.has(previewName)) {
            const preview: any = this._previewMap.get(previewName);
            if (preview[funcName]) {
                return await preview[funcName](...args);
            }
        }
        return false;
    }

    // --- 资源预览快捷方法 ---

    async queryMaterialPreview(uuid: string, width: number, height: number) {
        await this.materialPreview.setMaterialByUuid(uuid);
        return await this.materialPreview.queryPreviewData({ width, height });
    }

    async queryModelPreview(uuid: string, width: number, height: number) {
        await this.modelPreview.setModel(uuid);
        return await this.modelPreview.queryPreviewData({ width, height });
    }

    async queryMeshPreview(uuid: string, width: number, height: number) {
        await this.meshPreview.setMesh(uuid);
        return await this.meshPreview.queryPreviewData({ width, height });
    }

    async querySkeletonPreview(uuid: string, width: number, height: number) {
        await this.skeletonPreview.setSkeleton(uuid);
        return await this.skeletonPreview.queryPreviewData({ width, height });
    }

    async queryPrefabPreview(uuid: string, width: number, height: number) {
        await this.prefabPreview.setPrefab(uuid);
        return await this.prefabPreview.queryPreviewData({ width, height });
    }

    async querySpinePreview(uuid: string, width: number, height: number) {
        await this.spinePreview.setSpine(uuid);
        return await this.spinePreview.queryPreviewData({ width, height });
    }

    async queryScenePreview(width: number, height: number) {
        return await this.scenePreview.queryPreviewData({ width, height });
    }

    public switchMaterialPrimitive(type: string) {
        this.materialPreview.switchPrimitive(type);
    }

    // --- 缩略图生成 ---

    public async generateThumbnail(uuid: string, assetType: string, width = 128, height = 128) {
        switch (assetType) {
            case 'cc.Material':
                return await this.queryMaterialPreview(uuid, width, height);
            case 'cc.Mesh':
                return await this.queryMeshPreview(uuid, width, height);
            case 'cc.Prefab':
                return await this.queryPrefabPreview(uuid, width, height);
            case 'cc.Skeleton':
                return await this.querySkeletonPreview(uuid, width, height);
            case 'sp.SkeletonData':
                return await this.querySpinePreview(uuid, width, height);
            default:
                // 对于 fbx/gltf 等模型资源
                if (['cc.FBX', 'cc.GLTF', 'cc.ModelAsset'].includes(assetType)) {
                    return await this.queryModelPreview(uuid, width, height);
                }
                return null;
        }
    }

    // --- Service 事件钩子 ---

    onComponentAdded(comp: any) {
        this.scenePreview.onComponentAdded(comp);
    }
}

export { PreviewBase } from './preview-base';
export { InteractivePreview } from './interactive-preview';
export { ScenePreview } from './scene-preview';
export { MiniPreview } from './mini-preview';
export { MaterialPreview } from './material-preview';
export { ModelPreview } from './model-preview';
export { MeshPreview } from './mesh-preview';
export { SkeletonPreview } from './skeleton-preview';
export { PrefabPreview } from './prefab-preview';
export { SpinePreview } from './spine-preview';

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
import { Rpc } from '../../rpc';
import type { IPreviewService, IPreviewEvents, IPreviewInstance } from '../../../common/preview';

interface PreviewTypeEntry {
    instance: PreviewBase;
    setup: string;
}

interface ResolvedPreviewEntry extends PreviewTypeEntry {
    assetType: string;
}

function withTimeout<T>(promise: Promise<T>, message: string, timeout = 10000): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), timeout)),
    ]);
}

@register('Preview')
export class PreviewService extends BaseService<IPreviewEvents> implements IPreviewService {
    private _previewMap: Map<string, PreviewBase> = new Map();
    private _typeMap: Map<string, PreviewTypeEntry> = new Map();
    private _initialized = false;
    private _activePreview: IPreviewInstance | null = null;

    scenePreview = scenePreview;
    materialPreview = new MaterialPreview();
    miniPreview = new MiniPreview();
    modelPreview = new ModelPreview();
    meshPreview = new MeshPreview();
    skeletonPreview = new SkeletonPreview();
    prefabPreview = new PrefabPreview();
    spinePreview = new SpinePreview();

    get activePreview(): IPreviewInstance | null {
        return this._activePreview;
    }

    async init() {
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
        this.initTypeMap();
        console.log('[Preview] PreviewService initialized');
    }

    private initTypeMap() {
        const entries: [string[], PreviewTypeEntry][] = [
            [['material', 'cc.Material'], { instance: this.materialPreview, setup: 'setMaterialByUuid' }],
            [['model', 'cc.FBX', 'cc.GLTF', 'cc.ModelAsset'], { instance: this.modelPreview, setup: 'setModel' }],
            [['mesh', 'cc.Mesh'], { instance: this.meshPreview, setup: 'setMesh' }],
            [['prefab', 'cc.Prefab'], { instance: this.prefabPreview, setup: 'setPrefab' }],
            [['skeleton', 'cc.Skeleton'], { instance: this.skeletonPreview, setup: 'setSkeleton' }],
            [['spine', 'sp.SkeletonData'], { instance: this.spinePreview, setup: 'setSpine' }],
        ];
        for (const [keys, entry] of entries) {
            for (const key of keys) {
                this._typeMap.set(key, entry);
            }
        }
    }

    // importer name → preview type 的映射（用于 assetType 为 cc.Asset 等泛型的回退）
    private static readonly IMPORTER_MAP: Record<string, string> = {
        'gltf': 'model',
        'gltf-scene': 'model',
        'fbx': 'model',
        'spine-data': 'spine',
    };

    private resolvePreview(assetType: string): ResolvedPreviewEntry | null {
        const entry = this._typeMap.get(assetType);
        return entry ? { ...entry, assetType } : null;
    }

    private async resolveAssetType(uuid: string): Promise<string | null> {
        const info = await withTimeout(
            Rpc.getInstance().request('assetManager', 'queryAssetInfo', [uuid]),
            `Query asset info timeout: ${uuid}`,
        );
        if (!info) return null;
        // Importer is more specific for virtual model sub-assets such as gltf-scene.
        if (info.importer && PreviewService.IMPORTER_MAP[info.importer]) {
            return PreviewService.IMPORTER_MAP[info.importer];
        }
        if (info.type && this._typeMap.has(info.type)) {
            return info.type;
        }
        return info.type ?? null;
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

    public async queryPreviewData(previewName: string, info: any) {
        const preview = this._previewMap.get(previewName);
        if (preview) {
            return await preview.queryPreviewData(info);
        }
        return null;
    }

    public async callActivePreviewFunction(funcName: string, ...args: any[]) {
        const preview: any = this._activePreview;
        if (preview?.[funcName]) {
            return await preview[funcName](...args);
        }
        return false;
    }

    public async queryActivePreviewData(info: any) {
        const preview: any = this._activePreview;
        if (preview?.queryPreviewData) {
            return await preview.queryPreviewData(info);
        }
        return null;
    }

    public async toggleActivePreviewView(info?: any) {
        const preview: any = this._activePreview;
        if (!preview?.viewToggle) {
            return null;
        }
        const state = preview.queryViewToolState?.();
        if (state?.enableViewToggle === false) {
            return null;
        }
        await preview.viewToggle();
        const is2D = preview.is2DView?.() ?? null;
        if (info && preview.queryPreviewData) {
            return {
                is2D,
                frame: await preview.queryPreviewData(info),
            };
        }
        return is2D;
    }

    // --- 上屏预览 ---

    public async openAsset(uuid: string) {
        const preview = await this.open(uuid);
        return {
            supported: !!preview,
            assetType: (preview as any)?._previewAssetType ?? null,
            is2D: preview?.is2DView?.() ?? null,
        };
    }

    async open(uuid: string): Promise<IPreviewInstance | null> {
        const assetType = await this.resolveAssetType(uuid);
        if (!assetType) {
            console.warn(`[Preview] Cannot resolve asset type for uuid: ${uuid}`);
            return null;
        }

        const entry = this.resolvePreview(assetType);
        if (!entry) {
            console.warn(`[Preview] Unsupported asset type: ${assetType}`);
            return null;
        }

        // 清理上一个预览的相机
        if (this._activePreview) {
            const prev = this._activePreview as any;
            if (prev.cameraComp) {
                prev.cameraComp.enabled = false;
            }
        }

        // 设置资源
        await withTimeout(
            (entry.instance as any)[entry.setup](uuid),
            `Preview setup timeout: ${uuid}`,
            15000,
        );
        (entry.instance as any)._previewAssetType = entry.assetType;
        this._activePreview = entry.instance as unknown as IPreviewInstance;

        return this._activePreview;
    }

    // --- 缩略图生成 ---

    public async generateThumbnail(uuid: string, assetType: string, width = 128, height = 128) {
        const entry = this.resolvePreview(assetType);
        if (!entry) return null;
        await (entry.instance as any)[entry.setup](uuid);
        return await entry.instance.queryPreviewData({ width, height });
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

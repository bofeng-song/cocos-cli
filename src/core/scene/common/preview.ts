export interface IPreviewService {
    init(): void;
    queryPreviewData(previewName: string, info: any): Promise<any>;
    callPreviewFunction(previewName: string, funcName: string, ...args: any[]): Promise<any>;
    queryMaterialPreview(uuid: string, width: number, height: number): Promise<any>;
    queryModelPreview(uuid: string, width: number, height: number): Promise<any>;
    queryMeshPreview(uuid: string, width: number, height: number): Promise<any>;
    querySkeletonPreview(uuid: string, width: number, height: number): Promise<any>;
    queryPrefabPreview(uuid: string, width: number, height: number): Promise<any>;
    querySpinePreview(uuid: string, width: number, height: number): Promise<any>;
    queryScenePreview(width: number, height: number): Promise<any>;
    switchMaterialPrimitive(type: string): void;
    generateThumbnail(uuid: string, assetType: string, width?: number, height?: number): Promise<any>;
}

export type IPublicPreviewService = Pick<IPreviewService,
    'queryPreviewData' | 'callPreviewFunction' |
    'queryMaterialPreview' | 'queryModelPreview' | 'queryMeshPreview' |
    'querySkeletonPreview' | 'queryPrefabPreview' | 'querySpinePreview' |
    'queryScenePreview' | 'switchMaterialPrimitive' | 'generateThumbnail'
>;

export interface IPreviewEvents {
}

export interface IPreviewService {
    init(): void;
    open(uuid: string): Promise<any>;
    switchMaterialPrimitive(type: string): void;
    switchLight(enabled: boolean): void;
    generateThumbnail(uuid: string, assetType: string, width?: number, height?: number): Promise<any>;
}

export type IPublicPreviewService = Pick<IPreviewService,
    'open' | 'switchMaterialPrimitive' | 'switchLight' | 'generateThumbnail'
>;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface IPreviewEvents {
}

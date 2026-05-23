export interface IPreviewService {
    init(): void;
    switchMaterialPrimitive(type: string): void;
    generateThumbnail(uuid: string, assetType: string, width?: number, height?: number): Promise<any>;
}

export type IPublicPreviewService = Pick<IPreviewService,
    'switchMaterialPrimitive' | 'generateThumbnail'
>;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface IPreviewEvents {
}

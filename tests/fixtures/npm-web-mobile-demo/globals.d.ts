interface CocosDemoState {
    started: boolean;
    frame: number;
    angle: number;
    error: string | null;
    customComponent: {
        registered: boolean;
        started: boolean;
        updates: number;
    };
    customAssets: {
        remoteImageLoaded: boolean;
        remoteImageNodeName: string | null;
        remoteImageSize: string | null;
        remoteImageAssetType: string | null;
    };
    pipeline?: {
        rendererInitialized: unknown;
        usesCustomPipeline: unknown;
        pipeline: string | undefined;
        hasBuiltinUnlit: boolean;
    };
}

declare var __cocosAssetBaseUrl: string;
declare var __cocosDemoState: CocosDemoState;

declare module '*.css';

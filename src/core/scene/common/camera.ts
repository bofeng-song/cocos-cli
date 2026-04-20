import type { Vec3 } from 'cc';

export interface ICameraService {
    init(): void;
    initFromConfig(): Promise<void>;
    is2D: boolean;
    focus(nodes?: string[] | null, editorCameraInfo?: any, immediate?: boolean): void;
    defaultFocus(uuid: string): void;
    rotateCameraToDir(dir: Vec3, rotateByViewDist: boolean): void;
    changeProjection(): void;
    setGridVisible(value: boolean): void;
    isGridVisible(): boolean;
    setCameraProperty(options: any): void;
    resetCameraProperty(): void;
    getCameraFov(): number;
    zoomUp(): void;
    zoomDown(): void;
    zoomReset(): void;
    alignNodeToSceneView(nodes: string[]): void;
    alignSceneViewToNode(nodes: string[]): void;
    onUpdate(deltaTime: number): void;
}

export type IPublicCameraService = Pick<ICameraService,
    'focus' | 'defaultFocus' | 'rotateCameraToDir' | 'changeProjection' |
    'setGridVisible' | 'isGridVisible' | 'setCameraProperty' | 'resetCameraProperty' |
    'getCameraFov' | 'zoomUp' | 'zoomDown' | 'zoomReset' |
    'alignNodeToSceneView' | 'alignSceneViewToNode'
> & { is2D: boolean };

export interface ICameraEvents {
    'camera:mode-change': [mode: number];
    'camera:fov-changed': [fov: number];
    'camera:projection-changed': [projection: number];
}

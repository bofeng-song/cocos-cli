import type { IPublicCameraService } from '../../common';
import { Rpc } from '../rpc';

export const CameraProxy: IPublicCameraService = {
    is2D: false,
    focus(nodes?: string[] | null, editorCameraInfo?: any, immediate?: boolean) {
        return Rpc.getInstance().request('Camera', 'focus', [nodes, editorCameraInfo, immediate]) as any;
    },
    defaultFocus(uuid: string) {
        return Rpc.getInstance().request('Camera', 'defaultFocus', [uuid]) as any;
    },
    rotateCameraToDir(dir: any, rotateByViewDist: boolean) {
        return Rpc.getInstance().request('Camera', 'rotateCameraToDir', [dir, rotateByViewDist]) as any;
    },
    changeProjection() {
        return Rpc.getInstance().request('Camera', 'changeProjection') as any;
    },
    setGridVisible(value: boolean) {
        return Rpc.getInstance().request('Camera', 'setGridVisible', [value]) as any;
    },
    isGridVisible() {
        return Rpc.getInstance().request('Camera', 'isGridVisible') as any;
    },
    setCameraProperty(options: any) {
        return Rpc.getInstance().request('Camera', 'setCameraProperty', [options]) as any;
    },
    resetCameraProperty() {
        return Rpc.getInstance().request('Camera', 'resetCameraProperty') as any;
    },
    getCameraFov() {
        return Rpc.getInstance().request('Camera', 'getCameraFov') as any;
    },
    zoomUp() {
        return Rpc.getInstance().request('Camera', 'zoomUp') as any;
    },
    zoomDown() {
        return Rpc.getInstance().request('Camera', 'zoomDown') as any;
    },
    zoomReset() {
        return Rpc.getInstance().request('Camera', 'zoomReset') as any;
    },
    alignNodeToSceneView(nodes: string[]) {
        return Rpc.getInstance().request('Camera', 'alignNodeToSceneView', [nodes]) as any;
    },
    alignSceneViewToNode(nodes: string[]) {
        return Rpc.getInstance().request('Camera', 'alignSceneViewToNode', [nodes]) as any;
    },
};

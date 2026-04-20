import type { IPublicCameraService } from '../../common';
import { Rpc } from '../rpc';

export const CameraProxy: IPublicCameraService = {
    is2D: false,
    focus(nodes?: string[] | null, editorCameraInfo?: any, immediate?: boolean) {
        return Rpc.getInstance().request('Camera', 'focus', [nodes, editorCameraInfo, immediate]);
    },
    defaultFocus(uuid: string) {
        return Rpc.getInstance().request('Camera', 'defaultFocus', [uuid]);
    },
    rotateCameraToDir(dir: any, rotateByViewDist: boolean) {
        return Rpc.getInstance().request('Camera', 'rotateCameraToDir', [dir, rotateByViewDist]);
    },
    changeProjection() {
        return Rpc.getInstance().request('Camera', 'changeProjection');
    },
    setGridVisible(value: boolean) {
        return Rpc.getInstance().request('Camera', 'setGridVisible', [value]);
    },
    isGridVisible() {
        return Rpc.getInstance().request('Camera', 'isGridVisible');
    },
    setCameraProperty(options: any) {
        return Rpc.getInstance().request('Camera', 'setCameraProperty', [options]);
    },
    resetCameraProperty() {
        return Rpc.getInstance().request('Camera', 'resetCameraProperty');
    },
    getCameraFov() {
        return Rpc.getInstance().request('Camera', 'getCameraFov');
    },
    zoomUp() {
        return Rpc.getInstance().request('Camera', 'zoomUp');
    },
    zoomDown() {
        return Rpc.getInstance().request('Camera', 'zoomDown');
    },
    zoomReset() {
        return Rpc.getInstance().request('Camera', 'zoomReset');
    },
    alignNodeToSceneView(nodes: string[]) {
        return Rpc.getInstance().request('Camera', 'alignNodeToSceneView', [nodes]);
    },
    alignSceneViewToNode(nodes: string[]) {
        return Rpc.getInstance().request('Camera', 'alignSceneViewToNode', [nodes]);
    },
};

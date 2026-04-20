import type { IPublicGizmoService } from '../../common';
import { Rpc } from '../rpc';

export const GizmoProxy: IPublicGizmoService = {
    changeTool(name: string) {
        return Rpc.getInstance().request('Gizmo', 'changeTool', [name]);
    },
    setCoordinate(coord: 'local' | 'global') {
        return Rpc.getInstance().request('Gizmo', 'setCoordinate', [coord]);
    },
    setPivot(pivot: 'pivot' | 'center') {
        return Rpc.getInstance().request('Gizmo', 'setPivot', [pivot]);
    },
    lockGizmoTool(locked: boolean) {
        return Rpc.getInstance().request('Gizmo', 'lockGizmoTool', [locked]);
    },
    setIconVisible(visible: boolean) {
        return Rpc.getInstance().request('Gizmo', 'setIconVisible', [visible]);
    },
    get transformToolName() {
        return Rpc.getInstance().request('Gizmo', 'transformToolName') as any;
    },
    get isViewMode() {
        return Rpc.getInstance().request('Gizmo', 'isViewMode') as any;
    },
};

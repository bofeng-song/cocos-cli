import type { IPublicSceneViewService } from '../../common';
import { Rpc } from '../rpc';

export const SceneViewProxy: IPublicSceneViewService = {
    setSceneLightOn(enable: boolean) {
        return Rpc.getInstance().request('SceneView', 'setSceneLightOn', [enable]) as any;
    },
    querySceneLightOn() {
        return Rpc.getInstance().request('SceneView', 'querySceneLightOn') as any;
    },
};

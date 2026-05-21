import { IPublicEngineService, } from '../../common';
import { Rpc } from '../rpc';

export const EngineProxy: IPublicEngineService = {
    init() {
        return Rpc.getInstance().request('Engine', 'init');
    },
    repaintInEditMode() {
        return Rpc.getInstance().request('Engine', 'repaintInEditMode');
    },
    pause() {
        Rpc.getInstance().request('Engine', 'pause');
    },
    resume() {
        Rpc.getInstance().request('Engine', 'resume');
    },
};

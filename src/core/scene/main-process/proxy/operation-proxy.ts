import type { IPublicOperationService } from '../../common';
import { Rpc } from '../rpc';

export const OperationProxy: IPublicOperationService = {
    dispatch(type: any, ...args: any[]) {
        return Rpc.getInstance().request('Operation', 'dispatch', [type, ...args]);
    },
    emitMouseEvent(type: string, event: any, dpr?: number) {
        return Rpc.getInstance().request('Operation', 'emitMouseEvent', [type, event, dpr]);
    },
    requestPointerLock() {
        return Rpc.getInstance().request('Operation', 'requestPointerLock');
    },
    exitPointerLock() {
        return Rpc.getInstance().request('Operation', 'exitPointerLock');
    },
    changePointer(type: string) {
        return Rpc.getInstance().request('Operation', 'changePointer', [type]);
    },
};

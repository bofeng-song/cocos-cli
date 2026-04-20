import type { IPublicUndoService } from '../../common';
import { Rpc } from '../rpc';

export const UndoProxy: IPublicUndoService = {
    beginRecording(uuids: string[], options?: any) {
        return Rpc.getInstance().request('Undo', 'beginRecording', [uuids, options]) as any;
    },
    endRecording(commandId: string) {
        return Rpc.getInstance().request('Undo', 'endRecording', [commandId]) as any;
    },
    cancelRecording(commandId: string) {
        return Rpc.getInstance().request('Undo', 'cancelRecording', [commandId]) as any;
    },
    undo() {
        return Rpc.getInstance().request('Undo', 'undo') as any;
    },
    redo() {
        return Rpc.getInstance().request('Undo', 'redo') as any;
    },
    snapshot() {
        return Rpc.getInstance().request('Undo', 'snapshot') as any;
    },
    reset() {
        return Rpc.getInstance().request('Undo', 'reset') as any;
    },
    isDirty() {
        return Rpc.getInstance().request('Undo', 'isDirty') as any;
    },
};

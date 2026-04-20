import type { IPublicUndoService } from '../../common';
import { Rpc } from '../rpc';

export const UndoProxy: IPublicUndoService = {
    beginRecording(uuids: string[], options?: any) {
        return Rpc.getInstance().request('Undo', 'beginRecording', [uuids, options]);
    },
    endRecording(commandId: string) {
        return Rpc.getInstance().request('Undo', 'endRecording', [commandId]);
    },
    cancelRecording(commandId: string) {
        return Rpc.getInstance().request('Undo', 'cancelRecording', [commandId]);
    },
    undo() {
        return Rpc.getInstance().request('Undo', 'undo');
    },
    redo() {
        return Rpc.getInstance().request('Undo', 'redo');
    },
    snapshot() {
        return Rpc.getInstance().request('Undo', 'snapshot');
    },
    reset() {
        return Rpc.getInstance().request('Undo', 'reset');
    },
    isDirty() {
        return Rpc.getInstance().request('Undo', 'isDirty');
    },
};

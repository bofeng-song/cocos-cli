import type { IPublicSelectionService } from '../../common';
import { Rpc } from '../rpc';

export const SelectionProxy: IPublicSelectionService = {
    select(uuid: string) {
        return Rpc.getInstance().request('Selection', 'select', [uuid]);
    },
    unselect(uuid: string) {
        return Rpc.getInstance().request('Selection', 'unselect', [uuid]);
    },
    clear() {
        return Rpc.getInstance().request('Selection', 'clear');
    },
    query() {
        return Rpc.getInstance().request('Selection', 'query');
    },
    isSelect(uuid: string) {
        return Rpc.getInstance().request('Selection', 'isSelect', [uuid]);
    },
};

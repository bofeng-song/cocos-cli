import type { IPublicSelectionService } from '../../common';
import { Rpc } from '../rpc';

export const SelectionProxy: IPublicSelectionService = {
    select(uuid: string) {
        return Rpc.getInstance().request('Selection', 'select', [uuid]) as any;
    },
    unselect(uuid: string) {
        return Rpc.getInstance().request('Selection', 'unselect', [uuid]) as any;
    },
    clear() {
        return Rpc.getInstance().request('Selection', 'clear') as any;
    },
    query() {
        return Rpc.getInstance().request('Selection', 'query') as any;
    },
    isSelect(uuid: string) {
        return Rpc.getInstance().request('Selection', 'isSelect', [uuid]) as any;
    },
};

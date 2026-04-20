import dumpUtil from '../dump/index';
import { ServiceEvents } from '../core/global-events';

class UndoCommand {
    toPerformUndo = false;

    async perform() {
        if (this.toPerformUndo) {
            await this.undo();
        } else {
            await this.redo();
        }
    }

    async undo() {}
    async redo() {}
}

type IDump = any;
type SceneUndoCommandID = string;

class SceneUndoCommand extends UndoCommand {
    public tag = '';
    id: SceneUndoCommandID = '';
    auto = false;
    custom = false;
    uuids: string[] = [];
    undoData: Map<string, IDump> = new Map();
    redoData: Map<string, IDump> = new Map();

    async undo() {
        await this.applyData(this.undoData);
    }

    async redo() {
        await this.applyData(this.redoData);
    }

    private async applyData(data: Map<string, IDump>) {
        const EditorExtends = (cc as any).EditorExtends;
        if (!EditorExtends) return;

        for (const [uuid, dump] of data) {
            try {
                const node = EditorExtends.Node.getNode(uuid);
                if (node && dump) {
                    // Restore node by restoring each component's properties
                    if (dump.value) {
                        for (const key in dump.value) {
                            await dumpUtil.restoreProperty(node, key, dump.value[key]);
                        }
                    }
                    ServiceEvents.emit('node:change', node, { source: 'undo' });
                    continue;
                }

                const comp = EditorExtends.Component?.getComponent(uuid);
                if (comp && dump?.value) {
                    for (const key in dump.value) {
                        await dumpUtil.restoreProperty(comp, key, dump.value[key]);
                    }
                    if (comp.node) {
                        ServiceEvents.emit('node:change', comp.node, { source: 'undo' });
                    }
                }
            } catch (e) {
                console.error('[Undo] applyData error:', e);
            }
        }
    }
}

export { UndoCommand, SceneUndoCommand, SceneUndoCommandID };

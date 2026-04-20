import dumpUtil from '../dump/index';
import { UndoCommand, SceneUndoCommand, SceneUndoCommandID } from './undo-command';

interface ISceneUndoOption {
    tag?: string;
    auto?: boolean;
    customCommand?: SceneUndoCommand;
}

class SceneUndoManager {
    private _commandArray: UndoCommand[] = [];
    private _index = -1;
    private _lastSavedCommand: UndoCommand | null = null;
    private _autoCommands: SceneUndoCommand[] = [];
    private _manualCommands: SceneUndoCommand[] = [];
    private _id = 0;

    push(command: UndoCommand) {
        if (this._index !== this._commandArray.length - 1) {
            this._commandArray.splice(this._index + 1);
        }
        this._commandArray.push(command);
        this._index++;
    }

    async undo(): Promise<UndoCommand | undefined> {
        if (this._index === -1) return;
        const command = this._commandArray[this._index];
        if (command) {
            command.toPerformUndo = true;
            await command.perform();
            this._index--;
            return command;
        }
    }

    async redo(): Promise<UndoCommand | undefined> {
        if (this._index > this._commandArray.length - 1) return;
        const redoCommand = this._commandArray[this._index + 1];
        if (redoCommand) {
            this._index++;
            redoCommand.toPerformUndo = false;
            await redoCommand.perform();
            return redoCommand;
        }
    }

    reset() {
        this._commandArray.length = 0;
        this._index = -1;
        this._lastSavedCommand = null;
        this._autoCommands.length = 0;
        this._manualCommands.length = 0;
    }

    save() {
        this._lastSavedCommand = this._commandArray[this._index];
    }

    isDirty(): boolean {
        return this._index !== -1 && this._lastSavedCommand !== this._commandArray[this._index];
    }

    beginRecording(uuids: string | string[], option?: ISceneUndoOption): SceneUndoCommandID {
        option = option ?? { auto: false };
        const command = this._createCommand(option);
        const uuidList = Array.isArray(uuids) ? uuids : [uuids];
        const uuidSet = new Set(uuidList);
        for (const uuid of uuidSet.values()) {
            command.uuids.push(uuid);
            if (!command.custom) {
                this._setUndo(command, uuid);
            }
        }
        return command.id;
    }

    endRecording(id: SceneUndoCommandID): boolean {
        const command = this._autoCommands.find(t => t.id === id) ??
            this._manualCommands.find(t => t.id === id);
        if (!command) return false;
        if (this._commandArray.indexOf(command) !== -1) {
            console.warn('[Undo] command already exists', command.tag);
            return false;
        }
        if (!command.custom) {
            command.uuids.forEach(uuid => {
                this._setRedo(command, uuid);
            });
        }
        this.push(command);
        const index = this._manualCommands.indexOf(command);
        if (index !== -1) {
            this._manualCommands.splice(index, 1);
        }
        return true;
    }

    cancelRecording(id: SceneUndoCommandID): boolean {
        let removed = this._removeCommand(this._autoCommands, id);
        if (!removed) {
            removed = this._removeCommand(this._manualCommands, id);
        }
        return removed;
    }

    private _createCommand(option: ISceneUndoOption): SceneUndoCommand {
        let command: SceneUndoCommand;
        if (option.customCommand) {
            command = option.customCommand;
            command.custom = true;
        } else {
            command = new SceneUndoCommand();
        }
        if (option.tag !== undefined) command.tag = option.tag;
        if (option.auto !== undefined) command.auto = option.auto;
        if (command.auto !== false) {
            this._autoCommands.push(command);
        } else {
            this._manualCommands.push(command);
        }
        this._id++;
        command.id = (command.tag || 'cmd') + this._id;
        return command;
    }

    private _setUndo(command: SceneUndoCommand, uuid: string) {
        const EditorExtends = (cc as any).EditorExtends;
        if (!EditorExtends) return;
        try {
            const node = EditorExtends.Node.getNode(uuid);
            if (node) {
                command.undoData.set(uuid, dumpUtil.dumpComponent(node));
                return;
            }
            const comp = EditorExtends.Component?.getComponent(uuid);
            if (comp) {
                command.undoData.set(uuid, dumpUtil.dumpComponent(comp));
            }
        } catch (e) {
            console.error('[Undo] _setUndo error:', e);
        }
    }

    private _setRedo(command: SceneUndoCommand, uuid: string) {
        const EditorExtends = (cc as any).EditorExtends;
        if (!EditorExtends) return;
        try {
            const node = EditorExtends.Node.getNode(uuid);
            if (node) {
                command.redoData.set(uuid, dumpUtil.dumpComponent(node));
                return;
            }
            const comp = EditorExtends.Component?.getComponent(uuid);
            if (comp) {
                command.redoData.set(uuid, dumpUtil.dumpComponent(comp));
            }
        } catch (e) {
            console.error('[Undo] _setRedo error:', e);
        }
    }

    private _removeCommand(list: SceneUndoCommand[], id: SceneUndoCommandID): boolean {
        const index = list.findIndex(t => t.id === id);
        if (index !== -1) {
            list.splice(index, 1);
            return true;
        }
        return false;
    }
}

export { SceneUndoManager, ISceneUndoOption };

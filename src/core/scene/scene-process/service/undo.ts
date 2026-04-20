import { BaseService } from './core';
import { register } from './core/decorator';
import { SceneUndoManager } from './undo/scene-undo-manager';
import type { IUndoService, IUndoEvents } from '../../common';

@register('Undo')
export class UndoService extends BaseService<IUndoEvents> implements IUndoService {
    private _undoMgr = new SceneUndoManager();

    beginRecording(uuids: string[], options?: any): string {
        return this._undoMgr.beginRecording(uuids, options);
    }

    endRecording(commandId: string): void {
        this._undoMgr.endRecording(commandId);
    }

    cancelRecording(commandId: string): void {
        this._undoMgr.cancelRecording(commandId);
    }

    async undo(): Promise<void> {
        await this._undoMgr.undo();
        try {
            const { Service } = require('./core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
        this.broadcast('undo:changed');
    }

    async redo(): Promise<void> {
        await this._undoMgr.redo();
        try {
            const { Service } = require('./core/decorator');
            Service.Engine?.repaintInEditMode?.();
        } catch (e) {
            // Engine may not be ready
        }
        this.broadcast('undo:changed');
    }

    snapshot(): void {
        // Legacy one-shot: not needed for new code, kept for compatibility
    }

    reset(): void {
        this._undoMgr.reset();
    }

    isDirty(): boolean {
        return this._undoMgr.isDirty();
    }
}

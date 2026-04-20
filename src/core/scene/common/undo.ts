export interface IUndoService {
    beginRecording(uuids: string[], options?: any): string;
    endRecording(commandId: string): void;
    cancelRecording(commandId: string): void;
    undo(): Promise<void>;
    redo(): Promise<void>;
    snapshot(): void;
    reset(): void;
    isDirty(): boolean;
}

export type IPublicUndoService = IUndoService;

export interface IUndoEvents {
    'undo:changed': [];
}

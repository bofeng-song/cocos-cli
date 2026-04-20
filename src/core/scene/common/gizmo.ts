export interface IGizmoService {
    gizmoRootNode: any;
    foregroundNode: any;
    backgroundNode: any;
    transformToolData: any;
    transformToolName: string;
    isViewMode: boolean;

    init(): void;
    initFromConfig(): Promise<void>;
    saveConfig(): Promise<void>;
    changeTool(name: string): void;
    setCoordinate(coord: 'local' | 'global'): void;
    setPivot(pivot: 'pivot' | 'center'): void;
    lockGizmoTool(locked: boolean): void;
    setIconVisible(visible: boolean): void;
    showAllGizmoOfNode(node: any, recursive?: boolean): void;
    removeAllGizmoOfNode(node: any, recursive?: boolean): void;
    clearAllGizmos(): void;
    callAllGizmoFuncOfNode(node: any, funcName: string, ...params: any[]): boolean;
    onUpdate(deltaTime: number): void;
}

export type IPublicGizmoService = Pick<IGizmoService,
    'changeTool' | 'setCoordinate' | 'setPivot' | 'lockGizmoTool' |
    'setIconVisible' | 'transformToolName' | 'isViewMode'
>;

export interface IGizmoEvents {
    'gizmo:tool-changed': [name: string];
    'gizmo:control-begin': [];
    'gizmo:control-end': [];
}

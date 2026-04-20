import { IVec3Like, Vec3 } from 'cc';
import { EventEmitter } from 'events';

export interface ISnapConfigData {
    position: IVec3Like;
    rotation: number;
    scale: number;
    isPositionSnapEnabled: boolean;
    isRotationSnapEnabled: boolean;
    isScaleSnapEnabled: boolean;
}

/**
 * Snap 配置，支持事件通知
 */
export class SnapConfigs extends EventEmitter {
    private _position: IVec3Like = new Vec3(1, 1, 1);
    private _rotation: number = 15;
    private _scale: number = 0.1;
    private _isPositionSnapEnabled: boolean = false;
    private _isRotationSnapEnabled: boolean = false;
    private _isScaleSnapEnabled: boolean = false;

    get position(): IVec3Like {
        return this._position;
    }

    set position(value: IVec3Like) {
        this._position = value;
        this.emit('change', 'position', value);
    }

    get rotation(): number {
        return this._rotation;
    }

    set rotation(value: number) {
        this._rotation = value;
        this.emit('change', 'rotation', value);
    }

    get scale(): number {
        return this._scale;
    }

    set scale(value: number) {
        this._scale = value;
        this.emit('change', 'scale', value);
    }

    get isPositionSnapEnabled(): boolean {
        return this._isPositionSnapEnabled;
    }

    set isPositionSnapEnabled(value: boolean) {
        this._isPositionSnapEnabled = value;
        this.emit('change', 'isPositionSnapEnabled', value);
    }

    get isRotationSnapEnabled(): boolean {
        return this._isRotationSnapEnabled;
    }

    set isRotationSnapEnabled(value: boolean) {
        this._isRotationSnapEnabled = value;
        this.emit('change', 'isRotationSnapEnabled', value);
    }

    get isScaleSnapEnabled(): boolean {
        return this._isScaleSnapEnabled;
    }

    set isScaleSnapEnabled(value: boolean) {
        this._isScaleSnapEnabled = value;
        this.emit('change', 'isScaleSnapEnabled', value);
    }

    public getPureDataObject(): ISnapConfigData {
        return {
            position: this._position,
            rotation: this._rotation,
            scale: this._scale,
            isPositionSnapEnabled: this._isPositionSnapEnabled,
            isRotationSnapEnabled: this._isRotationSnapEnabled,
            isScaleSnapEnabled: this._isScaleSnapEnabled,
        };
    }

    public initFromData(data: ISnapConfigData) {
        this._position = data.position;
        this._rotation = data.rotation;
        this._scale = data.scale;
        this._isPositionSnapEnabled = data.isPositionSnapEnabled;
        this._isRotationSnapEnabled = data.isRotationSnapEnabled;
        this._isScaleSnapEnabled = data.isScaleSnapEnabled;
    }
}

export type TransformToolDataToolNameType = 'view' | 'position' | 'rotation' | 'scale' | 'rect';
export const transformToolDataToolNameTypeList: TransformToolDataToolNameType[] = ['view', 'position', 'rotation', 'scale', 'rect'];

export type TransformToolDataCoordinateType = 'local' | 'global';
export type TransformToolDataPivotType = 'pivot' | 'center';
export type TransformToolDataViewMode = 'view' | 'select';

/**
 * 变换工具数据，支持事件通知
 */
export class TransformToolData extends EventEmitter {
    private _toolName: TransformToolDataToolNameType = 'position';
    private _viewMode: TransformToolDataViewMode = 'select';
    private _coordinate: TransformToolDataCoordinateType = 'local';
    private _pivot: TransformToolDataPivotType = 'pivot';
    private _isLocked: boolean = false;
    private _is2D: boolean = false;
    private _scale2D: number = 1;
    private _snapConfigs: SnapConfigs = new SnapConfigs();
    private _cameraOrthoHeight: number = 10;

    get toolName(): TransformToolDataToolNameType {
        return this._toolName;
    }

    set toolName(value: TransformToolDataToolNameType) {
        this._toolName = value;
        this.emit('change', 'toolName', value);
    }

    get viewMode(): TransformToolDataViewMode {
        return this._viewMode;
    }

    set viewMode(value: TransformToolDataViewMode) {
        this._viewMode = value;
        this.emit('change', 'viewMode', value);
    }

    get coordinate(): TransformToolDataCoordinateType {
        return this._coordinate;
    }

    set coordinate(value: TransformToolDataCoordinateType) {
        this._coordinate = value;
        this.emit('change', 'coordinate', value);
    }

    get pivot(): TransformToolDataPivotType {
        return this._pivot;
    }

    set pivot(value: TransformToolDataPivotType) {
        this._pivot = value;
        this.emit('change', 'pivot', value);
    }

    get isLocked(): boolean {
        return this._isLocked;
    }

    set isLocked(value: boolean) {
        this._isLocked = value;
        this.emit('change', 'isLocked', value);
    }

    get is2D(): boolean {
        return this._is2D;
    }

    set is2D(value: boolean) {
        this._is2D = value;
        this.emit('change', 'is2D', value);
    }

    get scale2D(): number {
        return this._scale2D;
    }

    set scale2D(value: number) {
        this._scale2D = value;
        this.emit('change', 'scale2D', value);
    }

    get snapConfigs(): SnapConfigs {
        return this._snapConfigs;
    }

    get cameraOrthoHeight(): number {
        return this._cameraOrthoHeight;
    }

    set cameraOrthoHeight(value: number) {
        this._cameraOrthoHeight = value;
        this.emit('change', 'cameraOrthoHeight', value);
    }
}

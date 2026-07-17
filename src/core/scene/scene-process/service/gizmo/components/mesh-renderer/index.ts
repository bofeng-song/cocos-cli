'use strict';

import { geometry, js, MeshRenderer, Quat, Vec3 } from 'cc';
import GizmoBase from '../../base/gizmo-base';
import BoxController from '../../controller/box';
import { LightProbeTetraHelper } from '../../utils/light-probe-tetra';
import { registerGizmo } from '../../gizmo-defines';

const tempQuat_a = new Quat();
const tempSize = new Vec3();

class ModelComponentGizmo extends GizmoBase<MeshRenderer> {
    private _controller!: BoxController;
    private _tetraHelper!: LightProbeTetraHelper;

    init() {
        this._controller = new BoxController(this.getGizmoRoot());
        this._tetraHelper = new LightProbeTetraHelper(this.getGizmoRoot());
        this._isInitialized = true;
    }

    onShow() {
        this._controller.show();
        this.updateControllerData();
    }

    onHide() {
        this._controller.hide();
        this._tetraHelper.hide();
    }

    updateControllerData() {
        if (!this._isInitialized || this.target == null) {
            return;
        }

        const node = this.target.node;
        const boundingBox = this.getBoundingBox(this.target);
        if (boundingBox) {
            this._controller.show();

            const worldScale = node.getWorldScale();
            const worldPos = node.getWorldPosition();
            const worldRot = tempQuat_a;
            node.getWorldRotation(worldRot);
            this._controller.setScale(worldScale);
            this._controller.setPosition(worldPos);
            this._controller.setRotation(worldRot);

            Vec3.multiplyScalar(tempSize, boundingBox.halfExtents, 2);
            this._controller.updateSize(boundingBox.center, tempSize);
        } else {
            this._controller.hide();
        }

        // 影响该物体的光照探针四面体连线（仅当开启“使用光照探针”时显示）
        this._tetraHelper.update(this.target);
    }

    private getBoundingBox(component: MeshRenderer): geometry.AABB | null {
        let bb = component.model && component.model.modelBounds;
        if (!bb) {
            const mesh = component.mesh;
            if (mesh && mesh.minPosition && mesh.maxPosition) {
                bb = geometry.AABB.fromPoints(geometry.AABB.create(), mesh.minPosition, mesh.maxPosition);
            }
        }
        return bb || null;
    }

    updateControllerTransform() {
        this.updateControllerData();
    }

    onTargetUpdate() {
        this.updateControllerData();
    }

    onNodeChanged() {
        this.updateControllerData();
    }

    onUpdate() {
        // 引擎会在渲染循环里更新 model.tetrahedronIndex（不触发节点事件），需逐帧跟踪。
        // 只刷新影响四面体（内部按签名短路，无变化时不重建 SH/连线），不每帧重建包围盒。
        if (this.target) this._tetraHelper.update(this.target);
    }

    onDestroy() {
        this._tetraHelper?.destroy();
    }
}

export const name = js.getClassName(MeshRenderer);
export const SelectGizmo = ModelComponentGizmo;
export const IconGizmo = null;
export const PersistentGizmo = null;

registerGizmo(name, { SelectGizmo });

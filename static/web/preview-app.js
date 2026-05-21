/* global window, document, cc */

const PREVIEW_TYPES = {
    material: { method: 'queryMaterialPreview', needsUuid: true, instance: 'materialPreview' },
    model:    { method: 'queryModelPreview',    needsUuid: true, instance: 'modelPreview' },
    mesh:     { method: 'queryMeshPreview',     needsUuid: true, instance: 'meshPreview' },
    prefab:   { method: 'queryPrefabPreview',   needsUuid: true, instance: 'prefabPreview' },
    skeleton: { method: 'querySkeletonPreview', needsUuid: true, instance: 'skeletonPreview' },
    spine:    { method: 'querySpinePreview',    needsUuid: true, instance: 'spinePreview' },
};

var _activePreviewInstance = null;

function log(msg, level) {
    if (level === 'err') console.error('[Preview]', msg);
    else if (level === 'warn') console.warn('[Preview]', msg);
    else console.log('[Preview]', msg);
}

function getPreviewService() {
    try {
        return window.cli && window.cli.Scene && window.cli.Scene.Preview;
    } catch (e) {
        return null;
    }
}

// ── Redirect preview camera to main window ──

function attachToMainWindow(previewInstance) {
    if (!previewInstance || !previewInstance.cameraComp) return;

    var mainWindow = cc.director.root.mainWindow;
    var camera = previewInstance.cameraComp.camera || previewInstance.camera;
    if (!camera || !mainWindow) return;

    camera.changeTargetWindow(mainWindow);
    camera.isWindowSize = true;
    camera.enabled = true;
    previewInstance.cameraComp.enabled = true;

    if (previewInstance.scene && previewInstance.scene.renderScene) {
        if (!camera.scene) {
            previewInstance.scene.renderScene.addCamera(camera);
        }
    }

    if (previewInstance.worldAxis) {
        previewInstance.worldAxis._sceneGizmoCamera.camera.changeTargetWindow(mainWindow);
        if (previewInstance.enableAxis) {
            previewInstance.worldAxis.show();
        }
    }

    log('Attached preview camera to mainWindow');
}

// ── Preview execution ──

async function doPreview() {
    var preview = getPreviewService();
    if (!preview) {
        log('Preview service not ready', 'err');
        return null;
    }

    var type = document.getElementById('pvType').value;
    var uuid = document.getElementById('pvUuid').value.trim();
    var status = document.getElementById('pvStatus');

    var info = PREVIEW_TYPES[type];
    if (!info) {
        log('Unknown preview type: ' + type, 'err');
        return null;
    }
    if (info.needsUuid && !uuid) {
        log('UUID is required for ' + type + ' preview', 'warn');
        return null;
    }

    status.textContent = 'Loading...';
    log('Preview: type=' + type + ' uuid=' + uuid);

    try {
        // Detach previous preview from mainWindow
        if (_activePreviewInstance && _activePreviewInstance.cameraComp) {
            _activePreviewInstance.cameraComp.enabled = false;
        }

        // Load the asset into the preview instance (this calls setModel/setMesh/etc.)
        var previewInstance = info.instance ? preview[info.instance] : null;

        // Use the query method to trigger asset loading (setModel, setMesh, etc.)
        await preview[info.method](uuid, 256, 256);

        _activePreviewInstance = previewInstance;

        // Redirect the preview camera to render on the main canvas
        attachToMainWindow(previewInstance);

        window.cli.Scene.Engine.repaintInEditMode();
        status.textContent = type + ' ok';
        return null;
    } catch (e) {
        log('Preview error: ' + e.message, 'err');
        status.textContent = 'error';
        console.error('Preview error:', e);
        return null;
    }
}

function switchPrimitive(type) {
    var preview = getPreviewService();
    if (preview) {
        preview.switchMaterialPrimitive(type);
        window.cli.Scene.Engine.repaintInEditMode();
        log('Switched primitive: ' + type);
    }
}

function toggleLight() {
    var preview = getPreviewService();
    if (!preview) return;
    var mp = preview.materialPreview;
    if (mp && mp.lightComp) {
        var on = !mp.lightComp.enabled;
        mp.setLightEnable(on);
        window.cli.Scene.Engine.repaintInEditMode();
        log('Light: ' + (on ? 'ON' : 'OFF'));
    }
}

function toggle2D3D() {
    var preview = getPreviewService();
    if (!preview) return;
    var mp = preview.materialPreview;
    if (mp && mp.viewToggle) {
        mp.viewToggle();
        attachToMainWindow(mp);
        log('Toggled 2D/3D view');
    }
}

// ── Mouse event forwarding to InteractivePreview ──

function bindPreviewMouseEvents(canvas) {
    canvas.addEventListener('mousedown', function(e) {
        if (!_activePreviewInstance) return;
        _activePreviewInstance.onMouseDown(e);
    });

    canvas.addEventListener('mousemove', function(e) {
        if (!_activePreviewInstance) return;
        _activePreviewInstance.onMouseMove(e);
        if (_activePreviewInstance._isMouseDown) {
            window.cli.Scene.Engine.repaintInEditMode();
        }
    });

    canvas.addEventListener('mouseup', function(e) {
        if (!_activePreviewInstance) return;
        _activePreviewInstance.onMouseUp(e);
    });

    canvas.addEventListener('wheel', function(e) {
        if (!_activePreviewInstance) return;
        e.preventDefault();
        _activePreviewInstance.onMouseWheel({
            wheelDeltaY: -e.deltaY,
        });
        window.cli.Scene.Engine.repaintInEditMode();
    }, { passive: false });

    canvas.addEventListener('contextmenu', function(e) {
        e.preventDefault();
    });
}

// ── Initialization ──

export default function initPreviewApp() {
    var status = document.getElementById('pvStatus');

    var preview = getPreviewService();
    if (!preview) {
        status.textContent = 'Service unavailable';
        log('Preview service not found after boot', 'err');
        return;
    }

    try {
        window.cli.Scene.Engine.resume();
    } catch (e) {
        log('Engine resume failed: ' + e.message, 'warn');
    }

    var canvas = document.getElementById('GameCanvas');
    if (canvas) {
        bindPreviewMouseEvents(canvas);
        log('Bound preview mouse events to canvas');
    }

    status.textContent = 'Ready';
    log('Preview service ready');

    // Parse URL params for auto-preview
    var params = new URLSearchParams(window.location.search);
    var type = params.get('type');
    var uuid = params.get('uuid');

    if (type && PREVIEW_TYPES[type]) {
        document.getElementById('pvType').value = type;
    }
    if (uuid) {
        document.getElementById('pvUuid').value = uuid;
    }

    if (type && uuid) {
        log('Auto-preview from URL params: type=' + type + ' uuid=' + uuid);
        setTimeout(function() { doPreview(); }, 100);
    }

    // Expose API for external automation
    window.previewAPI = {
        doPreview: doPreview,
        preview: function(type, uuid) {
            document.getElementById('pvType').value = type;
            document.getElementById('pvUuid').value = uuid || '';
            return doPreview();
        },
        switchPrimitive: switchPrimitive,
        toggleLight: toggleLight,
        toggle2D3D: toggle2D3D,
        getPreviewTypes: function() { return Object.keys(PREVIEW_TYPES); },
    };
}

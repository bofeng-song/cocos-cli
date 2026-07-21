/* global window, document */

const RPC_TIMEOUT = 60000;
const SCENE_READY_RETRY_COUNT = 20;
const SCENE_READY_RETRY_DELAY = 250;
const MAX_PREVIEW_PIXELS = 3840 * 2160;
const MAX_PREVIEW_SIDE = 4096;

function log(msg, level) {
    if (level === 'err') console.error('[Preview]', msg);
    else if (level === 'warn') console.warn('[Preview]', msg);
    else console.log('[Preview]', msg);
}

let socket = null;
let activePreview = false;
let lightEnabled = true;
let renderScheduled = false;
let renderInProgress = false;
let renderQueued = false;

function getStatus() {
    return document.getElementById('pvStatus');
}

function getPreviewCanvas() {
    return document.getElementById('PreviewCanvas');
}

function resizePreviewCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const targetWidth = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const targetHeight = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    const scale = Math.min(
        1,
        MAX_PREVIEW_SIDE / targetWidth,
        MAX_PREVIEW_SIDE / targetHeight,
        Math.sqrt(MAX_PREVIEW_PIXELS / (targetWidth * targetHeight)),
    );
    const width = Math.max(1, Math.floor(targetWidth * scale));
    const height = Math.max(1, Math.floor(targetHeight * scale));
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
    return { width, height };
}

function toClampedArray(buffer) {
    if (buffer instanceof Uint8ClampedArray) {
        return buffer;
    }
    if (ArrayBuffer.isView(buffer)) {
        return new Uint8ClampedArray(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    }
    if (buffer instanceof ArrayBuffer) {
        return new Uint8ClampedArray(buffer);
    }
    if (Array.isArray(buffer)) {
        return new Uint8ClampedArray(buffer);
    }
    if (buffer && Array.isArray(buffer.data)) {
        return new Uint8ClampedArray(buffer.data);
    }
    return null;
}

function getSceneSocket() {
    return new Promise((resolve, reject) => {
        if (!window.io) {
            reject(new Error('socket.io client is unavailable'));
            return;
        }
        if (!socket) {
            socket = window.io(window.WebEnv.serverURL);
            socket.on('connect', () => {
                const status = getStatus();
                if (status && !activePreview) {
                    status.textContent = 'Ready';
                }
            });
            socket.on('disconnect', () => {
                const status = getStatus();
                if (status) {
                    status.textContent = 'Disconnected';
                }
            });
        }
        if (socket.connected) {
            resolve(socket);
            return;
        }

        const timer = window.setTimeout(() => {
            cleanup();
            reject(new Error('Timed out connecting to preview socket'));
        }, RPC_TIMEOUT);

        function cleanup() {
            window.clearTimeout(timer);
            socket.off('connect', onConnect);
            socket.off('connect_error', onError);
        }
        function onConnect() {
            cleanup();
            resolve(socket);
        }
        function onError(err) {
            cleanup();
            reject(err || new Error('Preview socket connection failed'));
        }

        socket.once('connect', onConnect);
        socket.once('connect_error', onError);
    });
}

async function sceneRpcRequest(module, method, args) {
    const sceneSocket = await getSceneSocket();
    return await new Promise((resolve, reject) => {
        sceneSocket.timeout(RPC_TIMEOUT).emit('scene:rpc:request', {
            module,
            method,
            args: args || [],
        }, (err, response) => {
            if (err) {
                reject(err);
                return;
            }
            if (response && response.error) {
                reject(new Error(response.error));
                return;
            }
            resolve(response ? response.result : null);
        });
    });
}

async function waitForSceneRpc() {
    let lastError = null;
    for (let i = 0; i < SCENE_READY_RETRY_COUNT; i++) {
        try {
            await sceneRpcRequest('Preview', 'queryActivePreviewData', [{ width: 1, height: 1 }]);
            return;
        } catch (e) {
            lastError = e;
            if (!/Scene editor is not connected|Timed out connecting/.test(e?.message || '')) {
                return;
            }
            await new Promise((resolve) => window.setTimeout(resolve, SCENE_READY_RETRY_DELAY));
        }
    }
    if (lastError) {
        throw lastError;
    }
}

function previewRequest(method, args) {
    return sceneRpcRequest('Preview', method, args);
}

function drawPreviewInfo(canvas, info, fallbackSize) {
    if (!info || !info.buffer) return;

    const width = info.width || fallbackSize.width;
    const height = info.height || fallbackSize.height;
    const data = toClampedArray(info.buffer);
    if (!data || data.length < width * height * 4) {
        log('Preview frame buffer is invalid', 'warn');
        return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(new ImageData(data, width, height), 0, 0);
    log('Preview frame: ' + width + 'x' + height + ', bytes=' + data.length);
}

async function drawPreviewFrame() {
    const canvas = getPreviewCanvas();
    if (!canvas || !activePreview) return;

    const size = resizePreviewCanvas(canvas);
    const info = await previewRequest('queryActivePreviewData', [{ width: size.width, height: size.height }]);
    drawPreviewInfo(canvas, info, size);
}

async function flushPreviewFrame() {
    if (renderInProgress) {
        renderQueued = true;
        return;
    }

    renderInProgress = true;
    try {
        do {
            renderQueued = false;
            await drawPreviewFrame();
        } while (renderQueued);
    } catch (e) {
        log('Render preview frame failed: ' + e.message, 'warn');
    } finally {
        renderInProgress = false;
    }
}

function requestPreviewFrame() {
    if (renderScheduled) return;
    renderScheduled = true;
    window.requestAnimationFrame(() => {
        renderScheduled = false;
        flushPreviewFrame();
    });
}

function requestPreviewFrames(count) {
    requestPreviewFrame();
    if (count > 1) {
        window.setTimeout(() => requestPreviewFrames(count - 1), 50);
    }
}

async function doPreview() {
    const uuid = document.getElementById('pvUuid').value.trim();
    const status = getStatus();

    if (!uuid) {
        log('UUID is required', 'warn');
        return null;
    }

    status.textContent = 'Loading...';
    log('Preview: uuid=' + uuid);

    try {
        await waitForSceneRpc();
        const result = await previewRequest('openAsset', [uuid]);
        log('Open asset result: ' + JSON.stringify(result));
        activePreview = !!result?.supported;
        if (!activePreview) {
            status.textContent = 'unsupported type';
            return null;
        }
        lightEnabled = true;
        status.textContent = 'ok';
        requestPreviewFrames(2);
        return result;
    } catch (e) {
        activePreview = false;
        log('Preview error: ' + e.message, 'err');
        status.textContent = 'error';
        return null;
    }
}

function serializeMouseEvent(event) {
    return {
        button: event.button,
        buttons: event.buttons,
        movementX: event.movementX || 0,
        movementY: event.movementY || 0,
        clientX: event.clientX,
        clientY: event.clientY,
        offsetX: event.offsetX,
        offsetY: event.offsetY,
    };
}

async function callActivePreviewFunction(funcName, ...args) {
    if (!activePreview) return false;
    return await previewRequest('callActivePreviewFunction', [funcName, ...args]);
}

function switchPrimitive(type) {
    callActivePreviewFunction('switchPrimitive', type)
        .then(() => {
            requestPreviewFrame();
            log('Switched primitive: ' + type);
        })
        .catch((e) => log('Switch primitive failed: ' + e.message, 'warn'));
}

function toggleLight() {
    lightEnabled = !lightEnabled;
    callActivePreviewFunction('setLightEnable', lightEnabled)
        .then(() => {
            requestPreviewFrame();
            log('Light: ' + (lightEnabled ? 'ON' : 'OFF'));
        })
        .catch((e) => log('Toggle light failed: ' + e.message, 'warn'));
}

async function toggle2D3D() {
    const canvas = getPreviewCanvas();
    const size = canvas ? resizePreviewCanvas(canvas) : null;
    try {
        const result = await previewRequest('toggleActivePreviewView', [size]);
        const nextIs2D = result && typeof result === 'object' ? result.is2D : result;
        if (nextIs2D == null) {
            log('No active preview supports 2D/3D toggle', 'warn');
            return;
        }
        if (canvas && result?.frame) {
            drawPreviewInfo(canvas, result.frame, size);
        }
        requestPreviewFrames(2);
        log('Toggled 2D/3D view: ' + (nextIs2D ? '2D' : '3D'));
    } catch (e) {
        log('Toggle 2D/3D failed: ' + e.message, 'warn');
    }
}

function bindPreviewMouseEvents(canvas) {
    canvas.addEventListener('mousedown', (e) => {
        callActivePreviewFunction('onMouseDown', serializeMouseEvent(e))
            .catch((err) => log('Mouse down failed: ' + err.message, 'warn'));
    });

    canvas.addEventListener('mousemove', (e) => {
        callActivePreviewFunction('onMouseMove', serializeMouseEvent(e))
            .then(() => requestPreviewFrame())
            .catch((err) => log('Mouse move failed: ' + err.message, 'warn'));
    });

    canvas.addEventListener('mouseup', (e) => {
        callActivePreviewFunction('onMouseUp', serializeMouseEvent(e))
            .then(() => requestPreviewFrame())
            .catch((err) => log('Mouse up failed: ' + err.message, 'warn'));
    });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        callActivePreviewFunction('onMouseWheel', { wheelDeltaY: -e.deltaY })
            .then(() => requestPreviewFrame())
            .catch((err) => log('Mouse wheel failed: ' + err.message, 'warn'));
    }, { passive: false });

    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });
}

export default function initPreviewApp() {
    const status = getStatus();
    const canvas = getPreviewCanvas();
    if (canvas) {
        bindPreviewMouseEvents(canvas);
    }
    window.addEventListener('resize', requestPreviewFrame);

    status.textContent = 'Connecting...';
    getSceneSocket()
        .then(() => {
            status.textContent = 'Ready';
            log('Preview display connected');
        })
        .catch((e) => {
            status.textContent = 'Scene editor unavailable';
            log(e.message, 'warn');
        });

    const params = new URLSearchParams(window.location.search);
    const uuid = params.get('uuid');
    if (uuid) {
        document.getElementById('pvUuid').value = uuid;
        log('Auto-preview from URL params: uuid=' + uuid);
        window.setTimeout(() => doPreview(), 100);
    }

    window.previewAPI = {
        doPreview,
        open(uuidValue) {
            document.getElementById('pvUuid').value = uuidValue || '';
            return doPreview();
        },
        switchPrimitive,
        toggleLight,
        toggle2D3D,
        render: requestPreviewFrame,
    };
}

import './style.css';
import cocos from 'cocos';
import { Rotator } from './scripts/Rotator';

const cc: any = cocos;

const REMOTE_TEXTURE_URL = '/custom-assets/checker.png';

globalThis.__cocosDemoState = {
    started: false,
    frame: 0,
    angle: 0,
    error: null,
    customComponent: {
        registered: false,
        started: false,
        updates: 0,
    },
    customAssets: {
        remoteImageLoaded: false,
        remoteImageNodeName: null,
        remoteImageSize: null,
        remoteImageAssetType: null,
    },
};

function setDemoStatus(status: string) {
    document.documentElement.dataset.cocosDemoStatus = status;
}

function setDemoError(error: unknown) {
    document.documentElement.dataset.cocosDemoError = String((error as Error)?.stack || error);
}

const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
const container = document.getElementById('Cocos3dGameContainer') as HTMLElement;

function resizeCanvas() {
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
}

function createMaterial() {
    const material = new cc.Material();
    material.initialize({
        effectName: 'builtin-unlit',
        defines: {
            USE_COLOR: true,
        },
        technique: 0,
    });
    material.setProperty('mainColor', new cc.Color(64, 160, 255, 255));
    return material;
}

function createTextureMaterial(texture: any) {
    const material = new cc.Material();
    material.initialize({
        effectName: 'builtin-unlit',
        defines: {
            USE_TEXTURE: true,
        },
        technique: 0,
    });
    material.setProperty('mainColor', new cc.Color(255, 255, 255, 255));
    material.setProperty('mainTexture', texture);
    return material;
}

function loadRemoteAsset<T = any>(url: string, options?: Record<string, unknown>) {
    return new Promise<T>((resolve, reject) => {
        cc.assetManager.loadRemote(url, options || null, (err: Error | null, asset: T) => {
            if (err) {
                reject(err);
            } else {
                resolve(asset);
            }
        });
    });
}

function createTextureFromImageAsset(imageAsset: any) {
    if (typeof imageAsset?.getHash === 'function') {
        return imageAsset;
    }
    const texture = new cc.Texture2D();
    texture.image = imageAsset;
    return texture;
}

async function createRemoteImageQuad(scene: any) {
    const remoteAsset = await loadRemoteAsset(REMOTE_TEXTURE_URL, { ext: '.png', reloadAsset: true });
    const remoteAssetType = remoteAsset?.constructor?.name || typeof remoteAsset;
    const texture = createTextureFromImageAsset(remoteAsset);

    const node = new cc.Node('RemoteImageQuad');
    node.setPosition(-1.3, 0.55, 0);
    node.setScale(1.25, 1.25, 1);

    const mesh = new cc.Primitive(cc.Primitive.PrimitiveType.QUAD);
    mesh.onLoaded();

    const renderer = node.addComponent(cc.MeshRenderer);
    renderer.setSharedMaterial(createTextureMaterial(texture), 0);
    renderer.mesh = mesh;

    scene.addChild(node);

    const state = globalThis.__cocosDemoState.customAssets;
    state.remoteImageLoaded = true;
    state.remoteImageNodeName = node.name;
    state.remoteImageSize = `${texture.width}x${texture.height}`;
    state.remoteImageAssetType = remoteAssetType;
    document.documentElement.dataset.cocosRemoteImageLoaded = 'true';
    document.documentElement.dataset.cocosRemoteImageNodeName = node.name;
    document.documentElement.dataset.cocosRemoteImageSize = state.remoteImageSize;
    document.documentElement.dataset.cocosRemoteImageAssetType = remoteAssetType;
}

function createCube(scene: any, RotatorClass: typeof Rotator) {
    const cube = new cc.Node('RotatingCube');
    cube.setPosition(0, 0, 0);
    scene.addChild(cube);

    const mesh = new cc.Primitive(0);
    mesh.onLoaded();

    const renderer = cube.addComponent(cc.MeshRenderer);
    renderer.mesh = mesh;
    renderer.setSharedMaterial(createMaterial(), 0);

    cube.addComponent(RotatorClass);
    return cube;
}

function createCamera(scene: any) {
    const cameraNode = new cc.Node('Camera');
    cameraNode.setPosition(0, 1.6, 5);
    cameraNode.lookAt(new cc.Vec3(0, 0, 0));
    scene.addChild(cameraNode);

    const camera = cameraNode.addComponent(cc.Camera);
    camera.clearColor = new cc.Color(22, 24, 29, 255);
    return camera;
}

async function createDefaultScene(RotatorClass: typeof Rotator) {
    const scene = new cc.Scene('DefaultScene');
    createCube(scene, RotatorClass);
    createCamera(scene);

    cc.director.runSceneImmediate(scene);

    await createRemoteImageQuad(scene);
}

async function boot() {
    globalThis.__cocosDemoState.customComponent.registered = true;
    document.documentElement.dataset.cocosCustomComponentRegistered = 'true';

    setDemoStatus('booting');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    await cc.game.init({
        debugMode: cc.DebugMode.INFO,
        overrideSettings: {
            screen: {
                frameRate: 60,
            },
            profiling: {
                showFPS: false,
            },
            rendering: {
                renderMode: 2,
                customPipeline: false,
            },
            launch: {
                launchScene: '',
            },
            scripting: {
                scriptPackages: [],
            },
        },
    });

    globalThis.__cocosDemoState.pipeline = {
        rendererInitialized: cc.game._rendererInitialized,
        usesCustomPipeline: cc.director.root.usesCustomPipeline,
        pipeline: cc.director.root.pipeline?.constructor?.name,
        hasBuiltinUnlit: !!cc.EffectAsset.get('builtin-unlit'),
    };
    globalThis.__cocosDemoState.started = true;
    setDemoStatus('started');

    cc.game.run(() => {
        createDefaultScene(Rotator).catch((error) => {
            globalThis.__cocosDemoState.error = String(error?.stack || error);
            setDemoStatus('error');
            setDemoError(error);
            console.error(error);
        });
    });
}

boot().catch((error) => {
    globalThis.__cocosDemoState.error = String(error?.stack || error);
    setDemoStatus('error');
    setDemoError(error);
    console.error(error);
});

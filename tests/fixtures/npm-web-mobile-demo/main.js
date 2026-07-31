globalThis.__cocosAssetBaseUrl = new URL('./', window.location.href).href;

let cc;

globalThis.__cocosDemoState = {
    started: false,
    frame: 0,
    angle: 0,
    error: null,
};

function setDemoStatus(status) {
    document.documentElement.dataset.cocosDemoStatus = status;
}

const canvas = document.getElementById('GameCanvas');
const container = document.getElementById('Cocos3dGameContainer');

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

function createCube(scene) {
    const cube = new cc.Node('RotatingCube');
    cube.setPosition(0, 0, 0);
    scene.addChild(cube);

    const mesh = new cc.Primitive(0);
    mesh.onLoaded();

    const renderer = cube.addComponent(cc.MeshRenderer);
    renderer.mesh = mesh;
    renderer.setSharedMaterial(createMaterial(), 0);

    return cube;
}

function createCamera(scene) {
    const cameraNode = new cc.Node('Camera');
    cameraNode.setPosition(0, 1.6, 5);
    cameraNode.lookAt(new cc.Vec3(0, 0, 0));
    scene.addChild(cameraNode);

    const camera = cameraNode.addComponent(cc.Camera);
    camera.clearColor = new cc.Color(22, 24, 29, 255);
    return camera;
}

function createDefaultScene() {
    const scene = new cc.Scene('DefaultScene');
    const cube = createCube(scene);
    createCamera(scene);

    cc.director.runSceneImmediate(scene);

    let angle = 0;
    cc.director.on(cc.Director.EVENT_BEGIN_FRAME, () => {
        angle += cc.game.deltaTime * 90;
        cube.setRotationFromEuler(20, angle, 0);
        globalThis.__cocosDemoState.frame += 1;
        globalThis.__cocosDemoState.angle = angle;
    });
}

async function boot() {
    const { default: cocos } = await import('cocos');
    cc = cocos;

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

    cc.game.run(createDefaultScene);
}

boot().catch((error) => {
    globalThis.__cocosDemoState.error = String(error?.stack || error);
    setDemoStatus('error');
    console.error(error);
});

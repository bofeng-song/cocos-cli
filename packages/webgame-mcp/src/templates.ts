export function indexHtmlTemplate(title) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,user-scalable=no,initial-scale=1,minimum-scale=1,maximum-scale=1">
  <link rel="icon" href="data:,">
  <title>${title}</title>
  <style>
    html,
    body,
    #GameDiv,
    #Cocos3dGameContainer,
    #GameCanvas {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: #16181d;
    }

    #GameCanvas {
      display: block;
    }
  </style>
</head>
<body>
  <script>
    globalThis.__cocosAssetBaseUrl = new URL('/', window.location.origin).href;
  </script>
  <div id="GameDiv">
    <div id="Cocos3dGameContainer">
      <canvas id="GameCanvas" tabindex="99"></canvas>
    </div>
  </div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
`;
}

export function packageJsonTemplate(name, cocosPackage) {
  return {
    name,
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite --host 127.0.0.1',
      build: 'vite build',
      preview: 'vite preview',
    },
    dependencies: {
      cocos: cocosPackage || 'latest',
    },
    devDependencies: {
      typescript: '^5.4.5',
      vite: '^5.0.0',
    },
  };
}

export function tsConfigTemplate() {
  return {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      skipLibCheck: true,
      experimentalDecorators: true,
      useDefineForClassFields: false,
      types: ['vite/client'],
      resolveJsonModule: true,
    },
    include: [
      'src/**/*.ts',
      'src/**/*.json',
      'globals.d.ts',
    ],
  };
}

export function viteConfigTemplate() {
  return `import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cocosAssetsDir = path.resolve(__dirname, 'node_modules', 'cocos', 'dist', 'engine', 'assets');
const publicAssetsDir = path.resolve(__dirname, 'public', 'assets');

function copyCocosRuntimeAssets() {
  if (!fs.existsSync(cocosAssetsDir)) {
    return;
  }
  fs.rmSync(publicAssetsDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(publicAssetsDir), { recursive: true });
  fs.cpSync(cocosAssetsDir, publicAssetsDir, { recursive: true });
}

export default defineConfig({
  plugins: [
    {
      name: 'copy-cocos-runtime-assets',
      buildStart() {
        copyCocosRuntimeAssets();
      },
      configureServer() {
        copyCocosRuntimeAssets();
      },
    },
  ],
  build: {
    chunkSizeWarningLimit: 8000,
  },
});
`;
}

export function globalsTemplate() {
  return `export {};

declare global {
  var __cocosAssetBaseUrl: string | undefined;
  var __cocosWebGameState: {
    started: boolean;
    frame: number;
    error: string | null;
  };
}
`;
}

export function projectGitIgnoreTemplate() {
  return `node_modules/
dist/
public/assets/
*.log
`;
}

export function mainTemplate() {
  return `import './runtime/cocos-assets';
import cocos from 'cocos';
import { Game } from './game';

const cc: any = cocos;

globalThis.__cocosWebGameState = {
  started: false,
  frame: 0,
  error: null,
};

const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
const container = document.getElementById('Cocos3dGameContainer') as HTMLElement;

function resizeCanvas() {
  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
}

async function boot() {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  await cc.game.init({
    debugMode: cc.DebugMode.INFO,
    overrideSettings: {
      screen: { frameRate: 60 },
      profiling: { showFPS: false },
      rendering: {
        renderMode: 2,
        customPipeline: false,
      },
      launch: { launchScene: '' },
      scripting: { scriptPackages: [] },
    },
  });

  globalThis.__cocosWebGameState.started = true;
  cc.game.run(() => {
    try {
      const game = new Game();
      Promise.resolve(game.start()).catch((error) => {
        globalThis.__cocosWebGameState.error = String(error?.stack || error);
        console.error(error);
      });
    } catch (error: any) {
      globalThis.__cocosWebGameState.error = String(error?.stack || error);
      console.error(error);
    }
  });
}

boot().catch((error) => {
  globalThis.__cocosWebGameState.error = String(error?.stack || error);
  console.error(error);
});
`;
}

export function gameTemplate() {
  return `import { Color } from 'cocos';
import { createDefaultUI } from './runtime/cocos-ui';

export class Game {
  private _count = 0;

  start() {
    const ui = createDefaultUI({ sceneName: 'CocosUiDemo' });
    ui.createLabel({
      name: 'Title',
      text: 'Cocos UI Demo',
      position: [0, 170],
      fontSize: 46,
      color: Color.WHITE,
    });

    const counter = ui.createLabel({
      name: 'Counter',
      text: 'Clicked: 0',
      position: [0, 88],
      fontSize: 38,
      color: '#c1e2ff',
    });

    const status = ui.createLabel({
      name: 'Status',
      text: 'Status: waiting for Cocos Button touch',
      position: [0, -158],
      fontSize: 26,
      color: '#afb7c4',
    });

    ui.createButton({
      name: 'ClickButton',
      text: 'Click Me',
      position: [0, -42],
      size: [360, 96],
      backgroundColor: '#1f6feb',
      pressedColor: '#144a9d',
      textColor: '#ffffff',
      pressedTextColor: '#ffe07a',
      fontSize: 38,
      onPress: () => {
        status.setText('Status: touch start');
      },
      onCancel: () => {
        status.setText('Status: touch canceled');
      },
      onClick: (button) => {
        this._count += 1;
        counter.setText('Clicked: ' + this._count);
        button.setText('Clicked ' + this._count);
        button.setBackgroundColor('#24b47e');
        button.setTextColor([230, 255, 242, 255]);
        status.setText('Status: touch end');
        globalThis.__cocosWebGameState.frame = this._count;
        console.info('[webgame] Cocos Button touched', this._count);
      },
    });
  }
}
`;
}

export function cocosUiTemplate() {
  return `import {
  builtinResMgr,
  Button,
  Camera,
  Canvas,
  Color,
  director,
  Label,
  Layers,
  Node,
  Scene,
  Sprite,
  SpriteFrame,
  UITransform,
  Vec3,
} from 'cocos';

export type UIColor = Color | string | [number, number, number] | [number, number, number, number];

export type CreateDefaultUIOptions = {
  sceneName?: string;
  canvasSize?: [number, number];
  clearColor?: UIColor;
  runScene?: boolean;
};

export type LabelOptions = {
  name?: string;
  text?: string;
  position?: [number, number] | [number, number, number];
  size?: [number, number];
  color?: UIColor;
  fontSize?: number;
  lineHeight?: number;
};

export type ButtonOptions = LabelOptions & {
  backgroundColor?: UIColor;
  pressedColor?: UIColor;
  disabledColor?: UIColor;
  textColor?: UIColor;
  pressedTextColor?: UIColor;
  disabledTextColor?: UIColor;
  onPress?: (button: UIButton) => void;
  onCancel?: (button: UIButton) => void;
  onClick?: (button: UIButton) => void;
};

export type UILabel = {
  node: Node;
  transform: UITransform;
  label: Label;
  setText(text: string): void;
  setColor(color: UIColor): void;
};

export type UIButton = {
  node: Node;
  transform: UITransform;
  button: Button;
  background: Sprite;
  labelNode: Node;
  label: Label;
  setText(text: string): void;
  setBackgroundColor(color: UIColor): void;
  setTextColor(color: UIColor): void;
  setEnabled(enabled: boolean): void;
};

export type UIContext = {
  scene: Scene;
  canvasNode: Node;
  canvas: Canvas;
  cameraNode: Node;
  camera: Camera;
  uiLayer: number;
  createLabel(options?: LabelOptions): UILabel;
  createButton(options?: ButtonOptions): UIButton;
};

export function createDefaultUI(options: CreateDefaultUIOptions = {}): UIContext {
  const scene = new Scene(options.sceneName || 'Game');
  const uiLayer = Layers.Enum.UI_2D;
  const canvasSize = options.canvasSize || [800, 600];

  const cameraNode = new Node('UICamera');
  cameraNode.setPosition(new Vec3(0, 0, 1000));
  const camera = cameraNode.addComponent(Camera);
  camera.projection = Camera.ProjectionType.ORTHO;
  camera.orthoHeight = canvasSize[1] / 2;
  camera.visibility = uiLayer;
  camera.clearColor = toColor(options.clearColor || '#16181d');
  scene.addChild(cameraNode);

  const canvasNode = new Node('Canvas');
  canvasNode.layer = uiLayer;
  const canvasTransform = canvasNode.addComponent(UITransform);
  canvasTransform.setContentSize(canvasSize[0], canvasSize[1]);
  const canvas = canvasNode.addComponent(Canvas);
  canvas.cameraComponent = camera;
  canvas.alignCanvasWithScreen = true;
  scene.addChild(canvasNode);

  const context: UIContext = {
    scene,
    canvasNode,
    canvas,
    cameraNode,
    camera,
    uiLayer,
    createLabel(labelOptions: LabelOptions = {}) {
      const label = createLabel(labelOptions);
      canvasNode.addChild(label.node);
      setLayerRecursively(label.node, uiLayer);
      return label;
    },
    createButton(buttonOptions: ButtonOptions = {}) {
      const button = createButton(buttonOptions);
      canvasNode.addChild(button.node);
      setLayerRecursively(button.node, uiLayer);
      return button;
    },
  };

  setLayerRecursively(canvasNode, uiLayer);
  if (options.runScene !== false) {
    director.runSceneImmediate(scene);
  }

  return context;
}

export function createLabel(options: LabelOptions = {}): UILabel {
  const fontSize = options.fontSize || 32;
  const size = options.size || [640, Math.max(64, fontSize + 20)];
  const position = options.position || [0, 0, 0];
  const node = new Node(options.name || 'Label');
  node.layer = Layers.Enum.UI_2D;
  node.setPosition(position[0] || 0, position[1] || 0, position[2] || 0);
  const transform = node.addComponent(UITransform);
  transform.setContentSize(size[0], size[1]);
  const label = node.addComponent(Label);
  label.string = options.text || 'Label';
  label.fontSize = fontSize;
  label.lineHeight = options.lineHeight || fontSize + 8;
  label.color = toColor(options.color || Color.WHITE);

  return {
    node,
    transform,
    label,
    setText(text: string) {
      label.string = text;
    },
    setColor(color: UIColor) {
      label.color = toColor(color);
    },
  };
}

export function createButton(options: ButtonOptions = {}): UIButton {
  let normalColor = toColor(options.backgroundColor || '#1f6feb');
  const pressedColor = toColor(options.pressedColor || '#144a9d');
  const disabledColor = toColor(options.disabledColor || '#5b6472');
  let textColor = toColor(options.textColor || '#ffffff');
  const pressedTextColor = toColor(options.pressedTextColor || textColor);
  const disabledTextColor = toColor(options.disabledTextColor || '#c7ced9');
  const size = options.size || [320, 88];
  const position = options.position || [0, 0, 0];

  const node = new Node(options.name || 'Button');
  node.layer = Layers.Enum.UI_2D;
  node.setPosition(position[0] || 0, position[1] || 0, position[2] || 0);
  const transform = node.addComponent(UITransform);
  transform.setContentSize(size[0], size[1]);

  const background = node.addComponent(Sprite);
  background.sizeMode = Sprite.SizeMode.CUSTOM;
  background.spriteFrame = createWhiteSpriteFrame();
  background.color = normalColor;
  transform.setContentSize(size[0], size[1]);

  const button = node.addComponent(Button);
  button.transition = Button.Transition.NONE;

  const text = createLabel({
    name: (options.name || 'Button') + 'Text',
    text: options.text || 'Button',
    size,
    color: textColor,
    fontSize: options.fontSize || 32,
    lineHeight: options.lineHeight,
  });
  node.addChild(text.node);

  const api: UIButton = {
    node,
    transform,
    button,
    background,
    labelNode: text.node,
    label: text.label,
    setText(value: string) {
      text.setText(value);
    },
    setBackgroundColor(color: UIColor) {
      normalColor = toColor(color);
      if (button.interactable) {
        background.color = normalColor;
      }
    },
    setTextColor(color: UIColor) {
      textColor = toColor(color);
      if (button.interactable) {
        text.label.color = textColor;
      }
    },
    setEnabled(enabled: boolean) {
      button.interactable = enabled;
      background.color = enabled ? normalColor : disabledColor;
      text.label.color = enabled ? textColor : disabledTextColor;
    },
  };

  node.on(Node.EventType.TOUCH_START, () => {
    if (!button.interactable) {
      return;
    }
    background.color = pressedColor;
    text.label.color = pressedTextColor;
    node.setScale(0.96, 0.96, 1);
    options.onPress?.(api);
  });

  node.on(Node.EventType.TOUCH_CANCEL, () => {
    if (!button.interactable) {
      return;
    }
    background.color = normalColor;
    text.label.color = textColor;
    node.setScale(1, 1, 1);
    options.onCancel?.(api);
  });

  node.on(Node.EventType.TOUCH_END, () => {
    if (!button.interactable) {
      return;
    }
    background.color = normalColor;
    text.label.color = textColor;
    node.setScale(1, 1, 1);
    options.onClick?.(api);
  });

  return api;
}

export function setLayerRecursively(node: Node, layer: number) {
  node.layer = layer;
  for (const child of node.children) {
    setLayerRecursively(child, layer);
  }
}

export function toColor(value: UIColor): Color {
  if (value instanceof Color) {
    return value.clone();
  }

  if (Array.isArray(value)) {
    return new Color(value[0], value[1], value[2], value[3] ?? 255);
  }

  const hex = value.trim().replace(/^#/, '');
  if (hex.length === 3 || hex.length === 4) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) : 255;
    return new Color(r, g, b, a);
  }

  if (hex.length === 6 || hex.length === 8) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255;
    return new Color(r, g, b, a);
  }

  throw new Error('Unsupported color format: ' + value);
}

function createWhiteSpriteFrame() {
  const whiteTexture = builtinResMgr.get('white-texture');
  if (!whiteTexture) {
    throw new Error('Missing builtin white-texture.');
  }
  const spriteFrame = new SpriteFrame();
  spriteFrame.reset({ texture: whiteTexture as any });
  spriteFrame.packable = false;
  return spriteFrame;
}
`;
}

export function cocosAssetsTemplate() {
  return `const pageUrl = typeof window === 'undefined' ? import.meta.url : window.location.href;
const viteBase = import.meta.env.BASE_URL || '/';

globalThis.__cocosAssetBaseUrl = new URL(viteBase, pageUrl).href;
`;
}

export function componentScriptTemplate(className = 'Rotator') {
  return `import { _decorator, Component } from 'cocos';

const { ccclass } = _decorator;

@ccclass('${className}')
export class ${className} extends Component {
  public speed = 90;

  private _angle = 0;

  update(dt: number) {
    this._angle += dt * this.speed;
    this.node.setRotationFromEuler(20, this._angle, 0);
    globalThis.__cocosWebGameState.frame += 1;
  }
}
`;
}

export const rotatorScriptTemplate = componentScriptTemplate;

export function defaultSceneTemplate(name = 'main') {
  return {
    version: 1,
    name,
    nodes: [
      {
        id: 'camera',
        name: 'Camera',
        parent: null,
        position: [0, 1.6, 5],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        components: [
          {
            id: 'camera',
            type: 'Camera',
            properties: {
              clearColor: [22, 24, 29, 255],
              lookAt: [0, 0, 0],
            },
          },
        ],
      },
      {
        id: 'cube',
        name: 'RotatingCube',
        parent: null,
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        components: [
          {
            id: 'mesh',
            type: 'MeshRenderer',
            properties: {
              mesh: 'builtin:cube',
              material: {
                effect: 'builtin-unlit',
                color: [64, 160, 255, 255],
              },
            },
          },
          {
            id: 'rotator',
            type: 'script',
            script: 'Rotator',
            properties: {},
          },
        ],
      },
    ],
  };
}

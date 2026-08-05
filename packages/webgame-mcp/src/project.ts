import fs from 'node:fs';
import path from 'node:path';
import {
  assertInsideProject,
  ensureDir,
  listFilesRecursive,
  pathExists,
  readJson,
  resolveProjectPath,
  sceneFilePath,
  scriptFilePath,
  toPosixPath,
  writeJson,
  writeText,
} from './fs-utils.js';
import {
  componentScriptTemplate,
  cocosAssetsTemplate,
  cocosUiTemplate,
  defaultSceneTemplate,
  gameTemplate,
  globalsTemplate,
  indexHtmlTemplate,
  mainTemplate,
  packageJsonTemplate,
  projectGitIgnoreTemplate,
  rotatorScriptTemplate,
  tsConfigTemplate,
  viteConfigTemplate,
} from './templates.js';

function projectNameFromPath(target: string) {
  return path.basename(path.resolve(target)).toLowerCase().replace(/[^a-z0-9-_]/g, '-');
}

function componentFilePath(projectRoot: string, componentPathOrName: string) {
  const input = String(componentPathOrName || '').trim();
  if (!input) {
    throw new Error('Component name or path is required.');
  }
  const relative = input.includes('/') || input.includes('\\')
    ? input
    : path.join('src', 'components', `${input}.ts`);
  const withExtension = relative.endsWith('.ts') ? relative : `${relative}.ts`;
  return assertInsideProject(projectRoot, path.join(projectRoot, withExtension));
}

function gameFilePath(projectRoot: string) {
  return assertInsideProject(projectRoot, path.join(projectRoot, 'src', 'game.ts'));
}

function loadScene(projectRoot: string, scene: string) {
  const file = sceneFilePath(projectRoot, scene);
  if (!pathExists(file)) {
    throw new Error(`Scene does not exist: ${toPosixPath(path.relative(projectRoot, file))}`);
  }
  return { file, data: readJson(file) };
}

function saveScene(file: string, data: any) {
  data.version ??= 1;
  data.nodes ??= [];
  writeJson(file, data);
}

function findNode(sceneData: any, nodeId: string) {
  return sceneData.nodes?.find((node) => node.id === nodeId);
}

function assertNodeExists(sceneData: any, nodeId: string) {
  const node = findNode(sceneData, nodeId);
  if (!node) {
    throw new Error(`Node not found: ${nodeId}`);
  }
  return node;
}

function assertNodeIdAvailable(sceneData: any, nodeId: string) {
  if (!nodeId) {
    throw new Error('Node id is required.');
  }
  if (findNode(sceneData, nodeId)) {
    throw new Error(`Node already exists: ${nodeId}`);
  }
}

function normalizeNode(node: any) {
  if (!node?.id) {
    throw new Error('node.id is required.');
  }
  return {
    id: node.id,
    name: node.name || node.id,
    parent: node.parent ?? null,
    active: node.active ?? true,
    position: node.position || [0, 0, 0],
    rotation: node.rotation || [0, 0, 0],
    scale: node.scale || [1, 1, 1],
    components: node.components || [],
  };
}

const canvasNodeId = 'ui-canvas';
const uiComponentTypes = new Set([
  'Canvas',
  'UITransform',
  'Label',
  'Button',
  'Sprite',
  'Widget',
  'Layout',
  'EditBox',
  'Toggle',
  'Slider',
  'ScrollView',
  'PageView',
  'ProgressBar',
  'RichText',
  'Mask',
  'Graphics',
  'VideoPlayer',
  'WebView',
  'SafeArea',
  'BlockInputEvents',
]);

const uiNodeTypeMap: Record<string, string> = {
  canvas: 'Canvas',
  label: 'Label',
  text: 'Label',
  button: 'Button',
  sprite: 'Sprite',
  image: 'Sprite',
  widget: 'Widget',
  layout: 'Layout',
  editbox: 'EditBox',
  input: 'EditBox',
  toggle: 'Toggle',
  slider: 'Slider',
  scrollview: 'ScrollView',
  pageview: 'PageView',
  progressbar: 'ProgressBar',
  richtext: 'RichText',
  mask: 'Mask',
  graphics: 'Graphics',
  videoplayer: 'VideoPlayer',
  webview: 'WebView',
  safearea: 'SafeArea',
  blockinputevents: 'BlockInputEvents',
};

function componentId(type: string, existing: any[]) {
  const base = String(type || 'component').replace(/[^a-zA-Z0-9_]/g, '_');
  let index = 1;
  let id = base;
  const ids = new Set(existing.map((component) => component.id));
  while (ids.has(id)) {
    id = `${base}_${index++}`;
  }
  return id;
}

function normalizeUiType(value: any) {
  if (typeof value !== 'string') {
    return '';
  }
  const compact = value.replace(/[\s_-]/g, '').toLowerCase();
  return uiNodeTypeMap[compact] || '';
}

function component(type: string, properties: any = {}, id?: string) {
  return {
    id: id || type.replace(/[^a-zA-Z0-9_]/g, '_'),
    type,
    properties,
  };
}

function hasComponent(node: any, type: string) {
  return !!node.components?.some((item: any) => item.type === type);
}

function ensureNodeComponent(node: any, type: string, properties: any = {}, id?: string) {
  node.components ??= [];
  if (!hasComponent(node, type)) {
    node.components.push(component(type, properties, id));
  }
}

function inferUiType(input: any, node: any) {
  const explicit = normalizeUiType(input.uiType || input.type || input.kind);
  if (explicit) {
    return explicit;
  }
  const componentType = node.components?.find((item: any) => uiComponentTypes.has(item.type))?.type;
  if (componentType) {
    return componentType;
  }
  return normalizeUiType(node.name) || normalizeUiType(node.id);
}

function defaultUiTransformProperties(type: string) {
  if (type === 'Canvas') {
    return { contentSize: [800, 600], anchorPoint: [0.5, 0.5] };
  }
  if (type === 'Label') {
    return { contentSize: [260, 80], anchorPoint: [0.5, 0.5] };
  }
  if (type === 'Button') {
    return { contentSize: [180, 64], anchorPoint: [0.5, 0.5] };
  }
  return { contentSize: [100, 40], anchorPoint: [0.5, 0.5] };
}

function defaultUiComponentProperties(type: string, input: any) {
  const properties = input.properties || input.props || {};
  if (type === 'Label') {
    return {
      string: String(properties.string ?? properties.text ?? input.text ?? 'Label'),
      fontSize: properties.fontSize ?? 36,
      lineHeight: properties.lineHeight ?? 42,
      color: properties.color ?? [255, 255, 255, 255],
    };
  }
  return properties;
}

function findCanvasNode(sceneData: any) {
  return sceneData.nodes?.find((node: any) => hasComponent(node, 'Canvas')) || findNode(sceneData, canvasNodeId);
}

function ensureCanvasNode(sceneData: any) {
  let canvas = findCanvasNode(sceneData);
  if (canvas) {
    ensureNodeComponent(canvas, 'Canvas', {}, 'canvas');
    ensureNodeComponent(canvas, 'UITransform', defaultUiTransformProperties('Canvas'), 'uiTransform');
    return canvas;
  }
  canvas = normalizeNode({
    id: canvasNodeId,
    name: 'Canvas',
    parent: null,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  });
  ensureNodeComponent(canvas, 'Canvas', {}, 'canvas');
  ensureNodeComponent(canvas, 'UITransform', defaultUiTransformProperties('Canvas'), 'uiTransform');
  sceneData.nodes ??= [];
  sceneData.nodes.push(canvas);
  return canvas;
}

function prepareUiNode(sceneData: any, input: any, node: any) {
  const uiType = inferUiType(input, node);
  if (!uiType || !uiComponentTypes.has(uiType)) {
    return;
  }
  ensureNodeComponent(node, 'UITransform', input.uiTransform || defaultUiTransformProperties(uiType), 'uiTransform');
  if (uiType !== 'Canvas' && uiType !== 'UITransform') {
    ensureNodeComponent(node, uiType, defaultUiComponentProperties(uiType, input), uiType.replace(/[^a-zA-Z0-9_]/g, '_'));
  }
  if (uiType === 'Canvas') {
    ensureNodeComponent(node, 'Canvas', {}, 'canvas');
    node.parent = null;
    return;
  }
  if (node.parent === null || node.parent === undefined) {
    node.parent = ensureCanvasNode(sceneData).id;
  }
}

function scanScripts(projectRoot: string) {
  const scriptsDir = path.join(projectRoot, 'src', 'scripts');
  return listFilesRecursive(scriptsDir, (file) => file.endsWith('.ts')).flatMap((file) => {
    const source = fs.readFileSync(file, 'utf8');
    const matches = [...source.matchAll(/export\s+class\s+([A-Za-z_$][\w$]*)/g)];
    return matches.map((match) => ({
      name: match[1],
      file,
      importPath: toPosixPath(path.relative(path.join(projectRoot, 'src', 'runtime'), file)).replace(/\.ts$/, ''),
    }));
  });
}

function scanScenes(projectRoot: string) {
  const scenesDir = path.join(projectRoot, 'src', 'scenes');
  return listFilesRecursive(scenesDir, (file) => file.endsWith('.scene.json')).map((file) => ({
    key: path.basename(file, '.scene.json'),
    file,
    importPath: toPosixPath(path.relative(path.join(projectRoot, 'src', 'runtime'), file)),
  }));
}

export function createProject(options: any = {}) {
  const target = resolveProjectPath(options.target || options.project);
  const template = options.template || 'vite';
  if (template !== 'vite') {
    throw new Error(`Only vite template is supported in this prototype, got: ${template}`);
  }
  if (pathExists(target) && fs.readdirSync(target).length > 0 && !options.force) {
    throw new Error(`Target directory is not empty: ${target}`);
  }

  const name = options.name || projectNameFromPath(target);
  ensureDir(target);
  ensureDir(path.join(target, 'src', 'runtime'));
  ensureDir(path.join(target, 'src', 'components'));
  ensureDir(path.join(target, 'public', 'assets'));

  writeJson(path.join(target, 'package.json'), packageJsonTemplate(name, options.cocosPackage || options.packageSource || 'cocos'));
  writeText(path.join(target, '.gitignore'), projectGitIgnoreTemplate());
  writeText(path.join(target, 'index.html'), indexHtmlTemplate(name));
  writeJson(path.join(target, 'tsconfig.json'), tsConfigTemplate());
  writeText(path.join(target, 'vite.config.js'), viteConfigTemplate());
  writeText(path.join(target, 'globals.d.ts'), globalsTemplate());
  writeText(path.join(target, 'src', 'runtime', 'cocos-assets.ts'), cocosAssetsTemplate());
  writeText(path.join(target, 'src', 'runtime', 'cocos-ui.ts'), cocosUiTemplate());
  writeText(path.join(target, 'src', 'main.ts'), mainTemplate());
  writeText(path.join(target, 'src', 'game.ts'), gameTemplate());
  writeText(path.join(target, 'src', 'components', 'Rotator.ts'), componentScriptTemplate('Rotator'));

  return {
    project: target,
    template,
    files: [
      'package.json',
      '.gitignore',
      'index.html',
      'tsconfig.json',
      'vite.config.js',
      'globals.d.ts',
      'src/main.ts',
      'src/game.ts',
      'src/runtime/cocos-assets.ts',
      'src/runtime/cocos-ui.ts',
      'src/components/Rotator.ts',
    ],
  };
}

export function createComponent(options: any = {}) {
  const projectRoot = resolveProjectPath(options.project);
  const name = options.name;
  if (!name && !options.path) {
    throw new Error('Component name or path is required.');
  }
  const file = componentFilePath(projectRoot, options.path || name);
  if (pathExists(file) && !options.overwrite) {
    throw new Error(`Component already exists: ${toPosixPath(path.relative(projectRoot, file))}`);
  }
  writeText(file, options.content || componentScriptTemplate(name || path.basename(file, '.ts')));
  return { name: name || path.basename(file, '.ts'), file };
}

export function modifyComponent(options: any = {}) {
  const projectRoot = resolveProjectPath(options.project);
  const file = componentFilePath(projectRoot, options.path || options.name);
  if (!pathExists(file)) {
    throw new Error(`Component does not exist: ${toPosixPath(path.relative(projectRoot, file))}`);
  }
  if (typeof options.content !== 'string') {
    throw new Error('content is required.');
  }
  writeText(file, options.content);
  return { file };
}

export function removeComponent(options: any = {}) {
  const projectRoot = resolveProjectPath(options.project);
  const file = componentFilePath(projectRoot, options.path || options.name);
  if (!pathExists(file)) {
    throw new Error(`Component does not exist: ${toPosixPath(path.relative(projectRoot, file))}`);
  }
  fs.unlinkSync(file);
  return { file, removed: true };
}

export function modifyGame(options: any = {}) {
  const projectRoot = resolveProjectPath(options.project);
  const file = gameFilePath(projectRoot);
  if (typeof options.content !== 'string') {
    throw new Error('content is required.');
  }
  writeText(file, options.content);
  return { file };
}

export function createScene(options: any = {}) {
  const projectRoot = resolveProjectPath(options.project);
  const scene = options.scene || options.name || 'main';
  const file = sceneFilePath(projectRoot, scene);
  if (pathExists(file) && !options.overwrite) {
    throw new Error(`Scene already exists: ${toPosixPath(path.relative(projectRoot, file))}`);
  }
  writeJson(file, {
    version: 1,
    name: options.name || path.basename(file, '.scene.json'),
    nodes: [],
  });
  return { scene, file };
}

export function queryScene(options: any = {}) {
  const projectRoot = resolveProjectPath(options.project);
  const { file, data } = loadScene(projectRoot, options.scene || 'main');
  return {
    file,
    scene: data,
  };
}

export function addNode(options: any = {}) {
  const projectRoot = resolveProjectPath(options.project);
  const { file, data } = loadScene(projectRoot, options.scene || 'main');
  const input = options.node || options;
  const node = normalizeNode(input);
  assertNodeIdAvailable(data, node.id);
  prepareUiNode(data, input, node);
  if (node.parent !== null) {
    assertNodeExists(data, node.parent);
  }
  data.nodes.push(node);
  saveScene(file, data);
  return { node, file };
}

export function updateNode(options: any = {}) {
  const projectRoot = resolveProjectPath(options.project);
  const { file, data } = loadScene(projectRoot, options.scene || 'main');
  const node = assertNodeExists(data, options.nodeId);
  const patch = options.patch || {};
  if (patch.id && patch.id !== options.nodeId) {
    assertNodeIdAvailable(data, patch.id);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'parent') && patch.parent !== null) {
    assertNodeExists(data, patch.parent);
  }
  Object.assign(node, patch);
  saveScene(file, data);
  return { node, file };
}

export function removeNode(options: any = {}) {
  const projectRoot = resolveProjectPath(options.project);
  const { file, data } = loadScene(projectRoot, options.scene || 'main');
  const nodeId = options.nodeId;
  assertNodeExists(data, nodeId);
  const mode = options.mode || 'withChildren';
  const removeIds = new Set([nodeId]);
  if (mode === 'withChildren') {
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of data.nodes) {
        if (removeIds.has(node.parent) && !removeIds.has(node.id)) {
          removeIds.add(node.id);
          changed = true;
        }
      }
    }
  } else if (mode === 'reparentChildren') {
    const removed = assertNodeExists(data, nodeId);
    for (const node of data.nodes) {
      if (node.parent === nodeId) {
        node.parent = removed.parent ?? null;
      }
    }
  } else {
    throw new Error(`Unsupported remove mode: ${mode}`);
  }
  data.nodes = data.nodes.filter((node) => !removeIds.has(node.id));
  saveScene(file, data);
  return { removed: [...removeIds], file };
}

export function addComponent(options: any = {}) {
  const projectRoot = resolveProjectPath(options.project);
  const { file, data } = loadScene(projectRoot, options.scene || 'main');
  const node = assertNodeExists(data, options.nodeId);
  const input = options.component || {};
  if (!input.type) {
    throw new Error('component.type is required.');
  }
  node.components ??= [];
  if (uiComponentTypes.has(input.type)) {
    if (input.type === 'Canvas') {
      node.parent = null;
    } else if (node.parent === null || node.parent === undefined) {
      node.parent = ensureCanvasNode(data).id;
    }
    if (input.type !== 'Canvas' && input.type !== 'UITransform') {
      ensureNodeComponent(node, 'UITransform', input.uiTransform || defaultUiTransformProperties(input.type), 'uiTransform');
    }
  }
  const component: any = {
    id: input.id || componentId(input.type, node.components),
    type: input.type,
    properties: input.properties || {},
  };
  if (input.script) {
    component.script = input.script;
  }
  node.components.push(component);
  saveScene(file, data);
  return { component, nodeId: node.id, file };
}

export function updateComponent(options: any = {}) {
  const projectRoot = resolveProjectPath(options.project);
  const { file, data } = loadScene(projectRoot, options.scene || 'main');
  const node = assertNodeExists(data, options.nodeId);
  const component = node.components?.find((item) => item.id === options.componentId);
  if (!component) {
    throw new Error(`Component not found: ${options.componentId}`);
  }
  const patch = options.patch || {};
  if (patch.properties) {
    component.properties = {
      ...(component.properties || {}),
      ...patch.properties,
    };
  }
  for (const [key, value] of Object.entries(patch)) {
    if (key !== 'properties') {
      component[key] = value;
    }
  }
  saveScene(file, data);
  return { component, nodeId: node.id, file };
}

export function createScript(options: any = {}) {
  const projectRoot = resolveProjectPath(options.project);
  const name = options.name;
  if (!name) {
    throw new Error('Script name is required.');
  }
  const file = scriptFilePath(projectRoot, options.path || name);
  if (pathExists(file) && !options.overwrite) {
    throw new Error(`Script already exists: ${toPosixPath(path.relative(projectRoot, file))}`);
  }
  writeText(file, options.content || rotatorScriptTemplate(name));
  return { name, file };
}

export function generateRuntime(options: any = {}) {
  const projectRoot = resolveProjectPath(options.project);
  const runtimeDir = assertInsideProject(projectRoot, path.join(projectRoot, 'src', 'runtime'));
  ensureDir(runtimeDir);
  const scenes = scanScenes(projectRoot);
  const scripts = scanScripts(projectRoot);
  const entryScene = options.entryScene || scenes[0]?.key || 'main';

  writeText(path.join(runtimeDir, 'scene-registry.ts'), createSceneRegistrySource(scenes));
  writeText(path.join(runtimeDir, 'script-registry.ts'), createScriptRegistrySource(scripts));
  writeText(path.join(runtimeDir, 'cocos-assets.ts'), cocosAssetsTemplate());
  writeText(path.join(runtimeDir, 'scene-loader.ts'), sceneLoaderSource());
  writeText(path.join(projectRoot, 'src', 'main.ts'), mainSource(entryScene));

  return {
    entryScene,
    scenes: scenes.map((scene) => scene.key),
    scripts: scripts.map((script) => script.name),
    files: [
      'src/main.ts',
      'src/runtime/cocos-assets.ts',
      'src/runtime/scene-loader.ts',
      'src/runtime/scene-registry.ts',
      'src/runtime/script-registry.ts',
    ],
  };
}

function createSceneRegistrySource(scenes: any[]) {
  const imports = scenes.map((scene, index) => `import scene${index} from './${scene.importPath}';`).join('\n');
  const entries = scenes.map((scene, index) => `  ${JSON.stringify(scene.key)}: scene${index}`).join(',\n');
  return `${imports}

export const scenes = {
${entries}
} as const;

export type SceneName = keyof typeof scenes;
`;
}

function createScriptRegistrySource(scripts: any[]) {
  const imports = scripts.map((script) => `import { ${script.name} } from './${script.importPath}';`).join('\n');
  const entries = scripts.map((script) => `  ${script.name}`).join(',\n');
  return `${imports}

export const scripts = {
${entries}
} as const;
`;
}

function mainSource(entryScene: string) {
  return `import './runtime/cocos-assets';
import cocos from 'cocos';
import { scenes } from './runtime/scene-registry';
import { scripts } from './runtime/script-registry';
import { runScene } from './runtime/scene-loader';

const cc: any = cocos;
const entryScene = ${JSON.stringify(entryScene)};

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
    runScene(entryScene as keyof typeof scenes, { cc, scenes, scripts }).catch((error) => {
      globalThis.__cocosWebGameState.error = String(error?.stack || error);
      console.error(error);
    });
  });
}

boot().catch((error) => {
  globalThis.__cocosWebGameState.error = String(error?.stack || error);
  console.error(error);
});
`;
}

function sceneLoaderSource() {
  return `type SceneData = {
  name: string;
  nodes: SceneNodeData[];
};

type SceneNodeData = {
  id: string;
  name: string;
  parent?: string | null;
  active?: boolean;
  position?: number[];
  rotation?: number[];
  scale?: number[];
  components?: SceneComponentData[];
};

type SceneComponentData = {
  id?: string;
  type: string;
  script?: string;
  properties?: Record<string, any>;
};

type RunSceneOptions = {
  cc: any;
  scenes: Record<string, SceneData>;
  scripts: Record<string, any>;
};

function applyTransform(cc: any, node: any, data: SceneNodeData) {
  const position = data.position || [0, 0, 0];
  const rotation = data.rotation || [0, 0, 0];
  const scale = data.scale || [1, 1, 1];
  node.setPosition(position[0] || 0, position[1] || 0, position[2] || 0);
  node.setRotationFromEuler(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0);
  node.setScale(scale[0] ?? 1, scale[1] ?? 1, scale[2] ?? 1);
  if (data.active === false) {
    node.active = false;
  }
}

function createColor(cc: any, color?: number[]) {
  const value = color || [255, 255, 255, 255];
  return new cc.Color(value[0] ?? 255, value[1] ?? 255, value[2] ?? 255, value[3] ?? 255);
}

function createMaterial(cc: any, properties: Record<string, any> = {}) {
  const materialConfig = properties.material || {};
  const material = new cc.Material();
  material.initialize({
    effectName: materialConfig.effect || 'builtin-unlit',
    defines: {
      USE_COLOR: true,
    },
    technique: 0,
  });
  material.setProperty('mainColor', createColor(cc, materialConfig.color));
  return material;
}

function primitiveType(cc: any, meshName?: string) {
  if (meshName === 'builtin:quad') {
    return cc.Primitive.PrimitiveType?.QUAD ?? 1;
  }
  return 0;
}

function addMeshRenderer(cc: any, node: any, properties: Record<string, any> = {}) {
  const mesh = new cc.Primitive(primitiveType(cc, properties.mesh));
  mesh.onLoaded();
  const renderer = node.addComponent(cc.MeshRenderer);
  renderer.mesh = mesh;
  renderer.setSharedMaterial(createMaterial(cc, properties), 0);
  return renderer;
}

function addCamera(cc: any, node: any, properties: Record<string, any> = {}) {
  const camera = node.addComponent(cc.Camera);
  camera.clearColor = createColor(cc, properties.clearColor || [22, 24, 29, 255]);
  if (Array.isArray(properties.lookAt)) {
    node.lookAt(new cc.Vec3(properties.lookAt[0] || 0, properties.lookAt[1] || 0, properties.lookAt[2] || 0));
  }
  return camera;
}

function addCanvas(cc: any, node: any) {
  return node.addComponent(cc.Canvas);
}

function addUITransform(cc: any, node: any, properties: Record<string, any> = {}) {
  const transform = node.addComponent(cc.UITransform);
  const size = properties.contentSize || properties.size;
  if (Array.isArray(size) && typeof transform.setContentSize === 'function') {
    transform.setContentSize(size[0] ?? 100, size[1] ?? 40);
  }
  const anchor = properties.anchorPoint || properties.anchor;
  if (Array.isArray(anchor) && typeof transform.setAnchorPoint === 'function') {
    transform.setAnchorPoint(anchor[0] ?? 0.5, anchor[1] ?? 0.5);
  }
  return transform;
}

function addLabel(cc: any, node: any, properties: Record<string, any> = {}) {
  const label = node.addComponent(cc.Label);
  label.string = String(properties.string ?? properties.text ?? '');
  if (typeof properties.fontSize === 'number') {
    label.fontSize = properties.fontSize;
  }
  if (typeof properties.lineHeight === 'number') {
    label.lineHeight = properties.lineHeight;
  }
  if (properties.color) {
    label.color = createColor(cc, properties.color);
  }
  return label;
}

const genericUiComponentTypes = new Set([
  'Button',
  'Sprite',
  'Widget',
  'Layout',
  'EditBox',
  'Toggle',
  'Slider',
  'ScrollView',
  'PageView',
  'ProgressBar',
  'RichText',
  'Mask',
  'Graphics',
  'VideoPlayer',
  'WebView',
  'SafeArea',
  'BlockInputEvents',
]);

function addGenericComponent(cc: any, node: any, data: SceneComponentData) {
  const ComponentClass = cc[data.type];
  if (!ComponentClass) {
    throw new Error(\`Component class is not available: \${data.type}\`);
  }
  const component = node.addComponent(ComponentClass);
  applyComponentProperties(component, data.properties);
  return component;
}

function applyComponentProperties(component: any, properties: Record<string, any> = {}) {
  for (const [key, value] of Object.entries(properties)) {
    if (key in component) {
      component[key] = value;
    }
  }
}

function addScript(node: any, scripts: Record<string, any>, data: SceneComponentData) {
  const ScriptClass = scripts[data.script || ''];
  if (!ScriptClass) {
    throw new Error(\`Script is not registered: \${data.script}\`);
  }
  const component = node.addComponent(ScriptClass);
  applyComponentProperties(component, data.properties);
  return component;
}

function addComponent(cc: any, node: any, scripts: Record<string, any>, data: SceneComponentData) {
  const properties = data.properties || {};
  if (data.type === 'MeshRenderer') {
    return addMeshRenderer(cc, node, properties);
  }
  if (data.type === 'Camera') {
    return addCamera(cc, node, properties);
  }
  if (data.type === 'Canvas') {
    return addCanvas(cc, node);
  }
  if (data.type === 'UITransform') {
    return addUITransform(cc, node, properties);
  }
  if (data.type === 'Label') {
    return addLabel(cc, node, properties);
  }
  if (genericUiComponentTypes.has(data.type)) {
    return addGenericComponent(cc, node, data);
  }
  if (data.type === 'script') {
    return addScript(node, scripts, data);
  }
  throw new Error(\`Unsupported component type: \${data.type}\`);
}

export async function loadScene(sceneData: SceneData, options: Pick<RunSceneOptions, 'cc' | 'scripts'>) {
  const { cc, scripts } = options;
  const scene = new cc.Scene(sceneData.name || 'Scene');
  const nodes = new Map<string, any>();

  for (const nodeData of sceneData.nodes || []) {
    const node = new cc.Node(nodeData.name || nodeData.id);
    applyTransform(cc, node, nodeData);
    nodes.set(nodeData.id, node);
  }

  for (const nodeData of sceneData.nodes || []) {
    const node = nodes.get(nodeData.id);
    const parent = nodeData.parent ? nodes.get(nodeData.parent) : scene;
    if (!parent) {
      throw new Error(\`Parent node not found: \${nodeData.parent}\`);
    }
    parent.addChild(node);
  }

  for (const nodeData of sceneData.nodes || []) {
    const node = nodes.get(nodeData.id);
    for (const component of nodeData.components || []) {
      addComponent(cc, node, scripts, component);
    }
  }

  return scene;
}

export async function runScene(name: string, options: RunSceneOptions) {
  const sceneData = options.scenes[name];
  if (!sceneData) {
    throw new Error(\`Scene is not registered: \${name}\`);
  }
  const scene = await loadScene(sceneData, options);
  options.cc.director.runSceneImmediate(scene);
  return scene;
}
`;
}

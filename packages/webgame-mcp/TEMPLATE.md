# webgame-mcp 模板说明

本文档说明 `@cocos/webgame-mcp` 当前模板的用途、生成工程结构，以及各个模板文件的职责。

## 目标

`webgame-mcp` 当前提供的是一个代码优先的 Cocos Web 游戏工程模板。模板生成的工程基于 Vite 和 `cocos` npm 包运行，不依赖 Creator 的 AssetDB、场景进程或完整 `cocos-cli` 构建流程。

默认设计是：

- `src/main.ts` 固定负责启动引擎。
- `src/game.ts` 作为游戏逻辑入口，供开发者或 Agent 主要修改。
- `src/runtime/*` 放模板运行时辅助代码。
- `src/components/*` 放用户自定义组件。

## 模板源码位置

模板主要定义在：

```text
packages/webgame-mcp/src/templates.ts
```

项目创建逻辑在：

```text
packages/webgame-mcp/src/project.ts
```

`createProject()` 会调用 `templates.ts` 中的模板函数，将文件写入目标项目目录。

## 生成工程结构

执行：

```bash
cocos-webgame-mcp create-project --target ./test001 --package cocos
```

会生成类似结构：

```text
test001/
  .gitignore
  package.json
  index.html
  tsconfig.json
  vite.config.js
  globals.d.ts
  public/
    assets/
  src/
    main.ts
    game.ts
    components/
      Rotator.ts
    runtime/
      cocos-assets.ts
      cocos-ui.ts
```

## 生成工程文件职责

| 文件 | 来源模板 | 职责 |
| --- | --- | --- |
| `.gitignore` | `projectGitIgnoreTemplate()` | 忽略 `node_modules/`、`dist/`、`public/assets/` 和日志文件，避免提交生成物。 |
| `package.json` | `packageJsonTemplate()` | 定义 Vite 工程脚本和 `cocos` 依赖。`--package` 参数会写入 `dependencies.cocos`。 |
| `index.html` | `indexHtmlTemplate()` | 定义页面 DOM、canvas 容器和 `/src/main.ts` 模块入口。 |
| `tsconfig.json` | `tsConfigTemplate()` | TypeScript 编译配置，使用 ESM、Bundler module resolution 和装饰器配置。 |
| `vite.config.js` | `viteConfigTemplate()` | Vite 配置，并在 dev/build 时把 `node_modules/cocos/dist/engine/assets` 拷贝到 `public/assets`。 |
| `globals.d.ts` | `globalsTemplate()` | 声明模板用到的全局变量，如 `__cocosAssetBaseUrl` 和 `__cocosWebGameState`。 |
| `src/main.ts` | `mainTemplate()` | 固定启动入口，初始化 `cc.game`、调整 canvas 尺寸、实例化并启动 `Game`。 |
| `src/game.ts` | `gameTemplate()` | 默认游戏逻辑示例，目前使用 `createDefaultUI()` 创建可点击 UI。推荐 Agent 主要修改此文件。 |
| `src/runtime/cocos-assets.ts` | `cocosAssetsTemplate()` | 设置 `globalThis.__cocosAssetBaseUrl`，用于运行时 wasm/bin 等资源定位。 |
| `src/runtime/cocos-ui.ts` | `cocosUiTemplate()` | 提供最小 Cocos UI helper，封装 UI Camera、Canvas、Label、Button。 |
| `src/components/Rotator.ts` | `componentScriptTemplate()` | 默认组件示例，每帧旋转节点。 |

## 关键模板说明

### `indexHtmlTemplate()`

生成 `index.html`。

主要职责：

- 创建 `#GameDiv`、`#Cocos3dGameContainer`、`#GameCanvas`。
- 设置 canvas 全屏样式。
- 设置初始 `globalThis.__cocosAssetBaseUrl`。
- 通过 `<script type="module" src="/src/main.ts">` 启动 Vite 入口。

### `packageJsonTemplate()`

生成项目 `package.json`。

默认脚本：

```json
{
  "dev": "vite --host 127.0.0.1",
  "build": "vite build",
  "preview": "vite preview"
}
```

`cocos` 依赖值由 `create-project --package` 或 `cocosPackage` 参数决定，可指向：

- npm registry 包名，例如 `cocos`
- 本地 tgz，例如 `file:../../dist-npm/cocos/cocos.tgz`

### `viteConfigTemplate()`

生成 `vite.config.js`。

主要职责是复制 Cocos runtime 资源：

```text
node_modules/cocos/dist/engine/assets -> public/assets
```

这些资源包括 wasm、bin 等运行时资源。`src/runtime/cocos-assets.ts` 会把资源 base URL 指向 Vite public 目录，避免 wasm 加载成 HTML 导致 `expected magic word` 一类错误。

### `mainTemplate()`

生成固定入口 `src/main.ts`。

职责：

- 导入 `src/runtime/cocos-assets.ts`。
- 导入 `cocos` npm 包。
- 初始化 `globalThis.__cocosWebGameState`。
- 获取页面上的 `GameCanvas`。
- 根据 DPR 调整 canvas 尺寸。
- 调用 `cc.game.init()`。
- 调用 `cc.game.run()` 后实例化 `new Game()` 并执行 `game.start()`。

除非要调整引擎启动流程，否则不建议 Agent 修改这个文件。

### `gameTemplate()`

生成默认 `src/game.ts`。

当前默认示例是 Cocos UI 点击计数：

- 创建 `createDefaultUI()`。
- 创建标题 Label。
- 创建计数 Label。
- 创建状态 Label。
- 创建 Button。
- 点击按钮后更新计数、按钮文字、按钮颜色和状态文本。

这是推荐 Agent 修改的主入口文件。

### `cocosUiTemplate()`

生成 `src/runtime/cocos-ui.ts`。

它解决的是 Cocos UI 最小可见流程，避免开发者或 Agent 手写 UI 时漏掉：

- UI Camera
- Canvas
- UI layer
- UITransform
- Sprite background
- Button touch event
- builtin white texture / SpriteFrame

主要导出：

```ts
createDefaultUI(options)
createLabel(options)
createButton(options)
toColor(value)
setLayerRecursively(node, layer)
```

`createButton()` 返回真实 Cocos 组件引用：

```ts
{
  node,
  transform,
  button,
  background,
  labelNode,
  label,
  setText,
  setBackgroundColor,
  setTextColor,
  setEnabled,
}
```

颜色参数支持：

- `Color`
- `#rgb`
- `#rgba`
- `#rrggbb`
- `#rrggbbaa`
- `[r, g, b]`
- `[r, g, b, a]`

### `cocosAssetsTemplate()`

生成 `src/runtime/cocos-assets.ts`。

主要职责：

```ts
globalThis.__cocosAssetBaseUrl = new URL(viteBase, pageUrl).href;
```

这样 Cocos npm runtime 在加载 wasm/bin 等资源时，可以从 Vite public base 路径下加载，而不是错误地相对到 JS chunk 路径或返回 HTML。

### `componentScriptTemplate()`

生成默认组件脚本，例如 `src/components/Rotator.ts`。

默认逻辑：

- 定义 `@ccclass('Rotator')` 组件。
- 在 `update(dt)` 中旋转节点。
- 更新 `globalThis.__cocosWebGameState.frame` 作为简单验证信号。

### `projectGitIgnoreTemplate()`

生成项目 `.gitignore`。

默认忽略：

```gitignore
node_modules/
dist/
public/assets/
*.log
```

`public/assets/` 是由 Vite 插件从 `cocos` 包复制出来的运行时资源，属于可再生成内容，不建议提交到业务项目。

## 旧场景 JSON 相关模板

`templates.ts` 和 `project.ts` 中仍保留了部分 scene JSON/runtime loader 相关逻辑，例如：

- `defaultSceneTemplate()`
- `generateRuntime()`
- `sceneLoaderSource()`
- `createSceneRegistrySource()`
- `createScriptRegistrySource()`

这些逻辑用于早期“JSON 描述场景 -> runtime loader 创建场景”的验证方向。

当前 MCP 暴露的工具已经收敛为代码优先流程：

- `webgame-create-project`
- `webgame-create-component`
- `webgame-modify-component`
- `webgame-remove-component`
- `webgame-modify-game`
- `webgame-build-project`

因此默认推荐修改 `src/game.ts` 和 `src/components/*.ts`，不推荐继续依赖 scene JSON 流程作为主要开发路径。

## PR 提交建议

应该提交：

- `packages/webgame-mcp/src/**`
- `packages/webgame-mcp/test/**`
- `packages/webgame-mcp/README.md`
- `packages/webgame-mcp/TEMPLATE.md`
- `packages/webgame-mcp/package.json`
- `packages/webgame-mcp/tsconfig.json`
- `packages/webgame-mcp/bin/cocos-webgame-mcp.js`

不建议提交：

- `packages/webgame-mcp/node_modules/`
- `packages/webgame-mcp/dist/`，除非发布策略要求提交编译产物
- `packages/webgame-mcp/my-game/`
- `packages/webgame-mcp/test001/`
- 生成项目里的 `dist/`
- 生成项目里的 `public/assets/`


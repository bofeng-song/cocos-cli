# @cocos/webgame-mcp

`@cocos/webgame-mcp` 是面向 `cocos` npm 包的轻量 MCP 工具包，用于让开发者或 Agent 通过文件级接口创建和修改 Web 游戏工程。

它和浏览器运行时包 `cocos` 是两个不同的包：

- `cocos`：浏览器端运行时，提供引擎 API。
- `@cocos/webgame-mcp`：Node.js 工具包，提供 MCP Server、工程模板、源码修改和构建命令。

当前实现不包含 Creator 的 AssetDB、场景进程、`.scene` 编辑能力，也不复用完整 `cocos-cli` 构建链路。它的目标是先支持“代码优先”的 Web 游戏开发流程：固定 `main.ts` 启动引擎，开发者或 Agent 修改 `game.ts` 和组件脚本。

## 使用流程

### 1. 构建 webgame-mcp

源码在 `packages/webgame-mcp/src`，需要先编译 TypeScript：

```bash
cd packages/webgame-mcp
npm install
npm run build
```

编译产物输出到：

```text
packages/webgame-mcp/dist/
```

### 2. 创建 Web 游戏工程

使用线上或本地的 `cocos` npm 包：

```bash
npx cocos-webgame-mcp create-project --target ./my-game --package cocos
```

如果要使用本地 `npm pack` 生成的 `cocos` 包：

```bash
npx cocos-webgame-mcp create-project --target ./my-game --package file:../../dist-npm/cocos/cocos.tgz
```

### 3. 安装并运行游戏工程

```bash
cd my-game
npm install
npm run dev
```

默认是 Vite 工程，浏览器打开终端输出的本地地址即可。

### 4. 启动 MCP Server

```bash
npx cocos-webgame-mcp start --project ./my-game --port 9527
```

启动后会提供：

- `POST /mcp`：MCP Streamable HTTP endpoint，供 MCP Client 或 Agent 调用。
- `GET /`：简单状态页。
- `GET /debug`：浏览器调试页，可以手动选择工具并提交 JSON 参数。
- `GET /health`：服务健康信息。
- `GET /tools`：当前暴露的工具列表。

浏览器直接打开 `/mcp` 会返回 `405 Method Not Allowed`，这是预期行为，因为 MCP endpoint 只接受 `POST` 请求。

## CLI 命令

```bash
cocos-webgame-mcp start --project <path> [--port 9527]
cocos-webgame-mcp create-project --target <path> [--package <cocos-dep>] [--force]
cocos-webgame-mcp create-component --project <path> --name Player
cocos-webgame-mcp modify-component --project <path> --name Player --content <source>
cocos-webgame-mcp remove-component --project <path> --name Player
cocos-webgame-mcp modify-game --project <path> --content <source>
cocos-webgame-mcp run-dev --project <path> [--port 5173]
cocos-webgame-mcp build-project --project <path>
```

## MCP 工具

当前 MCP Server 暴露的工具如下：

| 工具 | 行为 |
| --- | --- |
| `webgame-create-project` | 创建 Vite + `cocos` 的 Web 游戏工程。 |
| `webgame-create-component` | 在 `src/components` 下创建 TypeScript 组件脚本。 |
| `webgame-modify-component` | 替换指定组件脚本内容。 |
| `webgame-remove-component` | 删除指定组件脚本。 |
| `webgame-modify-game` | 替换 `src/game.ts`。 |
| `webgame-build-project` | 在游戏工程目录执行 `npm run build`。 |

示例 MCP 参数：

```json
{
  "name": "webgame-modify-game",
  "arguments": {
    "content": "import { createDefaultUI } from './runtime/cocos-ui';\n\nexport class Game {\n  start() {\n    const ui = createDefaultUI();\n    ui.createLabel({ text: 'Hello Cocos', position: [0, 80] });\n  }\n}\n"
  }
}
```

## 生成工程结构

`create-project` 会生成下面的工程：

```text
my-game/
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

### 关键文件说明

| 文件 | 说明 |
| --- | --- |
| `src/main.ts` | 固定启动入口，负责初始化 `cc.game`、绑定 canvas、启动 `Game`。通常不建议由 Agent 修改。 |
| `src/game.ts` | 游戏逻辑入口。推荐让 Agent 主要修改这个文件。 |
| `src/components/*.ts` | 用户自定义组件脚本。可以通过 `webgame-create-component` / `webgame-modify-component` 管理。 |
| `src/runtime/cocos-assets.ts` | 设置 `globalThis.__cocosAssetBaseUrl`，用于运行时 wasm/bin 等资源定位。 |
| `src/runtime/cocos-ui.ts` | 轻量 UI helper，封装 Canvas、UI Camera、Label、Button 的最小可见流程。 |
| `public/assets/` | Vite 插件会从 `node_modules/cocos/dist/engine/assets` 拷贝运行时资源到这里。 |

## 推荐开发边界

当前推荐的 Agent 修改范围：

- 修改 `src/game.ts`：创建场景、节点、UI、交互逻辑。
- 创建或修改 `src/components/*.ts`：编写可复用组件。
- 执行 `webgame-build-project`：验证 TypeScript 和 Vite 构建。

当前不推荐 Agent 修改：

- `src/main.ts`：这是模板固定启动入口。
- `src/runtime/cocos-assets.ts`：资源 base URL 逻辑应该保持统一。
- `vite.config.js`：负责拷贝 `cocos` 包里的运行时资源，除非需要调整打包器行为。

## UI Helper

`src/runtime/cocos-ui.ts` 解决的是 Cocos UI 最小可见流程问题。直接手写 Label/Button 时容易漏掉 Canvas、UI Camera、UI layer 或 builtin material，导致黑屏或 UI 不显示。

推荐使用：

```ts
import { createDefaultUI } from './runtime/cocos-ui';

export class Game {
  private count = 0;

  start() {
    const ui = createDefaultUI({ sceneName: 'Demo' });

    const counter = ui.createLabel({
      text: 'Clicked: 0',
      position: [0, 90],
      fontSize: 36,
      color: '#c1e2ff',
    });

    ui.createButton({
      text: 'Click Me',
      position: [0, -40],
      size: [320, 88],
      backgroundColor: '#1f6feb',
      pressedColor: '#144a9d',
      textColor: '#ffffff',
      pressedTextColor: '#ffe07a',
      onClick: (button) => {
        this.count += 1;
        counter.setText('Clicked: ' + this.count);
        button.setText('Clicked ' + this.count);
        button.setBackgroundColor('#24b47e');
      },
    });
  }
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

因此开发者仍然可以继续访问底层 `Button`、`Sprite`、`Label` 做更细的控制。

## 构建与验证

验证 `@cocos/webgame-mcp`：

```bash
npm --prefix packages/webgame-mcp run test
```

验证生成的 demo 工程：

```bash
npm --prefix packages/webgame-mcp/my-game run build
```

运行本地 demo：

```bash
npm --prefix packages/webgame-mcp/my-game run dev
```

## 当前限制

- 当前是代码优先流程，不支持 Creator 项目里的 AssetDB、meta、library、场景编辑器数据。
- 当前 MCP 工具不提供节点级增删改接口，默认让 Agent 直接修改 `src/game.ts`。
- 当前只内置 Vite 模板。
- 自定义资源的完整导入链路尚未覆盖，运行时资源需要按 Web 工程方式放到可访问 URL 下。
- UI helper 只提供最小常用封装，不等价于 Creator UI 编辑器。


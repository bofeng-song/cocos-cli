# npm web-mobile 包

本文档说明当前 `cocos` npm 包原型的设计、构建流程、demo 用途以及后续开发注意事项，方便其他成员介入继续开发或排查问题。

## 目标

当前目标是把 web-mobile HTML5 引擎运行时打包成一个名为 `cocos` 的 npm 包。

业务工程安装这个包后，可以直接在普通 Web 工程里使用引擎 API：

```js
import cc from 'cocos';
import { Node, MeshRenderer } from 'cocos';
```

这个包基于引擎构建能力生成，不包含 CLI 命令代码、编辑器 UI 代码、项目构建任务代码或 preview server 代码。

当前验证范围较小，主要确认以下能力：

- 可以从普通 Web 工程中导入 `cocos`。
- 不依赖 Creator 项目也能启动引擎。
- 可以用 JavaScript 创建默认场景。
- 可以创建 `Node`、`Primitive` 和 `MeshRenderer`。
- 可以逐帧修改节点旋转，让物体转起来。
- 可以在 Vite 和 Webpack 工程中运行。

后续还需要继续验证自定义脚本、自定义资产、自定义渲染管线以及更完整的项目级工作流。

## 构建命令

在仓库根目录执行：

```bash
npm run build:npm-web-mobile
```

这个 npm script 实际执行：

```bash
node --max-old-space-size=8192 workflow/build-npm-web-mobile.js
```

生成目录：

```text
dist-npm/cocos/
```

本地可安装的 tarball：

```text
dist-npm/cocos/cocos.tgz
```

demo 通过 file dependency 安装这个 tarball：

```json
"cocos": "file:../../../dist-npm/cocos/cocos.tgz"
```

如果重新构建了引擎 npm 包，需要在 demo 目录里重新安装 tarball，确保 `node_modules/cocos` 更新到最新产物。

## 构建流程

构建入口：

```text
workflow/build-npm-web-mobile.js
```

脚本主要步骤如下：

1. 使用 `packages/engine` 作为引擎根目录。
2. 通过 `@cocos/ccbuild` 的 `StatsQuery` 查询全部引擎 features。
3. 调用 `buildEngine()` 构建 HTML5 平台的 ESM 引擎产物。
4. 把生成的引擎运行时代码写入 `dist-npm/cocos/dist/engine`。
5. 对生成的引擎 JS 做 bundler 兼容 patch。
6. 编译内置 runtime effects，生成 JavaScript 数据。
7. 生成 npm 包入口和类型入口。
8. 从 `packages/engine/bin/.declarations/cc.d.ts` 复制引擎声明文件。
9. 写入 package metadata 和 `features.json`。
10. 执行 `npm pack`，并把生成的包统一命名为 `cocos.tgz`。

当前 `buildEngine()` 的核心配置如下：

```js
{
    mode: 'BUILD',
    platform: 'HTML5',
    moduleFormat: 'esm',
    split: false,
    nativeCodeBundleMode: 'both',
    assetURLFormat: 'runtime-resolved',
    sourceMap: false,
    mangleProperties: false,
    inlineEnum: true,
}
```

Bullet、Box2D、PhysX、Spine 的 wasm 加载方式当前使用手动加载。

## 包结构

生成后的包大致结构如下：

```text
dist-npm/cocos/
  package.json
  cocos.tgz
  dist/
    index.js
    index.d.ts
    cc.d.ts
    builtin-effects.js
    register-builtins.js
    engine/
      cc.js
      *.js
      features.json
      assets/
        *.wasm
        *.bin
```

重要文件说明：

- `dist/index.js`：npm 入口。导入生成的引擎入口，安装内置 effects，导出默认 `cc`，并 re-export 引擎 API。
- `dist/index.d.ts`：npm 类型入口。
- `dist/cc.d.ts`：完整引擎声明文件。
- `dist/builtin-effects.js`：编译后的内置 effect 数据。
- `dist/register-builtins.js`：把内置 effects 注册到运行时。
- `dist/engine/`：`@cocos/ccbuild` 生成的 ESM 引擎代码。
- `dist/engine/assets/`：wasm、memory 等运行时二进制资源。
- `dist/engine/features.json`：记录平台、模块格式、flags、features 和生成 exports 等元信息。

## Bundler 兼容 patch

`buildEngine()` 完成后，脚本会对 `dist/engine` 下生成的 JS 做一次后处理。

目前 patch 主要处理三类问题：

- Webpack 会尝试在编译期解析运行时 virtual import。
- 部分运行时 package import 应保持动态导入。
- wasm 等二进制资源 URL 需要基于运行时 asset base 解析。

二进制资源 URL 的 patch 会把生成代码中的：

```js
new URL(binaryUrl, import.meta.url)
```

替换为：

```js
new globalThis.URL(binaryUrl, globalThis.__cocosAssetBaseUrl || import.meta.url)
```

demo 会在加载 `cocos` 前设置：

```js
globalThis.__cocosAssetBaseUrl = new URL('./', window.location.href).href;
```

这样运行时请求 wasm/bin 资源时，会从 Web 应用发布的资源根路径解析。

这部分当前还是原型阶段的兼容层。长期更合理的方向是把这类能力沉到 engine 或 `@cocos/ccbuild` 的正式输出配置里，避免 npm 包脚本依赖生成代码的字符串替换。

## 为什么需要注册内置 effect

Creator 正常项目构建时，构建系统会处理内置 effect，并保证运行时可以使用。npm 包的目标是脱离 Creator 项目后也能运行，因此必须把必要的内置 effect 数据带进包里并在运行时注册。

例如 demo 创建材质时会使用：

```js
material.initialize({
    effectName: 'builtin-unlit',
});
```

如果 `builtin-unlit` 没有注册，材质初始化时就找不到对应 effect。

当前构建流程会把引擎里的 `.effect` 文件编译成运行时数据：

```text
packages/engine/editor/assets/effects/**/*.effect
    -> dist/builtin-effects.js
    -> dist/register-builtins.js
```

npm 入口 `dist/index.js` 会执行：

```js
installBuiltinEffects(cc);
```

注册逻辑会创建 `EffectAsset` 实例，并调用：

```js
effect.onLoaded();
```

当前 effect 收集规则：

- 收集 `packages/engine/editor/assets/effects` 下的 runtime effects。
- 排除 `internal/editor/` 下的编辑器专用 effects。
- 保留部分兼容 alias，例如 `for2d/builtin-sprite -> builtin-sprite`、`pipeline/post-process/bloom -> pipeline/bloom`。

注意：部分 `internal` effect 是 runtime 必需的，需要编译注册，而不是拷贝原始 `.effect` 文件。例如：

```text
internal/builtin-geometry-renderer
internal/builtin-occlusion-query
```

运行时消费的是编译后的 effect 数据，不会直接消费原始 `.effect` 源文件。

## Effect compiler 处理

npm 包脚本复用了现有 effect compiler：

```text
src/core/assets/effect-compiler
```

为了在当前独立构建流程里运行它，脚本在加载 effect compiler 时临时接管了 Node 的模块加载：

- 把 `./offline-mappings` 替换成从引擎源码枚举和格式表里动态生成的 mappings。
- 把 `gl` 替换成一个轻量 fake context，让 shader 检查可以在没有真实 headless GL 环境的 Node 里通过。

这样可以让 npm 包构建在普通 Node 环境里完成，但这部分仍然依赖 effect compiler 的内部实现。如果后续 compiler 修改了内部 import 路径，或者更强依赖真实 GL 行为，这里可能需要同步调整。

## Runtime assets

引擎 npm 包里包含运行时二进制资源：

```text
node_modules/cocos/dist/engine/assets
```

Web 应用需要把这些文件发布到浏览器可访问的路径，并且这个路径要和 `globalThis.__cocosAssetBaseUrl` 对应。

当前两个 demo 都设置：

```js
globalThis.__cocosAssetBaseUrl = new URL('./', window.location.href).href;
```

因此 wasm 文件应能通过下面这样的 URL 访问：

```text
/assets/*.wasm
```

如果 wasm 请求返回的是 HTML，而不是 wasm 文件，浏览器通常会报：

```text
WebAssembly.instantiate(): expected magic word 00 61 73 6d, found 3c 21 64 6f
```

其中 `3c 21 64 6f` 是 `<!do` 的开头，通常说明 dev server 返回了 `index.html` fallback。

## Vite demo

目录：

```text
tests/fixtures/npm-web-mobile-demo
```

运行：

```bash
npm run build:npm-web-mobile
cd tests/fixtures/npm-web-mobile-demo
npm install
npm run dev
```

构建：

```bash
npm run build
```

Vite 配置会把运行时资源从：

```text
node_modules/cocos/dist/engine/assets
```

复制到：

```text
public/assets
```

demo 会先设置 `globalThis.__cocosAssetBaseUrl`，再动态导入 `cocos`，然后创建一个旋转立方体。

## Webpack demo

目录：

```text
tests/fixtures/npm-web-mobile-webpack-demo
```

运行：

```bash
npm run build:npm-web-mobile
cd tests/fixtures/npm-web-mobile-webpack-demo
npm install
npm run dev
```

构建：

```bash
npm run build
```

Webpack 配置使用 `copy-webpack-plugin`，把：

```text
node_modules/cocos/dist/engine/assets
```

复制到输出目录：

```text
assets/
```

demo 同样会先设置 `globalThis.__cocosAssetBaseUrl`，再动态导入 `cocos`。

## 验证清单

修改 npm 包脚本或 demo 后，先重新生成包：

```bash
npm run build:npm-web-mobile
```

然后在 Vite demo 中重新安装 tarball 并构建：

```bash
cd tests/fixtures/npm-web-mobile-demo
npm install ../../../dist-npm/cocos/cocos.tgz --no-audit --prefer-offline
npm run build
```

再验证 Webpack demo：

```bash
cd tests/fixtures/npm-web-mobile-webpack-demo
npm install ../../../dist-npm/cocos/cocos.tgz --no-audit --prefer-offline
npm run build
```

运行时验证建议确认：

- 页面能显示旋转立方体。
- `document.documentElement.dataset.cocosDemoStatus` 变成 `started`。
- `/assets/*.wasm` 请求返回 HTTP 200。
- wasm 文件前 4 个字节是 `00 61 73 6d`。

## 常见问题

### demo 仍然使用旧包

如果只执行普通 `npm install`，在包路径和版本没变时可能不会刷新 `node_modules/cocos`。可以显式重新安装 tarball：

```bash
npm install ../../../dist-npm/cocos/cocos.tgz --no-audit --prefer-offline
```

### WebAssembly magic word 错误

通常是 wasm URL 返回了 HTML。检查 demo 是否把 `node_modules/cocos/dist/engine/assets` 发布到了 `/assets`。

### Webpack 无法解析 wasm module

检查生成的 engine 包是否包含 bundler compatibility patch，并确认 Webpack demo 是否把 runtime assets 复制到了 `assets/`。

### effect not found

检查对应 effect 是否存在于 `dist/builtin-effects.js`，以及 `installBuiltinEffects(cc)` 是否在材质初始化前执行。

## 已知限制

- 当前 package build 会通过字符串替换 patch 生成后的 engine JS。
- effect compiler 集成依赖内部 import 和 fake GL context。
- runtime assets 的发布方式由使用方工程或 demo 自己处理。
- npm 包名、版本策略、发布 registry 还需要产品层面确认。
- 当前 demo 只验证了一个脚本创建的简单场景。
- 自定义资产、自定义脚本、自定义渲染管线、资产加载和项目级工作流还需要继续验证。

## 后续开发注意事项

继续开发时建议注意这些边界：

- 不要把 CLI 运行时代码加入 npm 包。
- `dist-npm/` 是生成目录，应保持 ignored。
- demo 的 `node_modules/`、`dist/` 和复制出来的 runtime assets 不应提交。
- 尽量把 package 生成能力沉到 engine 或 `@cocos/ccbuild`，减少 npm 包脚本里的 generated-code patch。
- 新增 runtime asset 类型时，需要明确 Vite、Webpack 以及其他 bundler 的发布策略。
- 新增 runtime 内置 effect 时，需要编译并注册，不应只拷贝原始 `.effect` 文件。

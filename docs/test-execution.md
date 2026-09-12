# 测试执行

## Unit 分组

`npm test` 和 `npm run test:quiet` 顺序启动两个 Jest 进程：

1. parallel：`maxWorkers: 2`，关闭 `detectOpenHandles`，不加载项目清理钩子。
2. serial：等待 parallel 进程退出后，以 `--runInBand` 执行其余测试。

普通 `test/it` 在同一文件内仍顺序执行。第一组测试失败后继续执行第二组，最终返回失败；进程启动失败或被中断则停止。

并行文件列在 `workflow/parallel-tests.json`，新文件默认串行。加入白名单前，需要确认测试及其依赖不修改共享项目、引擎缓存、输出目录或服务状态。

| 测试类型 | 处理方式 |
| --- | --- |
| 纯逻辑、schema、完全 mock 的 API | 可以加入并行白名单 |
| 使用 mkdtemp 的文件测试 | 确认读写和清理均限定在独立目录后加入 |
| config-sync、资源操作/导入、脚本编译、真实场景 | 保持串行；这些测试共享 fixture、library 或引擎状态 |
| e2e/ | 保持单 worker；自动端口分配尚不能隔离共享项目和资源目录 |

`npm run test:groups` 使用 Jest 实际发现结果，检查白名单路径有效、两组互斥且并集等于原测试集。分组仅覆盖根 Jest 配置的 `src/core` 和 `tests`；AssetDB 包、类型包和 `e2e/` 保留各自入口。`src/core/scene/test/*.e2e.test.ts` 属于根 Jest 配置，仍在串行组。

## 命令

```sh
npm test
npm run test:quiet
npm run test:parallel
npm run test:serial
npm run test:groups
node --test workflow/test-runner.test.cjs workflow/postinstall.test.cjs
# 仅覆盖 parallel 的 worker 数量
npm test -- --maxWorkers=4
```

`npx jest` 仍使用基础配置，默认单 worker。不要从多个终端同时运行共享项目测试；调度器只保证本次调用的两个阶段不重叠。

`test:watch`、`test:coverage` 保留单次完整 Jest 调用。向 `npm test` 传入 watch、coverage、JSON/outputFile 或 detectOpenHandles 时，也使用一次完整串行调用，以保留交互行为和完整报告。自定义 config/projects/filter 请直接调用 Jest。

路径筛选允许其中一组为空。调度器先做一次不执行测试的文件发现检查；两组均无匹配时返回失败，除非显式指定 `--passWithNoTests`。

`test:quiet` 的 `--silent` 会屏蔽测试中的 console 输出，断言失败和异常栈仍会显示。`detectOpenHandles` 用于排查未关闭的定时器、连接等资源，有额外开销，不应用它测量并行性能。

## CI 构建

共享 `setup-env` action 在安装步骤设置 `COCOS_SKIP_POSTINSTALL_BUILD=true`。postinstall 仍编译引擎、生成 cc 模块和 i18n 类型、下载工具；CLI 在后续 `Build project` 步骤构建一次。

该开关只在安装步骤生效。本地安装仍执行完整 postinstall。使用共享 setup 的 workflow 无需再次从根目录执行 `npm ci`。

共享 setup 缓存 npm 下载目录和 `static/tools`，安装与构建步骤仍每次执行。npm 缓存按系统、架构、Node 版本、根 lockfile 和 `repo.json` 区分；依赖变化时可以复用同平台的已下载包。工具缓存按系统、架构、minimal 模式和下载脚本内容精确匹配，不回退到旧版本工具。

CI 工具下载失败会终止安装，缓存仅在安装成功后保存，并在测试开始前完成保存。引擎源码、编译产物、`node_modules` 和测试项目不缓存。首次运行填充缓存，后续命中时才可评估收益；比较环境准备总耗时时需包含缓存恢复与保存的时间。

## 耗时对比

使用相同 Node 版本、构建产物和缓存条件，对比步骤墙钟时间、测试文件/用例数量及失败、跳过情况。Windows E2E 比 macOS 多一个原生 Windows 构建用例，不能直接视为相同工作量。

调度器输出每组墙钟时间。需要文件级耗时和堆使用量时，分别生成报告：

```sh
npm run test:parallel -- --json --outputFile=parallel-results.json --logHeapUsage
npm run test:serial -- --json --outputFile=serial-results.json --logHeapUsage
```

比较 `testResults[].perfStats`，并区分首次运行和重复运行。失败导致的超时不应作为正常用例性能。

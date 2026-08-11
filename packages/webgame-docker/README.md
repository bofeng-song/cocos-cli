# webgame-docker

`webgame-docker` 用来制作和运行 webgame-mcp 服务镜像。它只负责 Docker 镜像、单机启动和集群化部署说明，不包含 MCP 工具源码。

## 职责划分

```text
packages/webgame-mcp
  MCP 服务源码、工具实现、npm 包发布

packages/webgame-docker
  基于 npm tgz 包制作 Docker 镜像
  提供 docker compose 单机启动配置
  提供服务端、客户端和集群化接入说明
```

镜像构建依赖两个 npm 压缩包：

```text
packages/cocos-webgame-mcp.tgz
packages/cocos.tgz
```

其中：

- `cocos-webgame-mcp.tgz` 会被安装成容器内 MCP 服务。
- `cocos.tgz` 会被放到容器内 `/workspace/packages/cocos.tgz`。
- 创建项目时推荐使用 `cocosPackage: "file:../../packages/cocos.tgz"`。

推荐制作顺序：

```text
1. 编译并打包 cocos npm 包
   -> dist-npm/cocos/cocos.tgz

2. 编译并打包 @cocos/webgame-mcp
   -> dist-npm/webgame-mcp/cocos-webgame-mcp.tgz

3. 复制两个 tgz 到 Docker build 默认输入位置
   -> packages/cocos.tgz
   -> packages/cocos-webgame-mcp.tgz

4. 使用 packages/webgame-docker/Dockerfile 制作镜像
```

一键准备两个 tgz：

```bash
cd <REPO_ROOT>
npm run build:webgame-docker:packages
```

这条命令会依次执行：

```text
npm run build:npm-web-mobile
cd packages/webgame-mcp && npm run build
cd packages/webgame-mcp && npm pack
```

如果已经有最新的 `dist-npm/cocos/cocos.tgz`，只想重新打包 webgame-mcp：

```bash
npm run build:webgame-docker:packages -- --skip-cocos
```

## 一、服务端单机部署

### 1. 需要安装的工具

Windows + WSL + Docker Desktop 场景：

- Docker Desktop，并开启 WSL integration。
- WSL2，例如 Ubuntu。
- WSL 中可以执行 `docker` 和 `docker compose`。
- `curl`，用于健康检查。

Linux 服务器场景：

- Docker Engine。
- Docker Compose plugin。
- `curl`。

验证命令：

```bash
docker version
docker compose version
curl --version
```

### 2. 配置环境变量

复制配置模板：

```bash
cd <REPO_ROOT>/packages/webgame-docker
cp .env.example .env
```

`.env` 示例：

```env
NODE_IMAGE=docker.m.daocloud.io/library/node:22-bookworm-slim
NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
WEBGAME_MCP_IMAGE=cocos-webgame-mcp:local
WEBGAME_MCP_PORT=9528
WEBGAME_DEV_PORT=5174
WEBGAME_PREVIEW_PORT=4174
```

端口含义：

```text
WEBGAME_MCP_PORT:     宿主机访问 MCP 服务的端口
WEBGAME_DEV_PORT:     宿主机访问 Vite dev 的端口
WEBGAME_PREVIEW_PORT: 宿主机访问 Vite preview 的端口
```

### 3. 构建镜像

镜像制作由构建脚本负责：

```bash
cd <REPO_ROOT>
npm run build:webgame-docker:image
```

如果 Docker Hub 拉取慢，可以指定镜像源：

```bash
npm run build:webgame-docker:image -- \
  --node-image docker.m.daocloud.io/library/node:22-bookworm-slim \
  --npm-registry https://registry.npmmirror.com
```

这条命令会准备 tgz、校验版本并执行 `docker build`。如果只想使用现有 tgz，可以传 `--skip-prepare`：

```bash
npm run build:webgame-docker:image -- --skip-prepare
```

### 4. 启动服务

启动脚本只负责使用已有镜像启动服务，不会重新制作镜像：

```bash
cd <REPO_ROOT>/packages/webgame-docker
./start-webgame-mcp.sh
```

也可以从仓库根目录直接使用 Docker Compose：

```bash
cd <REPO_ROOT>
docker compose --env-file packages/webgame-docker/.env -f packages/webgame-docker/docker-compose.yml up -d --no-build webgame-mcp
```

这条命令的用途：

- `up -d`：后台启动服务。
- `--no-build`：只使用本地已有镜像，镜像不存在时直接报错。
- `webgame-mcp`：只启动 MCP 服务。

### 5. 查看、停止、重启

查看状态：

```bash
docker compose --env-file packages/webgame-docker/.env -f packages/webgame-docker/docker-compose.yml ps
```

查看日志：

```bash
docker compose --env-file packages/webgame-docker/.env -f packages/webgame-docker/docker-compose.yml logs -f webgame-mcp
```

停止服务：

```bash
docker compose --env-file packages/webgame-docker/.env -f packages/webgame-docker/docker-compose.yml stop webgame-mcp
```

停止并删除容器：

```bash
docker compose --env-file packages/webgame-docker/.env -f packages/webgame-docker/docker-compose.yml down
```

重新构建镜像：

```bash
npm run build:webgame-docker:image
```

重新启动服务：

```bash
docker compose --env-file packages/webgame-docker/.env -f packages/webgame-docker/docker-compose.yml up -d --no-build --force-recreate webgame-mcp
```

### 6. 健康检查

```bash
curl http://localhost:<WEBGAME_MCP_PORT>/tools
```

例如：

```bash
curl http://localhost:9528/tools
```

正常会返回 MCP 工具列表。MCP endpoint 是：

```text
http://localhost:<WEBGAME_MCP_PORT>/mcp
```

### 7. 路径和包位置

镜像内文件位置：

```text
/usr/local/lib/node_modules/@cocos/webgame-mcp
/workspace/packages/cocos.tgz
/workspace/cocos
```

运行时项目输出目录：

```text
宿主机: <REPO_ROOT>/webgame-projects
容器内: /workspace/cocos
```

MCP 创建项目时使用容器路径：

```js
{
  target: "/workspace/cocos/<PROJECT_NAME>",
  name: "<PROJECT_NAME>",
  cocosPackage: "file:../../packages/cocos.tgz",
  force: true,
  install: true
}
```

## 二、客户端接入

客户端不需要访问源码目录，只需要能访问 MCP endpoint。

不同运行位置对应的 MCP 地址：

```text
Windows / WSL 本机客户端:       http://127.0.0.1:<WEBGAME_MCP_PORT>/mcp
webgame-mcp 容器内部客户端:     http://localhost:9527/mcp
同一 compose 网络其他容器:      http://webgame-mcp:9527/mcp
其他机器访问:                   http://<SERVER_IP>:<WEBGAME_MCP_PORT>/mcp
```

### MCP 客户端配置

支持 Streamable HTTP MCP 的客户端，一般只需要配置：

```text
name: cocos_webgame
transport: streamable_http
url: http://127.0.0.1:<WEBGAME_MCP_PORT>/mcp
```

配置完成后，客户端可使用以下 MCP 工具：

```text
webgame-create-project
webgame-build-project
webgame-list-files
webgame-read-file
```

## 三、镜像发布

镜像组合版本统一记录在 `packages/webgame-docker/release.json`：

```json
{
  "imageVersion": "0.0.1-alpha.0",
  "cocosVersion": "4.0.0-alpha.24",
  "webgameMcpVersion": "0.0.1-alpha.0"
}
```

`cocos`、`@cocos/webgame-mcp` 或 Docker 配置发生变化时，必须更新 `imageVersion`；npm 包版本变化时还必须同步对应的包版本。构建脚本会读取两个待入镜像 tgz 的 `package.json` 并校验版本，不匹配时拒绝发布。

使用构建脚本可以一条命令完成 tgz 准备、版本校验和镜像构建：

```bash
cd <REPO_ROOT>
npm run build:webgame-docker:image -- --image cocos-webgame-mcp:local
```

不传 `--image` 时，默认使用 `release.json` 中的版本：

```bash
npm run build:webgame-docker:image
# cocos-webgame-mcp:0.0.1-alpha.0
```

生成可发布镜像时，直接指定镜像仓库，脚本会使用 `release.json` 中的 `imageVersion` 打 tag：

```bash
npm run build:webgame-docker:image -- --repository <REGISTRY>/webgame-mcp
# <REGISTRY>/webgame-mcp:0.0.1-alpha.0
```

也可以显式指定完整镜像名：

```bash
npm run build:webgame-docker:image -- --image <REGISTRY>/webgame-mcp:<VERSION>
```

如果 Docker Hub 拉取慢，可以指定镜像源：

```bash
npm run build:webgame-docker:image -- \
  --repository <REGISTRY>/webgame-mcp \
  --node-image docker.m.daocloud.io/library/node:22-bookworm-slim \
  --npm-registry https://registry.npmmirror.com
```

发布到镜像仓库：

```bash
docker push <REGISTRY>/webgame-mcp:0.0.1-alpha.0
```

镜像会写入以下 OCI/自定义元数据，可用于发布审计：

```text
org.opencontainers.image.version
org.opencontainers.image.revision
org.opencontainers.image.created
io.cocos.webgame.cocos.version
io.cocos.webgame.mcp.version
```

生产环境应使用不可变版本标签或镜像 digest，不要直接依赖 `latest`。

`docker build` 会构建到本机 Docker 镜像库；`docker push` 才会上传到镜像仓库。

如果只是本机或单台服务器使用，可以不 push。Kubernetes 集群部署时，建议 push 到所有节点都能访问的内网镜像仓库。

## 四、集群化部署方向

推荐形态：

```text
Ubuntu Server 节点
  -> Kubernetes / containerd
  -> webgame-mcp 标准镜像
  -> Service / Ingress 暴露 MCP endpoint
```

Kubernetes 中使用标准镜像：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: webgame-mcp
spec:
  replicas: 1
  selector:
    matchLabels:
      app: webgame-mcp
  template:
    metadata:
      labels:
        app: webgame-mcp
    spec:
      containers:
        - name: webgame-mcp
          image: <REGISTRY>/webgame-mcp:<VERSION>
          ports:
            - containerPort: 9527
          resources:
            requests:
              cpu: "500m"
              memory: "1Gi"
            limits:
              cpu: "2"
              memory: "4Gi"
          volumeMounts:
            - name: projects
              mountPath: /workspace/cocos
      volumes:
        - name: projects
          persistentVolumeClaim:
            claimName: webgame-projects-pvc
```

Service：

```yaml
apiVersion: v1
kind: Service
metadata:
  name: webgame-mcp
spec:
  selector:
    app: webgame-mcp
  ports:
    - name: mcp
      port: 9527
      targetPort: 9527
```

集群化注意点：

- `cocos-webgame-mcp.tgz` 和 `cocos.tgz` 推荐进入标准镜像，版本随镜像 tag 管理。
- `/workspace/cocos` 推荐挂载 PVC 或其他持久化存储。
- 先使用 `replicas: 1`，确认 MCP session 无状态后再考虑多副本。
- `npm install` 和 `npm run build` 会消耗 CPU、内存和网络，需要配置资源限制。
- 生产环境需要 TLS、鉴权、访问控制、目录隔离和日志审计。

## 五、常见问题

### Docker Hub 拉取超时

使用镜像源和 npm registry：

```env
NODE_IMAGE=docker.m.daocloud.io/library/node:22-bookworm-slim
NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
```

### Vite 日志显示 5173，为什么浏览器要打开 5174

`5173` 是容器内端口，`5174` 是宿主机映射端口。

```text
宿主机 http://localhost:5174 -> 容器内 5173
```

实际端口以 `docker compose ps` 输出为准。

### Windows 下提示 vite 不是内部或外部命令

项目依赖如果是在 Linux 容器内安装的，Windows 下可能没有 `node_modules/.bin/vite.cmd`。在 Windows 项目目录执行：

```bat
npm install --registry https://registry.npmmirror.com
```

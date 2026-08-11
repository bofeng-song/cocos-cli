ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE}

ARG NPM_CONFIG_REGISTRY=https://registry.npmjs.org/
ARG WEBGAME_MCP_TGZ=packages/cocos-webgame-mcp.tgz
ARG COCOS_TGZ=packages/cocos.tgz
ARG IMAGE_VERSION=local
ARG COCOS_VERSION=unknown
ARG WEBGAME_MCP_VERSION=unknown
ARG VCS_REF=unknown
ARG BUILD_DATE=unknown

LABEL org.opencontainers.image.title="cocos-webgame-mcp" \
      org.opencontainers.image.description="Cocos web game MCP service" \
      org.opencontainers.image.version="${IMAGE_VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      io.cocos.webgame.cocos.version="${COCOS_VERSION}" \
      io.cocos.webgame.mcp.version="${WEBGAME_MCP_VERSION}"

ENV NPM_CONFIG_REGISTRY=${NPM_CONFIG_REGISTRY} \
    WEBGAME_IMAGE_VERSION=${IMAGE_VERSION} \
    COCOS_PACKAGE_VERSION=${COCOS_VERSION} \
    WEBGAME_MCP_PACKAGE_VERSION=${WEBGAME_MCP_VERSION} \
    WEBGAME_IMAGE_REVISION=${VCS_REF}

WORKDIR /app

COPY ${WEBGAME_MCP_TGZ} /tmp/webgame-mcp.tgz
RUN npm install -g /tmp/webgame-mcp.tgz && rm /tmp/webgame-mcp.tgz

RUN mkdir -p /workspace/cocos /workspace/packages
COPY ${COCOS_TGZ} /workspace/packages/cocos.tgz

EXPOSE 9527 5173 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:9527/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["cocos-webgame-mcp", "start", "--host", "0.0.0.0", "--port", "9527"]

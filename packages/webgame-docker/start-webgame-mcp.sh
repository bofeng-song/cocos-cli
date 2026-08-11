#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${WEBGAME_DOCKER_ENV:-${SCRIPT_DIR}/.env}"
RELEASE_FILE="${SCRIPT_DIR}/release.json"

if [ -f "${ENV_FILE}" ]; then
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
fi

export WEBGAME_DOCKER_CONTEXT="${WEBGAME_DOCKER_CONTEXT:-${REPO_ROOT}}"
export WEBGAME_DOCKERFILE="${WEBGAME_DOCKERFILE:-packages/webgame-docker/Dockerfile}"
export WEBGAME_PROJECTS_DIR="${WEBGAME_PROJECTS_DIR:-${REPO_ROOT}/webgame-projects}"
export WEBGAME_IMAGE_VERSION="${WEBGAME_IMAGE_VERSION:-$(node -p "require('${RELEASE_FILE}').imageVersion")}"
export COCOS_PACKAGE_VERSION="${COCOS_PACKAGE_VERSION:-$(node -p "require('${RELEASE_FILE}').cocosVersion")}"
export WEBGAME_MCP_PACKAGE_VERSION="${WEBGAME_MCP_PACKAGE_VERSION:-$(node -p "require('${RELEASE_FILE}').webgameMcpVersion")}"
export WEBGAME_MCP_IMAGE="${WEBGAME_MCP_IMAGE:-cocos-webgame-mcp:${WEBGAME_IMAGE_VERSION}}"

mkdir -p "${WEBGAME_PROJECTS_DIR}"

echo "Starting webgame-mcp on http://localhost:${WEBGAME_MCP_PORT:-9527}"
echo "Image: ${WEBGAME_MCP_IMAGE} (cocos ${COCOS_PACKAGE_VERSION}, webgame-mcp ${WEBGAME_MCP_PACKAGE_VERSION})"
echo "Project mount: ${WEBGAME_PROJECTS_DIR} -> /workspace/cocos"

docker compose \
  -f "${SCRIPT_DIR}/docker-compose.yml" \
  --project-directory "${REPO_ROOT}" \
  up -d --no-build webgame-mcp

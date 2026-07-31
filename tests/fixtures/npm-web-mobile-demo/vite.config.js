import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { defineConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cocosAssetsDir = path.resolve(__dirname, 'node_modules', 'cocos', 'dist', 'engine', 'assets');
const publicAssetsDir = path.resolve(__dirname, 'public', 'assets');

function copyCocosRuntimeAssets() {
    if (!fs.existsSync(cocosAssetsDir)) {
        throw new Error(`Missing cocos runtime assets: ${cocosAssetsDir}`);
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
    server: {
        fs: {
            allow: [
                path.resolve(__dirname, '../../..'),
            ],
        },
    },
});

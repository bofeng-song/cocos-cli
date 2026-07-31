# npm web-mobile Vite demo

This demo verifies that the generated `cocos` npm package can be installed from the local tarball and used from application JavaScript.

## Run

Build the package from the repository root first:

```bash
npm run build:npm-web-mobile
```

Install and start the demo:

```bash
cd tests/fixtures/npm-web-mobile-demo
npm install
npm run dev
```

Open the URL printed by Vite. The page should render a rotating cube.

The Vite config copies `node_modules/cocos/dist/engine/assets` to `public/assets` so wasm files can be served from `/assets`.

## Build

```bash
npm run build
```

The demo depends on `../../../dist-npm/cocos/cocos.tgz`, so rebuild the package before reinstalling if the engine output changes.

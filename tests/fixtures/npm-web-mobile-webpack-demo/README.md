# npm web-mobile Webpack demo

This demo verifies that the generated `cocos` npm package works with Webpack and that engine runtime assets, including wasm files, are available at runtime.

## Run

Build the package from the repository root first:

```bash
npm run build:npm-web-mobile
```

Install and start the demo:

```bash
cd tests/fixtures/npm-web-mobile-webpack-demo
npm install
npm run dev
```

Open the URL printed by webpack-dev-server. The page should render a rotating cube.

## Build

```bash
npm run build
```

## Runtime assets

The generated engine package contains runtime assets under `node_modules/cocos/dist/engine/assets`. The Webpack config copies them to the output `assets` directory so requests such as `/assets/meshopt_decoder.wasm-*.wasm` can resolve in the browser.

The demo depends on `../../../dist-npm/cocos/cocos.tgz`, so rebuild the package before reinstalling if the engine output changes.

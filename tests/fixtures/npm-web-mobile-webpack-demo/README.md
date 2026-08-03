# npm web-mobile Webpack demo

This demo verifies that the generated `cocos` npm package works with Webpack and that engine runtime assets, including wasm files, are available at runtime.

It also covers the lightweight custom script workflow:

- `scripts/Rotator.ts` defines a user component with `@ccclass('Rotator')`.
- `main.ts` imports the component explicitly and attaches it with `node.addComponent(Rotator)`.
- Webpack compiles the TypeScript and decorator syntax through `ts-loader`.
- Runtime state is exposed through `document.documentElement.dataset`:
  - `data-cocos-custom-component-registered`
  - `data-cocos-custom-component-started`
  - `data-cocos-custom-component-updates`

The demo also verifies custom runtime assets:

- `public/custom-assets/checker.png` is loaded with `assetManager.loadRemote(..., { ext: '.png' })`.
- The loaded image asset is converted to a `Texture2D` and rendered on a textured quad.
- Runtime state is exposed through:
  - `data-cocos-remote-image-loaded`
  - `data-cocos-remote-image-node-name`
  - `data-cocos-remote-image-size`
  - `data-cocos-remote-image-asset-type`

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

Open the URL printed by webpack-dev-server. The page should render a rotating cube driven by the custom `Rotator` component and a textured quad created from the remote PNG at runtime.

## Build

```bash
npm run build
```

## Runtime assets

The generated engine package contains runtime assets under `node_modules/cocos/dist/engine/assets`. The Webpack config copies them to the output `assets` directory so requests such as `/assets/meshopt_decoder.wasm-*.wasm` can resolve in the browser.

The Webpack config also copies `public/custom-assets` to the output root so `/custom-assets/checker.png` can be loaded at runtime.

The demo depends on `../../../dist-npm/cocos/cocos.tgz`, so rebuild the package before reinstalling if the engine output changes.

import fs from 'fs';
import path from 'path';
import vm from 'vm';

function setup(map: object, diagnostic = { source: '/project/Probe.ts', import: './Value', line: 2, column: 3 }) {
    const warn = jest.fn();
    const fetch = jest.fn(async (url: URL, options?: object) => ({ ok: true, json: async () => url.pathname.endsWith('module-diagnostic') ? diagnostic : map }));
    const context: any = { URL, fetch, console: { warn } };
    const script = fs.readFileSync(path.resolve(__dirname, '../../../../static/web/module-map-runtime.js'), 'utf8').replace(/export function /g, 'function ');
    vm.runInNewContext(script + ';globalThis.install=installModuleMapDiagnostics;', context);
    const original = new Error('SystemJS failed');
    const system = { resolve: jest.fn(async (specifier: string, importer: string) => { throw original; }) };
    context.install(system, 'http://localhost:9527');
    return { system, fetch, warn, original };
}
test('recovers a scoped placeholder from the latest map, using origin root as map base', async () => {
    const {system,fetch,warn}=setup({scopes:{'./chunks/aa/source.js':{'__unresolved_1':'./chunks/bb/value.js'}}});
    await expect(system.resolve('__unresolved_1','http://localhost:9527/chunks/aa/source.js')).resolves.toBe('http://localhost:9527/chunks/bb/value.js');
    expect(fetch.mock.calls[0][1]).toEqual({cache:'no-store'});
    expect(warn.mock.calls[0][0]).toContain('Probe.ts');
});
test('missing mapping retains the failure with source and original import', async () => {
    const {system}=setup({scopes:{}});
    await expect(system.resolve('__unresolved_1','http://localhost:9527/chunks/aa/source.js')).rejects.toThrow('Import: ./Value');
});
test('ordinary resolution errors do not fetch or retry', async () => {
    const {system,fetch,original}=setup({});
    await expect(system.resolve('some-package','http://localhost:9527/main.js')).rejects.toBe(original);
    expect(fetch).not.toHaveBeenCalled();
});

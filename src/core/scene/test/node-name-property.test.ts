import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import get from 'lodash/get';
import { parsingPath } from '../scene-process/service/dump/utils';

jest.mock('cc', () => ({ Node: class {}, Component: class {} }));
import { validateNodeName } from '../../engine/editor-extends/manager/path-utils';
import { NodePathManager } from '../../engine/editor-extends/manager/node-path-manager';

// Exercise the production methods without booting the engine or scene process.
function loadMethod(file: string, name: string, bindings: Record<string, unknown>): any {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    let method: ts.MethodDeclaration | undefined;
    function visit(node: ts.Node): void {
        if (ts.isMethodDeclaration(node) && node.name.getText(source) === name) {
            method = node;
        }
        ts.forEachChild(node, visit);
    }
    visit(source);
    if (!method) throw new Error('Missing method: ' + name);
    const code = ts.transpileModule('class Harness {' + method.getText(source) + '} return Harness;', {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None },
    }).outputText;
    return new Function(...Object.keys(bindings), code)(...Object.values(bindings));
}

const internal = path.resolve(__dirname, '../scene-process/service/node/index.ts');
const publicService = path.resolve(__dirname, '../scene-process/service/node.ts');

describe('node name property writes', () => {
    it.each(['', '   '])('rejects committed name %p before recording undo or changing selection paths', async value => {
        const node = { uuid: 'node', name: 'Original' };
        const Harness = loadMethod(publicService, 'setProperty', {
            NodeMgr: { getNodeByPath: () => node }, validateNodeName,
        });
        const service = new Harness();
        service._undo = { recordNodeSnapshot: jest.fn() };
        await expect(service.setProperty({ nodePath: 'Original', path: 'name', dump: { value } }))
            .rejects.toThrow('Node name must not be empty');
        expect(service._undo.recordNodeSnapshot).not.toHaveBeenCalled();
        expect(node.name).toBe('Original');
    });


    function createPreview(name = 'Original') {
        const manager = new NodePathManager();
        manager.generateUniquePath('node', name, 'scene');
        manager.generateUniquePath('child', 'Child', 'node');
        const node = { uuid: 'node', name };
        const updateNodeName = jest.fn((uuid: string, value: string) => {
            manager.updateUuid(uuid, value, 'scene');
            node.name = value;
        });
        const bindings = {
            validateNodeName, get,
            NodeMgr: { getNode: () => node, updateNodeName },
            dumpUtil: {
                parsingPath,
                encodeObject: (value: unknown) => ({ type: 'string', value }),
                restoreProperty: jest.fn(),
            },
            NodeOperationType: { SET_PROPERTY: 'set-property' },
        };
        const service: any = { _previewPropertysCache: new Map(), query: () => node, emit: jest.fn() };
        for (const method of ['previewSetNodeProperty', 'cancelPreviewSetNodeProperty', 'setProperty']) {
            service[method] = loadMethod(internal, method, bindings).prototype[method];
        }
        return { service, node, manager, updateNodeName };
    }

    it('rejects an empty preview using real top-level path parsing', async () => {
        const { service, node } = createPreview();
        expect(parsingPath('name', node)).toEqual({ search: '', key: 'name' });
        await expect(service.previewSetNodeProperty('node', 'name', { type: 'string', value: '' }))
            .rejects.toThrow('Node name must not be empty');
        expect(service._previewPropertysCache.size).toBe(0);
        expect(node.name).toBe('Original');
    });

    it('previews repeated renames and cancels back to the original name and descendant paths', async () => {
        const { service, node, manager } = createPreview();
        expect(await service.previewSetNodeProperty('node', 'name', { type: 'string', value: 'First' })).toBe(true);
        expect(await service.previewSetNodeProperty('node', 'name', { type: 'string', value: 'Second' })).toBe(true);
        expect(manager.getNodeUuid('Second/Child')).toBe('child');
        expect(await service.cancelPreviewSetNodeProperty('node', 'name')).toBe(true);
        expect(node.name).toBe('Original');
        expect(manager.getNodeUuid('Original/Child')).toBe('child');
        expect(manager.getNodeResult('Second').error).toBe('Not found');
        expect(service._previewPropertysCache.size).toBe(0);
        expect(await service.cancelPreviewSetNodeProperty('node', 'name')).toBe(false);
    });

    it.each(['', '   ', 'Legacy/Name'])('restores trusted legacy name %p without losing its system path', async original => {
        const { service, node, manager } = createPreview(original);
        const originalPath = manager.getNodePath('node');
        await service.previewSetNodeProperty('node', 'name', { type: 'string', value: 'Renamed' });
        expect(await service.cancelPreviewSetNodeProperty('node', 'name')).toBe(true);
        expect(node.name).toBe(original);
        expect(manager.getNodePath('node')).toBe(originalPath);
        expect(manager.getNodeUuid(originalPath + '/Child')).toBe('child');
    });

    it('keeps the restoration cache when cancellation fails so it can be retried', async () => {
        const { service, node, updateNodeName } = createPreview();
        await service.previewSetNodeProperty('node', 'name', { type: 'string', value: 'Renamed' });
        updateNodeName.mockImplementationOnce(() => { throw new Error('Restore failed'); });
        await expect(service.cancelPreviewSetNodeProperty('node', 'name')).rejects.toThrow('Restore failed');
        expect(service._previewPropertysCache.get('node').has('name')).toBe(true);
        expect(node.name).toBe('Renamed');
        expect(await service.cancelPreviewSetNodeProperty('node', 'name')).toBe(true);
        expect(node.name).toBe('Original');
    });

    it('rejects invalid preview paths without creating a cache', async () => {
        const { service } = createPreview();
        expect(await service.previewSetNodeProperty('node', 'missing', { value: 'x' })).toBe(false);
        expect(service._previewPropertysCache.size).toBe(0);
    });
});

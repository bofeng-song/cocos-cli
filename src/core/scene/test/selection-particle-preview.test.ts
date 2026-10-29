const mockParticleSystem2D = class {
    node: any;
    enabledInHierarchy = true;
    preview = true;
    active = false;
    resetSystem = jest.fn(() => { this.active = true; });
    // Match the engine focus methods and getParticleComponents traversal.
    onFocusInEditor = jest.fn(() => {
        for (const emitter of mockGetParticleComponents(this.node)) {
            if (!emitter.preview) emitter.resetSystem();
        }
    });
    onLostFocusInEditor = jest.fn(() => {
        for (const emitter of mockGetParticleComponents(this.node)) {
            if (emitter.preview) {
                emitter.resetSystem();
                emitter.active = false;
            }
        }
    });
};

function mockGetParticleComponents(node: any): any[] {
    const parent = node.parent;
    const comp = node.getComponent(mockParticleSystem2D);
    if (!parent || !comp) return node.getComponentsInChildren(mockParticleSystem2D);
    return mockGetParticleComponents(parent);
}

function mockCreateNode(components: any[] = [], parent?: any): any {
    const node: any = {
        _components: components, components, parent, children: [],
        getComponent(type: any) { return this.components.find((comp: any) => comp instanceof type) ?? null; },
        getComponentsInChildren(type: any): any[] {
            return [...this.components.filter((comp: any) => comp instanceof type),
                ...this.children.flatMap((child: any) => child.getComponentsInChildren(type))];
        },
    };
    for (const comp of components) comp.node = node;
    parent?.children.push(node);
    return node;
}

jest.mock('cc', () => ({ __esModule: true, ParticleSystem2D: mockParticleSystem2D }));
jest.mock('../scene-process/service/core/decorator', () => ({ register: () => () => undefined }));
jest.mock('../scene-process/service/utils/editor-node', () => ({
    getEditorNodeUuidByPath: () => 'particle-node',
    getEditorNodeByUuid: () => mockNode,
    getEditorNodePath: () => 'Canvas/Particle',
}));
let mockNode: any;

describe('SelectionService particle preview', () => {
    let selection: any;
    let particle: InstanceType<typeof mockParticleSystem2D>;
    beforeEach(() => {
        const { SelectionService } = require('../scene-process/service/selection');
        selection = new SelectionService();
        jest.spyOn(selection, 'broadcast').mockImplementation(() => undefined);
        particle = new mockParticleSystem2D();
        mockNode = mockCreateNode([particle]);
    });

    it('starts an idle preview-enabled emitter on first selection', () => {
        selection.select('Canvas/Particle');
        expect(particle.onFocusInEditor).toHaveBeenCalledTimes(1);
        expect(particle.active).toBe(true);
        expect(particle.resetSystem).toHaveBeenCalledTimes(1);
        selection.select('Canvas/Particle');
        expect(particle.resetSystem).toHaveBeenCalledTimes(1);
    });

    it('starts again after losing focus without restarting a running emitter', () => {
        particle.active = true;
        selection.select('Canvas/Particle');
        expect(particle.resetSystem).not.toHaveBeenCalled();
        selection.clear();
        expect(particle.active).toBe(false);
        particle.resetSystem.mockClear();
        selection.select('Canvas/Particle');
        expect(particle.active).toBe(true);
        expect(particle.resetSystem).toHaveBeenCalledTimes(1);
    });

    it('preserves the engine focus behavior when continuous preview is disabled', () => {
        particle.preview = false;
        selection.select('Canvas/Particle');
        expect(particle.resetSystem).toHaveBeenCalledTimes(1);
    });

    it('does not start disabled emitters', () => {
        particle.enabledInHierarchy = false;
        selection.select('Canvas/Particle');
        expect(particle.resetSystem).not.toHaveBeenCalled();
    });

    it.each(['parent', 'child'])('starts the complete group when selecting the %s emitter', selected => {
        const container = mockCreateNode();
        const parentNode = mockCreateNode([particle], container);
        const child = new mockParticleSystem2D();
        const childNode = mockCreateNode([child], parentNode);
        const sibling = new mockParticleSystem2D();
        mockCreateNode([sibling], container);
        mockNode = selected === 'parent' ? parentNode : childNode;
        selection.select('Canvas/Particle');
        for (const emitter of [particle, child, sibling]) {
            expect(emitter.active).toBe(true);
            expect(emitter.resetSystem).toHaveBeenCalledTimes(1);
        }
        selection.select('Canvas/Particle');
        for (const emitter of [particle, child, sibling]) expect(emitter.resetSystem).toHaveBeenCalledTimes(1);
    });

    it('keeps the enabled, preview and active guards across descendant emitters', () => {
        const disabled = new mockParticleSystem2D();
        disabled.enabledInHierarchy = false;
        const running = new mockParticleSystem2D();
        running.active = true;
        const oneShot = new mockParticleSystem2D();
        oneShot.preview = false;
        for (const emitter of [disabled, running, oneShot]) mockCreateNode([emitter], mockNode);
        selection.select('Canvas/Particle');
        expect(disabled.resetSystem).not.toHaveBeenCalled();
        expect(running.resetSystem).not.toHaveBeenCalled();
        // The engine starts non-continuous preview; the fallback must not reset it again.
        expect(oneShot.resetSystem).toHaveBeenCalledTimes(1);
        expect(particle.resetSystem).toHaveBeenCalledTimes(1);
    });

    it('does not cross a non-emitter ancestor boundary', () => {
        const ancestor = mockCreateNode([particle]);
        const boundary = mockCreateNode([], ancestor);
        const child = new mockParticleSystem2D();
        mockNode = mockCreateNode([child], boundary);
        selection.select('Canvas/Particle');
        expect(child.active).toBe(true);
        expect(particle.resetSystem).not.toHaveBeenCalled();
    });

    it('does not reset unrelated components with similar properties', () => {
        const component = { enabledInHierarchy: true, preview: true, active: false, resetSystem: jest.fn() };
        mockNode = mockCreateNode([component]);
        selection.select('Canvas/Particle');
        expect(component.resetSystem).not.toHaveBeenCalled();
    });
});
export {};

import { AssetsTestContext, setupAssetsTestEnvironment, teardownAssetsTestEnvironment } from '../../helpers/test-utils';
import { E2E_TIMEOUTS } from '../../config';

describe('Resource Preview', () => {
    let context: AssetsTestContext;
    let serverBaseUrl: string;

    beforeAll(async () => {
        context = await setupAssetsTestEnvironment();
        serverBaseUrl = `http://localhost:${context.mcpClient.getPort()}`;
    }, E2E_TIMEOUTS.SERVER_START);

    afterAll(async () => {
        await teardownAssetsTestEnvironment(context);
    });

    describe('preview route', () => {
        test('GET /preview should return valid HTML page', async () => {
            const res = await fetch(`${serverBaseUrl}/preview`);
            expect(res.status).toBe(200);

            const html = await res.text();
            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('Resource Preview');
            expect(html).toContain('GameCanvas');
            expect(html).toContain('preview-app.js');
        });

        test('preview page should include toolbar controls', async () => {
            const res = await fetch(`${serverBaseUrl}/preview`);
            const html = await res.text();

            expect(html).toContain('pvType');
            expect(html).toContain('pvUuid');
            expect(html).toContain('pvW');
            expect(html).toContain('pvH');
            expect(html).toContain('pvPrimitive');
            expect(html).toContain('previewResult');
        });

        test('preview page should inject serverURL', async () => {
            const res = await fetch(`${serverBaseUrl}/preview`);
            const html = await res.text();

            expect(html).toContain('window.WebEnv');
            expect(html).toContain('serverURL');
            expect(html).toContain(serverBaseUrl);
        });
    });

    describe('preview static assets', () => {
        test('GET /static/web/preview-app.js should return JS', async () => {
            const res = await fetch(`${serverBaseUrl}/static/web/preview-app.js`);
            expect(res.status).toBe(200);

            const js = await res.text();
            expect(js).toContain('PREVIEW_TYPES');
            expect(js).toContain('doPreview');
            expect(js).toContain('initPreviewApp');
        });

        test('GET /static/web/boot.js should return JS', async () => {
            const res = await fetch(`${serverBaseUrl}/static/web/boot.js`);
            expect(res.status).toBe(200);
        });
    });

    describe('preview via MCP (generateThumbnail)', () => {
        test('should query material assets for preview', async () => {
            const result = await context.mcpClient.callTool('assets-query-by-type', {
                assetType: 'cc.Material',
            });

            expect(result.code).toBe(200);
            expect(result.data).toBeDefined();

            if (Array.isArray(result.data) && result.data.length > 0) {
                const materialUuid = result.data[0].uuid;
                expect(materialUuid).toBeDefined();
                expect(typeof materialUuid).toBe('string');
            }
        });
    });
});

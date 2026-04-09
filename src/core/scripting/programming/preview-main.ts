import { Command } from 'commander';
import { PreviewServer } from './server';
import { join } from 'path';

async function main() {
    const program = new Command();
    program
        .version('1.0.0')
        .option('-p, --project <path>', '项目路径', process.cwd())
        .option('-e, --engine <path>', '引擎路径')
        .option('--port <number>', '预览服务端口', '9527')
        .parse(process.argv);

    const options = program.opts();
    const curDir = process.cwd();
    options.project = join(curDir, 'tests/fixtures/projects/asset-operation');
    const server = new PreviewServer({
        projectPath: options.project,
        enginePath: options.engine,
        port: options.port ? parseInt(options.port) : undefined,
    });

    await server.start();
}

main().catch(err => {
    console.error(`❌ Global error:`, err);
    process.exit(1);
});

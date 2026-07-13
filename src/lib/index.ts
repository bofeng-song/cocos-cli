export * as Assets from './assets/assets';
export * as Base from './base/base';
export * as Configuration from './configuration/configuration';
export * as Engine from './engine/engine';
export * as Mcp from './mcp/mcp';
export * as Project from './project/project';
export * as Server from './server/server';
export * as Scene from './scene/scene';
export * as Scripting from './scripting/scripting';
export * as i18n from '../i18n';

// Scene services. `Service` is the DecoratorService proxy (`Service.Node.xxx()`);
// import the per-service entry modules you need from `./service/<name>` so only
// those services are registered (incremental). See `./service`.
export { Service } from './service';
export type { Services, IPublicServiceManager } from './service';

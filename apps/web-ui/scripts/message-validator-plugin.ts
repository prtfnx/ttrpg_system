import Ajv2020 from 'ajv/dist/2020.js';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { normalizePath, type Plugin } from 'vite';

const moduleId = 'virtual:ttrpg-message-validator';
const schemaPath = normalizePath(fileURLToPath(
  new URL('../src/lib/websocket/message.schema.generated.json', import.meta.url),
));

const textModuleId = 'virtual:ttrpg-text-sprite-validator';
const textSchemaPath = normalizePath(fileURLToPath(new URL(
  '../src/features/canvas/components/TextSprite/text_sprite.schema.generated.json', import.meta.url,
)));
const schemas = new Map([[moduleId, schemaPath], [textModuleId, textSchemaPath]]);

/** Compile on the build server so browser validation works without unsafe-eval. */
export function messageValidatorPlugin(): Plugin {
  return {
    name: 'ttrpg-message-validator',
    config() {
      // The helper is emitted by the virtual module, outside Vite's initial scan.
      return { optimizeDeps: { include: ['ajv/dist/runtime/ucs2length.js'] } };
    },
    resolveId(id) {
      if (schemas.has(id)) return `\0${id}`;
    },
    async load(id) {
      const source = id.startsWith('\0') ? schemas.get(id.slice(1)) : undefined;
      if (!source) return;
      this.addWatchFile(source);
      const ajv = new Ajv2020({ allErrors: true, code: { source: true, esm: true } });
      ajv.addKeyword('x-enum-varnames');
      ajv.addKeyword('x-limits');
      ajv.addFormat('uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      const validate = ajv.compile(JSON.parse(await readFile(source, 'utf8')));
      const imports = new Map<string, string>();
      // Ajv's ESM output still uses CommonJS for runtime helpers (e.g. Unicode
      // string length). Turn those helpers into static imports for Vite.
      const code = standaloneCode(ajv, validate).replace(
        /require\("(ajv\/dist\/runtime\/[^"\n]+)"\)\.default/g,
        (_match, specifier: string) => {
          if (!imports.has(specifier)) imports.set(specifier, `ajvRuntime${imports.size}`);
          return imports.get(specifier)!;
        },
      );
      if (/\brequire\(/.test(code)) throw new Error('Unsupported CommonJS helper in message validator');
      return [
        ...Array.from(imports, ([specifier, name]) => `import ${name} from ${JSON.stringify(`${specifier}.js`)};`),
        code,
      ].join('\n');
    },
    handleHotUpdate(context) {
      for (const [id, source] of schemas) {
        if (context.file !== source) continue;
        const module = context.server.moduleGraph.getModuleById(`\0${id}`);
        if (module) return [module];
      }
    },
  };
}

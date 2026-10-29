/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make modules impossible to extract later (ADR-002).',
      from: {},
      to: { circular: true },
    },
    {
      name: 'domain-is-pure',
      severity: 'error',
      comment:
        'domain/ holds entities and invariants only. It may import @aurora/types and other domain files, never NestJS, Drizzle, application or infrastructure (ADR-002).',
      from: { path: '^apps/api/src/modules/[^/]+/domain/' },
      to: {
        pathNot: [
          '^apps/api/src/modules/[^/]+/domain/',
          '^packages/types/',
          'node_modules/@aurora/types',
        ],
        path: [
          '^apps/api/src/modules/[^/]+/(application|infrastructure|api)/',
          'node_modules/(@nestjs|drizzle-orm|pg|ioredis|bullmq)',
          '^apps/api/src/(platform|app)',
        ],
      },
    },
    {
      name: 'application-does-not-import-api',
      severity: 'error',
      comment: 'application/ orchestrates; it must not know about HTTP controllers.',
      from: { path: '^apps/api/src/modules/[^/]+/application/' },
      to: { path: '^apps/api/src/modules/[^/]+/api/' },
    },
    {
      name: 'modules-use-public-contract-only',
      severity: 'error',
      comment:
        "A module may depend on another module only through that module's index.ts (its public contract, ADR-002). " +
        "The one exception is infrastructure/schema.ts → another module's infrastructure/schema.ts: foreign keys are a " +
        'persistence-level contract and must stay free of NestJS wiring; schema-to-schema cycles are still forbidden by no-circular.',
      from: {
        path: '^apps/api/src/modules/([^/]+)/',
        pathNot: '^apps/api/src/modules/[^/]+/infrastructure/schema\\.ts$',
      },
      to: {
        path: '^apps/api/src/modules/([^/]+)/(domain|application|infrastructure|api)/',
        pathNot: '^apps/api/src/modules/$1/',
      },
    },
    {
      name: 'schema-files-only-reference-schema-files',
      severity: 'error',
      comment:
        "infrastructure/schema.ts may reach into another module only for that module's schema.ts (FK references).",
      from: { path: '^apps/api/src/modules/([^/]+)/infrastructure/schema\\.ts$' },
      to: {
        path: '^apps/api/src/modules/([^/]+)/',
        pathNot: [
          '^apps/api/src/modules/$1/',
          '^apps/api/src/modules/[^/]+/infrastructure/schema\\.ts$',
        ],
      },
    },
    {
      name: 'types-package-is-dependency-free',
      severity: 'error',
      comment: 'packages/types is shared by API and web; it may only use decimal.js, uuid and zod.',
      from: { path: '^packages/types/src/' },
      to: {
        path: 'node_modules/',
        pathNot: 'node_modules/(decimal\\.js|uuid|zod)(/|$)',
      },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      from: { orphan: true, pathNot: ['\\.d\\.ts$', '(^|/)(index|main)\\.ts$', 'test/'] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};

import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { PATH_METADATA } from '@nestjs/common/constants';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AUTH_ONLY_KEY, IS_PUBLIC, PERMISSION_KEY } from '../../src/platform/auth/request-context';
import { type TestApp, createTestApp } from '../support/harness';

/**
 * Every HTTP route must declare its authorization intent explicitly: @Public, @RequirePermission
 * (method or class) or @AuthOnly. A route with none of these is a bug, not an auth-only route —
 * this test turns that bug into a CI failure (reviewer finding, SEC-002).
 */
describe('route authorization coverage', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('every controller method declares @Public, @RequirePermission or @AuthOnly', () => {
    const discovery = t.app.get(DiscoveryService);
    const scanner = new MetadataScanner();
    const reflector = t.app.get(Reflector);
    const undeclared: string[] = [];
    const declared: string[] = [];
    for (const wrapper of discovery.getControllers()) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;
      const prototype = Object.getPrototypeOf(instance) as object;
      for (const name of scanner.getAllMethodNames(prototype)) {
        const handler = (prototype as Record<string, unknown>)[name];
        if (typeof handler !== 'function') continue;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        if (path === undefined) continue; // not a route handler
        const route = `${metatype.name}.${name}`;
        const isPublic = reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
          handler,
          metatype,
        ]);
        const perms = reflector.getAllAndOverride<string[] | undefined>(PERMISSION_KEY, [
          handler,
          metatype,
        ]);
        const authOnly = reflector.getAllAndOverride<boolean | undefined>(AUTH_ONLY_KEY, [
          handler,
          metatype,
        ]);
        if (isPublic || (perms && perms.length > 0) || authOnly) declared.push(route);
        else undeclared.push(route);
      }
    }
    expect(declared.length).toBeGreaterThan(25);
    expect(undeclared, 'routes without an explicit authorization decorator').toEqual([]);
  });
});

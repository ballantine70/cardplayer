// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { SiteAuth, loginPage, safeNext } from './auth.ts';

const req = (cookie?: string) => ({ headers: { cookie } }) as unknown as IncomingMessage;

describe('safeNext', () => {
  it('keeps paths on this site', () => {
    expect(safeNext('/r/abcd')).toBe('/r/abcd');
  });
  it('refuses other sites', () => {
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('/\\evil.example')).toBe('/');
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext(null)).toBe('/');
  });
});

describe('SiteAuth', () => {
  it('only accepts the cookie for the current password', () => {
    const a = new SiteAuth('secret');
    const token = (a as unknown as { token: string }).token;
    expect(a.isAuthorised(req(`cp_auth=${token}`))).toBe(true);
    expect(a.isAuthorised(req('cp_auth=wrong'))).toBe(false);
    expect(a.isAuthorised(req())).toBe(false);
    expect(new SiteAuth('changed').isAuthorised(req(`cp_auth=${token}`))).toBe(false);
  });
});

describe('loginPage', () => {
  it('escapes the return path', () => {
    expect(loginPage(null, '/"><script>')).not.toContain('<script>');
  });
});

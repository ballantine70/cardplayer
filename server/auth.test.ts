// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { Auth, loginPage, safeNext } from './auth.ts';

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

type Gates = { site: { token: string } | null; admin: { token: string } | null };
const tokens = (a: Auth) => a as unknown as Gates;

describe('Auth', () => {
  it('only accepts the site cookie for the current password', () => {
    const a = new Auth('secret');
    const token = tokens(a).site!.token;
    expect(a.hasSiteAccess(req(`cp_auth=${token}`))).toBe(true);
    expect(a.hasSiteAccess(req('cp_auth=wrong'))).toBe(false);
    expect(a.hasSiteAccess(req())).toBe(false);
    expect(new Auth('changed').hasSiteAccess(req(`cp_auth=${token}`))).toBe(false);
  });

  it('treats everyone with access as an admin when there is no admin password', () => {
    expect(new Auth().isAdmin(req())).toBe(true);
    const a = new Auth('secret');
    expect(a.isAdmin(req(`cp_auth=${tokens(a).site!.token}`))).toBe(true);
    expect(a.isAdmin(req())).toBe(false);
  });

  it('separates players from admins', () => {
    const a = new Auth('site', 'boss');
    const player = req(`cp_auth=${tokens(a).site!.token}`);
    const admin = req(`cp_admin=${tokens(a).admin!.token}`);
    expect(a.hasSiteAccess(player)).toBe(true);
    expect(a.isAdmin(player)).toBe(false);
    // The admin login also grants site access.
    expect(a.hasSiteAccess(admin)).toBe(true);
    expect(a.isAdmin(admin)).toBe(true);
  });

  it('allows an admin password without a site password', () => {
    const a = new Auth(undefined, 'boss');
    expect(a.hasSiteAccess(req())).toBe(true);
    expect(a.isAdmin(req())).toBe(false);
  });
});

describe('loginPage', () => {
  it('escapes the return path', () => {
    expect(loginPage(null, '/"><script>')).not.toContain('<script>');
  });
});

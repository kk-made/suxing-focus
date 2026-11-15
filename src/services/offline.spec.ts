/**
 * 本地单机约束：业务源码不出现联网 API；manifest 不申请网络权限、不开启 DCloud 统计。
 * 这是结构护栏，防止以后误接入云同步 / 统计上报 / 远程资源。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const NETWORK_APIS: { name: string; pattern: RegExp }[] = [
  { name: 'uni.request', pattern: /\buni\.request\s*\(/ },
  { name: 'uni.uploadFile', pattern: /\buni\.uploadFile\s*\(/ },
  { name: 'uni.downloadFile', pattern: /\buni\.downloadFile\s*\(/ },
  { name: 'uni.connectSocket', pattern: /\buni\.connectSocket\s*\(/ },
  { name: 'fetch', pattern: /\bfetch\s*\(/ },
  { name: 'XMLHttpRequest', pattern: /\bnew\s+XMLHttpRequest\b/ },
  { name: 'WebSocket', pattern: /\bnew\s+WebSocket\b/ },
  { name: 'EventSource', pattern: /\bnew\s+EventSource\b/ },
  { name: 'sendBeacon', pattern: /\bnavigator\.sendBeacon\s*\(/ },
  { name: 'uniCloud', pattern: /\buniCloud\b/ },
];

function walk(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

describe('本地单机约束', () => {
  it('业务源码不包含联网 API', () => {
    const files = walk(SRC).filter(
      (file) =>
        /\.(ts|vue|js|html)$/.test(file) &&
        !file.endsWith('.spec.ts') &&
        !file.includes(`${path.sep}node_modules${path.sep}`),
    );
    const hits: string[] = [];

    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      for (const api of NETWORK_APIS) {
        if (api.pattern.test(text)) {
          hits.push(`${path.relative(SRC, file)} → ${api.name}`);
        }
      }
    }

    expect(hits).toEqual([]);
  });

  it('manifest 不申请网络权限、不开启统计上报', () => {
    const manifest = fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8');

    expect(manifest).not.toMatch(/ACCESS_NETWORK_STATE|CHANGE_NETWORK_STATE/);
    expect(manifest).not.toMatch(/ACCESS_WIFI_STATE|CHANGE_WIFI_STATE/);
    expect(manifest).not.toMatch(/android\.permission\.INTERNET/);
    expect(manifest).toMatch(/"uniStatistics"\s*:\s*\{[\s\S]*?"enable"\s*:\s*false/);
  });

  it('生产构建保留 same-origin CSP', () => {
    const config = fs.readFileSync(path.join(SRC, '..', 'vite.config.ts'), 'utf8');

    expect(config).toContain('Content-Security-Policy');
    expect(config).toContain("connect-src 'self'");
  });
});

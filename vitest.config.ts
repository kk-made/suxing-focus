/**
 * vitest 独立配置（单元测试专用）
 * 不加载 uni-app 编译插件：services/ 是纯 TS 逻辑，在 node 环境直接测试即可。
 */
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});

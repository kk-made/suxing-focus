import { createSSRApp } from 'vue';
import * as Pinia from 'pinia';
import App from './App.vue';
import { createPersistPlugin } from './stores/persist';

export function createApp() {
  const app = createSSRApp(App);

  // Pinia 实例 + 自研持久化插件（声明了 persist 的 store 自动读写本地存储）
  const pinia = Pinia.createPinia();
  pinia.use(createPersistPlugin());
  app.use(pinia);

  return {
    app,
    // uni-app 约定：必须将 Pinia 返回（SSR 上下文需要）
    Pinia,
  };
}

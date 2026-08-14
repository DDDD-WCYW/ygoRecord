import App from "./App.vue";
import { createSSRApp } from "vue";
import wxCompat from "./services/wx-compat";

export function createApp() {
  const app = createSSRApp(App);
  // 全局 mixin:为选项式页面提供 setData 等小程序式能力
  app.mixin(wxCompat.pageMixin);
  return {
    app,
  };
}

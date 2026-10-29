import { startBackground, type BackgroundBrowserApi } from '../core/background/start-background';

export default defineBackground(() => {
  const app = startBackground(browser as unknown as BackgroundBrowserApi);
  void app.ready.catch((error) => {
    console.error('Browser AI Background 初始化失败', error);
  });
});

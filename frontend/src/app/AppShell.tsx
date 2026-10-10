import { AppHistoryProvider } from './appHistory';
import { AppHeader } from './AppHeader';
import { useContextUrlSync } from './context/useContextUrl';
import { SpatialShell } from '../features/spatial/SpatialShell';

/** 四要素 ↔ URL 同步：必须在 Router 上下文内、且在任何页面读取上下文之前挂载。 */
function ContextUrlBridge() {
  useContextUrlSync();
  return null;
}

/** 应用外壳：一份导航 + 一个空间舞台，跨路由保持不变。 */
export function AppShell() {
  return (
    <AppHistoryProvider>
      <ContextUrlBridge />
      <AppHeader />
      <SpatialShell />
    </AppHistoryProvider>
  );
}
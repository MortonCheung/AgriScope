import { AppHistoryProvider } from './appHistory';
import { AppHeader } from './AppHeader';
import { SpatialShell } from '../features/spatial/SpatialShell';

/** 应用外壳：一份导航 + 一个空间舞台，跨路由保持不变。 */
export function AppShell() {
  return (
    <AppHistoryProvider>
      <AppHeader />
      <SpatialShell />
    </AppHistoryProvider>
  );
}

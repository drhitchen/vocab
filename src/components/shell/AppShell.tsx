import type { ReactNode } from 'react';
import { useAppearance } from '../../appearance/appearance';
import EditorialHeader from './EditorialHeader';
import FocusSidebar from './FocusSidebar';
import type { ChromeProps } from './shared';

// Only the chrome swaps when the design changes. The content wrapper sits at a fixed
// position in the tree so screens keep their state (search text, a running session, ...).
export default function AppShell({ children, ...chrome }: ChromeProps & { children: ReactNode }) {
  const { design } = useAppearance();

  return (
    <div className="shell">
      {design === 'editorial' && <EditorialHeader {...chrome} />}
      {design === 'focus' && <FocusSidebar {...chrome} />}
      <div className="content">
        <div className="inner">{children}</div>
      </div>
    </div>
  );
}

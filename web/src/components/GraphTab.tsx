import { useStore } from '../lib/store';
import { t } from '../lib/i18n';
import GraphView from './GraphView';
import GalaxyView from './GalaxyView';

/** The graph tab: 星图 galaxy (default) or the Obsidian-style 关系图; the choice is persisted (PRD 2.0). */
export default function GraphTab() {
  const mode = useStore((s) => s.graphMode);
  const setMode = useStore((s) => s.setGraphMode);
  return (
    <div className="graph-tab" data-mode={mode}>
      {mode === 'graph' ? <GraphView /> : <GalaxyView />}
      <div className="graph-mode-switch" role="group" aria-label={t('Graph mode')}>
        <button aria-pressed={mode === 'galaxy'} onClick={() => setMode('galaxy')}>{t('Galaxy')}</button>
        <button aria-pressed={mode === 'graph'} onClick={() => setMode('graph')}>{t('Links graph')}</button>
      </div>
    </div>
  );
}

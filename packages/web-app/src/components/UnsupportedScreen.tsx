import { useTranslation } from 'react-i18next';
import { ContextHelp } from './ContextHelp';

export type StartupFailureKind = 'capabilities' | 'other_tab' | 'timeout' | 'storage' | 'unexpected' | 'isolation';

export interface UnsupportedScreenProps {
  kind: StartupFailureKind;
  reasons: string[];
}

export function UnsupportedScreen(props: UnsupportedScreenProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <main className="page startupShell">
      <section className="unsupported startupCard startupFailureCard">
        <h1>{t(`common.startup_failure.${props.kind}.title`)}</h1>
        <p>{t(`common.startup_failure.${props.kind}.reason`)}</p>
        <h2>{t('common.startup_failure.try_title')}</h2>
        <p>{t(`common.startup_failure.${props.kind}.action`)}</p>
        <div className="actions startupActionRow">
          <button type="button" className="primaryActionButton" onClick={() => window.location.reload()}>
            {t('common.reload')}
          </button>
          <ContextHelp title={t('common.technical_info')}>
            <ul className="startupDiagnostics">
              {props.reasons.length > 0 ? props.reasons.map((reason, index) => (
                <li key={index}>{reason || t('common.startup_failure.no_details')}</li>
              )) : <li>{t('common.startup_failure.no_details')}</li>}
            </ul>
          </ContextHelp>
        </div>
      </section>
    </main>
  );
}

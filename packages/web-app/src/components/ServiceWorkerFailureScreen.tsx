import React from 'react';
import { useTranslation } from 'react-i18next';
import { ContextHelp } from './ContextHelp';

export type ServiceWorkerFailureReason = 'unsupported' | 'register_error' | 'controller_timeout';

export function ServiceWorkerFailureScreen({ reason, errorMessage }: {
  reason: ServiceWorkerFailureReason;
  errorMessage: string | null;
}): JSX.Element {
  const { t } = useTranslation();
  const [guideOpen, setGuideOpen] = React.useState(false);
  const guideId = React.useId();

  return (
    <main className="page startupShell">
      <section className="unsupported startupCard startupFailureCard">
        <h1>{t('common.service_worker_failure.title')}</h1>
        <p>{t(`common.service_worker_failure.reason.${reason}`)}</p>
        <h2>{t('common.startup_failure.try_title')}</h2>
        <p>{t(`common.service_worker_failure.action.${reason}`)}</p>
        <div className="actions startupActionRow">
          <button type="button" className="primaryActionButton" onClick={() => window.location.reload()}>
            {t('common.reload')}
          </button>
          <ContextHelp title={t('common.technical_info')}>
            <p className="startupDiagnostics">{t(`common.service_worker_failure.diagnostic.${reason}`)}</p>
            {errorMessage ? <p className="startupDiagnostics">{errorMessage}</p> : null}
          </ContextHelp>
        </div>
        <div>
          <button type="button" aria-expanded={guideOpen} aria-controls={guideId} onClick={() => setGuideOpen((current) => !current)}>
            {t('common.service_worker_failure.guide_toggle')}
          </button>
        </div>
        <section id={guideId} hidden={!guideOpen} className="startupRecoveryGuide" aria-label={t('common.service_worker_failure.guide_toggle')}>
          <div className="warningBox">
            <h2>{t('common.service_worker_failure.delete_warning_title')}</h2>
            <p>{t('common.service_worker_failure.delete_warning')}</p>
          </div>
          <ol className="startupGuide">
            <li>{t('common.service_worker_failure.guide_steps.clear_site_data')}</li>
            <li>{t('common.service_worker_failure.guide_steps.reopen')}</li>
          </ol>
        </section>
      </section>
    </main>
  );
}

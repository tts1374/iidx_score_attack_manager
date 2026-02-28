import React from 'react';
import { useTranslation } from 'react-i18next';

interface ImportTournamentPageProps {
  songMasterReady: boolean;
  songMasterMessage: string | null;
  busy: boolean;
  onImportPayload: (text: string) => Promise<void>;
  onImportFile: (file: File) => Promise<void>;
}

export function ImportTournamentPage(props: ImportTournamentPageProps): JSX.Element {
  const { t } = useTranslation();
  const [importText, setImportText] = React.useState('');
  const importDisabled = !props.songMasterReady || props.busy;

  return (
    <div className="page">
      {!props.songMasterReady && (
        <section className="warningBox">
          <p>{t('import.warning.song_master_unavailable')}</p>
          {props.songMasterMessage && <p>{props.songMasterMessage}</p>}
          <p>{t('import.warning.song_master_action')}</p>
        </section>
      )}

      <section className="detailCard importSection">
        <h2>{t('import.title')}</h2>
        <p className="hintText">{t('import.description')}</p>
        <textarea
          placeholder={t('import.input.url_placeholder')}
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          rows={4}
        />
        <div className="rowActions">
          <button
            disabled={importDisabled || importText.trim().length === 0}
            onClick={async () => {
              await props.onImportPayload(importText);
              setImportText('');
            }}
          >
            {t('import.action.import_text')}
          </button>
          <label className={`fileButton ${importDisabled ? 'disabled' : ''}`}>
            {t('import.action.import_file')}
            <input
              type="file"
              accept="image/*,.txt,.json"
              disabled={importDisabled}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                await props.onImportFile(file);
                event.target.value = '';
              }}
            />
          </label>
        </div>
      </section>
    </div>
  );
}

import React from 'react';

interface ImportTournamentPageProps {
  songMasterReady: boolean;
  songMasterMessage: string | null;
  busy: boolean;
  onImportPayload: (text: string) => Promise<void>;
  onImportFile: (file: File) => Promise<void>;
  onRefreshSongMaster: () => Promise<void>;
}

export function ImportTournamentPage(props: ImportTournamentPageProps): JSX.Element {
  const [importText, setImportText] = React.useState('');
  const importDisabled = !props.songMasterReady || props.busy;

  return (
    <div className="page">
      {!props.songMasterReady && (
        <section className="warningBox">
          <p>曲マスタが未取得のため、大会取込は利用できません。</p>
          {props.songMasterMessage && <p>{props.songMasterMessage}</p>}
          <button onClick={props.onRefreshSongMaster} disabled={props.busy}>
            曲データ更新
          </button>
        </section>
      )}

      <section className="detailCard importSection">
        <h2>大会取込</h2>
        <p className="hintText">URL またはペイロード文字列、もしくは画像/テキストファイルを取り込めます。</p>
        <textarea
          placeholder="URLまたはペイロードを貼り付け"
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
            テキスト取込
          </button>
          <label className={`fileButton ${importDisabled ? 'disabled' : ''}`}>
            ファイル取込
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


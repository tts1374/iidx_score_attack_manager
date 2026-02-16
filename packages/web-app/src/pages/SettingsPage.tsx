import React from 'react';

interface SettingsPageProps {
  songMasterMeta: Record<string, string | null>;
  autoDeleteEnabled: boolean;
  autoDeleteDays: number;
  busy: boolean;
  onBack: () => void;
  onCheckUpdate: (force: boolean) => Promise<void>;
  onSaveAutoDelete: (enabled: boolean, days: number) => Promise<void>;
  onRunAutoDelete: () => Promise<void>;
}

export function SettingsPage(props: SettingsPageProps): JSX.Element {
  const [enabled, setEnabled] = React.useState(props.autoDeleteEnabled);
  const [days, setDays] = React.useState(props.autoDeleteDays);

  React.useEffect(() => {
    setEnabled(props.autoDeleteEnabled);
    setDays(props.autoDeleteDays);
  }, [props.autoDeleteEnabled, props.autoDeleteDays]);

  return (
    <div className="page">      <section className="detailCard">
        <h2>曲マスタ情報</h2>
        <dl className="settingsGrid">
          <dt>file_name</dt>
          <dd>{props.songMasterMeta.song_master_file_name ?? '-'}</dd>
          <dt>schema_version</dt>
          <dd>{props.songMasterMeta.song_master_schema_version ?? '-'}</dd>
          <dt>sha256</dt>
          <dd>{props.songMasterMeta.song_master_sha256 ?? '-'}</dd>
          <dt>byte_size</dt>
          <dd>{props.songMasterMeta.song_master_byte_size ?? '-'}</dd>
          <dt>updated_at</dt>
          <dd>{props.songMasterMeta.song_master_updated_at ?? '-'}</dd>
          <dt>downloaded_at</dt>
          <dd>{props.songMasterMeta.song_master_downloaded_at ?? '-'}</dd>
        </dl>
        <div className="rowActions">
          <button disabled={props.busy} onClick={() => props.onCheckUpdate(false)}>
            更新確認
          </button>
          <button disabled={props.busy} onClick={() => props.onCheckUpdate(true)}>
            強制更新
          </button>
        </div>
      </section>

      <section className="detailCard">
        <h2>画像自動削除</h2>
        <label>
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          終了後N日で画像削除を有効化
        </label>
        <label>
          N日
          <input
            type="number"
            min={1}
            value={days}
            onChange={(event) => setDays(Number(event.target.value) || 1)}
          />
        </label>

        <div className="rowActions">
          <button
            disabled={props.busy}
            onClick={() => {
              void props.onSaveAutoDelete(enabled, days);
            }}
          >
            設定保存
          </button>
          <button disabled={props.busy} onClick={() => props.onRunAutoDelete()}>
            今すぐ削除実行
          </button>
        </div>
      </section>    </div>
  );
}

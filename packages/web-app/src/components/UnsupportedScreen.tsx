import { useTranslation } from 'react-i18next';

interface UnsupportedScreenProps {
  title: string;
  reasons: string[];
}

export function UnsupportedScreen(props: UnsupportedScreenProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <main className="page unsupported">
      <h1>{props.title}</h1>
      <p>{t('common.unsupported_browser_environment_message')}</p>
      <ul>
        {props.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </main>
  );
}

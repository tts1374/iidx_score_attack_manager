interface UnsupportedScreenProps {
  title: string;
  reasons: string[];
}

export function UnsupportedScreen(props: UnsupportedScreenProps): JSX.Element {
  return (
    <main className="page unsupported">
      <h1>{props.title}</h1>
      <p>このブラウザ環境では起動できません。</p>
      <ul>
        {props.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </main>
  );
}

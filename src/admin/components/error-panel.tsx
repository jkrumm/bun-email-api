export function ErrorPanel({
  name,
  message,
}: {
  name: string;
  message: string;
}) {
  return (
    <div className="error-panel">
      <p className="eyebrow">Resend error</p>
      <p>
        <strong>{name}</strong>: {message}
      </p>
    </div>
  );
}

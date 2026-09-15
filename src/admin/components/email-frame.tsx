export function EmailFrame({ html }: { html: string }) {
  return (
    // Empty sandbox: no scripts, no same-origin. React escapes the srcDoc
    // attribute value, so untrusted email HTML never breaks out of it.
    <iframe
      sandbox=""
      srcDoc={html}
      className="email-frame"
      title="email preview"
    />
  );
}

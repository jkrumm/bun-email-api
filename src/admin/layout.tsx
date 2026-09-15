import type { ReactNode } from "react";

export type AdminTab = "sent" | "received" | "filtered" | "templates";

const TABS: { id: AdminTab; label: string; href: string }[] = [
  { id: "sent", label: "Sent", href: "/admin/sent" },
  { id: "received", label: "Received", href: "/admin/received" },
  { id: "filtered", label: "Filtered", href: "/admin/filtered" },
  { id: "templates", label: "Templates", href: "/admin/templates" },
];

// Kept intentionally plain: no client JS, so there is nothing to escape or
// sandbox here beyond the static string below.
const STYLES = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #f5f2eb;
    color: #203b3e;
    font: 14px/1.5 system-ui, -apple-system, sans-serif;
  }
  h1, h2, h3 { font-family: Georgia, serif; font-weight: 400; margin: 0 0 16px; }
  a { color: #95754d; }
  .nav {
    display: flex;
    align-items: center;
    gap: 32px;
    padding: 16px 32px;
    border-bottom: 1px solid #d7d8cf;
    background: #e6e8de;
  }
  .wordmark { font-family: Georgia, serif; font-size: 18px; }
  .tabs { display: flex; gap: 24px; }
  .tab { text-decoration: none; color: #56615d; padding-bottom: 4px; }
  .tab.active { color: #203b3e; border-bottom: 2px solid #95754d; }
  .main { padding: 32px; max-width: 1100px; margin: 0 auto; }
  .eyebrow {
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.17em;
    color: #56615d;
    margin: 0 0 16px;
  }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #d7d8cf; font-size: 13px; }
  th { text-transform: uppercase; font-size: 11px; letter-spacing: 0.1em; color: #56615d; }
  .pill {
    display: inline-block;
    padding: 2px 8px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .pill-outline { border: 1px solid #56615d; color: #56615d; }
  .pill-fill { background: #95754d; color: #f5f2eb; }
  .email-frame { width: 100%; height: 900px; border: 1px solid #d7d8cf; background: #fff; }
  .panel { background: #e6e8de; border: 1px solid #d7d8cf; padding: 16px; }
  .error-panel { background: #e6e8de; border: 1px solid #95754d; padding: 16px; }
  dl { display: grid; grid-template-columns: 140px 1fr; gap: 6px 12px; margin: 0 0 24px; }
  dt { color: #56615d; }
  dd { margin: 0; }
  .empty { color: #56615d; padding: 32px 0; }
  .actions { margin: 16px 0; }
  details summary { cursor: pointer; color: #95754d; }
  pre { white-space: pre-wrap; word-break: break-word; }
`;

export function AdminLayout({
  title,
  active,
  children,
}: {
  title: string;
  active: AdminTab;
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${title} · Mail Admin`}</title>
        <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      </head>
      <body>
        <nav className="nav">
          <span className="wordmark">Mail</span>
          <div className="tabs">
            {TABS.map((tab) => (
              <a
                key={tab.id}
                className={tab.id === active ? "tab active" : "tab"}
                href={tab.href}
                aria-current={tab.id === active ? "page" : undefined}
              >
                {tab.label}
              </a>
            ))}
          </div>
        </nav>
        <main className="main">{children}</main>
      </body>
    </html>
  );
}

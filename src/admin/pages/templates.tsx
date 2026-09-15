import { createElement } from "react";
import { render } from "react-email";
import { emailRegistry, type EmailTemplateEntry } from "../../emails/registry";
import { AdminLayout } from "../layout";
import { EmailFrame } from "../components/email-frame";

type RegistryEntry = (typeof emailRegistry)[number];

export function TemplatesListPage() {
  return (
    <AdminLayout title="Templates" active="templates">
      <h1>Templates</h1>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>ID</th>
          </tr>
        </thead>
        <tbody>
          {emailRegistry.map((entry) => (
            <tr key={entry.id}>
              <td>
                <a href={`/admin/templates/${entry.id}`}>{entry.name}</a>
              </td>
              <td>{entry.id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminLayout>
  );
}

export function TemplateNotFoundPage({ id }: { id: string }) {
  return (
    <AdminLayout title="Template not found" active="templates">
      <h1>Template not found</h1>
      <p>No template registered with id "{id}".</p>
    </AdminLayout>
  );
}

export async function renderTemplateHtml(
  entry: RegistryEntry,
): Promise<string> {
  // Registry entries are heterogeneous per-template Props; the union type
  // `.find()` returns can't be proven pairwise-consistent to TS, but by
  // construction each entry's component and previewProps always match.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { component, previewProps } = entry as EmailTemplateEntry<any>;
  return render(createElement(component, previewProps));
}

export function TemplateDetailPage({
  entry,
  html,
}: {
  entry: RegistryEntry;
  html: string;
}) {
  return (
    <AdminLayout title={entry.name} active="templates">
      <h1>{entry.name}</h1>
      <p className="eyebrow">{entry.id}</p>
      <EmailFrame html={html} />
      <p className="actions">
        <a href={`/admin/templates/${entry.id}/raw`}>Raw HTML</a>
      </p>
      <details>
        <summary>Preview props</summary>
        <pre>{JSON.stringify(entry.previewProps, null, 2)}</pre>
      </details>
    </AdminLayout>
  );
}

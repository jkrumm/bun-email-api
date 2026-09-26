// Component CSS for the admin dashboard. Tokens (--vx-*) come from
// basalt-ui/tokens (see assets.ts); this file only styles our own markup.
// Kept intentionally plain: no client JS, so nothing here is escaped/sandboxed
// beyond what render.ts already does for page content.
export const STYLES = `
  * { box-sizing: border-box; }
  html { color-scheme: light dark; }
  body {
    margin: 0;
    background: var(--vx-surface-bg);
    color: var(--vx-ink);
    font-family: 'Nunito Sans Variable', system-ui, -apple-system, sans-serif;
    font-size: 15px;
    line-height: 1.5;
  }
  h1, h2, h3 {
    font-family: 'Hubot Sans Variable', system-ui, -apple-system, sans-serif;
    font-weight: 550;
    font-stretch: 88%;
    margin: 0 0 4px;
  }
  a { color: var(--vx-accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .mono {
    font-family: 'JetBrains Mono Variable', ui-monospace, monospace;
    font-variant-numeric: tabular-nums;
  }

  .app-shell { display: flex; flex-direction: column; min-height: 100vh; }
  .app-header {
    height: 44px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 0 16px;
    background: var(--vx-surface-panel);
    border-bottom: 1px solid var(--vx-divider);
  }
  .wordmark {
    font-family: 'Hubot Sans Variable', system-ui, sans-serif;
    font-weight: 550;
    font-stretch: 88%;
    font-size: 16px;
    color: var(--vx-ink);
  }
  .search-form { flex: 1; max-width: 360px; }
  .app-body { display: flex; flex: 1; min-height: 0; }
  .app-sidebar {
    width: 232px;
    flex-shrink: 0;
    padding: 16px 12px;
    border-right: 1px solid var(--vx-divider);
  }
  .nav-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: var(--vx-radius-ctrl);
    color: var(--vx-muted);
    border-left: 2px solid transparent;
    font-size: 13.5px;
  }
  .nav-item:hover { background: var(--vx-surface-panel-hover); text-decoration: none; }
  .nav-item.active {
    background: var(--vx-surface-panel-hover);
    color: var(--vx-ink);
    border-left-color: var(--vx-accent);
  }
  .nav-item svg { flex-shrink: 0; }
  .nav-badge {
    margin-left: auto;
    font-family: 'JetBrains Mono Variable', ui-monospace, monospace;
    font-size: 11px;
    padding: 1px 6px;
    border-radius: var(--vx-radius-pill);
    background: var(--vx-fill-red);
    color: #fff;
  }
  .app-content { flex: 1; min-width: 0; padding: 20px; max-width: 1200px; }

  @media (max-width: 800px) {
    .app-body { flex-direction: column; }
    .app-sidebar {
      width: 100%;
      border-right: none;
      border-bottom: 1px solid var(--vx-divider);
      padding: 8px 12px;
      overflow-x: auto;
    }
    .nav-list { flex-direction: row; }
    .nav-item { border-left: none; border-bottom: 2px solid transparent; white-space: nowrap; }
    .nav-item.active { border-bottom-color: var(--vx-accent); }
  }

  .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
  .page-title { font-size: 18px; margin: 0; }
  .page-subtitle { font-size: 13.5px; color: var(--vx-faint); margin: 2px 0 0; }
  .page-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }

  .notice {
    margin: 0 0 16px;
    padding: 8px 12px;
    border-radius: var(--vx-radius-ctrl);
    background: color-mix(in srgb, var(--vx-status-good) 14%, var(--vx-surface-panel));
    color: var(--vx-ink);
    font-size: 13.5px;
  }
  .notice-error {
    background: color-mix(in srgb, var(--vx-status-bad) 14%, var(--vx-surface-panel));
  }

  .stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px; }
  @media (min-width: 900px) { .stat-grid { grid-template-columns: repeat(4, 1fr); } }
  .stat-tile {
    position: relative;
    background: var(--vx-surface-panel);
    border-radius: var(--vx-radius-card);
    box-shadow: var(--vx-shadow-card);
    padding: 11px 13px;
    padding-left: 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .stat-tile-bar { position: absolute; top: 0; left: 0; bottom: 0; width: 3px; border-radius: var(--vx-radius-card) 0 0 var(--vx-radius-card); }
  .stat-tile-bar-good { background: var(--vx-good-solid); }
  .stat-tile-bar-warn { background: var(--vx-warn-solid); }
  .stat-tile-bar-bad { background: var(--vx-bad-solid); }
  .stat-label {
    font-family: 'Hubot Sans Variable', system-ui, sans-serif;
    font-size: 13.5px;
    font-weight: 550;
    color: var(--vx-muted);
  }
  .stat-value {
    font-family: 'JetBrains Mono Variable', ui-monospace, monospace;
    font-variant-numeric: tabular-nums;
    font-size: 24px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .card {
    background: var(--vx-surface-panel);
    border-radius: var(--vx-radius-card);
    box-shadow: var(--vx-shadow-card);
    padding: 11px 13px;
    margin-bottom: 16px;
  }
  .card-title { font-size: 13.5px; font-weight: 550; color: var(--vx-muted); margin: 0 0 8px; }
  .panel-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
  @media (min-width: 900px) { .panel-grid { grid-template-columns: 1fr 1fr; } }
  .panel-grid-top { align-items: start; }

  .card-header-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
  .card-header-row .card-title { margin: 0; }
  .chart-legend { display: flex; gap: 10px; font-size: 11px; color: var(--vx-faint); flex-shrink: 0; }
  .legend-item { display: inline-flex; align-items: center; gap: 4px; }
  .legend-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; }
  .legend-dot-indigo { background: var(--vx-fill-indigo); }
  .legend-dot-teal { background: var(--vx-fill-teal); }

  .category-bars { display: flex; flex-direction: column; gap: 8px; }
  .category-bar-row { display: grid; grid-template-columns: 90px 1fr 44px; align-items: center; gap: 8px; font-size: 13px; }
  .category-bar-track { display: block; height: 8px; border-radius: var(--vx-radius-pill); background: var(--vx-surface-subtle); overflow: hidden; }
  .category-bar-fill { display: block; height: 100%; border-radius: var(--vx-radius-pill); }
  .category-bar-count { text-align: right; }

  .filter-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 10px;
    margin-bottom: 16px;
    padding: 11px 13px;
    background: var(--vx-surface-panel);
    border-radius: var(--vx-radius-card);
    box-shadow: var(--vx-shadow-card);
  }
  .field { display: flex; flex-direction: column; gap: 4px; }
  .field label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--vx-faint); }
  .control {
    height: 2rem;
    padding: 0 8px;
    border-radius: var(--vx-radius-ctrl);
    border: 1px solid var(--vx-surface-border);
    background: var(--vx-surface-elevated);
    color: var(--vx-ink);
    font-size: 13.5px;
    font-family: inherit;
  }
  .control:focus, .btn:focus, .seg-option:focus-within { outline: 2px solid var(--vx-accent); outline-offset: 1px; }
  .checkbox-field { flex-direction: row; align-items: center; gap: 6px; }
  .checkbox-field label { text-transform: none; letter-spacing: normal; font-size: 13.5px; color: var(--vx-ink); }

  .seg { display: inline-flex; border: 1px solid var(--vx-surface-border); border-radius: var(--vx-radius-ctrl); overflow: hidden; background: var(--vx-surface-elevated); }
  .seg-option {
    display: flex;
    align-items: center;
    padding: 0 10px;
    height: 2rem;
    font-size: 13px;
    color: var(--vx-muted);
    cursor: pointer;
    border-right: 1px solid var(--vx-surface-border);
  }
  .seg-option:last-child { border-right: none; }
  .seg-option input { position: absolute; opacity: 0; pointer-events: none; }
  .seg-option:has(input:checked), .seg-option.active {
    background: var(--vx-accent-fill);
    color: var(--vx-on-accent);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 2rem;
    padding: 0 12px;
    border-radius: var(--vx-radius-ctrl);
    border: 1px solid var(--vx-surface-border);
    background: var(--vx-surface-elevated);
    color: var(--vx-ink);
    font-size: 13.5px;
    font-family: inherit;
    cursor: pointer;
  }
  .btn:hover { background: var(--vx-surface-panel-hover); text-decoration: none; }
  .btn-primary { background: var(--vx-accent-fill); border-color: transparent; color: var(--vx-on-accent); }
  .btn-primary:hover { background: var(--vx-accent-fill-hover); }

  .table-wrap { background: var(--vx-surface-panel); border-radius: var(--vx-radius-card); box-shadow: var(--vx-shadow-card); overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  thead th {
    height: 36px;
    text-align: left;
    padding: 0 12px;
    font-family: 'JetBrains Mono Variable', ui-monospace, monospace;
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--vx-faint);
    border-bottom: 1px solid var(--vx-divider);
  }
  tbody tr { border-bottom: 1px solid var(--vx-divider); }
  tbody tr:last-child { border-bottom: none; }
  tbody tr:hover { background: var(--vx-surface-panel-hover); }
  td { padding: 10px 12px; font-size: 13.5px; vertical-align: top; }
  .row-link { position: relative; display: block; color: var(--vx-ink); font-weight: 600; }
  .row-link::after { content: ''; position: absolute; inset: -10px -12px; }
  .row-link:hover { text-decoration: none; }
  .date-cell {
    white-space: nowrap;
    font-family: 'JetBrains Mono Variable', ui-monospace, monospace;
    font-variant-numeric: tabular-nums;
  }
  .date-cell-end { text-align: right; color: var(--vx-faint); }
  .col-shrink { width: 1%; white-space: nowrap; }
  .counterpart-cell {
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .summary-line {
    color: var(--vx-faint);
    font-size: 12.5px;
    margin: 2px 0 0;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 20px;
    padding: 0 7px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }
  .badge-gray { background: color-mix(in srgb, var(--vx-fill-gray) 16%, transparent); color: color-mix(in srgb, var(--vx-fill-gray) 55%, var(--vx-ink)); }
  .badge-red { background: color-mix(in srgb, var(--vx-fill-red) 16%, transparent); color: color-mix(in srgb, var(--vx-fill-red) 55%, var(--vx-ink)); }
  .badge-pink { background: color-mix(in srgb, var(--vx-fill-pink) 16%, transparent); color: color-mix(in srgb, var(--vx-fill-pink) 55%, var(--vx-ink)); }
  .badge-grape { background: color-mix(in srgb, var(--vx-fill-grape) 16%, transparent); color: color-mix(in srgb, var(--vx-fill-grape) 55%, var(--vx-ink)); }
  .badge-violet { background: color-mix(in srgb, var(--vx-fill-violet) 16%, transparent); color: color-mix(in srgb, var(--vx-fill-violet) 55%, var(--vx-ink)); }
  .badge-indigo { background: color-mix(in srgb, var(--vx-fill-indigo) 16%, transparent); color: color-mix(in srgb, var(--vx-fill-indigo) 55%, var(--vx-ink)); }
  .badge-cyan { background: color-mix(in srgb, var(--vx-fill-cyan) 16%, transparent); color: color-mix(in srgb, var(--vx-fill-cyan) 55%, var(--vx-ink)); }
  .badge-teal { background: color-mix(in srgb, var(--vx-fill-teal) 16%, transparent); color: color-mix(in srgb, var(--vx-fill-teal) 55%, var(--vx-ink)); }
  .badge-green { background: color-mix(in srgb, var(--vx-fill-green) 16%, transparent); color: color-mix(in srgb, var(--vx-fill-green) 55%, var(--vx-ink)); }
  .badge-lime { background: color-mix(in srgb, var(--vx-fill-lime) 16%, transparent); color: color-mix(in srgb, var(--vx-fill-lime) 55%, var(--vx-ink)); }
  .badge-yellow { background: color-mix(in srgb, var(--vx-fill-yellow) 16%, transparent); color: color-mix(in srgb, var(--vx-fill-yellow) 55%, var(--vx-ink)); }
  .badge-orange { background: color-mix(in srgb, var(--vx-fill-orange) 16%, transparent); color: color-mix(in srgb, var(--vx-fill-orange) 55%, var(--vx-ink)); }
  .badge-outline { background: transparent; border: 1px solid var(--vx-surface-border); color: var(--vx-muted); }
  .badge-good { background: color-mix(in srgb, var(--vx-good-solid) 16%, transparent); color: var(--vx-good-solid); }
  .badge-warn { background: color-mix(in srgb, var(--vx-warn-solid) 16%, transparent); color: var(--vx-warn-solid); }
  .badge-bad { background: color-mix(in srgb, var(--vx-bad-solid) 16%, transparent); color: var(--vx-bad-solid); }

  .priority-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; }
  .priority-dot-high { background: var(--vx-bad-solid); }
  .priority-dot-low { background: var(--vx-faint); }

  .direction-icon { font-size: 14px; color: var(--vx-muted); }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }

  .empty-state { text-align: center; padding: 48px 16px; }
  .empty-title { font-size: 18px; font-weight: 550; margin: 0 0 6px; }
  .empty-body { font-size: 15px; color: var(--vx-muted); max-width: 22.5rem; margin: 0 auto; }

  dl.meta-grid { display: grid; grid-template-columns: 130px 1fr; gap: 6px 12px; margin: 0; font-size: 13.5px; }
  dl.meta-grid dt { color: var(--vx-faint); }
  dl.meta-grid dd { margin: 0; }
  dl.fact-grid { display: grid; grid-template-columns: 140px 1fr; gap: 4px 12px; margin: 0; font-size: 13px; }
  dl.fact-grid dt { color: var(--vx-faint); }
  dl.fact-grid dd { margin: 0; }

  .meter { position: relative; height: 4px; width: 60px; border-radius: var(--vx-radius-pill); background: var(--vx-surface-subtle); overflow: hidden; display: inline-block; vertical-align: middle; margin-left: 6px; }
  .meter-fill { position: absolute; inset: 0; border-radius: var(--vx-radius-pill); background: var(--vx-accent); }

  details summary { cursor: pointer; color: var(--vx-accent); font-size: 13px; }
  pre { white-space: pre-wrap; word-break: break-word; font-family: 'JetBrains Mono Variable', ui-monospace, monospace; font-size: 12.5px; }

  .email-frame { width: 100%; height: min(70vh, 720px); border: 1px solid var(--vx-surface-border); border-radius: var(--vx-radius-card); background: #fff; }

  .pagination { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; font-size: 13.5px; }
  .back-link { display: inline-block; margin-bottom: 12px; font-size: 13px; color: var(--vx-muted); }
  .suggested-action {
    padding: 8px 10px;
    border-radius: var(--vx-radius-ctrl);
    background: color-mix(in srgb, var(--vx-accent) 10%, transparent);
    font-size: 13.5px;
    margin: 8px 0;
  }
`;

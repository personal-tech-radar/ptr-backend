// Shared minimal HTML response page for unguarded, token/signature-based endpoints reached from
// email links (feedback clicks, save-from-email) — these always render HTML, never JSON, even on
// failure, since the "user" here is a browser tab opened from an email, not an API caller.
export function htmlPage(title: string, message: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f9fafb;}
.card{text-align:center;padding:40px;background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.1);}
h1{font-size:18px;color:#111827;margin:0 0 8px;}p{font-size:14px;color:#6b7280;margin:0;}</style>
</head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

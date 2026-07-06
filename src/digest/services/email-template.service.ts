import { Injectable } from '@nestjs/common';
import { DigestStats } from '../digest.types';

export interface DigestEmailItem {
  position: number;
  title: string;
  sourceName: string;
  shortSummary: string;
  whyItMatters?: string;
  url: string;
  matchedInterests?: string[];
  articleId?: string;
}

const FONT_URL =
  'https://fonts.googleapis.com/css2?family=Google+Sans+Code:ital,wght@0,400;0,500;0,700;1,400&display=swap';

const FONT_STACK =
  "'Google Sans Code',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,monospace";

const STYLES = {
  body: `font-family:${FONT_STACK};max-width:640px;margin:0 auto;padding:0;background:#ffffff;color:#111827;`,
  header:
    'display:flex;align-items:center;padding:28px 32px 20px;border-bottom:2px solid #f3f4f6;margin-bottom:28px;',
  brand: 'margin-left:12px;font-size:15px;font-weight:700;color:#111827;letter-spacing:-0.01em;',
  content: 'padding:0 32px 32px;',
  subject:
    'font-size:13px;font-weight:500;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px 0;',
  intro:
    'font-size:14px;color:#374151;margin:0 0 32px 0;line-height:1.7;border-bottom:1px solid #f3f4f6;padding-bottom:24px;',
  item: 'margin-bottom:28px;padding-bottom:24px;border-bottom:1px solid #f3f4f6;',
  itemTitle: 'margin:0 0 3px 0;font-size:15px;font-weight:600;color:#111827;',
  itemSource:
    'margin:0 0 10px 0;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;',
  itemSummary: 'margin:0 0 4px 0;font-size:14px;color:#374151;line-height:1.6;',
  itemWhy: 'margin:0 0 8px 0;font-size:13px;color:#6b7280;line-height:1.5;',
  interests: 'font-size:12px;color:#9ca3af;margin:0 0 8px 0;',
  link: 'font-size:12px;color:#2563eb;text-decoration:none;word-break:break-all;',
  feedbackRow: 'margin-top:10px;',
  feedbackBtn:
    'display:inline-block;padding:4px 12px;border-radius:4px;font-size:12px;font-weight:500;text-decoration:none;margin-right:8px;',
  feedbackUseful: 'background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;',
  feedbackNot: 'background:#fef2f2;color:#991b1b;border:1px solid #fecaca;',
  stats:
    'margin-top:24px;padding:16px;background:#f9fafb;border-radius:8px;border:1px solid #f3f4f6;',
  statsLabel:
    'font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px 0;',
  statsRow: 'font-size:12px;color:#6b7280;margin:4px 0;',
  statsNum: 'font-weight:600;color:#374151;',
  footer: 'padding:20px 32px 28px;border-top:1px solid #f3f4f6;text-align:center;',
  footerText: 'font-size:11px;color:#d1d5db;margin:0;',
  footerLink: 'color:#9ca3af;text-decoration:none;',
};

@Injectable()
export class EmailTemplateService {
  renderHtml(
    subject: string,
    intro: string,
    items: DigestEmailItem[],
    stats?: DigestStats,
  ): string {
    const renderedItems = items.map((item) => this.renderItemHtml(item)).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
  <link href="${FONT_URL}" rel="stylesheet">
</head>
<body style="${STYLES.body}">
  <div style="${STYLES.header}">
    <span style="font-size:32px;line-height:1;">📡</span>
    <span style="${STYLES.brand}">Personal Tech Radar</span>
  </div>
  <div style="${STYLES.content}">
    <p style="${STYLES.subject}">${escapeHtml(subject)}</p>
    <p style="${STYLES.intro}">${escapeHtml(intro)}</p>
    ${renderedItems}
    ${stats ? this.renderStatsHtml(stats) : ''}
  </div>
  <div style="${STYLES.footer}">
    <p style="${STYLES.footerText}">Personal Tech Radar &nbsp;·&nbsp; <a href="https://personalradar.dev" style="${STYLES.footerLink}">personalradar.dev</a></p>
  </div>
</body>
</html>`;
  }

  renderText(
    subject: string,
    intro: string,
    items: DigestEmailItem[],
    stats?: DigestStats,
  ): string {
    const lines: string[] = ['Personal Tech Radar', subject, '', intro, ''];
    for (const item of items) {
      lines.push(`${item.position}. ${item.title}`, item.sourceName, item.shortSummary);
      if (item.whyItMatters) lines.push(item.whyItMatters);
      lines.push(
        item.matchedInterests?.length ? item.matchedInterests.join(', ') : '',
        item.url,
        '',
      );
    }
    if (stats) {
      const label = stats.windowHours >= 168 ? 'Last 7 days' : `Last ${stats.windowHours}h`;
      lines.push(
        `── Pipeline · ${label} ──`,
        `${stats.articlesIngested} ingested · ${stats.articlesPassedPreanalysis} passed pre-analysis · ${stats.articlesAnalyzed} fully analyzed`,
        `DB: ${stats.totalArticlesInDb} total articles · ${stats.totalSourcesActive} active sources`,
        `Sources: ${stats.feedSourcesActive} feed active · ${stats.webSourcesActive} web active · ${stats.sourceCandidatesPending} candidates pending`,
        '',
      );
    }
    lines.push('', 'Personal Tech Radar · personalradar.dev');
    return lines.join('\n');
  }

  private renderItemHtml(item: DigestEmailItem): string {
    const feedbackHtml = this.renderFeedbackButtons(item);
    return `
  <div style="${STYLES.item}">
    <p style="${STYLES.itemTitle}">${item.position}. ${escapeHtml(item.title)}</p>
    <p style="${STYLES.itemSource}">${escapeHtml(item.sourceName)}</p>
    <p style="${STYLES.itemSummary}">${escapeHtml(item.shortSummary)}</p>
    ${item.whyItMatters ? `<p style="${STYLES.itemWhy}">${escapeHtml(item.whyItMatters)}</p>` : ''}
    ${item.matchedInterests?.length ? `<p style="${STYLES.interests}">${escapeHtml(item.matchedInterests.join(', '))}</p>` : ''}
    <a href="${item.url}" style="${STYLES.link}">${item.url}</a>
    ${feedbackHtml}
  </div>`;
  }

  private renderFeedbackButtons(item: DigestEmailItem): string {
    const appUrl = process.env.APP_URL;
    const token = process.env.FEEDBACK_TOKEN;
    if (!appUrl || !token || !item.articleId) return '';

    const base = `${appUrl}/articles/${item.articleId}/feedback/click?token=${encodeURIComponent(token)}`;
    return `
    <div style="${STYLES.feedbackRow}">
      <a href="${base}&type=useful" style="${STYLES.feedbackBtn}${STYLES.feedbackUseful}">👍 Useful</a>
      <a href="${base}&type=not_useful" style="${STYLES.feedbackBtn}${STYLES.feedbackNot}">👎 Not for me</a>
    </div>`;
  }

  private renderStatsHtml(stats: DigestStats): string {
    const label = stats.windowHours >= 168 ? 'Last 7 days' : `Last ${stats.windowHours}h`;
    return `
  <div style="${STYLES.stats}">
    <p style="${STYLES.statsLabel}">Pipeline · ${label}</p>
    <p style="${STYLES.statsRow}">
      <span style="${STYLES.statsNum}">${stats.articlesIngested}</span> ingested &nbsp;·&nbsp;
      <span style="${STYLES.statsNum}">${stats.articlesPassedPreanalysis}</span> passed pre-analysis &nbsp;·&nbsp;
      <span style="${STYLES.statsNum}">${stats.articlesAnalyzed}</span> fully analyzed
    </p>
    <p style="${STYLES.statsRow}">
      DB: <span style="${STYLES.statsNum}">${stats.totalArticlesInDb}</span> total articles &nbsp;·&nbsp;
      <span style="${STYLES.statsNum}">${stats.totalSourcesActive}</span> active sources
    </p>
    <p style="${STYLES.statsRow}">
      Sources: <span style="${STYLES.statsNum}">${stats.feedSourcesActive}</span> feed active &nbsp;·&nbsp;
      <span style="${STYLES.statsNum}">${stats.webSourcesActive}</span> web active &nbsp;·&nbsp;
      <span style="${STYLES.statsNum}">${stats.sourceCandidatesPending}</span> candidates pending
    </p>
  </div>`;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

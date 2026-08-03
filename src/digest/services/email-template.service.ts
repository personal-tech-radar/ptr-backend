import { Injectable } from '@nestjs/common';
import { DigestStats } from '../digest.types';

export interface DigestEmailItem {
  position: number;
  title: string;
  sourceName: string;
  shortSummary: string;
  whyItMatters?: string;
  trackingUrl: string;
  originalUrl: string;
  openUrl: string;
  usefulUrl: string;
  notUsefulUrl: string;
  matchedInterests?: string[];
  // Personal digests only — a permanent opaque Save action rendered near the main article link.
  saveUrl?: string;
}

export interface DigestEmailStreamLink {
  name: string;
  url: string;
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
  saveLink:
    'font-size:12px;color:#6b7280;text-decoration:none;margin-left:12px;white-space:nowrap;',
  streamLinks: 'margin:0 0 28px 0;padding:16px;background:#f9fafb;border:1px solid #f3f4f6;',
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
    streamLinks: DigestEmailStreamLink[] = [],
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
    ${this.renderStreamLinksHtml(streamLinks)}
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
    streamLinks: DigestEmailStreamLink[] = [],
  ): string {
    const lines: string[] = ['Personal Tech Radar', subject, '', intro, ''];
    if (streamLinks.length > 0) {
      lines.push('Browse by stream');
      for (const stream of streamLinks) lines.push(`${stream.name}: ${stream.url}`);
      lines.push('');
    }
    for (const item of items) {
      lines.push(`${item.position}. ${item.title}`, item.sourceName, item.shortSummary);
      if (item.whyItMatters) lines.push(item.whyItMatters);
      lines.push(
        item.matchedInterests?.length ? item.matchedInterests.join(', ') : '',
        `Publication: ${item.trackingUrl}`,
        `Open article: ${item.openUrl}`,
        `Useful: ${item.usefulUrl}`,
        `Not useful: ${item.notUsefulUrl}`,
      );
      if (item.saveUrl) lines.push(`Save: ${item.saveUrl}`);
      lines.push('');
    }
    if (stats) {
      const label = stats.windowHours >= 168 ? 'Last 7 days' : `Last ${stats.windowHours}h`;
      lines.push(
        `── Pipeline · ${label} ──`,
        `${stats.articlesIngested} ingested · ${stats.articlesPassedPreanalysis} passed pre-analysis · ${stats.articlesAnalyzed} fully analyzed`,
        `Period: ${stats.sourcesProcessed} sources processed · ${stats.publicationsProcessed} publications processed · ${stats.publicationsIncluded} included`,
        `DB: ${stats.totalArticlesInDb} total articles · ${stats.totalSourcesActive} active sources`,
        `Sources: ${stats.feedSourcesActive} feed active · ${stats.webSourcesActive} web active · ${stats.degradedSources} degraded · ${stats.disabledSources} disabled · ${stats.sourceCandidatesPending} candidates pending`,
        '',
      );
    }
    lines.push('', 'Personal Tech Radar · personalradar.dev');
    return lines.join('\n');
  }

  private renderItemHtml(item: DigestEmailItem): string {
    return `
  <div style="${STYLES.item}">
    <p style="${STYLES.itemTitle}">${item.position}. <a href="${item.trackingUrl}" style="${STYLES.link}">${escapeHtml(item.title)}</a></p>
    <p style="${STYLES.itemSource}">${escapeHtml(item.sourceName)}</p>
    <p style="${STYLES.itemSummary}">${escapeHtml(item.shortSummary)}</p>
    ${item.whyItMatters ? `<p style="${STYLES.itemWhy}">${escapeHtml(item.whyItMatters)}</p>` : ''}
    ${item.matchedInterests?.length ? `<p style="${STYLES.interests}">${escapeHtml(item.matchedInterests.join(', '))}</p>` : ''}
    <a href="${item.trackingUrl}" style="${STYLES.link}">${escapeHtml(item.originalUrl)}</a><br>
    <a href="${item.openUrl}" style="${STYLES.link}">Open article</a>
    <a href="${item.usefulUrl}" style="${STYLES.saveLink}">Useful</a>
    <a href="${item.notUsefulUrl}" style="${STYLES.saveLink}">Not useful</a>
    ${item.saveUrl ? `<a href="${item.saveUrl}" style="${STYLES.saveLink}">Save</a>` : ''}
  </div>`;
  }

  private renderStreamLinksHtml(streamLinks: DigestEmailStreamLink[]): string {
    if (streamLinks.length === 0) return '';
    const links = streamLinks
      .map(
        (stream) => `<a href="${stream.url}" style="${STYLES.link}">${escapeHtml(stream.name)}</a>`,
      )
      .join(' &nbsp;·&nbsp; ');
    return `<div style="${STYLES.streamLinks}"><strong>Browse by stream</strong><br>${links}</div>`;
  }

  private renderStatsHtml(stats: DigestStats): string {
    const label = stats.windowHours >= 168 ? 'Last 7 days' : `Last ${stats.windowHours}h`;
    return `
  <div style="${STYLES.stats}">
    <p style="${STYLES.statsLabel}">Pipeline · ${label}</p>
    <p style="${STYLES.statsRow}">
      Period: <span style="${STYLES.statsNum}">${stats.sourcesProcessed}</span> sources processed &nbsp;·&nbsp;
      <span style="${STYLES.statsNum}">${stats.publicationsProcessed}</span> publications processed &nbsp;·&nbsp;
      <span style="${STYLES.statsNum}">${stats.publicationsIncluded}</span> included
    </p>
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
      <span style="${STYLES.statsNum}">${stats.degradedSources}</span> degraded &nbsp;·&nbsp;
      <span style="${STYLES.statsNum}">${stats.disabledSources}</span> disabled &nbsp;·&nbsp;
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

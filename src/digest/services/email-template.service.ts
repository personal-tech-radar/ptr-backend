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
  saveUrl?: string;
}

export interface DigestEmailStreamLink {
  name: string;
  url: string;
}

const FONT_STACK =
  "'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace";
const COLORS = {
  background: '#1E1F22',
  surface: '#2D2E32',
  line: '#3A3B40',
  text: '#BCBEC3',
  muted: '#8E8F94',
  steel: '#A9B7C5',
  blue: '#57A8F5',
  green: '#6AAB73',
  orange: '#CE8E6D',
  purple: '#C87DBB',
  cyan: '#2DBBC5',
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
    const cadence = /weekly/i.test(subject) ? 'Weekly digest' : 'Daily digest';
    const renderedItems = items.map((item) => this.renderItemHtml(item)).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${escapeHtml(subject)}</title>
  <style>
    body { margin:0; padding:0; background:${COLORS.background}; color:${COLORS.text}; font-family:${FONT_STACK}; }
    a { color:${COLORS.blue}; }
  </style>
</head>
<body style="margin:0;padding:0;background:${COLORS.background};color:${COLORS.text};font-family:${FONT_STACK};">
  <div style="background:${COLORS.background};color:${COLORS.text};padding:40px 16px;box-sizing:border-box;min-height:100vh;">
    <div style="max-width:640px;margin:0 auto;">
      <div style="font-size:22px;font-weight:700;color:${COLORS.text};letter-spacing:-0.01em;margin-bottom:8px;">Personal Tech Radar<span>_</span></div>
      <div style="font-size:12px;color:${COLORS.cyan};margin-bottom:28px;">${cadence}</div>
      <div style="border-top:1px dashed ${COLORS.line};margin-bottom:28px;"></div>

      <p style="font-size:13.5px;line-height:1.85;color:${COLORS.muted};margin:0 0 36px;">${escapeHtml(intro)}</p>
      ${this.renderStreamLinksHtml(streamLinks)}
      ${renderedItems}
      ${stats ? this.renderStatsHtml(stats) : ''}

      <div style="border-top:1px dashed ${COLORS.line};margin:8px 0 28px;"></div>
      <div style="font-size:11.5px;color:${COLORS.muted};text-align:center;line-height:1.8;">
        <span>You receive this because your radar is configured for a ${cadence.toLowerCase()}.</span><br>
        <span>© 2026 Personal Tech Radar</span>
      </div>
    </div>
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
      if (item.matchedInterests?.length) lines.push(`Topics: ${item.matchedInterests.join(', ')}`);
      lines.push(
        `Publication: ${item.trackingUrl}`,
        `Useful: ${item.usefulUrl}`,
        `Not useful: ${item.notUsefulUrl}`,
      );
      if (item.saveUrl) lines.push(`Save: ${item.saveUrl}`);
      lines.push('');
    }
    if (stats) {
      const label = stats.windowHours >= 168 ? 'Last 7 days' : `Last ${stats.windowHours}h`;
      lines.push(
        `── Your radar · ${label} ──`,
        `${stats.totalSourcesActive} active sources`,
        `${stats.publicationsProcessed} articles collected`,
        `${stats.articlesAnalyzed} articles analyzed`,
        `${stats.publicationsIncluded} selected for your radar`,
        `${stats.articlesIngested} ingested · ${stats.articlesPassedPreanalysis} passed pre-analysis · ${stats.articlesAnalyzed} fully analyzed`,
        `DB: ${stats.totalArticlesInDb} total articles · ${stats.totalSourcesActive} active sources`,
        `Sources: ${stats.feedSourcesActive} feed active · ${stats.webSourcesActive} web active · ${stats.degradedSources} degraded · ${stats.disabledSources} disabled · ${stats.sourceCandidatesPending} candidates pending`,
        '',
      );
    }
    lines.push('', 'Personal Tech Radar');
    return lines.join('\n');
  }

  private renderItemHtml(item: DigestEmailItem): string {
    return `
      <div style="margin-bottom:28px;padding-bottom:24px;border-bottom:1px dashed ${COLORS.line};">
        <a href="${escapeAttribute(item.trackingUrl)}" style="display:block;text-decoration:none;color:${COLORS.text};font-size:16px;font-weight:600;line-height:1.5;margin-bottom:4px;">${item.position}. ${escapeHtml(item.title)}</a>
        <div style="font-size:11.5px;color:${COLORS.purple};margin-bottom:8px;">${escapeHtml(item.sourceName)}</div>
        <p style="font-size:13px;line-height:1.8;color:${COLORS.muted};margin:0 0 12px;">${escapeHtml(item.shortSummary)}</p>
        ${item.whyItMatters ? `<p style="font-size:12px;line-height:1.7;color:${COLORS.steel};margin:0 0 12px;">${escapeHtml(item.whyItMatters)}</p>` : ''}
        ${item.matchedInterests?.length ? `<div style="font-size:11.5px;color:${COLORS.cyan};margin:0 0 12px;">${escapeHtml(item.matchedInterests.join(' · '))}</div>` : ''}
        <div style="font-size:11.5px;line-height:1.8;margin-bottom:12px;">
          <a href="${escapeAttribute(item.trackingUrl)}" style="color:${COLORS.blue};word-break:break-all;">${escapeHtml(item.originalUrl)}</a>
        </div>
        <div style="font-size:11.5px;line-height:1.8;">
          <a href="${escapeAttribute(item.usefulUrl)}" style="color:${COLORS.green};text-decoration:none;border:1px solid ${COLORS.green};padding:6px 12px;margin:0 6px 6px 0;display:inline-block;">[+] Useful</a>
          <a href="${escapeAttribute(item.notUsefulUrl)}" style="color:${COLORS.muted};text-decoration:none;border:1px solid ${COLORS.line};padding:6px 12px;margin:0 6px 6px 0;display:inline-block;">[-] Not useful</a>
          ${item.saveUrl ? `<a href="${escapeAttribute(item.saveUrl)}" style="color:${COLORS.orange};text-decoration:none;border:1px solid ${COLORS.orange};padding:6px 12px;margin:0 6px 6px 0;display:inline-block;">[x] Save</a>` : ''}
        </div>
      </div>`;
  }

  private renderStreamLinksHtml(streamLinks: DigestEmailStreamLink[]): string {
    if (streamLinks.length === 0) return '';
    const links = streamLinks
      .map(
        (stream) =>
          `<a href="${escapeAttribute(stream.url)}" style="color:${COLORS.blue};">${escapeHtml(stream.name)}</a>`,
      )
      .join(' &nbsp;·&nbsp; ');
    return `<div style="margin:0 0 28px;padding:14px 16px;background:${COLORS.surface};border:1px solid ${COLORS.line};font-size:11.5px;line-height:1.8;"><strong style="color:${COLORS.steel};">Browse by stream</strong><br>${links}</div>`;
  }

  private renderStatsHtml(stats: DigestStats): string {
    const label = stats.windowHours >= 168 ? 'Last 7 days' : `Last ${stats.windowHours}h`;
    const row = (value: number, labelText: string) =>
      `<div style="font-size:13px;line-height:2;"><span style="color:${COLORS.cyan};">${value}</span> ${labelText}</div>`;
    return `<div style="margin:8px 0 32px;color:${COLORS.text};">
      <div style="font-size:12px;color:${COLORS.muted};margin-bottom:12px;letter-spacing:0.04em;">Your radar · ${label}</div>
      ${row(stats.totalSourcesActive, 'active sources')}
      ${row(stats.publicationsProcessed, 'articles collected')}
      ${row(stats.articlesAnalyzed, 'articles analyzed')}
      ${row(stats.publicationsIncluded, 'selected for your radar')}
      <div style="font-size:11.5px;line-height:1.8;color:${COLORS.muted};margin-top:10px;">${stats.articlesIngested} ingested · ${stats.articlesPassedPreanalysis} passed pre-analysis · ${stats.articlesAnalyzed} fully analyzed</div>
      <div style="font-size:11.5px;line-height:1.8;color:${COLORS.muted};">DB: ${stats.totalArticlesInDb} total articles · ${stats.totalSourcesActive} active sources</div>
      <div style="font-size:11.5px;line-height:1.8;color:${COLORS.muted};">Sources: ${stats.feedSourcesActive} feed active · ${stats.webSourcesActive} web active · ${stats.degradedSources} degraded · ${stats.disabledSources} disabled · ${stats.sourceCandidatesPending} candidates pending</div>
    </div>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

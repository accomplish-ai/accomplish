import slackIcon from '/assets/icons/integrations/slack.png';
import chromeIcon from '/assets/icons/integrations/chrome.png';
import notionIcon from '/assets/icons/integrations/notion.png';
import googleDocsIcon from '/assets/icons/integrations/google-docs.png';
import googleCalendarIcon from '/assets/icons/integrations/google-calendar.png';
import googleSheetsIcon from '/assets/icons/integrations/google-sheets.png';
import googleSlidesIcon from '/assets/icons/integrations/google-slides.png';
import gmailIcon from '/assets/icons/integrations/gmail.png';
import linkedinIcon from '/assets/icons/integrations/linkedin.png';
import eventbriteIcon from '/assets/icons/integrations/eventbrite.png';
import yahooFinanceIcon from '/assets/icons/integrations/yahoo-finance.png';

export const ICON_MAP: Record<string, string> = {
  'slack.com': slackIcon,
  'google.com': chromeIcon,
  'notion.so': notionIcon,
  'docs.google.com': googleDocsIcon,
  'calendar.google.com': googleCalendarIcon,
  'sheets.google.com': googleSheetsIcon,
  'slides.google.com': googleSlidesIcon,
  'mail.google.com': gmailIcon,
  'linkedin.com': linkedinIcon,
  'eventbrite.com': eventbriteIcon,
  'finance.yahoo.com': yahooFinanceIcon,
};

/**
 * Resolve a domain to a local icon URL if available, checking the exact domain
 * and then walking up parent domains (e.g. "accomplish-ai.slack.com" → "slack.com").
 */
export function getLocalIcon(domain: string): string | undefined {
  if (ICON_MAP[domain]) {
    return ICON_MAP[domain];
  }
  // Try with ".com" appended for truncated domains (e.g. "calendar.google" → "calendar.google.com")
  if (ICON_MAP[`${domain}.com`]) {
    return ICON_MAP[`${domain}.com`];
  }
  const parts = domain.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join('.');
    if (ICON_MAP[parent]) {
      return ICON_MAP[parent];
    }
  }
  return undefined;
}

export function getFaviconUrl(domain: string, size: number = 16): string {
  const encodedDomain = encodeURIComponent(domain);
  return (
    getLocalIcon(domain) ?? `https://www.google.com/s2/favicons?domain=${encodedDomain}&sz=${size}`
  );
}

export function IntegrationIcon({ domain, className }: { domain: string; className?: string }) {
  const encodedDomain = encodeURIComponent(domain);
  const src =
    getLocalIcon(domain) ?? `https://www.google.com/s2/favicons?domain=${encodedDomain}&sz=128`;
  return (
    <img
      alt={domain}
      src={src}
      className={className}
      loading="lazy"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = 'none';
      }}
    />
  );
}

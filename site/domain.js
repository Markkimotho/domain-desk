import { parse } from './vendor/tldts.js';

export function normalizeDomain(input) {
  const raw = input.trim();
  if (!raw) throw new Error('Enter a domain name or website URL.');
  if (/[\s\\]/u.test(raw)) throw new Error('Remove spaces or backslashes from the address.');
  let url;
  try { url = new URL(raw.startsWith('//') ? `https:${raw}` : /^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`); }
  catch { throw new Error('Enter a valid domain or HTTP(S) URL.'); }
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Use an HTTP(S) website address.');
  if (url.username || url.password) throw new Error('Do not include credentials in the URL.');
  const domain = url.hostname.toLowerCase().replace(/\.$/, '');
  const labels = domain.split('.');
  const parsed = parse(domain);
  if (parsed.isIp) throw new Error('Enter a domain name, rather than an IP address.');
  if (labels.length < 2 || domain.length > 253 || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) || /\.(localhost|local|internal|test|invalid|example|onion)$/.test(domain)) {
    throw new Error('Enter a public domain, such as example.com.');
  }
  if (!parsed.domain) throw new Error('Enter a domain below the public suffix, such as example.co.uk.');
  return domain;
}
export function domainInfo(input) {
  const hostname = normalizeDomain(input);
  const registry = parse(hostname);
  const hosted = parse(hostname, { allowPrivateDomains: true });
  return { hostname, domain: registry.domain, suffix: registry.publicSuffix,
    hostedDomain: hosted.isPrivate ? hosted.domain : null,
    international: hostname.split('.').some(label => label.startsWith('xn--')) };
}
export function registrationDate(rdap) {
  const date = rdap?.events?.find(item => item.eventAction === 'registration')?.eventDate;
  const parsed = date ? new Date(date) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
}
export function ageInDays(date, now = new Date()) {
  return date && date <= now ? Math.floor((now - date) / 86400000) : null;
}
export function dnsAnswers(response, type) {
  return Array.isArray(response?.Answer) ? response.Answer.filter(answer => type === undefined || answer.type === type).map(answer => answer.data).filter(value => typeof value === 'string') : [];
}
export const RECORD_TYPES = { A: 1, AAAA: 28, CNAME: 5, MX: 15, NS: 2, TXT: 16, CAA: 257, SOA: 6 };
export function dnsState(response, type) {
  if (response.Status === 3) return 'not-found';
  if (response.Status !== 0) return 'error';
  return dnsAnswers(response, RECORD_TYPES[type]).length ? 'found' : 'empty';
}
export function resolutionSummary(records) {
  const addresses = records.filter(item => ['A', 'AAAA'].includes(item.type));
  if (addresses.some(item => item.state === 'found')) return { title: 'DNS resolves', text: 'This hostname has an IP address. Website availability and safety have not been checked.', tone: 'good' };
  if (addresses.length === 2 && addresses.every(item => item.state === 'not-found')) return { title: 'Hostname not found', text: 'Both address lookups returned NXDOMAIN. Check the spelling or try the registered domain.', tone: 'warn' };
  if (addresses.length === 2 && addresses.every(item => item.state === 'empty')) return { title: 'No web address records', text: 'DNS responded, but returned no IPv4 or IPv6 address. The domain may be used for email or other services.', tone: 'warn' };
  return { title: 'Lookup incomplete', text: 'Address lookups were unavailable or inconsistent. Retry; this does not mean the website is unsafe.', tone: 'warn' };
}

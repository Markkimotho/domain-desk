import { dnsState } from './domain.js';

export async function getJSON(url, { signal, timeout = 7000, fetcher = fetch, headers = {} } = {}) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, timeout);
  try {
    const response = await fetcher(url, { signal: controller.signal, headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
export async function lookupDNS(name, type, options = {}) {
  const attempts = [];
  for (const [provider, base] of [['Cloudflare', 'https://cloudflare-dns.com/dns-query'], ['Google', 'https://dns.google/resolve']]) {
    if (options.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const url = `${base}?name=${encodeURIComponent(name)}&type=${type}&do=true`;
    try {
      const data = await getJSON(url, { ...options, headers: { Accept: 'application/dns-json' } });
      if (data?.TC === true) throw new Error('Truncated DNS response');
      if (!Number.isInteger(data?.Status) || (data.Answer !== undefined && !Array.isArray(data.Answer))) throw new Error('Unexpected DNS response');
      const state = dnsState(data, type);
      if (state === 'error') throw new Error(`DNS response code ${data.Status}`);
      return { name, type, state, data, provider, url, attempts };
    } catch (error) { attempts.push({ provider, error: error.message }); }
  }
  return { name, type, state: 'unavailable', attempts };
}
export async function lookupRegistration(domain, options = {}) {
  const attempts = [];
  const urls = [];
  try {
    const bootstrap = await getJSON('https://data.iana.org/rdap/dns.json', options);
    const suffix = domain.split('.').at(-1);
    const service = bootstrap.services?.find(([suffixes]) => suffixes.includes(suffix));
    for (const base of service?.[1] || []) if (base.startsWith('https://')) urls.push(`${base.replace(/\/$/, '')}/domain/${encodeURIComponent(domain)}`);
  } catch (error) { attempts.push({ provider: 'IANA directory', error: error.message }); }
  urls.push(`https://rdap.org/domain/${encodeURIComponent(domain)}`);
  for (const url of [...new Set(urls)].slice(0, 3)) {
    if (options.signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    try {
      const data = await getJSON(url, { ...options, headers: { Accept: 'application/rdap+json, application/json' } });
      if (data?.objectClassName !== 'domain') throw new Error('Unexpected registration response');
      // Optional RDAP fields are not uniformly published by registries.
      data.events = Array.isArray(data.events) ? data.events.filter(item => item && typeof item.eventAction === 'string' && typeof item.eventDate === 'string') : [];
      data.status = Array.isArray(data.status) ? data.status.filter(item => typeof item === 'string') : [];
      data.entities = Array.isArray(data.entities) ? data.entities.filter(item => item && Array.isArray(item.roles) && Array.isArray(item.vcardArray?.[1]) && item.vcardArray[1].every(Array.isArray)) : [];
      return { state: 'found', domain, data, url, attempts };
    } catch (error) { attempts.push({ provider: new URL(url).hostname, error: error.message }); }
  }
  return { state: 'unavailable', domain, attempts };
}
export function queriesFor(info) {
  return [ ...['A', 'AAAA', 'CNAME'].map(type => ({ name: info.hostname, type })),
    ...['MX', 'NS', 'TXT', 'CAA', 'SOA'].map(type => ({ name: info.domain, type })),
    { name: `_dmarc.${info.domain}`, type: 'TXT', label: 'DMARC' } ];
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { domainInfo, normalizeDomain, dnsAnswers, dnsState, resolutionSummary, ageInDays } from '../site/domain.js';
import { getJSON, lookupDNS, lookupRegistration, queriesFor } from '../site/lookup.js';
const json = body => ({ ok: true, json: async () => body });

test('normalizes full, protocol-relative and international URLs', () => {
  assert.equal(normalizeDomain(' //WWW.Example.COM./path?q=secret '), 'www.example.com');
  assert.equal(normalizeDomain('https://bücher.de'), 'xn--bcher-kva.de');
  assert.equal(normalizeDomain('example.com:8080/path'), 'example.com');
});
test('rejects IPs, credentials, unsupported protocols, suffixes and local names', () => {
  for (const value of ['127.0.0.1', '0x7f000001', '[::1]', 'ftp://example.com', 'https://u:p@example.com', 'co.uk', 'foo.local', 'foo.onion', 'exa mple.com', 'https://example.com\\@evil.com']) assert.throws(() => normalizeDomain(value), value);
});
test('separates registry domain from hostname using suffix rules', () => {
  assert.equal(domainInfo('https://news.bbc.co.uk/story').domain, 'bbc.co.uk');
  assert.equal(domainInfo('www.example.co.ke').domain, 'example.co.ke');
  assert.equal(domainInfo('mark.github.io').domain, 'github.io');
  assert.equal(domainInfo('mark.github.io').hostedDomain, 'mark.github.io');
  assert.equal(domainInfo('www.city.kawasaki.jp').domain, 'city.kawasaki.jp');
  const queries = queriesFor(domainInfo('www.example.com'));
  assert.equal(queries.find(x => x.type === 'A').name, 'www.example.com');
  assert.equal(queries.find(x => x.type === 'MX').name, 'example.com');
});
test('does not treat CNAME as an address or DNS failures as empty answers', () => {
  const data = { Status: 0, Answer: [{ type: 5, data: 'target.example.com' }] };
  assert.deepEqual(dnsAnswers(data, 1), []);
  assert.equal(dnsState(data, 'A'), 'empty');
  assert.equal(dnsState({ Status: 3 }, 'A'), 'not-found');
  assert.equal(dnsState({ Status: 2 }, 'A'), 'error');
});
test('summaries distinguish IPv6-only, missing names, empty responses and partial failures', () => {
  const records = (a, aaaa) => [{ type: 'A', state: a }, { type: 'AAAA', state: aaaa }];
  assert.equal(resolutionSummary(records('empty', 'found')).title, 'DNS resolves');
  assert.equal(resolutionSummary(records('not-found', 'not-found')).title, 'Hostname not found');
  assert.equal(resolutionSummary(records('empty', 'empty')).title, 'No web address records');
  assert.equal(resolutionSummary(records('unavailable', 'empty')).title, 'Lookup incomplete');
  assert.equal(ageInDays(new Date('2100-01-01')), null);
});
test('falls back after a transport failure or SERVFAIL, retaining provenance', async () => {
  for (const first of [() => { throw new Error('Network unavailable'); }, () => json({ Status: 2 })]) {
    const calls = [];
    const result = await lookupDNS('example.com', 'A', { fetcher: async url => {
      calls.push(url); return calls.length === 1 ? first() : json({ Status: 0, Answer: [{ type: 1, data: '1.2.3.4' }] });
    } });
    assert.equal(result.provider, 'Google'); assert.equal(result.state, 'found'); assert.equal(result.attempts.length, 1);
  }
});
test('NXDOMAIN is an answer, not a network failure', async () => {
  let calls = 0;
  const result = await lookupDNS('missing.example.com', 'A', { fetcher: async () => { calls++; return json({ Status: 3 }); } });
  assert.equal(result.state, 'not-found'); assert.equal(calls, 1);
});
test('malformed replies and provider failures remain unavailable', async () => {
  const result = await lookupDNS('example.com', 'A', { fetcher: async () => json({ Answer: 'bad' }) });
  assert.equal(result.state, 'unavailable'); assert.equal(result.attempts.length, 2);
});
test('RDAP uses IANA registry and falls back if blocked', async () => {
  const calls = [];
  const result = await lookupRegistration('example.com', { fetcher: async url => {
    calls.push(url);
    if (calls.length === 1) return json({ services: [[['com'], ['https://registry.example/rdap/']]] });
    if (calls.length === 2) throw new Error('CORS blocked');
    return json({ objectClassName: 'domain', events: [] });
  } });
  assert.equal(result.state, 'found');
  assert.equal(calls[1], 'https://registry.example/rdap/domain/example.com');
  assert.equal(calls[2], 'https://rdap.org/domain/example.com');
});
test('RDAP absence is reported separately from DNS', async () => {
  const result = await lookupRegistration('example.com', { fetcher: async () => { throw new Error('Unavailable'); } });
  assert.equal(result.state, 'unavailable');
});
test('requests time out and already cancelled lookups do not query providers', async () => {
  const stalled = async (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
  await assert.rejects(getJSON('https://example.com', { fetcher: stalled, timeout: 5 }), { name: 'AbortError' });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(lookupDNS('example.com', 'A', { signal: controller.signal, fetcher: () => assert.fail('Should not fetch') }), { name: 'AbortError' });
});
test('incomplete optional RDAP fields do not break registration rendering', async () => {
  const result = await lookupRegistration('example.com', { fetcher: async url => json(url.includes('iana.org') ? { services: [] } : { objectClassName: 'domain', events: 'unknown', status: 'active', entities: [null, {}] }) });
  assert.equal(result.state, 'found');
  assert.deepEqual(result.data.events, []);
  assert.deepEqual(result.data.status, []);
  assert.deepEqual(result.data.entities, []);
});

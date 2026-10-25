import { domainInfo, registrationDate, ageInDays, dnsAnswers, RECORD_TYPES, resolutionSummary } from './domain.js';
import { lookupDNS, lookupRegistration, queriesFor } from './lookup.js';

const $ = id => document.getElementById(id);
let active;
let report;
const text = (id, value) => { $(id).textContent = value; };
function rows(id, entries) {
  $(id).replaceChildren(...entries.flatMap(([label, value]) => {
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = value;
    return [dt, dd];
  }));
}
function formatDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not published';
}
function renderRegistration(result) {
  const date = registrationDate(result.data);
  const days = ageInDays(date);
  text('registration', date ? `Registered ${formatDate(date)}` : 'Registration date unavailable');
  text('age', days === null ? '' : days < 365 ? `${days} days since registration` : `${(days / 365.25).toFixed(1)} years since registration`);
  const registrar = result.data?.entities?.find(entity => entity.roles?.includes('registrar'))?.vcardArray?.[1]?.find(field => field[0] === 'fn')?.[3];
  rows('registration-details', [ ['Registered domain', result.domain], ['Registrar', typeof registrar === 'string' ? registrar : 'Not published'],
    ['Expires', formatDate(result.data?.events?.find(item => item.eventAction === 'expiration')?.eventDate)],
    ['Status', result.data?.status?.join(', ') || 'Not published'] ]);
  text('rdap-note', result.state === 'found' ? 'Dates describe the registered domain, not the age of this website or its current owner.' : 'Registration data could not be retrieved. The registry may not support RDAP, may restrict browser access, or may be temporarily unavailable. Try the ICANN lookup below.');
  $('registration-link').hidden = !result.url;
  if (result.url) $('registration-link').href = result.url;
}
function renderDNS(records) {
  $('records').replaceChildren(...records.map(item => {
    const section = document.createElement('div'); section.className = 'record';
    const heading = document.createElement('div'); heading.className = 'record-heading';
    const title = document.createElement('strong'); title.textContent = item.label || item.type;
    const name = document.createElement('small'); name.textContent = item.name;
    heading.append(title, name);
    const body = document.createElement('div');
    const messages = { empty: 'No record published for this query.', 'not-found': 'NXDOMAIN — this DNS name does not exist.', unavailable: 'Lookup unavailable. Both providers failed; retry later.' };
    if (item.state !== 'found') { const p = document.createElement('p'); p.textContent = messages[item.state]; body.append(p); }
    for (const answer of item.data?.Answer || []) {
      const p = document.createElement('pre');
      const type = Object.entries(RECORD_TYPES).find(([, code]) => code === answer.type)?.[0] || answer.type;
      p.textContent = `${type}  ${answer.data}\nTTL ${answer.TTL ?? 'unknown'} seconds`;
      body.append(p);
    }
    const source = document.createElement('p'); source.className = 'note';
    source.textContent = item.provider ? `${item.provider} · ${item.data.AD ? 'Resolver reports DNSSEC validated' : 'DNSSEC validation not confirmed'}${item.attempts.length ? ' · fallback used' : ''}` : item.attempts.map(attempt => `${attempt.provider}: ${attempt.error}`).join(' · ');
    body.append(source); section.append(heading, body); return section;
  }));
  text('record-count', `${records.filter(item => item.state !== 'unavailable').length}/${records.length} queries answered`);
  const summary = resolutionSummary(records);
  $('summary').className = `summary ${summary.tone}`;
  text('summary-title', summary.title); text('summary-text', summary.text);
  const get = label => records.find(item => (item.label || item.type) === label);
  const values = label => { const item = get(label); return item ? dnsAnswers(item.data, RECORD_TYPES[item.type]) : []; };
  const policy = (label, prefix) => {
    const item = get(label);
    if (!item || item.state === 'unavailable') return 'Check unavailable';
    const policies = values(label).map(value => value.replace(/"\s*"/g, '').replace(/^"|"$/g, '')).filter(value => value.toLowerCase().startsWith(prefix));
    return policies.length > 1 ? 'Multiple policies found — review configuration' : policies.length === 1 ? 'Policy found (not fully validated)' : 'No policy found at this name';
  };
  const mx = get('MX');
  rows('email-details', [ ['Mail routing', mx?.state === 'unavailable' ? 'Check unavailable' : values('MX').some(value => /^0\s+\.$/.test(value)) ? 'Null MX: domain explicitly declines email' : values('MX').length ? `${values('MX').length} mail server record(s)` : 'No MX records; address fallback may apply'],
    ['SPF', policy('TXT', 'v=spf1')], ['DMARC', policy('DMARC', 'v=dmarc1;')],
    ['Certificate policy', get('CAA')?.state === 'unavailable' ? 'Check unavailable' : values('CAA').length ? 'CAA records found at registered domain' : 'No CAA at registered domain; inheritance may apply'] ]);
}
function stop() {
  active?.abort(); active = null;
  $('cancel').hidden = true;
  $('results').setAttribute('aria-busy', 'false');
}
$('cancel').addEventListener('click', () => {
  stop(); report = null; $('results').hidden = true;
  text('status', 'Lookup cancelled. Enter an address to try again.');
});
$('lookup').addEventListener('submit', async event => {
  event.preventDefault(); stop(); report = null; $('download').disabled = true;
  let info;
  try { info = domainInfo($('domain').value); }
  catch (error) { text('status', error.message); $('results').hidden = true; $('domain').setAttribute('aria-invalid', 'true'); $('domain').focus(); return; }
  $('domain').removeAttribute('aria-invalid');
  const controller = new AbortController(); active = controller;
  const current = () => active === controller;
  const options = { signal: controller.signal };
  $('results').hidden = false; $('results').setAttribute('aria-busy', 'true'); $('cancel').hidden = false;
  text('result-domain', info.hostname);
  text('scope', `Registered domain: ${info.domain}`);
  text('address-note', [info.international ? 'Internationalized name: the ASCII (punycode) spelling is shown above. Compare the exact address carefully.' : '', info.hostedDomain ? `This is a hosted address. Registration belongs to ${info.domain}, not necessarily the person running ${info.hostedDomain}.` : ''].filter(Boolean).join(' '));
  text('summary-title', 'Checking DNS…'); text('summary-text', 'Looking for the addresses behind this hostname.'); $('summary').className = 'summary';
  text('registration', 'Checking registration…'); text('age', ''); text('rdap-note', ''); $('registration-details').replaceChildren(); $('registration-link').hidden = true;
  rows('email-details', [['Status', 'Checking records…']]); $('records').replaceChildren(); text('record-count', 'Checking…'); text('checked-at', '');
  text('status', `Looking up ${info.hostname}…`);
  $('safety-link').href = `https://transparencyreport.google.com/safe-browsing/search?url=${encodeURIComponent(info.hostname)}`;
  $('icann-link').href = `https://lookup.icann.org/en/lookup?name=${encodeURIComponent(info.domain)}`;
  try {
    const dnsPromise = Promise.all(queriesFor(info).map(async query => ({ ...await lookupDNS(query.name, query.type, options), label: query.label }))).then(records => {
      if (current()) { renderDNS(records); text('status', 'DNS checks finished. Waiting for registration data…'); }
      return records;
    });
    const registrationPromise = lookupRegistration(info.domain, options).then(result => { if (current()) renderRegistration(result); return result; });
    const [records, registration] = await Promise.all([dnsPromise, registrationPromise]);
    if (!current()) return;
    report = { ...info, checkedAt: new Date().toISOString(), records, registration, limitations: 'DNS and registration only. Website uptime, TLS and reputation have not been tested.' };
    $('download').disabled = false;
    text('checked-at', `Checked ${new Date(report.checkedAt).toLocaleString()}. Records can change; run another lookup to refresh.`);
    const incomplete = records.some(item => item.state === 'unavailable') || registration.state === 'unavailable';
    text('status', incomplete ? 'Lookup finished with some data unavailable. Available results are shown below.' : 'Lookup complete. Sources and details are available below.');
  } catch (error) {
    if (current()) text('status', 'The lookup could not finish. Please try again.');
  } finally { if (current()) stop(); }
});
document.querySelectorAll('[data-example]').forEach(button => button.addEventListener('click', () => {
  $('domain').value = button.dataset.example; $('lookup').requestSubmit();
}));
$('download').addEventListener('click', () => {
  if (!report) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `${report.hostname}-domain-report.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

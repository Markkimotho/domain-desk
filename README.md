# Domain Desk / domain-desk

A static, browser-based domain evidence tool. Paste a domain or HTTP(S) URL to see DNS resolution, registration events, registrar, email configuration and raw DNS records. The interface keeps one primary action up front and reveals technical detail on demand.

## Run and test

Serve `site/` with `python3 -m http.server 8000 --directory site` and open http://localhost:8000. Run `npm test` (Node 22+) for parsing, DNS interpretation, fallback, timeout and RDAP tests. No build or server-side secret is needed; GitHub Actions tests and deploys `site/` to GitHub Pages.

## Coverage

- Full URLs, trailing dots, internationalized domains and protocol-relative addresses normalize to an ASCII hostname. Paths, credentials and query strings are never sent to lookup providers (credential-bearing URLs are rejected).
- Public Suffix List rules distinguish hostnames from registered domains, including `co.uk`, `co.ke`, wildcard rules and private hosting platforms. Registration age for a hosted site refers to the platform domain, clearly labelled.
- A, AAAA and CNAME query the exact hostname. MX, NS, TXT, CAA and SOA query the registered domain; DMARC queries `_dmarc` at that domain. The app does not claim to fully validate email policy syntax, inheritance or DNSSEC.
- Cloudflare DNS-over-HTTPS falls back to Google on network, malformed-response or DNS server errors. NXDOMAIN, an empty successful response and unavailable data are distinct states. Typed answers prevent a CNAME from being mistaken for an IP address.
- RDAP discovers registry endpoints through IANA, then tries rdap.org if needed. Each network request has a seven-second timeout. DNS results appear independently of registration results.
- New lookups cancel old requests; stale responses cannot overwrite the current result. Users can cancel and export a completed report as JSON, including query names, sources, failures and timestamps.

## Limits and privacy

This is **not a website safety scanner**. It does not test uptime, TLS, page contents or business legitimacy. Browser CORS policies and registry coverage mean some registration information will remain unavailable. A missing date does not establish risk. IP addresses, local names and non-HTTP(S) protocols are deliberately unsupported.

External Safe Browsing and ICANN reports are manual links; the app does not ingest their findings. No history is stored locally. DNS/RDAP providers receive queried names and the visitor's IP address.

## Public suffix data

`site/vendor/tldts.js` is the standalone ESM distribution of tldts 7.4.19, with its MIT license alongside it. It is vendored so deployed lookups do not depend on a JavaScript CDN. To refresh it, update the pinned npm dependency, then run `npm run vendor`. Commit the lockfile and regenerated files together. The suffix snapshot requires periodic updates as registries change.

Design direction: the single-action simplicity of [city-roads](https://github.com/anvaka/city-roads), with an original layout and styling. No city-roads code or assets are used.

# Detailed doc: CaelLab sites, login, policy and footers

Read this when the user asks how a CaelLab site relates to another one, which domain to use, how signing in
works across them, or where the rules and policies are written down.

## The domain map

CaelLab spreads across three domain families, and the domain does not decide ownership — all of them are the
same team:

- **`caellab.com`** — the main site and the team's own products: `www.caellab.com`, plus `id.caellab.com`
  (login), `minecraft.caellab.com`, `site.caellab.com`, `gamets.caellab.com` (games).
- **`xmuer.online`** — the XMUER sub-brand for the coding sites: `engine.` (this editor),
  `coding.` (the community), `forum.` (the forum), `packager.` (the packager).
- **`caellab.org`** — the team's own pages and the public documents: `caellab.org` (who we are, contact,
  news) and `policy.caellab.org` (the policies themselves).

Two more that do not follow the pattern: **`130.wiki`** is 轻之舟百科, and **`caellab.click`** is
CaelLab Search.

## CaelLabID — one login for all of them

- <https://id.caellab.com/> is the shared identity service. Sites that need an account do **not** build their
  own: they send the user through CaelLabID with **OAuth 2.0**, so the same person is one account across the
  family.
- Its own documentation is at <https://id.caellab.com/docs>.
- Signing in may pass through CaelLabID's own second-factor step. That happens on CaelLabID's side and is
  not something the other sites control.
- If a user's session is broken on one site, that is a login question, not an editor question — the fix
  is on CaelLabID, and you cannot log in for them.

## Policy and the public documents

- **policy.caellab.org** holds the written policies: privacy, terms of service, integrity (阳光) and human
  rights principles. Read them there rather than reciting them from memory.
- **caellab.org** holds the team's own pages: 我们是谁 (who we are), 联系方式 (contact) and a news feed.
- Every site's footer links to the policies that apply to it, usually including 隐私政策 and 服务协议 — and
  the forum adds 社区守则 (community rules).

## Contact

- The hub is <https://caellab.org/who-we-are/contact/>. It lists a general address plus per-project ones
  (轻之舟百科, the forum, the coding community, CaelLab Search) and separate addresses for rights questions,
  donations and integrity matters.
- **Link the page; do not recite an address from memory.** The addresses are deliberately obfuscated against
  scrapers and can change, and some sites also show their own contact address in the footer.
- Public accounts: GitHub `CaelLab-org`, Bilibili `1199120693`, YouTube `@CaelLab`, Kuaishou
  `3xgrwi2jsy45yza`, and (for XCC) a team page at `coding.xmuer.online/team/caellab`.

## Footers, filings and licensing

- The standard copyright line is `© 2025-Present 虚舟实验室 (CaelLab). All rights reserved.` Individual
  sites sometimes add their own name to it (XCC uses `© 2026 XMUER Coding Community`, and the forum
  `© 2025-Present XMUER by 虚舟实验室 (CaelLab)`).
- Each site shows **its own** 舟ICP备 filing number. Three to know, so they do not get mixed up:
  caellab.com shows 舟ICP备 97257623号 (创意型作品), caellab.org shows 舟ICP备 20250705号 (创意型作品), and
  XCC shows 舟ICP备 67114514号. Never carry a number from one site over to another, and never invent one.
- Licensing: site source code is under the **CaelLab BY-SA Code License**, site text under **CC BY-SA 4.0**.
  Brand marks, logos, downloadable program files and third-party assets are excluded from both.

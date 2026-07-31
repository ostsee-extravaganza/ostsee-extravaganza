/* ============================================================================
   logbuch.js — dated posts with a deliberately small markdown subset.
   ========================================================================= */

import { mountChrome, mountWaves, loadJSON, esc, longDate, failBox, initReveal } from './core.js';

const $ = (s) => document.querySelector(s);
const REPO = 'https://github.com/ostsee-extravaganza/ostsee-extravaganza';

/* --- markdown-lite -------------------------------------------------------
   Escapes first, then re-introduces only the handful of constructs we allow.
   Anything the author pastes in is inert by the time it reaches innerHTML. */

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, href) =>
      /^(https?:|mailto:|#|[a-z0-9._-]+\.html)/i.test(href)
        ? `<a href="${href}"${href.startsWith('http') ? ' rel="noopener"' : ''}>${text}</a>`
        : text
    );
}

function markdown(body) {
  const blocks = String(body ?? '').split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split('\n');
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        const items = lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('');
        return `<ul>${items}</ul>`;
      }
      if (/^>\s/.test(block)) {
        return `<blockquote>${inline(block.replace(/^>\s?/gm, ''))}</blockquote>`;
      }
      return `<p>${lines.map(inline).join('<br>')}</p>`;
    })
    .join('');
}

/* --- rendering ----------------------------------------------------------- */

function post(p) {
  return `
<article class="post reveal" id="${esc(p.id)}">
  <header class="post__head">
    <time class="post__date" datetime="${esc(p.date)}">${esc(longDate(p.date))}</time>
    <h2 class="post__title">
      <a href="#${esc(p.id)}" class="post__anchor">${esc(p.title)}</a>
    </h2>
    <p class="post__meta">${esc(p.author ?? '')}${
      p.placeholder ? ' · <span class="tag tag--ghost">Platzhalter</span>' : ''
    }</p>
  </header>
  ${
    p.image
      ? `<img class="post__img" src="${esc(p.image)}" alt="${esc(p.imageAlt ?? '')}"
           loading="lazy" decoding="async">`
      : ''
  }
  <div class="post__body">${markdown(p.body)}</div>
</article>`;
}

/* --- boot ---------------------------------------------------------------- */

(async function main() {
  await mountChrome();
  mountWaves();

  let doc;
  try {
    doc = await loadJSON('posts.json');
  } catch (err) {
    failBox($('#posts'), err);
    return;
  }

  const posts = [...doc.posts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const real = posts.filter((p) => !p.placeholder).length;

  $('#head-facts').innerHTML = [
    ['Einträge', posts.length],
    ['Davon echt', real],
    ['Letzter', posts.length ? longDate(posts[0].date) : '—'],
  ]
    .map(([dt, dd]) => `<div class="page-head__fact"><dt>${esc(dt)}</dt><dd>${esc(dd)}</dd></div>`)
    .join('');

  $('#posts').innerHTML = posts.length
    ? (real === 0
        ? `<div class="notice notice--soon" style="margin-bottom:var(--sp-6)">
             <div class="notice__title">Alles noch Platzhalter</div>
             <p>The entries below were written while building the site, to give the page a shape.
                Overwrite or delete them — they are not anybody's actual words.</p>
           </div>`
        : '') + posts.map(post).join('')
    : `<p class="small dim">Noch kein Eintrag.</p>`;

  const link = $('#issue-link');
  if (link) link.href = `${REPO}/issues/new?labels=logbuch&title=Logbuch%3A+`;

  initReveal();

  if (location.hash) document.querySelector(location.hash)?.scrollIntoView({ block: 'start' });
})();

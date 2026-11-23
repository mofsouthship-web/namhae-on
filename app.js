const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nl2br = (t) => esc(t).replace(/\n/g, '<br>');
let DATA = null, q = '', MAP = {}, PARENT = {}, current = null;

/* ================= 트리 구조 =================
   node = { id, title, desc?, type: 'list'|'inspection'|'doc', layout?: 'grid', soon?, soonText?, children? }
   inspection: intro, roles, images, checks   /   doc: body, law, links, updated                         */
function index(nodes, parent) {
  nodes.forEach((n) => {
    MAP[n.id] = n; PARENT[n.id] = parent ? parent.id : null;
    if (n.children) index(n.children, n);
  });
}
const isLeaf = (n) => !n.children || !n.children.length;
const isSoon = (n) => !!n.soon || (isLeaf(n) && n.type === 'inspection' && !(n.checks && n.checks.length)) || (isLeaf(n) && !n.type);
function leaves(n) { return isLeaf(n) ? [n] : n.children.flatMap(leaves); }
function pathOf(id) { const p = []; for (let x = id; x; x = PARENT[x]) p.unshift(MAP[x]); return p; }
function crumbs(id, withSelf) {
  const p = pathOf(id);
  const parts = [`<a href="#/">홈</a>`].concat(p.map((n, i) => (i === p.length - 1 && !withSelf) ? '' : `<a href="#/n/${esc(n.id)}">${esc(n.title)}</a>`).filter(Boolean));
  return `<nav class="crumb">${parts.join(' <i>›</i> ')}</nav>`;
}

// 본문 간이 렌더링: [제목] / - 목록 / 1. 목록 / 일반 문단
function renderBody(t) {
  let h = '', list = '';
  const close = () => { if (list) { h += `</${list}>`; list = ''; } };
  for (const raw of String(t).split('\n')) {
    const l = raw.trim();
    if (!l) { close(); continue; }
    let m;
    if ((m = l.match(/^\[(.+)\]$/))) { close(); h += `<h3>${esc(m[1])}</h3>`; }
    else if ((m = l.match(/^[-·]\s*(.+)/))) { if (list !== 'ul') { close(); h += '<ul>'; list = 'ul'; } h += `<li>${esc(m[1])}</li>`; }
    else if ((m = l.match(/^\d+\.\s*(.+)/))) { if (list !== 'ol') { close(); h += '<ol>'; list = 'ol'; } h += `<li>${esc(m[1])}</li>`; }
    else { close(); h += `<p>${esc(l)}</p>`; }
  }
  close();
  return h;
}

let STATUS_TXT = '';
function setStatus(mode) {
  const d = DATA ? DATA.updated : '-';
  STATUS_TXT = (mode === 'online' ? '● 최신 내용 · ' : '○ 오프라인(저장된 내용) · ') + '업데이트 ' + d;
  $('#status').textContent = STATUS_TXT;
  const h = $('#hstatus'); if (h) h.textContent = STATUS_TXT;
}

/* ================= 화면 틀: 검색창은 한 번만 만들고 아래 영역만 갱신 (한글 입력 끊김 방지) ================= */
let SEARCH_MODE = false;
function shell(contentFn, pre, withSearch) {
  current = contentFn; SEARCH_MODE = !!withSearch;
  $('#app').innerHTML = (pre || '') + (withSearch ? `<input id="q" type="search" placeholder="검색 (예: 기선권현망, 혼획)" value="${esc(q)}" autocomplete="off" enterkeyhint="search">` : '') + `<div id="body"></div>`;
  if (withSearch) $('#q').addEventListener('input', (e) => { q = e.target.value; paint(); });
  paint();
}
function paint() { $('#body').innerHTML = (SEARCH_MODE && q.trim()) ? searchView() : current(); const h = $('#hstatus'); if (h) h.textContent = STATUS_TXT; }

function card(n) {
  const soon = isSoon(n);
  const cnt = !isLeaf(n) ? (() => { const L = leaves(n), r = L.filter((x) => !isSoon(x)).length; return `<span class="cnt">${r}/${L.length}</span>`; })() : '';
  const inner = `<div class="nt"><b>${esc(n.title)}</b>${n.desc ? `<small>${esc(n.desc)}</small>` : ''}${soon && n.soonText ? `<small class="stxt">${esc(n.soonText)}</small>` : ''}</div>${soon ? '<span class="soon">준비중</span>' : cnt + '<span class="arrow">›</span>'}`;
  return soon ? `<div class="ncard off">${inner}</div>` : `<a class="ncard" href="#/n/${esc(n.id)}">${inner}</a>`;
}
function gcard(n) {
  return isSoon(n)
    ? `<div class="fcard off"><b>${esc(n.title)}</b><small>준비중</small></div>`
    : `<a class="fcard" href="#/n/${esc(n.id)}"><b>${esc(n.title)}</b></a>`;
}

function searchView() {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = Object.values(MAP).filter((n) => {
    if (!isLeaf(n) && n.type !== 'inspection') return terms.every((t) => (n.title + ' ' + (n.desc || '')).toLowerCase().includes(t));
    const hay = (n.title + ' ' + (n.desc || '') + ' ' + (n.intro || '') + ' ' + (n.body || '') + ' ' + JSON.stringify(n.checks || '')).toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
  if (!hits.length) return '<div class="empty">검색 결과가 없습니다.</div>';
  return hits.map((n) => {
    const path = pathOf(n.id).slice(0, -1).map((x) => x.title).join(' › ');
    const soon = isSoon(n);
    const inner = `<div class="nt"><b>${esc(n.title)}</b><small>${esc(path)}${soon ? ' · 준비중' : ''}</small></div>${soon ? '' : '<span class="arrow">›</span>'}`;
    return soon ? `<div class="ncard off">${inner}</div>` : `<a class="ncard" href="#/n/${esc(n.id)}">${inner}</a>`;
  }).join('');
}


/* ================= 홈 화면 (일러스트 이미지) ================= */
const HERO = `<div class="hero"><img src="img/hero-banner.jpg" alt="남해온 · 남해어업관리단 디지털 업무 플랫폼"></div>`;
const CARD_IMG = { enforce: 'img/card-enforce.jpg', admin: 'img/card-admin.jpg' };
const EYEBROW = { enforce: '01 · FIELD OPERATIONS', admin: '02 · ADMINISTRATION' };
function bigCard(n) {
  const soon = isSoon(n);
  const img = CARD_IMG[n.id] ? `<img class="thumb" src="${CARD_IMG[n.id]}" alt="" loading="lazy">` : '';
  const inner = `<div class="nt"><small class="eb">${EYEBROW[n.id] || ''}</small><b>${esc(n.title)}</b><small>${esc(n.desc || '')}</small>${soon ? `<span class="soon">준비중</span>` : '<span class="go">업무 바로가기 →</span>'}</div>${img}`;
  return soon ? `<div class="bigcard off">${inner}</div>` : `<a class="bigcard" href="#/n/${esc(n.id)}">${inner}</a>`;
}

function viewHome() {
  document.body.classList.add('home');
  shell(() => DATA.tree.map(bigCard).join('') + '<div class="hfoot" id="hstatus"></div>', HERO);
}
function viewSearch() {
  shell(() => '<div class="empty">업종명·확인내용·법령 이름으로 찾아보세요.</div>', '', true);
  const i = $('#q'); if (i) i.focus();
}

/* ===== 즐겨찾기: 이 기기(localStorage)에 저장 ===== */
function getFav() { try { return JSON.parse(localStorage.getItem('fav') || '[]'); } catch (e) { return []; } }
function setFav(a) { try { localStorage.setItem('fav', JSON.stringify(a)); } catch (e) {} }
const isFav = (id) => getFav().includes(id);
const starBtn = (id) => `<button class="star${isFav(id) ? ' on' : ''}" data-fav="${esc(id)}" aria-pressed="${isFav(id)}" aria-label="즐겨찾기">${isFav(id) ? '★ 즐겨찾기 해제' : '☆ 즐겨찾기'}</button>`;
function viewFav() {
  const ids = getFav().filter((id) => MAP[id]);
  if (ids.length !== getFav().length) setFav(ids);   // 삭제된 항목 정리
  shell(() => `<h2 class="ptitle">즐겨찾기</h2>` + (ids.length
    ? ids.map((id) => { const n = MAP[id]; const path = pathOf(id).slice(0, -1).map((x) => x.title).join(' › ');
        return `<a class="ncard" href="#/n/${esc(id)}"><div class="nt"><b>${esc(n.title)}</b><small>${esc(path)}</small></div><span class="arrow">›</span></a>`; }).join('')
    : '<div class="empty">아직 없습니다.<br>업종 화면에서 ☆를 누르면 여기에 모입니다.</div>'));
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-fav]'); if (!b) return;
  const id = b.dataset.fav; let a = getFav();
  a = a.includes(id) ? a.filter((x) => x !== id) : a.concat(id);
  setFav(a);
  b.outerHTML = starBtn(id);
});
function viewList(n) {
  shell(() => `${crumbs(n.id, true)}<h2 class="ptitle">${esc(n.title)}</h2>${n.desc ? `<div class="pdesc">${esc(n.desc)}</div>` : ''}` +
    (n.layout === 'grid' ? `<div class="fgrid">${n.children.map(gcard).join('')}</div>` : n.children.map(card).join('')));
}

/* ================= 화면: 점검표형(inspection) ================= */
function tableHtml(t) {
  return `<div class="tw"><table><thead><tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${
    t.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
let CUR = null;
function figs(a, f) { return (a || []).map((m) => `<figure><img data-zoom src="${esc(m.src)}" alt="${esc(m.caption || f.title)}" loading="lazy"><figcaption>${esc(m.caption || '')} · 터치하면 확대</figcaption>${m.law ? lawLink(m.law, 'lawchip') : ''}</figure>`).join(''); }
function viewInspection(f) {
  CUR = f.id;
  const par = PARENT[f.id] ? MAP[PARENT[f.id]] : null;
  const roles = (f.roles || []).map((x) => `<li><b>${esc(x.name)}</b> ${esc(x.desc)}</li>`).join('');
  const imgs = (f.images || []).map((m) =>
    `<figure><img data-zoom src="${esc(m.src)}" alt="${esc(m.caption || f.title)}" loading="lazy"><figcaption>${esc(m.caption || '')} · 터치하면 확대</figcaption></figure>`).join('');
  const checks = (f.checks || []).map((c, i) => `
    <div class="chk">
      <div class="num">${i + 1}</div>
      <div class="cbody">
        <div class="lbl">확인내용${c.added ? ' <i class="addtag">책자 외 추가 제안</i>' : ''}</div>
        <div class="ctext">${esc(c.text)}</div>
        ${c.points ? `<ul>${c.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
        ${c.table ? tableHtml(c.table) : ''}
        ${c.imgs ? figs(c.imgs, f) : ''}
        ${c.note ? `<div class="cnote">${nl2br(c.note)}</div>` : ''}
        ${c.law ? `<div class="lbl">관련법령</div>${lawLink(c.law, 'lawchip')}` : ''}
        ${c.lawInfo ? `<div class="lawinfo">ⓘ ${nl2br(c.lawInfo)}</div>` : ''}
        ${c.lawCheck ? `<div class="lawwarn">⚠ ${esc(c.lawCheck)}</div>` : ''}
        ${c.lawOld ? `<div class="lawold">책자 표기: ${esc(c.lawOld)}</div>` : ''}
      </div>
    </div>`).join('');
  $('#app').innerHTML = `
    ${crumbs(f.id, false)}
    <article class="detail">
      ${par ? `<span class="tag">${esc(par.title)}</span>` : ''}
      <h2>${esc(f.title)}</h2>
      ${starBtn(f.id)}
      ${f.intro ? `<p>${esc(f.intro)}</p>` : ''}
      ${roles ? `<ul class="roles">${roles}</ul>` : ''}
    </article>
    ${imgs ? `<h3 class="sec">어선형태 및 조업모식도</h3>${imgs}` : ''}
    <h3 class="sec">승선조사 확인사항</h3>
    ${checks}
    ${(f.maps || []).length ? `<h3 class="sec">조업구역·금지구역도 (법령 별표)</h3>${f.maps.map((m) => `<div class="mapref"><div class="mcap">${esc(m.caption)}</div>${m.law ? lawLink(m.law, 'lawchip') : ''}</div>`).join('')}` : ''}`;
  $('#app').insertAdjacentHTML('beforeend', `<a class="reportbtn" href="#/board/new?ref=${encodeURIComponent(f.id)}">✎ 이 업종 내용 오류·의견 건의하기</a>`);
  scrollTo(0, 0);
}

/* ================= 화면: 문서형(doc) ================= */
function viewDoc(n) {
  const links = (n.links || []).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join('');
  $('#app').innerHTML = `${crumbs(n.id, false)}
    <article class="detail">
      <h2>${esc(n.title)}</h2>
      ${starBtn(n.id)}
      ${n.law ? `<div class="law">근거: ${lawLink(n.law, 'lawinline')}</div>` : ''}
      ${renderBody(n.body || '')}
      <div class="links">${links}</div>
      ${n.updated ? `<div class="upd">수정일 ${esc(n.updated)}</div>` : ''}
    </article>`;
  scrollTo(0, 0);
}

window.MAP_GET = (id) => MAP[id];
function setTab(t) { document.querySelectorAll('#tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === t)); }
function route() {
  if (!DATA || !DATA.tree) return;
  document.body.classList.remove('home');
  if (location.hash === '#/search') { setTab('search'); viewSearch(); return; }
  if (location.hash.startsWith('#/board')) { setTab('board'); window.viewBoard && window.viewBoard(); return; }
  if (location.hash === '#/fav') { setTab('fav'); viewFav(); scrollTo(0, 0); return; }
  setTab('home');
  const m = location.hash.match(/^#\/n\/(.+)$/);
  const n = m && MAP[decodeURIComponent(m[1])];
  if (!n) { viewHome(); scrollTo(0, 0); return; }
  if (!isLeaf(n)) viewList(n);
  else if (n.type === 'inspection') viewInspection(n);
  else if (n.type === 'doc' && !n.soon) viewDoc(n);
  else viewList({ ...n, children: [], desc: '준비중입니다.' });
}

/* ================= 관련법령 → 국가법령정보센터 / 저장된 조문 ================= */
// "수산업법 시행령 제38조제2항, 별표 7" → https://www.law.go.kr/법령/수산업법시행령/제38조
function lawUrl(text) {
  const t = String(text).trim();
  const m = t.match(/^(.+?)\s+(제\d+조(?:의\d+)?)/);
  let name = (m ? m[1] : t).trim();
  const alias = (DATA.lawAliases || {})[name];
  if (alias) name = alias;
  name = name.replace(/[「」]/g, '').replace(/\s+/g, '');
  if (!name) return null;
  return 'https://www.law.go.kr/법령/' + encodeURIComponent(name) + (m ? '/' + encodeURIComponent(m[2]) : '');
}
function lawKey(line) {
  const m = String(line).trim().match(/^(.+?)\s+(제\d+조(?:의\d+)?)/);
  if (!m) return null;
  const name = m[1].trim();
  return { key: name + '|' + m[2], name, jo: m[2], hang: (String(line).match(/^.*?제\d+조(?:의\d+)?\s*제(\d+)항/) || [])[1] || '', byeolpyo: /별표/.test(line) };
}
// "수산업법 시행령 제38조제2항, 별표 7" → 법령명 + [조문 칩, 별표 칩]
function parseLaw(line) {
  const t = String(line).trim();
  const i = t.search(/제\d+조|별표/);
  if (i < 0) return { name: t, items: [] };
  const name = t.slice(0, i).trim();
  const items = t.slice(i).split(/\s*[,，]\s*/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const bp = x.match(/^별표\s*(\d+(?:의\d+)?)/);
    if (bp) return { kind: 'bp', label: x, no: '별표 ' + bp[1] };
    const jo = x.match(/^(제\d+조(?:의\d+)?)(?:\s*제(\d+)항)?/);
    return jo ? { kind: 'jo', label: x, jo: jo[1], hang: jo[2] || '' } : { kind: 'etc', label: x };
  });
  return { name, items };
}
function lawLink(text, cls) {
  return String(text).split('\n').filter((x) => x.trim()).map((l) => {
    const P = parseLaw(l);
    if (/고시/.test(l) && !P.items.length) return `<div class="lawrow"><span class="${cls}">${esc(l.trim())}</span></div>`;
    if (!P.items.length) { const u = lawUrl(P.name); return u ? `<div class="lawrow"><a class="${cls}" href="${u}" target="_blank" rel="noopener" data-law>${esc(l.trim())} <span>↗</span></a></div>` : `<div class="lawrow"><span class="${cls}">${esc(l.trim())}</span></div>`; }
    const chips = P.items.map((it, k) => {
      const lab = esc((k === 0 ? P.name + ' ' : '') + it.label);
      if (it.kind === 'jo' && DATA.lawTexts && DATA.lawTexts[P.name + '|' + it.jo])
        return `<button class="${cls} saved" data-lawkey="${esc(P.name + '|' + it.jo)}" data-hang="${it.hang}" data-line="${esc(P.name + ' ' + it.jo)}">${lab} <span>조문 보기</span></button>`;
      if (it.kind === 'bp' && DATA.lawBp && DATA.lawBp[P.name + '|' + it.no])
        return `<button class="${cls} saved bp" data-bpkey="${esc(P.name + '|' + it.no)}">${lab} <span>별표 보기</span></button>`;
      const u = lawUrl(it.kind === 'jo' ? P.name + ' ' + it.jo : P.name);
      return u ? `<a class="${cls}" href="${u}" target="_blank" rel="noopener" data-law>${lab} <span>↗</span></a>` : `<span class="${cls}">${lab}</span>`;
    }).join('');
    return `<div class="lawrow">${chips}</div>`;
  }).join('');
}
const CIRC = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
function openSheet(btn) {
  const key = btn.dataset.lawkey, t = DATA.lawTexts[key], [name, jo] = key.split('|');
  const want = btn.dataset.hang ? CIRC[+btn.dataset.hang - 1] : '';
  let on = false;
  const body = t.text.split('\n').map((ln) => {
    const isHang = CIRC.includes(ln[0]);
    if (isHang) on = !!want && ln[0] === want;
    return `<p class="${isHang ? 'hang' : 'ho'} ${on ? 'hl' : ''}">${esc(ln)}</p>`;
  }).join('');
  const meta = (DATA.lawMeta || {})[name] || '';
  const url = lawUrl(btn.dataset.line);
  const o = document.createElement('div');
  o.className = 'sheetbg';
  o.innerHTML = `<div class="sheet"><div class="shead"><b>${esc(name)} ${esc(jo)}(${esc(t.title)})</b><button class="sx">✕</button></div>
    <div class="smeta">${esc(meta)} 기준 · 앱에 저장된 내용</div>
    <div class="sbody">${body}</div>
    <a class="sorig" href="${url}" target="_blank" rel="noopener" data-law>법령정보센터 원문 열기 ↗</a></div>`;
  o.addEventListener('click', (e) => { if (e.target === o || e.target.closest('.sx')) o.remove(); });
  document.body.appendChild(o);
  const h = o.querySelector('.hl'); if (h) h.scrollIntoView({ block: 'center' });
}
document.addEventListener('click', (e) => { const b = e.target.closest('button[data-lawkey]'); if (b) openSheet(b); });
function openBp(btn) {
  const key = btn.dataset.bpkey, B = DATA.lawBp[key], [name, no] = key.split('|');
  const meta = (DATA.lawMeta || {})[name] || '';
  const url = lawUrl(name);
  const only = B.byNode && CUR && B.byNode[CUR];
  const pages = B.pages.map((p, i) => only && !only.includes(i) ? '' : `<figure class="bpg" id="bpg${i}"><img data-zoom src="${esc(p.src)}" alt="${esc(name + ' ' + no)} 원문 ${p.page}쪽" loading="lazy"><figcaption>원문 PDF ${p.page}쪽 · 터치하면 확대</figcaption></figure>`).join('');
  const o = document.createElement('div');
  o.className = 'sheetbg';
  o.innerHTML = `<div class="sheet"><div class="shead"><b>${esc(name)} [${esc(no)}]<br><small>${esc(B.title)}${B.ref ? ' (' + esc(B.ref) + ')' : ''}</small></b><button class="sx">✕</button></div>
    <div class="smeta">${esc(meta)} 기준 · 앱에 저장된 원문 쪽 이미지</div>
    ${(B.partial || only) ? `<div class="snote">${esc(B.partial || '해당 업종과 관련된 쪽만 발췌했습니다. 전체는 법령정보센터 원문을 보세요.')}</div>` : ''}
    <div class="sbody bpbody">${pages}</div>
    <a class="sorig" href="${url}" target="_blank" rel="noopener" data-law>법령정보센터 원문 열기 ↗</a></div>`;
  o.addEventListener('click', (e) => { if (e.target === o || e.target.closest('.sx')) o.remove(); });
  document.body.appendChild(o);
  const f = !only && o.querySelector('#bpg' + (B.focus || 0)); if (f && B.focus) f.scrollIntoView({ block: 'start' });
}
document.addEventListener('click', (e) => { const b = e.target.closest('button[data-bpkey]'); if (b) openBp(b); });

// 법령 링크: 오프라인이면 안내
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-law]');
  if (a && !navigator.onLine) { e.preventDefault(); alert('법령 원문은 인터넷에 연결되어야 열립니다.'); }
});
// 이미지 확대
document.addEventListener('click', (e) => {
  const img = e.target.closest('img[data-zoom]');
  if (img) {
    const o = document.createElement('div');
    o.className = 'lb';
    o.innerHTML = `<div class="lbbar">닫기 ✕</div><div class="lbin"><img src="${img.src}" alt=""></div>`;
    o.addEventListener('click', (ev) => { if (!ev.target.closest('.lbin img')) o.remove(); else ev.target.classList.toggle('big'); });
    document.body.appendChild(o);
  }
});

/* ================= 내용 불러오기 ================= */
function loadContent() {
  if (window.__INLINE) return Promise.resolve(window.CONTENT);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'content.js?t=' + Date.now();
    s.onload = () => { s.remove(); resolve(window.CONTENT); };
    s.onerror = () => { s.remove(); reject(new Error('load fail')); };
    document.head.appendChild(s);
  });
}
function setData(d) { DATA = d; MAP = {}; PARENT = {}; index(d.tree, null); }
// 모든 이미지를 미리 받아 둬서 오프라인에서도 보이게 한다
function prefetchImages() {
  if (window.__INLINE) return;
  Object.values(MAP).forEach((n) => [...(n.images || []), ...(n.checks || []).flatMap((c) => c.imgs || [])].forEach((m) => fetch(m.src).catch(() => {})));
  Object.values(DATA.lawBp || {}).forEach((b) => b.pages.forEach((p) => fetch(p.src).catch(() => {})));
}

async function load() {
  // 1) 저장된 내용을 먼저 보여준다 (오프라인에서도 즉시 열림)
  try { const c = JSON.parse(localStorage.getItem('content') || 'null'); if (c && c.tree) { setData(c); setStatus('offline'); route(); } } catch (e) {}
  // 2) 연결되면 최신 내용으로 교체한다
  try {
    const d = await loadContent();
    if (!d || !d.tree) throw new Error('bad content');
    setData(d);
    try { localStorage.setItem('content', JSON.stringify(d)); } catch (e) {}
    setStatus(navigator.onLine ? 'online' : 'offline');
    prefetchImages();
  } catch (e) {
    if (!DATA) { $('#app').innerHTML = '<div class="empty">내용을 불러오지 못했습니다.<br>인터넷에 연결해 한 번 열어주세요.</div>'; $('#status').textContent = '○ 오프라인'; return; }
    setStatus('offline');
  }
  // 검색 중이면 화면을 덮어쓰지 않는다
  if (!(SEARCH_MODE && q)) route();
}

window.addEventListener('hashchange', route);
window.addEventListener('online', load);
window.addEventListener('offline', () => DATA && setStatus('offline'));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(() => { if (DATA && navigator.onLine) setTimeout(prefetchImages, 500); }).catch(() => {});
load();

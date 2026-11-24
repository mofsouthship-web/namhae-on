/* 건의사항 게시판: 구글 시트(앱스 스크립트)에 저장, 전 직원 공개 */
(function () {
  const CATS = ['내용 오류', '자료 요청', '앱 불편', '현장 의견'];
  const QK = 'board.queue', CK = 'board.cache';
  let filter = '전체', state = { items: null, loading: false, err: '' };
  const J = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const S = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const url = () => (window.BOARD_URL || '').trim();
  const queue = () => J(QK, []);
  const MK = 'board.mine';
  const mine = () => J(MK, []);
  const mineOf = (id) => mine().find((m) => Number(m.id) === Number(id));
  const post = async (o) => { const r = await fetch(url(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...o, code: window.BOARD_CODE || '' }) }); return r.json(); };

  async function load() {
    if (!url()) return;
    state.loading = true; state.err = ''; repaint();
    try {
      const r = await fetch(url() + '?t=' + Date.now()); const d = await r.json();
      if (!d.ok) throw new Error('bad');
      state.items = d.items; S(CK, d.items);
    } catch (e) { state.items = J(CK, null); state.err = state.items ? '오프라인 — 마지막으로 받은 목록입니다.' : '목록을 불러오지 못했습니다. 연결을 확인하세요.'; }
    state.loading = false; repaint();
  }
  async function flush() {
    if (!url() || !navigator.onLine) return 0;
    let q = queue(), sent = 0;
    for (const it of q.slice()) {
      try {
        const d = await post(it); if (!d.ok) throw new Error(d.error);
        if (d.id) S(MK, mine().filter((m) => m.cid !== it.cid).concat({ id: d.id, cid: it.cid }));
        q = q.filter((x) => x.cid !== it.cid); S(QK, q); sent++;
      } catch (e) { break; }
    }
    return sent;
  }
  function repaint() { if (/^#\/board\/?$/.test(location.hash) && window.__boardPaint) window.__boardPaint(); }

  function listHTML() {
    if (!url()) return `<div class="empty">건의 게시판은 준비 중입니다.<br><small>관리자가 board-config.js 에 주소를 등록하면 열립니다.</small></div>`;
    const q = queue(), items = (state.items || []).filter((x) => filter === '전체' || x.cat === filter);
    return `
      <div class="bhead"><a class="bwrite" href="#/board/new">✎ 건의 작성</a><button class="brefresh" data-b="refresh">새로고침</button></div>
      <div class="bnote">전 직원에게 공개됩니다. 개인정보·민감정보는 쓰지 마세요.</div>
      <div class="bchips">${['전체'].concat(CATS).map((c) => `<button class="bchip${c === filter ? ' on' : ''}" data-b="f" data-v="${c}">${c}</button>`).join('')}</div>
      ${q.length ? `<div class="bpend">전송 대기 ${q.length}건 — 연결되면 자동 전송됩니다.</div>` : ''}
      ${state.err ? `<div class="bpend">${esc(state.err)}</div>` : ''}
      ${state.loading && !state.items ? '<div class="empty">불러오는 중…</div>' : ''}
      ${items.map((x) => `
        <details class="bitem">
          <summary><span class="bst s-${esc(x.status)}">${esc(x.status)}</span><b>${esc(x.title)}</b>
            <small>${esc(x.cat)} · ${esc(x.author)} · ${esc(String(x.at).slice(0, 10))}${x.ref ? ' · ' + esc(x.ref) : ''}</small></summary>
          <div class="bbody">${esc(x.body).replace(/\n/g, '<br>')}</div>
          ${mineOf(x.id) ? `<div class="bmine"><a href="#/board/edit/${x.id}">수정</a><button data-b="del" data-v="${x.id}">삭제</button></div>` : ''}
          ${(x.reply || x.file) ? `<div class="breply"><b>관리자 답변</b> <small>${esc(String(x.replyAt).slice(0, 10))}</small><br>${esc(x.reply || '').replace(/\n/g, '<br>')}${x.file && /^https:\/\/(drive|docs)\.google\.com\//.test(x.file) ? `<a class="bfile" href="${esc(x.file)}" target="_blank" rel="noopener">📎 답변 파일 보기${x.fileName ? ' · ' + esc(x.fileName) : ''}</a>` : ''}</div>` : ''}
        </details>`).join('') || (state.items ? '<div class="empty">아직 글이 없습니다.</div>' : '')}`;
  }
  function formHTML(ref, ed) {
    const n = ref && window.MAP_GET && MAP_GET(ref); const rt = n ? n.title : '';
    if (ed && !mineOf(ed.id)) return '<div class="empty">이 기기에서 작성한 글만 수정할 수 있습니다.</div>';
    return `<h2 class="ptitle">${ed ? '건의 수정' : '건의 작성'}</h2>
      <form id="bform" class="bform" autocomplete="off" ${ed ? `data-edit="${ed.id}"` : ''}>
        <label>분류<select name="cat">${CATS.map((c) => `<option${(ed ? c === ed.cat : ref && c === '내용 오류') ? ' selected' : ''}>${c}</option>`).join('')}</select></label>
        ${rt ? `<div class="bref">관련 업종: <b>${esc(rt)}</b></div>` : ''}<input type="hidden" name="ref" value="${esc(ed ? ed.ref : rt)}">
        <label>제목<input name="title" maxlength="60" required placeholder="한 줄 요약" value="${esc(ed ? ed.title : '')}"></label>
        <label>내용<textarea name="body" rows="7" maxlength="1500" required placeholder="어느 항목이 어떻게 다른지, 필요한 자료가 무엇인지 적어주세요.">${esc(ed ? ed.body : '')}</textarea></label>
        ${ed ? '' : '<label>작성자 <small>(비우면 익명)</small><input name="author" maxlength="20" placeholder="예: 홍길동 / 2호선 / 익명"></label>'}
        <div class="bnote">전 직원에게 공개됩니다. 개인정보·민감정보는 쓰지 마세요.</div>
        <button class="bsubmit" type="submit">${ed ? '수정 저장' : '등록'}</button> <a class="bcancel" href="#/board">취소</a>
      </form>`;
  }

  window.viewBoard = function () {
    const em = location.hash.match(/^#\/board\/edit\/(\d+)$/);
    if (em) { shell(() => formHTML('', (state.items || J(CK, []) || []).find((x) => String(x.id) === em[1]))); scrollTo(0, 0); return; }
    const m = location.hash.match(/^#\/board\/new(?:\?ref=(.+))?$/);
    if (m) { shell(() => formHTML(m[1] && decodeURIComponent(m[1]))); scrollTo(0, 0); return; }
    window.__boardPaint = () => { const b = document.getElementById('body'); if (b) b.innerHTML = listHTML(); };
    shell(listHTML, '<h2 class="ptitle">건의 게시판</h2>');
    scrollTo(0, 0);
    flush().then(() => load());
    if (state.items === null) state.items = J(CK, null), repaint();
  };

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-b]'); if (!b) return;
    if (b.dataset.b === 'f') { filter = b.dataset.v; repaint(); } else if (b.dataset.b === 'refresh') { flush().then(load); }
    else if (b.dataset.b === 'del') {
      const m = mineOf(b.dataset.v); if (!m || !confirm('이 글을 삭제할까요?')) return;
      post({ action: 'delete', id: m.id, cid: m.cid }).then((d) => { if (!d.ok) throw 0; S(MK, mine().filter((x) => x.cid !== m.cid)); load(); }).catch(() => alert('삭제하지 못했습니다. 연결을 확인하세요.'));
    }
  });
  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'bform') return; e.preventDefault();
    const f = e.target, btn = f.querySelector('.bsubmit'); btn.disabled = true; btn.textContent = '등록 중…';
    if (f.dataset.edit) {
      const m = mineOf(f.dataset.edit);
      try { const d = await post({ action: 'edit', id: m.id, cid: m.cid, cat: f.cat.value, title: f.title.value.trim(), body: f.body.value.trim() }); if (!d.ok) throw 0; alert('수정되었습니다.'); state.items = null; location.hash = '#/board'; }
      catch (x) { alert('수정하지 못했습니다. 연결을 확인하세요.'); btn.disabled = false; btn.textContent = '수정 저장'; }
      return;
    }
    const it = { cid: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), cat: f.cat.value, ref: f.ref.value, title: f.title.value.trim(), body: f.body.value.trim(), author: f.author.value.trim() };
    S(QK, queue().concat(it));
    const sent = await flush();
    alert(queue().some((x) => x.cid === it.cid) ? '연결이 안 되어 임시 저장했습니다. 연결되면 자동으로 등록됩니다.' : '등록되었습니다.');
    location.hash = '#/board';
  });
  window.addEventListener('online', () => flush().then(() => /^#\/board\/?$/.test(location.hash) && load()));
  window.addEventListener('load', () => setTimeout(flush, 3000));
})();

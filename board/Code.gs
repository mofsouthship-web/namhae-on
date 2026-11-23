/**
 * 남해온 건의사항 게시판 서버 (구글 시트 + Apps Script)
 * 설치: 시트 열기 → 확장 프로그램 → Apps Script → 이 코드 붙여넣기 → 배포 → 웹 앱
 *       (실행: 나 / 액세스 권한: 모든 사용자) → 웹 앱 URL을 board-config.js 에 입력
 * 관리: 시트의 '건의' 탭에서 상태(H열)·답변(I열)·답변일(J열) 입력, 숨기려면 K열에 Y
 */
const SHEET = '건의';
const HEAD = ['번호', '작성일시', '분류', '제목', '내용', '작성자', '관련업종', '상태', '답변', '답변일', '숨김', '고유값'];
const CATS = ['내용 오류', '자료 요청', '앱 불편', '현장 의견'];
const CODE = '';   // 선택: 입력하면 board-config.js 의 BOARD_CODE 와 같아야 글쓰기 가능 (간단한 외부인 차단용)

function sh_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(SHEET);
  if (!s) { s = ss.insertSheet(SHEET); s.appendRow(HEAD); s.setFrozenRows(1); s.getRange('B:B').setNumberFormat('@'); s.getRange('J:J').setNumberFormat('@'); }
  return s;
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function txt_(x) { if (x instanceof Date) return Utilities.formatDate(x, 'Asia/Seoul', 'yyyy-MM-dd HH:mm'); return x === null || x === undefined ? '' : String(x); }
function safe_(x, n) { x = String(x || '').trim().slice(0, n); return /^[=+\-@]/.test(x) ? "'" + x : x; }

function doGet() {
  const v = sh_().getDataRange().getValues(); v.shift();
  const items = v.filter((r) => r[0] && txt_(r[10]).toUpperCase() !== 'Y').map((r) => ({
    id: r[0], at: txt_(r[1]), cat: txt_(r[2]), title: txt_(r[3]), body: txt_(r[4]), author: txt_(r[5]),
    ref: txt_(r[6]), status: txt_(r[7]) || '접수', reply: txt_(r[8]), replyAt: txt_(r[9]),
  })).reverse().slice(0, 300);
  return out_({ ok: true, items: items });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const d = JSON.parse(e.postData.contents);
    if (CODE && d.code !== CODE) return out_({ ok: false, error: 'code' });
    const title = safe_(d.title, 60), body = safe_(d.body, 1500);
    if (!title || !body) return out_({ ok: false, error: 'empty' });
    const s = sh_(); const v = s.getDataRange().getValues(); v.shift();
    if (d.cid && v.some((r) => r[11] === d.cid)) return out_({ ok: true, dup: true });   // 중복 전송 방지
    const cat = CATS.indexOf(d.cat) >= 0 ? d.cat : '현장 의견';
    const id = v.reduce((m, r) => Math.max(m, Number(r[0]) || 0), 0) + 1;
    s.appendRow([id, Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'), cat, title, body, safe_(d.author, 20) || '익명', safe_(d.ref, 60), '접수', '', '', '', String(d.cid || '')]);
    return out_({ ok: true, id: id });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally { try { lock.releaseLock(); } catch (x) {} }
}

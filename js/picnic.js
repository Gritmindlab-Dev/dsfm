/* =====================================================================
   DS-FM/GLM PICNIC DAY (2026. 10. 29.) — 학생 화면 미션 모듈
   - index.html 이 로그인하면 "dsfm:login" 이벤트를 보내고, 이 파일이 미션 화면을 그려요.
   - 모든 미션은 로그인한 상태에서만 할 수 있어요 (기록이 남아야 결과보고서를 만들 수 있어요).
   데이터 (Firestore)
     picnic_users/{명단ID}   : 출석 시각, 팀, 스탬프
     picnic_teams/{팀ID}     : 팀 이름, 멤버, 간식박스·돗자리·담요, 사진 인증
     picnic_config/main      : QR 인정 시간, 공지 배너, 건물 이름, 간식박스·부스 수량
     picnic_booth_logs/{항목_명단ID} : 체험부스 참여 기록 (스태프가 처리)
     verify_posts (category "피크닉 인증") : 미션 3 사진 인증 글
   ===================================================================== */
(function(){
  "use strict";

  var EVENT_START = new Date("2026-10-29T10:00:00+09:00").getTime();
  var ATTEND_OPEN = new Date("2026-10-29T09:00:00+09:00").getTime(); /* 출석체크 버튼은 행사 당일 09:00부터 */
  function attendOpenNow(cfg){ return ((cfg && cfg.qrMode) === "on") || Date.now() >= ATTEND_OPEN; }
  var EVENT_END   = new Date("2026-10-29T16:00:00+09:00").getTime();
  var POINT_KEYS = ["b1","b2","b3","b4","b5"];
  /* QR 주소의 토큰은 sha256("dsfm-qr|토큰") 값으로만 비교해요 (토큰 원문은 코드에 없어요) */
  var POINT_HASH = {
    b1: "ca6ee2be2822e19ed39a077ba4477e49b22eed9c3eb069615fa64b6868dd13b2",
    b2: "e1a4b197d22960a0c7cb3dd7817b1c65236b11e8ad7ac2b4fc545e5284df87b3",
    b3: "c2cb949078ee0abcfa5a6c07a67fc4329307c99efdba7eb3eb42603a12e25d63",
    b4: "50d62a23f6d727e14617e25a2c302b3b9e2194ec8ca9e6487e7e546fbbe6a60f",
    b5: "a9e9aaec1344a248e06e9ae9ed39f4632b8d83b085041e5b913945d5d848196c"
  };
  /* 건물별 미션 — QR을 찍어야만 보여요.
     type "text" : 각자 한 줄 → 공유공간 게시판에 그대로 올라가요 (자유게시판 / 운영진에게 건의)
     type "photo": 팀에서 1명이 사진 1장 → 사진 게시판에 올라가고, 팀원 모두에게 스탬프 */
  var MISSIONS = {
    b1: { type: "text", board: "private_posts", boardName: "자유게시판", t: "피크닉데이 한 줄 각오", d: "자유게시판에 오늘 피크닉데이\n나의 한 줄 각오를 남겨 주세요!", ph: "예) 오늘 스탬프 5개 다 모으고 라면 먹는다!", prefix: "[PICNIC DAY 각오] " },
    b2: { type: "photo", t: "강의동 거울샷", d: "강의동 거울 앞에서\n팀 전원이 다 나오게 거울샷 찰칵!" },
    b3: { type: "text", board: "suggestion_posts", boardName: "운영진에게 건의", t: "멘토링에 바라는 점", d: "운영진에게 건의에\n'멘토링에 바라는 점'을 한 줄 남겨 주세요.\n성과보고서에 함께 반영돼요.", ph: "예) 다음 학기에는 팀별 활동비가 있으면 좋겠어요", prefix: "[멘토링에 바라는 점] " },
    b4: { type: "photo", t: "0.5배 항공샷", d: "단풍 아래에서 카메라를 0.5배(초광각)로 바꾸고\n머리 위로 높이 들어 단체 셀카!" },
    b5: { type: "photo", t: "멘토 몰아주기", d: "멘토를 화면 한가운데 크게!\n멘티는 양옆에서 볼콕·하트로\n얼굴 몰아주기 셀카" }
  };
  var DEFAULT_POINT_NAMES = { b1:"대학본부", b2:"차미리사기념관", b3:"학생회관", b4:"자연관", b5:"예술관" };
  var BOOTHS = [
    { key:"tarot",   booth:1, name:"진로타로상담",            total:0 },
    { key:"color",   booth:2, name:"퍼스널컬러 진단 + 화장법 상담", total:0 },
    { key:"keycap",  booth:3, name:"키캡 꾸미기",             total:80 },
    { key:"pen",     booth:3, name:"볼꾸 (볼펜 꾸미기)",       total:80 },
    { key:"keyring", booth:3, name:"이니셜 키링 만들기",       total:150 }
  ];
  var PENDING_KEY = "dsfm_pending_qr";
  var OPEN_BOOTH = { tarot: 1, color: 1 }; /* 진로타로·퍼스널컬러: 미션 3 없이 누구나 */

  /* ---------- QR로 들어온 경우: 토큰을 기억해 두고 주소창에서는 지워요 ---------- */
  (function grabQr(){
    try{
      var u = new URL(location.href);
      var t = u.searchParams.get("qr");
      if(t){
        try{ localStorage.setItem(PENDING_KEY, JSON.stringify({ t: t, at: Date.now() })); }catch(e){}
        u.searchParams.delete("qr");
        history.replaceState(null, "", u.pathname + (u.search ? u.search : "") + u.hash);
        window.__dsfmPicnicFromQr = true;
      }
    }catch(e){}
  })();
  function takePending(){
    try{
      var raw = localStorage.getItem(PENDING_KEY);
      if(!raw) return null;
      localStorage.removeItem(PENDING_KEY);
      var p = JSON.parse(raw);
      if(!p || !p.t || Date.now() - (p.at || 0) > 60 * 60 * 1000) return null; /* 1시간 지난 건 버려요 */
      return p.t;
    }catch(e){ return null; }
  }
  /* 로그인 전이면 로그인 화면에 안내 문구를 보여줘요 */
  if(window.__dsfmPicnicFromQr){
    document.addEventListener("DOMContentLoaded", showQrLoginHint);
    if(document.readyState !== "loading") showQrLoginHint();
  }
  function showQrLoginHint(){
    var card = document.querySelector("#login-screen .login-card");
    if(!card || document.getElementById("pk-qr-hint")) return;
    var d = document.createElement("div");
    d.id = "pk-qr-hint";
    d.style.cssText = "margin:0 0 14px;padding:11px 13px;border-radius:12px;background:#fff4d6;color:#6b4a00;font-size:13px;font-weight:700;line-height:1.5";
    d.textContent = "📍 QR 스탬프를 찍었어요! 로그인하면 스탬프가 바로 적립돼요.";
    var form = card.querySelector("form");
    card.insertBefore(d, form || card.firstChild);
  }

  /* ---------- 공통 ---------- */
  function esc(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }
  function hhmm(ts){ if(!ts) return "-"; var d = new Date(ts); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }
  function sha256(text){
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function(buf){
      return Array.prototype.map.call(new Uint8Array(buf), function(b){ return ("0" + b.toString(16)).slice(-2); }).join("");
    });
  }
  function toast(msg, kind){
    var t = document.createElement("div");
    t.className = "pk-toast" + (kind ? " " + kind : "");
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function(){ t.classList.add("out"); }, 3200);
    setTimeout(function(){ t.remove(); }, 3700);
  }
  function qrOpenNow(cfg){
    var mode = (cfg && cfg.qrMode) || "auto";
    if(mode === "on") return true;
    if(mode === "off") return false;
    var n = Date.now();
    return n >= EVENT_START && n <= EVENT_END;
  }
  function pointName(cfg, k){ return (cfg && cfg.points && cfg.points[k]) || DEFAULT_POINT_NAMES[k]; }
  function stampCount(u){ var s = (u && u.stamps) || {}; return POINT_KEYS.filter(function(k){ return !!s[k]; }).length; }
  function boothTotal(cfg, b){ var c = cfg && cfg.booths && cfg.booths[b.key]; return c && typeof c.total === "number" ? c.total : b.total; }
  function boothUsed(cfg, b){ var c = cfg && cfg.booths && cfg.booths[b.key]; return (c && c.used) || 0; }
  function boothClosed(cfg, b){ var c = cfg && cfg.booths && cfg.booths[b.key]; var t = boothTotal(cfg, b); return (t > 0 && boothUsed(cfg, b) >= t); }

  /* ---------- 스타일 ---------- */
  var css = [
    ".pk-banner{display:none;margin:0 0 18px;padding:13px 16px;border-radius:14px;background:linear-gradient(120deg,#4c1226,#7c1f3d);color:#fff;font-weight:700;font-size:14.5px;line-height:1.5;box-shadow:0 6px 18px rgba(76,18,38,.18)}",
    ".pk-banner b{display:inline-block;margin-right:8px;padding:2px 8px;border-radius:999px;background:#ffd76a;color:#4c1226;font-size:11.5px;vertical-align:1px}",
    ".pk-wrap{max-width:560px}",
    ".pk-hero{border-radius:20px;padding:20px 20px 18px;background:linear-gradient(135deg,#7c1f3d 0%,#a8446a 100%);color:#fff;margin-bottom:16px;position:relative;overflow:hidden}",
    ".pk-hero .k{font-size:11.5px;letter-spacing:.12em;font-weight:700;opacity:.8}",
    ".pk-hero h2{font-size:26px;font-weight:900;margin:4px 0 4px;letter-spacing:-.5px}",
    ".pk-hero .s{font-size:13px;opacity:.9}",
    ".pk-hero .all{display:inline-block;margin-top:10px;padding:5px 12px;border-radius:999px;background:#ffd76a;color:#4c1226;font-weight:900;font-size:13px}",
    ".pk-steps{display:flex;gap:6px;margin:0 0 16px}",
    ".pk-step{flex:1;min-width:0;text-align:center;padding:10px 4px;border-radius:12px;background:#fff;border:1.5px solid var(--line);font-size:11.5px;font-weight:700;color:var(--ink-soft);line-height:1.3}",
    ".pk-step .n{display:block;font-size:16px;margin-bottom:2px}",
    ".pk-step.done{background:#e6f2ec;border-color:#bcdccb;color:#2f6a4c}",
    ".pk-step.now{background:var(--wine-deep);border-color:var(--wine-deep);color:#fff;box-shadow:0 6px 16px rgba(76,18,38,.25)}",
    ".pk-card{background:#fff;border:1.5px solid var(--line);border-radius:18px;padding:18px;margin-bottom:14px}",
    ".pk-card.lock{opacity:.55}",
    ".pk-card h3{font-size:17px;margin:0 0 4px;display:flex;align-items:center;gap:8px}",
    ".pk-card .d{font-size:13.5px;color:var(--ink-soft);line-height:1.55;margin:0 0 12px}",
    ".pk-tag{display:inline-block;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;background:var(--blush);color:var(--wine-deep)}",
    ".pk-tag.ok{background:#e6f2ec;color:#2f6a4c}.pk-tag.lock{background:#eee;color:#888}",
    ".pk-big{all:unset;box-sizing:border-box;display:block;width:100%;text-align:center;cursor:pointer;padding:18px;border-radius:16px;background:var(--wine-deep);color:#fff;font-size:19px;font-weight:900;box-shadow:0 8px 20px rgba(76,18,38,.25)}",
    ".pk-big:active{transform:scale(.98)}.pk-big[disabled]{opacity:.5;cursor:default}",
    ".pk-big.alt{background:#fff;color:var(--wine-deep);border:2px solid var(--wine-deep);box-shadow:none}",
    ".pk-pass{border-radius:18px;padding:20px;text-align:center;background:#f3fbf6;border:2.5px solid #3f7a5c}",
    ".pk-pass .ck{width:64px;height:64px;border-radius:50%;background:#3f7a5c;color:#fff;font-size:36px;line-height:64px;margin:0 auto 10px;font-weight:900}",
    ".pk-pass .nm{font-size:26px;font-weight:900;color:var(--ink)}",
    ".pk-pass .sb{font-size:14px;color:var(--ink-soft);margin-top:4px}",
    ".pk-pass .tm{font-size:15px;font-weight:700;margin-top:10px;color:#2f6a4c}",
    ".pk-pass .live{font-size:12px;color:var(--ink-soft);margin-top:8px}",
    ".pk-stamps{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:4px 0 6px}",
    ".pk-stamp{display:flex;flex-direction:column;align-items:center;text-align:center;font-size:10.5px;color:var(--ink-soft);line-height:1.2;word-break:keep-all;padding:6px 2px 4px;border-radius:14px;background:#f7f9f7}",
    ".pk-stamp .ic{width:100%;max-width:58px;aspect-ratio:1/1;margin-bottom:5px}",
    ".pk-stamp .ic svg{display:block;width:100%;height:100%}",
    ".pk-stamp.on{background:#eef8f1;color:#1f6b3a;font-weight:700}",
    ".pk-stamp.tp{background:#fff;outline:2px dashed #2f8a4c;outline-offset:-2px;color:#1f6b3a}",
    ".pk-stamp .tm{font-weight:400;font-size:9.5px;margin-top:1px}",
    ".pk-prog{display:flex;align-items:center;gap:10px;margin:8px 0 2px}",
    ".pk-prog .bar{flex:1;height:10px;border-radius:99px;background:#e6eee8;overflow:hidden}",
    ".pk-prog .bar i{display:block;height:100%;background:#2f8a4c;border-radius:99px;transition:width .6s}",
    ".pk-prog .c{font-weight:900;font-size:14px;color:#1f6b3a;min-width:40px;text-align:right}",
    ".pk-pop{position:fixed;inset:0;z-index:10001;background:rgba(30,40,34,.62);display:flex;align-items:center;justify-content:center;padding:20px}",
    ".pk-pop .bx{width:100%;max-width:340px;background:#fff;border-radius:24px;padding:26px 22px 20px;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,.35);animation:pkPopIn .25s ease-out}",
    ".pk-pop .stp{position:relative;width:160px;height:160px;margin:18px auto 30px}",
    ".pk-pop .stp svg.mk{position:absolute;inset:0;width:100%;height:100%;animation:pkStampIn .55s cubic-bezier(.2,1.4,.4,1) both .1s}",
    ".pk-pop .stp svg.ray{position:absolute;inset:-26px;width:calc(100% + 52px);height:calc(100% + 52px);animation:pkRay .5s ease-out both .45s}",
    ".pk-pop .t{font-size:22px;font-weight:900;color:#1d2a22;margin-top:6px}",
    ".pk-pop .s{font-size:14.5px;color:#55625a;margin-top:6px;line-height:1.5}",
    ".pk-pop .s b{color:#1f6b3a}",
    ".pk-pop button{all:unset;box-sizing:border-box;display:block;width:100%;margin-top:18px;padding:15px;border-radius:14px;background:#2f8a4c;color:#fff;font-weight:900;font-size:16px;cursor:pointer}",
    "@keyframes pkStampIn{0%{transform:scale(2.6) rotate(-22deg);opacity:0}60%{transform:scale(.88) rotate(-8deg);opacity:1}100%{transform:scale(1) rotate(-8deg);opacity:1}}",
    "@keyframes pkRay{0%{transform:scale(.6);opacity:0}100%{transform:scale(1);opacity:1}}",
    "@keyframes pkPopIn{0%{transform:scale(.92);opacity:0}100%{transform:scale(1);opacity:1}}",
    ".pk-mem{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--line);font-size:14px}",
    ".pk-mem:first-child{border-top:0}",
    ".pk-mem .bar{flex:1;height:8px;border-radius:99px;background:#f1e6e9;overflow:hidden}",
    ".pk-mem .bar i{display:block;height:100%;background:var(--wine-soft);border-radius:99px}",
    ".pk-mem .bar i.full{background:#3f7a5c}",
    ".pk-mem .c{font-weight:700;min-width:34px;text-align:right}",
    ".pk-ok{margin-top:12px;border-radius:14px;padding:16px;text-align:center;background:#3f7a5c;color:#fff}",
    ".pk-ok .t{font-size:20px;font-weight:900}.pk-ok .s{font-size:13px;opacity:.9;margin-top:4px}",
    ".pk-info{margin-top:10px;padding:10px 12px;border-radius:12px;background:var(--cream);font-size:13px;line-height:1.55;color:var(--ink)}",
    ".pk-booth{display:flex;align-items:center;gap:10px;padding:11px 0;border-top:1px solid var(--line)}",
    ".pk-booth:first-child{border-top:0}",
    ".pk-booth .no{width:28px;height:28px;border-radius:8px;background:var(--blush);color:var(--wine-deep);font-weight:900;font-size:13px;display:flex;align-items:center;justify-content:center;flex:none}",
    ".pk-booth .nm{flex:1;font-size:14px;font-weight:700}",
    ".pk-booth .rm{font-size:12.5px;font-weight:700;color:var(--ink-soft);text-align:right}",
    ".pk-booth .rm.end{color:#b23b3b}.pk-booth .rm.mine{color:#2f6a4c}",
    ".pk-myqr{text-align:center}.pk-myqr .box{display:inline-block;padding:10px;background:#fff;border-radius:12px;border:1.5px solid var(--line)}",
    ".pk-myqr svg,.pk-myqr img{display:block;width:200px;height:200px}",
    ".pk-files{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:10px 0}",
    ".pk-files img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:10px;border:1px solid var(--line)}",
    ".pk-ta{width:100%;box-sizing:border-box;border:1.5px solid var(--line);border-radius:12px;padding:12px;font:inherit;font-size:15px;min-height:84px;resize:vertical;background:var(--cream);margin-bottom:10px}",
    ".pk-toast{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:10000;max-width:calc(100vw - 32px);padding:13px 18px;border-radius:14px;background:#2a1e22;color:#fff;font-weight:700;font-size:14.5px;box-shadow:0 10px 30px rgba(0,0,0,.25);transition:opacity .4s}",
    ".pk-toast.ok{background:#3f7a5c}.pk-toast.bad{background:#b23b3b}.pk-toast.out{opacity:0}",
    ".pk-mo{position:fixed;inset:0;z-index:9998;background:rgba(42,30,34,.6);display:flex;align-items:center;justify-content:center;padding:20px}",
    ".pk-mo .bx{width:100%;max-width:400px;background:#fff;border-radius:22px;padding:24px 22px 20px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.3)}",
    ".pk-mo .st{font-size:13px;font-weight:700;color:#3f7a5c}.pk-mo .bn{font-size:24px;font-weight:900;margin:4px 0 14px}",
    ".pk-mo .ms{border:2.5px solid var(--wine-soft);border-radius:16px;padding:16px 14px;background:#fdf6f8}",
    ".pk-mo .ms .h{display:inline-block;padding:3px 12px;border-radius:999px;background:var(--wine-soft);color:#fff;font-size:12.5px;font-weight:700}",
    ".pk-mo .ms .t{font-size:20px;font-weight:900;color:var(--wine-deep);margin:8px 0 6px}.pk-mo .ms .d{font-size:15.5px;line-height:1.6;white-space:pre-line;font-weight:500}",
    ".pk-mo button{all:unset;box-sizing:border-box;display:block;width:100%;margin-top:16px;padding:15px;border-radius:14px;background:var(--wine-deep);color:#fff;font-weight:900;font-size:16px;cursor:pointer}",
    ".pk-stamp.on{cursor:pointer}",
    ".pk-mo .ans{margin-top:14px;text-align:left}.pk-mo .ans .l{font-size:12.5px;font-weight:700;color:var(--ink-soft);margin-bottom:6px}",
    ".pk-mo .ans .v{padding:12px;border-radius:12px;background:var(--cream);font-size:15px;line-height:1.5;white-space:pre-wrap}",
    ".pk-mo textarea{width:100%;box-sizing:border-box;min-height:84px;border:1.5px solid var(--line);border-radius:12px;padding:12px;font:inherit;font-size:16px;background:var(--cream);resize:vertical}",
    ".pk-mo button.alt{background:#fff;color:var(--wine-deep);border:2px solid var(--wine-deep);margin-top:0;padding:12px}",
    ".pk-mo button[disabled]{opacity:.5}",
    ".pk-mo button.sub{background:none;color:var(--ink-soft);font-size:13.5px;font-weight:700;margin-top:6px;padding:10px}",
    ".pk-mo .bx{max-height:calc(100dvh - 40px);overflow:auto}",
    ".pk-note{font-size:12px;color:var(--ink-soft);line-height:1.6;margin-top:8px}",
    "#rail-nav button[data-page=picnic]{position:relative}",
    "#rail-nav button[data-page=picnic]:not(.active){color:#ffd76a;font-weight:700}",
    "@media (max-width:760px){.pk-hero h2{font-size:23px}.pk-stamps{gap:5px}.pk-stamp{font-size:9.5px}}"
  ].join("\n");
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  /* ---------- 상태 ---------- */
  var S = { proofs:{}, me:null, user:undefined, cfg:{}, team:null, members:[], logs:[], files:[], uploading:false, started:false };
  var db = null, unsubProofs = null, unsubTeam = null, unsubMembers = null, curTeamId = null;

  function root(){ return document.getElementById("picnic-root"); }

  /* ---------- 공지 배너 (모든 화면 위에) ---------- */
  function renderBanner(){
    var el = document.getElementById("picnic-banner");
    if(!el) return;
    var c = S.cfg || {};
    if(c.bannerOn && c.banner){
      el.innerHTML = "<b>현장 공지</b>" + esc(c.banner);
      el.style.display = "block";
    } else el.style.display = "none";
  }

  /* ---------- 화면 ---------- */
  function stage(){
    var u = S.user;
    if(!u || !u.attendAt) return 1;
    if(!u.teamId || !u.verifiedAt) return 1;
    if(!S.team || !S.team.photoAt) return S.team && teamComplete() ? 3 : 2;
    return 4;
  }
  function teamComplete(){
    if(!S.team) return false;
    var ids = S.team.members || [];
    if(!ids.length) return false;
    return ids.every(function(id){
      var m = S.members.filter(function(x){ return x.id === id; })[0];
      return m && stampCount(m.d) >= 5;
    });
  }

  function render(){
    renderBanner();
    var el = root(); if(!el) return;
    if(!S.me){ el.innerHTML = ""; return; }
    if(S.user === undefined){ el.innerHTML = '<div class="pk-card">불러오는 중...</div>'; return; }
    var cur = stage();
    var u = S.user || {};
    var steps = [["1","출석"],["2","QR 스탬프"],["3","사진 인증"],["★","체험부스"]];
    var html = '<div class="pk-wrap">' +
      '<div class="pk-hero"><div class="k">2026 DS-FM/GLM</div><h2>PICNIC DAY</h2><div class="s">10.29 (목) 10:00~16:00 · 영근터</div><span class="all">올데이미션! 10~16시 언제든 OK</span></div>' +
      '<div class="pk-steps">' + steps.map(function(s, i){
        var n = i + 1, cls = n < cur ? "done" : n === cur ? "now" : "";
        return '<div class="pk-step ' + cls + '"><span class="n">' + (n < cur ? "✓" : s[0]) + '</span>' + s[1] + '</div>';
      }).join("") + '</div>';

    /* 미션 1 */
    if(!u.attendAt){
      html += '<div class="pk-card"><h3>피크닉미션 1 · 출석체크</h3><p class="d">버튼을 누르면 출석 시각이 기록돼요. 출석 완료 화면을 <b>운영본부</b>에 보여주면 팀을 배정해 드려요.</p>' +
        (attendOpenNow(S.cfg) ? '<button class="pk-big" type="button" data-pk="attend">출석체크 하기</button>' :
          '<button class="pk-big" type="button" disabled>10/29(목) 오전 9시부터 출석할 수 있어요</button>') + '</div>';
    } else if(!u.teamId || !u.verifiedAt){
      html += '<div class="pk-card"><h3>피크닉미션 1 · 출석 완료 <span class="pk-tag ok">완료</span></h3><p class="d">이 화면을 <b>운영본부 스태프</b>에게 보여주세요. 확인을 받으면 미션 2가 열려요.</p>' +
        passHtml(u, "출석 " + hhmm(u.attendAt) + (u.teamId && S.team ? " · 팀 " + S.team.name : "")) + '</div>' +
        lockCard("피크닉미션 2 · 교내 QR을 모아라!", "운영본부에서 출석 확인을 받으면 열려요.");
    } else {
      html += teamCard(u);
    }
    if(u.teamId && u.verifiedAt){
      html += stampCard(u);
      html += photoCard(u);
      html += boothCard(u);
    } else if(u.attendAt){
      html += lockCard("피크닉미션 3 · 피크닉 사진 인증", "미션 2를 마치면 열려요.") + lockCard("체험부스 (13:00~16:00)", "미션 3을 마치면 이용권이 열려요.");
    }
    html += '</div>';
    el.innerHTML = html;
    if(u.teamId && u.verifiedAt) drawMyQr();
  }
  function lockCard(t, d){ return '<div class="pk-card lock"><h3>🔒 ' + esc(t) + '</h3><p class="d" style="margin:0">' + esc(d) + '</p></div>'; }
  function passHtml(u, line){
    var me = S.me;
    return '<div class="pk-pass"><div class="ck">✓</div><div class="nm">' + esc(me.name) + '</div>' +
      '<div class="sb">' + esc([me.college, me.teamName, me.role].filter(Boolean).join(" · ")) + '</div>' +
      '<div class="tm">' + esc(line) + '</div><div class="live" data-clock>' + new Date().toLocaleTimeString("ko-KR") + ' 기준</div></div>';
  }
  function teamCard(u){
    var t = S.team;
    return '<div class="pk-card"><h3>내 팀 <span class="pk-tag ok">출석 ' + hhmm(u.attendAt) + '</span></h3>' +
      '<div style="font-size:22px;font-weight:900;color:var(--wine-deep);margin:2px 0 4px">' + esc(t ? t.name : "팀 정보를 불러오는 중") + '</div>' +
      '<div class="d" style="margin:0">' + (t ? ((t.members || []).length + "명" + (t.hasMentor ? " · 멘토 포함" : " · 멘티 팀")) : "") + '</div></div>';
  }
  /* 초록 도장 그림 (찍힌 것 / 빈 칸) */
  function stampSvg(on, big){
    var c = on ? "#2f8a4c" : "#c5cfc8", f = on ? "#fff" : "none", dash = on ? "" : ' stroke-dasharray="7 6"';
    var icon = '<g fill="' + (on ? c : "none") + '" stroke="' + c + '" stroke-width="' + (on ? 0 : 4) + '" stroke-linejoin="round">' +
      '<circle cx="60" cy="33" r="10"/><path d="M55 42h10l3 12H52z"/><rect x="40" y="54" width="40" height="11" rx="3"/></g>' +
      (on ? '<rect x="44" y="68" width="32" height="3.5" rx="1.75" fill="' + c + '" opacity=".5"/>' : "");
    return '<svg viewBox="0 0 120 120" aria-hidden="true">' +
      '<circle cx="60" cy="60" r="55" fill="' + f + '" stroke="' + c + '" stroke-width="5"' + dash + '/>' +
      (on ? '<circle cx="60" cy="60" r="46" fill="none" stroke="' + c + '" stroke-width="2" stroke-dasharray="4 4"/>' : "") +
      icon +
      (on ? '<text x="60" y="91" text-anchor="middle" font-size="' + (big ? 17 : 15) + '" font-weight="900" fill="' + c + '" font-family="Arial,sans-serif" letter-spacing="1">STAMP</text>' : "") +
      '</svg>';
  }
  function showStampPop(key, cnt, sub){
    try{ if(navigator.vibrate) navigator.vibrate(80); }catch(e){}
    var rays = "", cols = ["#f5b82e","#e8546b","#3b82f6","#2f8a4c","#a855f7","#f97316","#14b8a6","#ec4899"];
    for(var i = 0; i < 12; i++){
      var a = i * 30 * Math.PI / 180, r1 = 92, r2 = 106;
      rays += '<line x1="' + (111 + r1 * Math.cos(a)).toFixed(1) + '" y1="' + (111 + r1 * Math.sin(a)).toFixed(1) + '" x2="' + (111 + r2 * Math.cos(a)).toFixed(1) + '" y2="' + (111 + r2 * Math.sin(a)).toFixed(1) + '" stroke="' + cols[i % cols.length] + '" stroke-width="5" stroke-linecap="round"/>';
    }
    var nm = pointName(S.cfg, key);
    var w = document.createElement("div"); w.className = "pk-pop";
    w.innerHTML = '<div class="bx" role="dialog" aria-label="스탬프 적립">' +
      '<div class="stp"><svg class="ray" viewBox="0 0 222 222" aria-hidden="true">' + rays + '</svg>' + stampSvg(true, true).replace("<svg ", '<svg class="mk" ') + '</div>' +
      '<div class="t">스탬프가 찍혔어요!</div>' +
      '<div class="s"><b>' + esc(nm) + '</b> 미션 완료 · <b>' + cnt + ' / 5</b>' + (sub ? '<br>' + esc(sub) : "") +
      (cnt >= 5 ? '<br><b>5개 모두 모았어요!</b> 팀원 모두 모으면 간식박스를 받을 수 있어요.' : "") + '</div>' +
      '<button type="button">확인</button></div>';
    w.querySelector("button").addEventListener("click", function(){ w.remove(); });
    w.addEventListener("click", function(e){ if(e.target === w) w.remove(); });
    document.body.appendChild(w);
  }
  function stampCard(u){
    var cfg = S.cfg, s = u.stamps || {}, n = stampCount(u), open = qrOpenNow(cfg);
    var html = '<div class="pk-card"><h3>피크닉미션 2 · 교내 QR을 모아라! ' + (n >= 5 ? '<span class="pk-tag ok">5/5 완료</span>' : '<span class="pk-tag">' + n + '/5</span>') + '</h3>' +
      '<p class="d">교내 5개 건물에 붙은 QR을 <b>휴대폰 카메라</b>로 찍으면 <b>미션</b>이 열려요. 한 줄 쓰기 미션은 각자, 사진 미션은 팀에서 1명이 올리면 팀원 모두에게 스탬프가 찍혀요. 팀원 <b>전원</b>이 5개를 모으면 간식박스를 받을 수 있어요.' +
      (open ? "" : '<br><b style="color:#b23b3b">지금은 QR 인정 시간이 아니에요 (10:00~16:00).</b>') + '</p>' +
      '<div class="pk-stamps">' + POINT_KEYS.map(function(k){
        var tp = !s[k] && MISSIONS[k].type === "photo" && S.proofs[k];
        return '<div class="pk-stamp' + (s[k] ? " on" : tp ? " tp" : "") + '"' + (s[k] ? ' data-pk="mission" data-key="' + k + '"' : "") + '>' +
          '<div class="ic">' + stampSvg(!!s[k]) + '</div>' + esc(pointName(cfg, k)) +
          (s[k] ? '<span class="tm">' + hhmm(s[k]) + '</span>' : tp ? '<span class="tm" style="font-weight:700">팀 인증 완료<br>QR 찍기!</span>' : "") + '</div>';
      }).join("") + '</div>' +
      '<div class="pk-prog"><span class="bar"><i style="width:' + (n * 20) + '%"></i></span><span class="c">' + n + ' / 5</span></div>';
    /* 팀원 진행 현황 */
    var t = S.team;
    if(t){
      var ids = t.members || [];
      html += '<div style="font-size:13px;font-weight:700;margin:14px 0 4px">팀원 진행 현황</div><div>' + ids.map(function(id){
        var m = S.members.filter(function(x){ return x.id === id; })[0];
        var d = m ? m.d : {}, c = stampCount(d);
        return '<div class="pk-mem"><span style="min-width:62px;font-weight:' + (id === S.me.rosterId ? 900 : 500) + '">' + esc(d.name || "팀원") + (d.role === "멘토" ? ' <span class="pk-tag" style="font-size:10px;padding:1px 6px">멘토</span>' : "") + '</span>' +
          '<span class="bar"><i class="' + (c >= 5 ? "full" : "") + '" style="width:' + (c * 20) + '%"></i></span><span class="c">' + c + '/5</span></div>';
      }).join("") + '</div>';
      if(teamComplete()){
        html += t.snackAt ?
          '<div class="pk-ok" style="background:#2a1e22"><div class="t">🧺 간식박스 수령 완료</div><div class="s">' + hhmm(t.snackAt) + ' 수령 · 영근터 피크닉은 16:00까지!</div></div>' :
          '<div class="pk-ok"><div class="t">🧺 간식박스 수령 가능!</div><div class="s">팀원 모두 함께 <b>큐브컨테이너</b>(영근터 앞 카페 옆)로 와서<br>이 화면을 보여주세요 · 11:00~14:00 · 선착순</div>' +
            '<div style="margin-top:10px;padding:10px;border-radius:10px;background:rgba(255,255,255,.15);font-size:15px;font-weight:900">' + esc(t.name) + ' · ' + ids.length + '명 · 전원 5/5</div></div>';
      }
    }
    return html + '</div>';
  }
  function photoCard(u){
    var t = S.team;
    if(!t) return "";
    if(t.photoAt){
      return '<div class="pk-card"><h3>피크닉미션 3 · 사진 인증 <span class="pk-tag ok">완료</span></h3><p class="d" style="margin:0">' + esc(t.photoBy || "팀 대표") + ' 님이 ' + hhmm(t.photoAt) + '에 인증했어요. 팀 전원에게 체험부스 이용권이 열렸어요! 인증 글은 <a href="#" data-goto="verify" style="color:var(--wine-deep);font-weight:700">인증게시판</a>에서 볼 수 있어요.</p></div>';
    }
    if(!teamComplete()) return lockCard("피크닉미션 3 · 피크닉 사진 인증", "팀원 전원이 스탬프 5개를 모으면 열려요.");
    var files = S.files;
    return '<div class="pk-card"><h3>피크닉미션 3 · 피크닉 사진 인증</h3>' +
      '<p class="d">영근터에서 <b>멘토·멘티가 함께 간식을 먹는 사진 2장 이상</b> + 간단한 소감을 <b>팀 대표 1명</b>이 올려주세요. 올리면 팀 전원에게 체험부스 이용권이 열려요.</p>' +
      '<button class="pk-big alt" type="button" data-pk="pick">📷 사진 고르기 (2~4장)</button>' +
      '<input type="file" id="pk-file" accept="image/*" multiple style="display:none">' +
      (files.length ? '<div class="pk-files">' + files.map(function(f){ return '<img src="' + f + '" alt="">'; }).join("") + '</div>' : '<div class="pk-note">아직 고른 사진이 없어요.</div>') +
      '<textarea class="pk-ta" id="pk-cap" maxlength="500" placeholder="간단한 소감을 적어주세요" style="margin-top:10px">' + esc(S.capDraft || "") + '</textarea>' +
      '<button class="pk-big" type="button" data-pk="upload"' + (files.length < 2 || S.uploading ? " disabled" : "") + '>' + (S.uploading ? "올리는 중..." : files.length < 2 ? "사진을 2장 이상 골라주세요" : "사진 " + files.length + "장 인증 올리기") + '</button></div>';
  }
  function boothCard(u){
    var t = S.team, cfg = S.cfg;
    var pass = !!(t && t.photoAt);
    var mine = {}; S.logs.forEach(function(l){ mine[l.item] = l; });
    var html = '<div class="pk-card"><h3>🎟️ 체험부스 · 13:00~16:00 ' + (pass ? '<span class="pk-tag ok">이용권 OK</span>' : '<span class="pk-tag lock">키캡·볼꾸·키링은 미션 3 후</span>') + '</h3>' +
      '<p class="d">모두 무료·선착순이에요. <b>진로타로·퍼스널컬러는 누구나</b>, 키캡·볼꾸·키링은 <b>미션 3(사진 인증)</b>을 마친 팀만 참여할 수 있어요. 부스에서 서명부를 쓰고, 아래 <b>내 QR</b>을 스태프에게 보여주세요.</p><div>' +
      BOOTHS.map(function(b){
        var tot = boothTotal(cfg, b), used = boothUsed(cfg, b), closed = boothClosed(cfg, b);
        var rm = mine[b.key] ? '<span class="rm mine">✓ 참여 ' + hhmm(mine[b.key].createdAt) + '</span>' :
          closed ? '<span class="rm end">마감</span>' :
          tot > 0 ? '<span class="rm">남은 ' + Math.max(0, tot - used) + '개</span>' : '<span class="rm">선착순</span>';
        return '<div class="pk-booth"><span class="no">' + b.booth + '</span><span class="nm">' + esc(b.name) + (OPEN_BOOTH[b.key] ? ' <span class="pk-tag ok" style="font-size:10.5px">누구나</span>' : '') + '</span>' + rm + '</div>';
      }).join("") + '</div>';
    html += '<div class="pk-myqr" style="margin-top:14px"><div style="font-size:13px;font-weight:700;margin-bottom:8px">내 QR (부스 참여 확인용)</div><div class="box" id="pk-myqr"></div>' +
      '<div class="pk-note">' + esc(S.me.name) + ' · ' + esc(S.me.college || "") + '</div></div>';
    return html + '</div>';
  }
  function drawMyQr(){
    var box = document.getElementById("pk-myqr");
    if(!box || typeof qrcode !== "function") return;
    var url = location.origin + location.pathname.replace(/[^/]*$/, "") + "staff/?u=" + encodeURIComponent(S.me.rosterId);
    try{ var q = qrcode(0, "M"); q.addData(url); q.make(); box.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }catch(e){}
  }
  setInterval(function(){ var c = document.querySelector("[data-clock]"); if(c) c.textContent = new Date().toLocaleTimeString("ko-KR") + " 기준"; }, 1000);

  /* ---------- 동작 ---------- */
  function attend(btn){
    if(!attendOpenNow(S.cfg)){ toast("출석체크는 10/29(목) 오전 9시부터 할 수 있어요.", "bad"); render(); return; }
    if(!S.me.rosterId){ toast("명단 정보가 없어요. 로그아웃 후 다시 로그인해 주세요.", "bad"); return; }
    btn.disabled = true; btn.textContent = "기록 중...";
    var me = S.me;
    db.collection("picnic_users").doc(me.rosterId).set({
      rosterId: me.rosterId, name: me.name, college: me.college || "", team: me.team || "", teamName: me.teamName || "", role: me.role || "멘티",
      attendAt: Date.now(), teamId: "", stamps: {}, createdAt: Date.now()
    }).then(function(){ toast("출석 완료! 운영본부에 화면을 보여주세요.", "ok"); })
      .catch(function(e){ btn.disabled = false; btn.textContent = "출석체크 하기"; toast("저장하지 못했어요. 다시 눌러주세요.", "bad"); console.warn(e); });
  }

  function giveStamp(key, extra){
    var upd = {}; upd["stamps." + key] = Date.now();
    if(extra) upd["missions." + key] = extra;
    var cnt = stampCount(S.user) + 1;
    return db.collection("picnic_users").doc(S.me.rosterId).update(upd).then(function(){ return cnt; });
  }
  /* 사진 미션: 1명이 올리면 팀원 모두에게 스탬프 */
  function teamStamp(key){
    try{
      var now = Date.now(), b = db.batch(), n = 0;
      (S.members || []).forEach(function(m){
        if(m.id === S.me.rosterId || !m.d || !m.d.teamId || (m.d.stamps && m.d.stamps[key])) return;
        var u = {}; u["stamps." + key] = now; b.update(db.collection("picnic_users").doc(m.id), u); n++;
      });
      if(n) b.commit().catch(function(e){ console.warn("팀원 스탬프", e); });
    }catch(e){ console.warn(e); }
  }
  /* 팀원이 이미 올린 사진 미션은 내 스탬프도 자동으로 (늦게 합류한 팀원 등) */
  var autoTried = {};
  function autoTeamStamps(){
    var u = S.user; if(!u || !u.teamId || !u.verifiedAt || !db) return;
    POINT_KEYS.forEach(function(k){
      if(MISSIONS[k].type !== "photo" || !S.proofs[k] || (u.stamps && u.stamps[k]) || autoTried[k]) return;
      if(S.proofs[k].teamId !== u.teamId || S.proofs[k].byId === S.me.rosterId) return;
      autoTried[k] = 1;
      giveStamp(k).then(function(cnt){ showStampPop(k, cnt, (S.proofs[k].by || "팀원") + " 님이 팀 사진을 올려서 함께 적립됐어요"); }).catch(function(){ autoTried[k] = 0; });
    });
  }
  /* mode: "new"(미션 하기) | "team"(팀원이 이미 사진 인증 → 스탬프 적립됨) | "done"(다시 보기) */
  function showMission(key, mode, headline){
    var m = MISSIONS[key]; if(!m) return;
    var old = document.querySelector(".pk-mo"); if(old) old.remove();
    var w = document.createElement("div"); w.className = "pk-mo";
    var file = "";
    function draw(){
      var body = "";
      var proof = S.proofs[key], mine = S.user && S.user.missions && S.user.missions[key];
      if(mode === "new" && m.type === "text"){
        body = '<div class="ans"><div class="l">' + esc(m.boardName) + '에 그대로 올라가요</div><textarea maxlength="300" placeholder="' + esc(m.ph) + '"></textarea></div>' +
          '<button type="button" data-mo="submit">올리고 스탬프 받기</button><button type="button" data-mo="close" class="sub">나중에 하기 (QR 다시 찍으면 돼요)</button>';
      } else if(mode === "new"){
        body = '<div class="ans"><div class="l">팀에서 1명만 올리면 팀원 모두 스탬프 · 사진 게시판에 올라가요</div>' +
          '<button type="button" data-mo="pick" class="alt">📷 사진 고르기</button><input type="file" accept="image/*" style="display:none">' +
          (file ? '<div class="pk-files" style="margin:8px 0;grid-template-columns:1fr"><img src="' + file + '" alt="" style="aspect-ratio:auto;max-height:240px;object-fit:contain"></div>' : "") + '</div>' +
          '<button type="button" data-mo="submit"' + (file ? "" : " disabled") + '>' + (file ? "사진 올리고 스탬프 받기" : "사진을 골라 주세요") + '</button>' +
          '<button type="button" data-mo="close" class="sub">닫기 (팀원이 올리면 QR만 다시 찍으면 돼요)</button>';
      } else if(m.type === "text"){
        body = (mine ? '<div class="ans"><div class="l">내가 남긴 글 · ' + hhmm(mine.at) + '</div><div class="v">' + esc(mine.a) + '</div></div>' : "") + '<button type="button" data-mo="close">닫기</button>';
      } else {
        body = (proof ? '<div class="ans"><div class="l">우리 팀 사진 · ' + esc(proof.by || "") + ' · ' + hhmm(proof.at) + '</div><div class="pk-files" style="margin:6px 0;grid-template-columns:1fr"><img src="' + (proof.images || [])[0] + '" alt="" style="aspect-ratio:auto;max-height:240px;object-fit:contain"></div></div>' : "") +
          '<button type="button" data-mo="close">닫기</button>';
      }
      var keep = w.querySelector("textarea") ? w.querySelector("textarea").value : "";
      w.innerHTML = '<div class="bx"><div class="st">' + esc(headline) + '</div><div class="bn">' + esc(pointName(S.cfg, key)) + '</div>' +
        '<div class="ms"><span class="h">미션</span><div class="t">' + esc(m.t) + '</div><div class="d">' + esc(m.d) + '</div></div>' + body + '</div>';
      var ta = w.querySelector("textarea"); if(ta) ta.value = keep;
      var fi = w.querySelector("input[type=file]");
      if(fi) fi.addEventListener("change", function(){
        var f = fi.files && fi.files[0];
        if(!f || f.type.indexOf("image/") !== 0) return;
        compress(f, 800, 0.6).then(function(d){ file = d; draw(); }).catch(function(){ toast("사진을 읽지 못했어요.", "bad"); });
      });
    }
    w.addEventListener("click", function(e){
      var b = e.target.closest("[data-mo]"); if(!b) return;
      var a = b.dataset.mo;
      if(a === "close"){ w.remove(); return; }
      if(a === "pick"){ w.querySelector("input[type=file]").click(); return; }
      if(a !== "submit") return;
      if(!qrOpenNow(S.cfg)){ toast("지금은 QR 스탬프 인정 시간이 아니에요 (10:00~16:00).", "bad"); return; }
      var me = S.me, done;
      if(m.type === "text"){
        var text = (w.querySelector("textarea").value || "").trim();
        if(text.length < 2){ toast("한 줄 남겨 주세요.", "bad"); return; }
        b.disabled = true; b.textContent = "올리는 중...";
        done = db.collection(m.board).add({ author: me.name || "참여자", text: m.prefix + text, team: me.team || "", college: me.college || "", picnic: key, createdAt: Date.now() })
          .then(function(){ return giveStamp(key, { a: text, at: Date.now() }); });
      } else {
        if(!file){ toast("사진을 골라 주세요.", "bad"); return; }
        b.disabled = true; b.textContent = "올리는 중...";
        var ref = db.collection("picnic_missions").doc(curTeamId + "_" + key);
        var teamName = (S.team && S.team.name) || "";
        done = ref.set({ teamId: curTeamId, teamName: teamName, key: key, building: pointName(S.cfg, key), mission: m.t, images: [file], text: "", by: me.name, byId: me.rosterId, at: Date.now() })
          .then(function(){
            return db.collection("photo_posts").add({ type: "image", author: me.name || "참여자", title: "[PICNIC DAY] " + m.t + " · " + teamName, caption: pointName(S.cfg, key) + " 미션", image: file, college: me.college || "", picnic: key, createdAt: Date.now() }).catch(function(){});
          }, function(err){ return ref.get().then(function(sn){ if(!sn.exists) throw err; }); }) /* 팀원이 먼저 올렸으면 스탬프만 */
          .then(function(){ teamStamp(key); return giveStamp(key); });
      }
      done.then(function(cnt){ w.remove(); showStampPop(key, cnt); })
        .catch(function(err){ b.disabled = false; b.textContent = "다시 시도"; toast("올리지 못했어요. 다시 시도해 주세요.", "bad"); console.warn(err); });
    });
    draw();
    document.body.appendChild(w);
  }

  function processPending(){
    var tok = takePending();
    if(!tok) return;
    var u = S.user;
    sha256("dsfm-qr|" + tok).then(function(h){
      var key = POINT_KEYS.filter(function(k){ return POINT_HASH[k] === h; })[0];
      if(!key){ toast("올바른 피크닉데이 QR이 아니에요.", "bad"); return; }
      var nm = pointName(S.cfg, key);
      if(!qrOpenNow(S.cfg)){ toast("지금은 QR 스탬프 인정 시간이 아니에요 (10:00~16:00).", "bad"); return; }
      if(!u || !u.attendAt){ toast("먼저 [출석체크]를 하고 운영본부에서 팀을 배정받아 주세요.", "bad"); return; }
      if(!u.teamId || !u.verifiedAt){ toast("운영본부에서 출석 확인을 받은 뒤에 QR을 찍어야 미션이 열려요.", "bad"); return; }
      if(u.stamps && u.stamps[key]){ showMission(key, "done", "이미 받은 스탬프예요"); return; }
      if(MISSIONS[key].type === "photo" && S.proofs[key]){
        giveStamp(key).then(function(cnt){ showStampPop(key, cnt, "팀원이 이미 사진을 올려서 바로 적립됐어요"); })
          .catch(function(e){ toast("스탬프를 저장하지 못했어요. QR을 다시 찍어 주세요.", "bad"); console.warn(e); });
        return;
      }
      showMission(key, "new", "📍 QR 확인! 미션이 열렸어요");
    });
  }

  function compress(file, maxW, q){
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onload = function(){
        var img = new Image();
        img.onload = function(){
          var scale = Math.min(1, maxW / Math.max(img.width, img.height));
          var c = document.createElement("canvas");
          c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/jpeg", q));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  function pickFiles(input){
    var list = Array.prototype.slice.call(input.files || []).filter(function(f){ return f.type.indexOf("image/") === 0; }).slice(0, 4);
    if(!list.length) return;
    if((input.files || []).length > 4) toast("사진은 최대 4장까지 올릴 수 있어요. 앞의 4장만 골랐어요.");
    var capEl = document.getElementById("pk-cap"); if(capEl) S.capDraft = capEl.value;
    Promise.all(list.map(function(f){ return compress(f, 720, 0.6); })).then(function(arr){
      var total = arr.join("").length;
      if(total > 800000) return Promise.all(list.map(function(f){ return compress(f, 520, 0.5); }));
      return arr;
    }).then(function(arr){ S.files = arr; render(); })
      .catch(function(){ toast("사진을 읽지 못했어요. 다른 사진으로 시도해주세요.", "bad"); });
  }
  function upload(){
    var t = S.team, cap = (document.getElementById("pk-cap") || {}).value || "";
    cap = cap.trim();
    if(S.files.length < 2){ toast("사진을 2장 이상 골라주세요.", "bad"); return; }
    if(!cap){ toast("간단한 소감을 적어주세요.", "bad"); return; }
    if(!t || t.photoAt){ return; }
    S.uploading = true; S.capDraft = cap; render();
    var me = S.me;
    db.collection("verify_posts").add({
      author: me.name, team: me.team || "", college: me.college || "", category: "피크닉 인증", status: "확인중",
      caption: "[" + t.name + "] " + cap, image: S.files[0], images: S.files.slice(), picnicTeamId: curTeamId, createdAt: Date.now()
    }).then(function(ref){
      return db.collection("picnic_teams").doc(curTeamId).update({ photoPostId: ref.id, photoAt: Date.now(), photoBy: me.name });
    }).then(function(){
      S.files = []; S.capDraft = ""; S.uploading = false; toast("인증 완료! 팀 전원에게 체험부스 이용권이 열렸어요 🎟️", "ok"); render();
    }).catch(function(e){
      S.uploading = false; render(); toast("올리지 못했어요. 사진 수를 줄이거나 다시 시도해주세요.", "bad"); console.warn(e);
    });
  }

  document.addEventListener("click", function(e){
    var b = e.target.closest("[data-pk]"); if(!b || !root() || !root().contains(b)) return;
    var a = b.dataset.pk;
    if(a === "attend") attend(b);
    if(a === "pick"){ var f = document.getElementById("pk-file"); if(f) f.click(); }
    if(a === "upload") upload();
    if(a === "mission") showMission(b.dataset.key, "done", "받은 스탬프 · 미션 기록");
  });
  document.addEventListener("change", function(e){ if(e.target && e.target.id === "pk-file") pickFiles(e.target); });
  document.addEventListener("input", function(e){ if(e.target && e.target.id === "pk-cap") S.capDraft = e.target.value; });

  /* ---------- 구독 ---------- */
  function watchTeam(teamId){
    if(teamId === curTeamId) return;
    curTeamId = teamId;
    if(unsubTeam){ unsubTeam(); unsubTeam = null; }
    if(unsubMembers){ unsubMembers(); unsubMembers = null; }
    if(unsubProofs){ unsubProofs(); unsubProofs = null; }
    S.team = null; S.members = []; S.proofs = {};
    if(!teamId) return;
    unsubProofs = db.collection("picnic_missions").where("teamId", "==", teamId).onSnapshot(function(s){
      var m = {}; s.docs.forEach(function(d){ var x = d.data(); m[x.key] = x; }); S.proofs = m; render(); autoTeamStamps();
    }, function(){});
    unsubTeam = db.collection("picnic_teams").doc(teamId).onSnapshot(function(s){ S.team = s.exists ? s.data() : null; render(); }, function(){});
    unsubMembers = db.collection("picnic_users").where("teamId", "==", teamId).onSnapshot(function(s){
      S.members = s.docs.map(function(d){ return { id: d.id, d: d.data() }; }); render();
    }, function(){});
  }

  function start(me){
    if(S.started) return;
    S.started = true;
    S.me = me;
    try{ if(!firebase.apps.length) return; db = firebase.firestore(); }catch(e){ return; }
    var pendingTried = false;
    db.collection("picnic_config").doc("main").onSnapshot(function(s){ S.cfg = s.exists ? (s.data() || {}) : {}; render(); }, function(){});
    if(!me.rosterId){ S.user = null; render(); return; }
    db.collection("picnic_users").doc(me.rosterId).onSnapshot(function(s){
      S.user = s.exists ? s.data() : null;
      watchTeam(S.user && S.user.teamId ? S.user.teamId : null);
      render();
      autoTeamStamps();
      if(!pendingTried){ pendingTried = true; setTimeout(processPending, 600); }
    }, function(err){ console.warn(err); S.user = null; render(); });
    db.collection("picnic_booth_logs").where("rosterId", "==", me.rosterId).onSnapshot(function(s){
      S.logs = s.docs.map(function(d){ return d.data(); }); render();
    }, function(){});
  }

  window.addEventListener("dsfm:login", function(e){ start(e.detail || {}); });
  if(window.DSFM && window.DSFM.me) start(window.DSFM.me);
})();

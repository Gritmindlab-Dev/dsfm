/* =====================================================================
   DS-FM/GLM 2학기 성과보고회 (DS-FM REPLAY) 홈 — 로그인하면 첫 화면
   ① 참석 투표 (선착순 100명)  ② 우수멘토 사전투표 (11.24~11.25)
   ③ 럭키드로우 상품보기       ④ 공유공간 들어가기
   데이터 (Firestore)
     poll_votes (pollId = POLL_ID)              : 11/20까지 받은 기존 참여 신청
     attendance_votes/replay1126_{명단ID}       : 새 참석 신청 (kind "replay_rsvp")
     attendance_votes/prevote1126_{명단ID}      : 사전투표 1인 1표 (kind "prevote")
     suggestion_posts kind "final_report"       : 멘토가 제출한 결과보고서
   ===================================================================== */
(function(){
  "use strict";

  var POLL_ID = "Vypn1dWt0tPgNl5a6N0J";
  var CAP = 100;
  var EVENT_TEXT = "2026. 11. 26.(목) 18:30";
  var VOTE_START = new Date("2026-11-24T00:00:00+09:00").getTime();
  var VOTE_END   = new Date("2026-11-25T23:59:59+09:00").getTime();
  var PRIZES = [ { name: "올리브영 1만원권", qty: "10명" } ];  /* 상품이 정해지면 여기에 추가 */
  var OPT_PRESENT = "발표로 참여할게요 (멘토·팀)", OPT_WATCH = "참관으로 참여할게요", OPT_NO = "참석이 어려워요";

  var S = { me: null, started: false, view: "home", rsvp: null, pollMine: null, attend: 0, loading: false,
            reports: null, myVote: null, busy: false };
  var db = null;
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function now(){ return Date.now(); }
  function voteState(){ var n = now(); return n < VOTE_START ? "before" : n > VOTE_END ? "after" : "open"; }

  var css = [
    "#page-hub .hb-head{background:linear-gradient(110deg,#4f1226,#8a2346);color:#fff;border-radius:20px;padding:22px 26px;margin-bottom:18px}",
    "#page-hub .hb-head small{display:block;font-size:13px;opacity:.85}",
    "#page-hub .hb-head b{display:block;font-size:24px;font-weight:900;margin-top:4px;letter-spacing:-.3px}",
    "#page-hub .hb-head b span{color:#ffd77a;font-size:17px;margin-left:6px}",
    "#page-hub .hb-head p{font-size:14px;opacity:.92;margin-top:6px}",
    "#page-hub .hb-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}",
    "#page-hub .hb-tile{border:0;border-radius:18px;min-height:210px;padding:22px;color:#fff;font:inherit;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;box-shadow:0 6px 18px rgba(40,10,20,.10);transition:transform .12s}",
    "#page-hub .hb-tile:hover{transform:translateY(-2px)}",
    "#page-hub .hb-tile svg{width:64px;height:64px}",
    "#page-hub .hb-tile b{font-size:21px;font-weight:900;line-height:1.35}",
    "#page-hub .hb-tile span{font-size:14px;opacity:.95;line-height:1.45}",
    "#page-hub .hb-tile .pill{display:inline-block;background:rgba(255,255,255,.22);border-radius:14px;padding:4px 12px;font-weight:800;font-size:13.5px}",
    "#page-hub .t1{background:#205696}#page-hub .t2{background:#459cad}#page-hub .t3{background:#c5637a}#page-hub .t4{background:#f2dd68;color:#3b3208}",
    "#page-hub .t4 .pill{background:#3b3208;color:#f2dd68}",
    "@media(max-width:640px){#page-hub .hb-grid{gap:10px}#page-hub .hb-tile{min-height:160px;padding:14px;gap:8px}#page-hub .hb-tile svg{width:44px;height:44px}#page-hub .hb-tile b{font-size:16px}#page-hub .hb-tile span{font-size:12px}#page-hub .hb-tile .pill{font-size:11.5px;padding:3px 9px}#page-hub .hb-head b{font-size:19px}}",
    "#page-hub .hb-back{border:0;background:none;color:#7c1f3d;font:inherit;font-weight:800;font-size:14px;cursor:pointer;padding:4px 0;margin-bottom:10px}",
    "#page-hub .hb-card{background:#fff;border:1px solid #ecdde1;border-radius:18px;padding:20px 22px;margin-bottom:14px}",
    "#page-hub .hb-card h3{font-size:19px;color:#4f1226;margin-bottom:6px}",
    "#page-hub .hb-d{font-size:14px;color:#8a737a;line-height:1.65}",
    "#page-hub .hb-intro{background:#fff;border:1px solid #efe2e6;border-radius:16px;padding:16px 20px;margin-bottom:16px;font-size:14px;color:#5a4a50;line-height:1.7}",
    "#page-hub .hb-intro b{color:#7c1f3d}",
    "#page-hub{word-break:keep-all;overflow-wrap:break-word}#page-hub br.mb{display:none}",
    "@media(max-width:640px){#page-hub br.mb{display:inline}#page-hub .dt{display:none}#page-hub .hb-head b span{display:block;margin:2px 0 0}}",
    "#page-hub .hb-tile .sub{font-size:13px;opacity:.92;font-weight:500;line-height:1.5}",
    "#page-hub .t4 .sub{color:#5a4d12}",
    "#page-hub .hb-steps{list-style:none;margin:12px 0 4px;padding:0;counter-reset:st}",
    "#page-hub .hb-steps li{counter-increment:st;position:relative;padding:9px 12px 9px 44px;margin-bottom:6px;background:#faf6f7;border-radius:12px;font-size:14px;color:#4a3a40;line-height:1.6}",
    "#page-hub .hb-steps li:before{content:counter(st);position:absolute;left:12px;top:9px;width:22px;height:22px;border-radius:50%;background:#7c1f3d;color:#fff;font-size:12.5px;font-weight:800;display:flex;align-items:center;justify-content:center}",
    "#page-hub .hb-steps li b{color:#4f1226}",
    "#page-hub .hb-sec{font-size:14.5px;font-weight:900;color:#4f1226;margin:16px 0 4px}",
    "@media(max-width:640px){#page-hub .hb-tile .sub{font-size:11.5px}#page-hub .hb-intro{font-size:13px;padding:13px 15px}}",
    "#page-hub .hb-bar{height:12px;background:#f3e6ea;border-radius:8px;overflow:hidden;margin:12px 0 6px}",
    "#page-hub .hb-bar i{display:block;height:100%;background:#205696;border-radius:8px}",
    "#page-hub .hb-opts{display:flex;flex-direction:column;gap:10px;margin-top:14px}",
    "#page-hub .hb-opt{border:2px solid #ecdde1;background:#fff;border-radius:14px;padding:14px 16px;font:inherit;font-size:15px;font-weight:800;text-align:left;cursor:pointer;color:#2a1e22}",
    "#page-hub .hb-opt.on{border-color:#205696;background:#eef4fb;color:#1f4f85}",
    "#page-hub .hb-opt[disabled]{opacity:.45;cursor:default}",
    "#page-hub .hb-mine{margin-top:12px;font-size:14px;font-weight:800;color:#2f7a4b}",
    "#page-hub .hb-msg{margin-top:8px;font-size:13px;color:#7c1f3d;min-height:16px}",
    "#page-hub .hb-rep{display:flex;align-items:center;gap:12px;border:1px solid #ecdde1;border-radius:14px;padding:14px 16px;margin-top:10px;background:#fff}",
    "#page-hub .hb-rep.mine{background:#fbf7f8}",
    "#page-hub .hb-rep.voted{border:2px solid #2f7f8f;background:#f1f8f3}",
    "#page-hub .hb-rep .nm{flex:1;min-width:0}",
    "#page-hub .hb-rep .nm b{display:block;font-size:16px;color:#2a1e22}",
    "#page-hub .hb-rep .nm small{color:#8a737a;font-size:12.5px}",
    "#page-hub .hb-btn{border:0;border-radius:10px;padding:9px 13px;font:inherit;font-weight:800;font-size:13px;cursor:pointer;background:#2f7f8f;color:#fff;white-space:nowrap}",
    "#page-hub .hb-btn.gh{background:#fff;color:#4f1226;border:1.5px solid #d9c3ca}",
    "#page-hub .hb-btn[disabled]{opacity:.45;cursor:default}",
    "#page-hub .hb-tag{font-size:11px;font-weight:800;padding:2px 8px;border-radius:8px;background:#f1e6e9;color:#7c1f3d;margin-left:6px}",
    "#page-hub .hb-prize{display:flex;justify-content:space-between;align-items:center;border:1px solid #f3dcb8;background:#fff8ec;border-radius:12px;padding:12px 16px;margin-top:10px;font-size:15px;font-weight:800;color:#5a3a10}",
    "#page-hub .hb-soon{border:2px dashed #e8c48a;border-radius:12px;padding:16px;text-align:center;color:#a87a2c;font-weight:800;margin-top:10px}",
    "@media(max-width:640px){#page-hub .hb-rep{flex-wrap:wrap}#page-hub .hb-rep .nm{flex-basis:100%}}"
  ].join("\n");

  var IC = {
    vote: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><rect x="10" y="12" width="44" height="42" rx="6"/><path d="M10 24h44M22 6v10M42 6v10"/><path d="M23 38l6 6 12-13"/></svg>',
    ballot: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 40h48v16H8z"/><path d="M18 40V14a4 4 0 0 1 4-4h20a4 4 0 0 1 4 4v26"/><path d="M25 26l5 5 10-10"/></svg>',
    gift: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="24" width="48" height="12" rx="3"/><path d="M12 36v20h40V36M32 24v32"/><path d="M32 24c-4-10-16-12-16-4s16 4 16 4zM32 24c4-10 16-12 16-4s-16 4-16 4z"/></svg>',
    door: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 56V10h28v46"/><path d="M8 56h48"/><circle cx="35" cy="34" r="2" fill="currentColor"/><path d="M48 22l8 8-8 8M42 30h14"/></svg>'
  };

  /* ---------- 데이터 ---------- */
  function rsvpRef(){ return db.collection("attendance_votes").doc("replay1126_" + S.me.rosterId); }
  function voteRef(){ return db.collection("attendance_votes").doc("prevote1126_" + S.me.rosterId); }
  function isAttend(opt){ return opt === OPT_PRESENT || opt === OPT_WATCH; }
  function loadCount(){
    if(!db) return Promise.resolve();
    return Promise.all([
      db.collection("poll_votes").where("pollId", "==", POLL_ID).get().catch(function(){ return { docs: [] }; }),
      db.collection("attendance_votes").where("kind", "==", "replay_rsvp").get().catch(function(){ return { docs: [] }; })
    ]).then(function(r){
      var m = {};
      r[0].docs.forEach(function(x){ var d = x.data(); if(d.rosterId) m[d.rosterId] = isAttend(d.choice); if(d.rosterId === S.me.rosterId) S.pollMine = d.choice; });
      r[1].docs.forEach(function(x){ var d = x.data(); if(d.rosterId) m[d.rosterId] = d.choice === "attend"; if(d.rosterId === S.me.rosterId) S.rsvp = d; });
      S.attend = Object.keys(m).filter(function(k){ return m[k]; }).length;
    });
  }
  function myOption(){ return S.rsvp ? S.rsvp.option : S.pollMine; }
  function loadReports(){
    /* 후보 = 운영진이 관리자 화면에서 올린 결과보고서만 (polls/replay_prevote, 최고 관리자만 수정 가능) */
    return db.collection("polls").doc("replay_prevote").get().then(function(s){
      var c = (s.exists && s.data().candidates) || [];
      S.reports = c.map(function(x){ return { id: x.id, d: { teamName: x.team || "", author: x.mentor || "", college: x.college || "", team: x.teamKey || "", fileName: x.fileName || "", fileChunks: x.fileChunks || 0, fileId: x.fileId || x.id, title: x.team || "" } }; });
    }).catch(function(){ S.reports = []; });
  }
  function loadMyVote(){
    return voteRef().get().then(function(s){ S.myVote = s.exists ? s.data() : null; }).catch(function(){ S.myVote = null; });
  }
  function teamTitle(d){
    if(d.title) return d.title;
    var f = String(d.fileName || "").replace(/\.[^.]+$/, "").split("_")[0];
    return f && f !== "팀이름" && f !== "팀번호" ? f : (d.teamName || "팀");
  }

  /* ---------- 화면 ---------- */
  function ensure(){
    var sec = $("page-hub"); if(!sec) return null;
    if(!$("hb-style")){ var st = document.createElement("style"); st.id = "hb-style"; st.textContent = css; document.head.appendChild(st); }
    if(!$("hb-body")){ var b = document.createElement("div"); b.id = "hb-body"; sec.appendChild(b); wire(b); }
    return $("hb-body");
  }
  function head(){
    return '<div class="hb-head"><small>덕성여대 신입생 멘토링(DS-FM/GLM)</small><b>2학기 멘토링 성과보고회<span>DS-FM REPLAY</span></b><p>📅 ' + EVENT_TEXT + ' · 장소는 추후 안내<br class="mb"><span class="dt"> · </span>사전투표·현장투표로 우수멘토를 함께 뽑아요</p></div>';
  }
  function render(){
    var el = ensure(); if(!el || !S.me) return;
    var v = S.view, h = "";
    if(v === "home"){
      var vs = voteState(), full = S.attend >= CAP;
      h = head() + '<div class="hb-intro">11. 26.(목) <b>성과보고회</b>에 오실 분은 <b>참석 투표</b>,<br class="mb"> 11. 24.~25.에는 <b>우수멘토 사전투표</b>에 참여해 주세요.<br>기존 메뉴는 <b>공유공간 들어가기</b>에 있어요.</div>' + '<div class="hb-grid">' +
        '<button type="button" class="hb-tile t1" data-hb="rsvp">' + IC.vote + '<b>성과보고회<br>참석 투표</b><span class="sub">멘토·멘티 누구나<span class="dt"> · </span><br class="mb">선착순 ' + CAP + '명</span><span class="pill">' + (full ? "선착순 마감" : S.attend + " / " + CAP + "명 신청") + '</span></button>' +
        '<button type="button" class="hb-tile t2" data-hb="vote">' + IC.ballot + '<b>우수멘토<br>사전투표</b><span class="sub">후보 멘토 8명의 결과보고서<br class="mb"> 보고 1팀에 투표</span><span class="pill">' + (vs === "open" ? "투표 중 · ~11.25(수)" : vs === "before" ? "11.24(화)~25(수)" : "사전투표 마감") + '</span></button>' +
        '<button type="button" class="hb-tile t3" data-hb="lucky">' + IC.gift + '<b>성과보고회<br>럭키드로우 상품보기</b><span class="sub">입장 시 번호표<span class="dt"> → </span><br class="mb">시상 후 추첨</span><span class="pill">참여자 중 약 30명</span></button>' +
        '<button type="button" class="hb-tile t4" data-hb="space">' + IC.door + '<b>공유공간<br>들어가기</b><span class="sub">공지·게시판·<br class="mb">결과보고서·미션</span><span class="pill">기존 기능</span></button>' +
        '</div>';
    } else if(v === "rsvp"){
      var mine = myOption(), att = isAttend(mine), full2 = S.attend >= CAP && !att, pct = Math.min(100, Math.round(S.attend / CAP * 100));
      var opt = function(o, attendOpt){ return '<button type="button" class="hb-opt' + (mine === o ? " on" : "") + '" data-opt="' + esc(o) + '"' + ((attendOpt && full2) || S.busy ? " disabled" : "") + '>' + (mine === o ? "✓ " : "") + esc(o) + '</button>'; };
      h = '<button type="button" class="hb-back" data-hb="home">← 처음 화면으로</button>' + head() +
        '<div class="hb-card"><h3>성과보고회 참석 투표</h3><div class="hb-d">📅 <b>11. 26.(목) 18:30</b> · 장소는 추후 안내 · 멘토·멘티 <b>누구나</b> 참여할 수 있어요.<br>자리 준비를 위해 <b>선착순 ' + CAP + '명</b>까지 받고, 100명이 차면 자동으로 마감돼요. 11/20까지 참여 신청 투표에 응답한 분은 이미 포함돼 있어요.</div>' +
        '<div class="hb-sec">참석하면 이런 걸 할 수 있어요</div><ul class="hb-steps"><li><b>현장투표 1표</b> — 발표를 듣고 우수멘토에게 직접 투표해요.</li><li><b>커피차 · 간식 2종</b> — 현장에서 함께 즐겨요.</li><li><b>럭키드로우</b> — 입장할 때 받은 번호표로 상품 추첨에 참여해요 (약 30명).</li></ul>' +
        '<div class="hb-sec">응답 방법</div><div class="hb-d">· <b>발표로 참여</b>: 사전투표로 선발된 멘토와 그 팀원<br>· <b>참관으로 참여</b>: 발표하지 않고 참석하는 멘토·멘티<br>· 응답은 행사 전까지 언제든 바꿀 수 있어요.</div>' +
        '<div class="hb-bar"><i style="width:' + pct + '%"></i></div><div class="hb-d"><b style="color:#205696">' + S.attend + '명</b> / ' + CAP + '명 신청' + (S.attend >= CAP ? ' · 선착순 마감' : '') + '</div>' +
        '<div class="hb-opts">' + opt(OPT_PRESENT, true) + opt(OPT_WATCH, true) + opt(OPT_NO, false) + '</div>' +
        (full2 ? '<div class="hb-msg">선착순 ' + CAP + '명이 모두 차서 참석 신청이 마감됐어요.</div>' : '') +
        (mine ? '<div class="hb-mine">내 응답: ' + esc(mine) + (att ? ' · 신청 완료' : '') + '</div><div class="hb-d" style="margin-top:4px">다른 항목을 누르면 응답이 바뀌어요.</div>' : '<div class="hb-d" style="margin-top:12px">아직 응답하지 않았어요.</div>') +
        '<div class="hb-msg" id="hb-msg"></div></div>';
    } else if(v === "vote"){
      var vs2 = voteState(), list = S.reports, myVoteId = S.myVote && S.myVote.reportId;
      h = '<button type="button" class="hb-back" data-hb="home">← 처음 화면으로</button>' + head() +
        '<div class="hb-card"><h3>우수멘토 사전투표</h3><div class="hb-d">기간 <b>11. 24.(화) 0시 ~ 11. 25.(수) 23:59</b> · 멘토들이 제출한 <b>2026년 결과보고서</b>를 읽어 보고, 가장 인상 깊었던 팀에 투표해 주세요.</div>' +
        '<div class="hb-sec">우수멘토는 이렇게 뽑아요</div><ul class="hb-steps"><li><b>사전투표 (11. 24.~25.)</b> — 운영진이 선정한 후보 멘토 <b>8명</b>의 결과보고서 중에서 <b>5명</b>을 뽑아요. 사전투표는 <b>최종 점수의 50%</b>예요.</li><li><b>현장 발표 (11. 26.)</b> — 선발된 <b>5명</b>의 멘토가 성과보고회에서 활동을 발표해요.</li><li><b>현장투표 · 시상</b> — 현장투표를 더해 <b>3명</b>에게 <b>대상 · 최우수상 · 우수상</b>을 드려요.</li></ul>' +
        '<div class="hb-sec">투표 방법</div><div class="hb-d">① 아래 목록에서 <b>📄 보고서 보기</b>로 결과보고서를 읽어요.<br>② 가장 좋았던 팀의 <b>이 팀에 투표</b>를 눌러요. (1인 1표)<br>③ <b>우리 팀</b>에는 투표할 수 없고, 마감 전까지 다른 팀으로 바꿀 수 있어요.<br>' +
        (vs2 === "before" ? '<b style="color:#7c1f3d">투표는 11. 24.(화) 0시부터 할 수 있어요.</b> 지금은 제출된 보고서를 미리 볼 수 있어요.' : vs2 === "after" ? '<b style="color:#7c1f3d">사전투표가 마감됐어요.</b>' : '<b style="color:#2f7f8f">지금 투표할 수 있어요!</b>') +
        '<br><span style="font-size:12.5px">※ 운영진이 선정한 <b>후보 멘토 8명</b>의 결과보고서만 아래에 보여요. 보고서는 투표를 위해 공유공간 참여자에게 공개돼요.</span></div>' +
        (myVoteId ? '<div class="hb-mine">✓ 내 투표: ' + esc(S.myVote.reportTeam || "") + '</div>' : '') +
        '<div class="hb-msg" id="hb-msg"></div>' +
        (list === null ? '<div class="hb-d" style="margin-top:12px">불러오는 중이에요…</div>' : !list.length ? '<div class="hb-d" style="margin-top:12px">후보 결과보고서를 준비하고 있어요. 11. 24.(화)까지 올라와요.</div>' :
          list.map(function(x){
            var d = x.d, isMine = d.team && d.team === S.me.team, voted = myVoteId === x.id;
            return '<div class="hb-rep' + (isMine ? " mine" : "") + (voted ? " voted" : "") + '"><div class="nm"><b>' + esc(teamTitle(d)) + (isMine ? '<span class="hb-tag">우리 팀</span>' : '') + (voted ? '<span class="hb-tag" style="background:#e3f1e8;color:#2f7a4b">내 투표</span>' : '') + '</b><small>' + esc([d.college, d.team, "멘토 " + (d.author || "")].filter(Boolean).join(" · ")) + '</small></div>' +
              '<button type="button" class="hb-btn gh" data-view="' + esc(x.id) + '">📄 보고서 보기</button>' +
              '<button type="button" class="hb-btn" data-vote="' + esc(x.id) + '"' + (isMine || vs2 !== "open" || voted || S.busy ? " disabled" : "") + '>' + (voted ? "투표함" : "이 팀에 투표") + '</button></div>';
          }).join("")) + '</div>';
    } else if(v === "lucky"){
      h = '<button type="button" class="hb-back" data-hb="home">← 처음 화면으로</button>' + head() +
        '<div class="hb-card"><h3>🎁 성과보고회 럭키드로우</h3><div class="hb-d">성과보고회에 참여한 멘토·멘티 중 <b>약 30명</b>에게 행운권 추첨으로 상품을 드려요.</div>' +
        '<div class="hb-sec">추첨은 이렇게 진행돼요</div><ul class="hb-steps"><li><b>입장</b> — 행사장에 들어올 때 <b>번호표(행운권)</b>를 받아요.</li><li><b>발표 · 시상</b> — 우수멘토 발표와 시상이 끝날 때까지 번호표를 잘 보관해 주세요.</li><li><b>추첨</b> — 시상이 끝난 뒤 번호를 뽑아 상품을 드려요. <b>현장에 있어야</b> 받을 수 있어요.</li></ul>' +
        '<div class="hb-sec">상품 미리 보기</div>' +
        PRIZES.map(function(p){ return '<div class="hb-prize"><span>' + esc(p.name) + '</span><span>' + esc(p.qty) + '</span></div>'; }).join("") +
        '<div class="hb-soon">그 밖의 상품도 곧 공개돼요!</div>' +
        '<div style="margin-top:16px"><button type="button" class="hb-btn" style="background:#205696;padding:12px 18px;font-size:14.5px" data-hb="rsvp">참석 투표하러 가기 →</button></div></div>';
    }
    el.innerHTML = h;
  }
  function msg(t){ var m = $("hb-msg"); if(m) m.textContent = t || ""; }

  /* ---------- 동작 ---------- */
  function saveRsvp(opt){
    if(!db || S.busy) return;
    var attend = isAttend(opt);
    S.busy = true; render(); msg("저장하는 중이에요…");
    loadCount().then(function(){
      if(attend && !isAttend(myOption()) && S.attend >= CAP) throw new Error("full");
      var me = S.me, t = now();
      return rsvpRef().set({ choice: attend ? "attend" : "absent", kind: "replay_rsvp", option: opt, pollId: POLL_ID,
        name: me.name || "", rosterId: me.rosterId || "", role: me.role || "", college: me.college || "", team: me.team || "", teamName: me.teamName || "",
        firstAt: (S.rsvp && S.rsvp.firstAt) || t, updatedAt: t });
    }).then(function(){ return loadCount(); }).then(function(){
      S.busy = false; render(); msg(attend ? "참석 신청이 완료됐어요. 11/26(목)에 만나요!" : "응답이 저장됐어요.");
    }).catch(function(e){
      S.busy = false; render();
      msg(e && e.message === "full" ? "아쉽지만 선착순 " + CAP + "명이 방금 모두 찼어요." : "저장하지 못했어요. 새로고침 후 다시 시도해 주세요.");
    });
  }
  function castVote(id){
    if(!db || S.busy || voteState() !== "open") return;
    var r = (S.reports || []).filter(function(x){ return x.id === id; })[0]; if(!r) return;
    if(r.d.team && r.d.team === S.me.team){ msg("우리 팀에는 투표할 수 없어요."); return; }
    var title = teamTitle(r.d);
    if(!confirm("'" + title + "' 팀에 투표할까요?\n(마감 전까지 다른 팀으로 바꿀 수 있어요)")) return;
    S.busy = true; render();
    var me = S.me;
    voteRef().set({ choice: "attend", kind: "prevote", reportId: id, reportTeam: title, reportTeamKey: r.d.team || "", reportAuthor: r.d.author || "",
      name: me.name || "", rosterId: me.rosterId || "", role: me.role || "", college: me.college || "", team: me.team || "", updatedAt: now() })
      .then(function(){ return loadMyVote(); })
      .then(function(){ S.busy = false; render(); msg("'" + title + "' 팀에 투표했어요!"); })
      .catch(function(){ S.busy = false; render(); msg("투표하지 못했어요. 새로고침 후 다시 시도해 주세요."); });
  }
  function viewReport(id, btn){
    var r = (S.reports || []).filter(function(x){ return x.id === id; })[0]; if(!r) return;
    var d = r.d, w = null;
    try{ w = window.open("", "_blank"); if(w) w.document.write('<p style="font-family:sans-serif;padding:20px">결과보고서를 불러오는 중이에요…</p>'); }catch(e){ w = null; }
    var old = btn.textContent; btn.textContent = "불러오는 중…"; btn.disabled = true;
    var get = d.fileData ? Promise.resolve(d.fileData) : db.collection("attendance_votes").where("parentId", "==", d.fileId || id).get().then(function(s){
      var ch = s.docs.map(function(x){ return x.data(); }).sort(function(a, b){ return a.idx - b.idx; });
      if(d.fileChunks && ch.length < d.fileChunks) throw new Error("part");
      return ch.map(function(x){ return x.data || ""; }).join("");
    });
    get.then(function(data){
      var m = String(data).match(/^data:([^;]*);base64,(.*)$/); if(!m) throw new Error("bad");
      var bin = atob(m[2]), u8 = new Uint8Array(bin.length);
      for(var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      var url = URL.createObjectURL(new Blob([u8], { type: m[1] || "application/pdf" }));
      if(w && !w.closed) w.location.href = url;
      else { var a = document.createElement("a"); a.href = url; a.download = d.fileName || "결과보고서.pdf"; document.body.appendChild(a); a.click(); a.remove(); }
    }).catch(function(){ if(w && !w.closed) w.close(); alert("보고서를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."); })
      .then(function(){ btn.textContent = old; btn.disabled = false; });
  }
  function go(v){
    S.view = v; render(); window.scrollTo(0, 0);
    if(v === "home" || v === "rsvp") loadCount().then(render);
    if(v === "vote"){ Promise.all([loadReports(), loadMyVote()]).then(render); }
  }
  function wire(el){
    el.addEventListener("click", function(e){
      var t = e.target.closest("[data-hb]");
      if(t){
        var a = t.getAttribute("data-hb");
        if(a === "space"){ if(window.DSFM && window.DSFM.goToPage) window.DSFM.goToPage("announce"); return; }
        go(a); return;
      }
      if((t = e.target.closest("[data-opt]")) && !t.disabled){ saveRsvp(t.getAttribute("data-opt")); return; }
      if((t = e.target.closest("[data-vote]")) && !t.disabled){ castVote(t.getAttribute("data-vote")); return; }
      if((t = e.target.closest("[data-view]")) && !t.disabled){ viewReport(t.getAttribute("data-view"), t); return; }
    });
  }

  function open(){ if(!S.me) return; go(S.view === "home" ? "home" : S.view); }
  function start(me){
    if(S.started) return;
    S.started = true; S.me = me;
    try{ if(firebase.apps.length) db = firebase.firestore(); }catch(e){}
    render();
    loadCount().then(render);
    /* 로그인하면 첫 화면은 성과보고회 홈 (QR로 들어온 피크닉 등은 그대로) */
    setTimeout(function(){
      if(window.__dsfmPicnicFromQr) return;
      if(window.DSFM && window.DSFM.goToPage) window.DSFM.goToPage("hub");
    }, 0);
  }
  window.DSFMReplay = { open: open };
  window.addEventListener("dsfm:login", function(e){ start(e.detail || {}); });
  if(window.DSFM && window.DSFM.me) start(window.DSFM.me);
})();

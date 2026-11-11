/* =====================================================================
   DS-FM/GLM 11월 퀘스트 — 선배 전공 시간표 공개 「MY MAJOR TIMETABLE」
   기간: 2026. 11. 12.(목) 09:00 ~ 11. 20.(금) 23:59
   - 멘토 퀘스트 1) 시간표 캡처 업로드   2) 멘티 질문에 답글 달기
   - 멘티 퀘스트 1) 관심 있는 시간표에 ♥   2) 시간표에 궁금한 점 댓글
   데이터 (Firestore)
     photo_posts  type "quest_tt"     : 시간표 글 (작은 미리보기 thumb, likedBy = "이름__팀")
     photo_posts  type "quest_tt_img" : 시간표 원본 사진 (상세 화면에서만 불러옴)
     photo_comments kind "quest"      : 질문·답글 (replyTo = 답글 대상 댓글 ID)
   ※ createdAt 대신 ts 를 써서 사진 게시판·홈 화면 목록에는 나타나지 않아요.
   ===================================================================== */
(function(){
  "use strict";

  var START = new Date("2026-11-12T09:00:00+09:00").getTime();
  var END   = new Date("2026-11-20T23:59:59+09:00").getTime();
  var PREVIEW = /[?&]quest=preview\b/.test(location.search);
  var COLLEGES = ["글로벌융합대학","아트앤디자인대학","과학기술대학","자유전공학부"];
  var SEMS = ["1학년 1학기","1학년 2학기","2학년 1학기","2학년 2학기","3학년 1학기","3학년 2학기","4학년 1학기","4학년 2학기"];
  function metaLine(p){ return [p.college, p.major, p.sem ? p.sem + " 시간표" : ""].filter(Boolean).join(" · "); }
  var TAGS = ["#공강요일","#1교시없음","#전공필수먼저","#실습많음","#복수전공","#부전공","#교직이수","#알바병행","#대외활동병행","#팀플많음"];

  var S = { me: null, posts: [], cmts: [], started: false, unsubP: null, unsubC: null,
            college: "전체", tag: "", sort: "like", openId: null, replyTo: null, editing: false,
            draft: { tags: [] }, imgCache: {}, file: null };
  var db = null;

  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function ago(ts){
    if(!ts) return "";
    var m = Math.floor((Date.now() - ts) / 60000);
    if(m < 1) return "방금"; if(m < 60) return m + "분 전";
    var h = Math.floor(m / 60); if(h < 24) return h + "시간 전";
    var d = new Date(ts); return (d.getMonth() + 1) + "/" + d.getDate();
  }
  function now(){ return Date.now(); }
  function isOpen(){ var n = now(); return (n >= START || PREVIEW) && n <= END; }
  function isClosed(){ return now() > END; }
  function visible(){ return PREVIEW || now() >= START; }
  function isMentor(){ return S.me && S.me.role === "멘토"; }
  function myKey(){ return (S.me.name || "") + "__" + (S.me.team || ""); }
  function ownerKey(p){ return p.rosterId || ((p.author || "") + "__" + (p.team || "")); }
  function myOwnerKey(){ return S.me.rosterId || myKey(); }
  function $(id){ return document.getElementById(id); }

  /* ---------- 스타일 ---------- */
  var css = [
    "#nav-quest .qx-new{margin-left:auto;font-size:9.5px;font-weight:800;background:#e8b04b;color:#4c1226;border-radius:8px;padding:2px 6px;letter-spacing:.03em}",
    ".qx-banner{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:16px 20px;border-radius:16px;background:linear-gradient(120deg,#7c1f3d,#a8446a);color:#fff;margin-top:18px}",
    ".qx-banner b{font-size:16px}.qx-banner .qx-b-sub{font-size:12.5px;opacity:.85;margin-top:3px}",
    ".qx-banner .qx-b-right{margin-left:auto;text-align:right;font-size:12.5px;opacity:.95;line-height:1.6}",
    ".qx-banner .qx-b-right b{font-size:15px}",
    ".qx-intro{margin-top:12px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 18px;font-size:13.5px;line-height:1.75;color:var(--ink)}",
    ".qx-intro b{color:var(--wine-deep)}",
    ".qx-note{margin-top:8px;padding:8px 12px;border-radius:10px;background:var(--cream);font-size:12.5px;color:var(--ink-soft)}",
    ".qx-quests{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}",
    ".qx-q{display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border:1px solid var(--line);border-radius:14px;background:#fff}",
    ".qx-q .qx-chk{flex:none;width:30px;height:30px;border-radius:50%;border:2px solid var(--line);display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff}",
    ".qx-q.done .qx-chk{background:var(--good);border-color:var(--good)}",
    ".qx-q .qx-qn{font-size:11px;font-weight:800;color:var(--wine);letter-spacing:.04em}",
    ".qx-q .qx-qt{font-size:14px;font-weight:700;color:var(--ink);margin-top:2px}",
    ".qx-q .qx-qs{font-size:12px;color:var(--ink-soft);margin-top:3px;line-height:1.55}",
    ".qx-tabs{display:flex;gap:6px;margin-top:22px;border-bottom:2px solid var(--line)}",
    ".qx-tabs button{border:0;background:none;padding:10px 16px;font-size:14.5px;font-weight:700;color:var(--ink-soft);cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-2px;display:flex;align-items:center;gap:6px}",
    ".qx-tabs button.on{color:var(--wine-deep);border-bottom-color:var(--wine)}",
    ".qx-h{font-size:16px;font-weight:800;color:var(--wine-deep);margin:26px 0 10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
    ".qx-h small{font-size:12px;font-weight:500;color:var(--ink-soft)}",
    ".qx-form{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:16px;padding:20px}",
    ".qx-form label{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:700;color:var(--ink)}",
    ".qx-form label .qx-cnt{font-weight:500;color:var(--ink-soft);font-size:11.5px;align-self:flex-end;margin-top:-22px}",
    ".qx-form input[type=text],.qx-form select,.qx-form textarea{border:1.5px solid var(--line);border-radius:10px;padding:10px 12px;font:inherit;font-size:13.5px;font-weight:400;background:var(--cream);color:var(--ink);outline:0}",
    ".qx-form textarea{min-height:76px;resize:vertical;line-height:1.6}",
    ".qx-form input:focus,.qx-form select:focus,.qx-form textarea:focus{border-color:var(--wine-soft);background:#fff}",
    ".qx-col{display:flex;flex-direction:column;gap:12px;min-width:0}",
    ".qx-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}",
    ".qx-drop{border:2px dashed #dcc3cb;border-radius:12px;background:var(--cream);min-height:150px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:pointer;color:var(--ink-soft);font-size:13px;text-align:center;padding:12px;overflow:hidden}",
    ".qx-drop img{max-width:100%;max-height:320px;border-radius:8px}",
    ".qx-drop b{color:var(--wine)}",
    ".qx-tags{display:flex;flex-wrap:wrap;gap:6px}",
    ".qx-tag{border:1.5px solid var(--line);background:#fff;border-radius:99px;padding:5px 11px;font-size:12px;font-weight:700;color:var(--ink-soft);cursor:pointer}",
    ".qx-tag.on{background:var(--wine);border-color:var(--wine);color:#fff}",
    ".qx-agree{flex-direction:row !important;align-items:flex-start;gap:8px !important;font-weight:500 !important;font-size:12.5px !important;color:var(--ink-soft) !important;line-height:1.55}",
    ".qx-agree input{margin-top:3px}",
    ".qx-btn{border:0;border-radius:11px;background:var(--wine-deep);color:#fff;font-weight:800;font-size:14px;padding:12px 18px;cursor:pointer}",
    ".qx-btn:hover{background:var(--wine)}.qx-btn[disabled]{background:#cbb9c0;cursor:not-allowed}",
    ".qx-btn.ghost{background:#fff;color:var(--wine);border:1.5px solid var(--line)}",
    ".qx-msg{font-size:12.5px;color:var(--wine);min-height:16px}",
    ".qx-guide{background:var(--cream);border-radius:12px;padding:14px 16px;font-size:12.5px;line-height:1.75;color:var(--ink)}",
    ".qx-guide b{color:var(--wine-deep)}",
    ".qx-pv-label{font-size:12px;font-weight:700;color:var(--ink-soft)}",
    ".qx-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}",
    ".qx-stat{background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px 14px}",
    ".qx-stat .l{font-size:11.5px;color:var(--ink-soft)}.qx-stat .v{font-size:22px;font-weight:800;color:var(--wine-deep);margin-top:2px}",
    ".qx-stat .v small{font-size:12px;font-weight:600;color:var(--ink-soft);margin-left:3px}",
    ".qx-filters{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:12px}",
    ".qx-chip{border:1.5px solid var(--line);background:#fff;border-radius:99px;padding:6px 12px;font-size:12.5px;font-weight:700;color:var(--ink-soft);cursor:pointer}",
    ".qx-chip.on{background:var(--wine-deep);border-color:var(--wine-deep);color:#fff}",
    ".qx-sort{margin-left:auto;display:flex;gap:10px;font-size:12.5px}",
    ".qx-sort button{border:0;background:none;color:var(--ink-soft);cursor:pointer;font-weight:600;padding:4px 0}",
    ".qx-sort button.on{color:var(--wine);font-weight:800;text-decoration:underline;text-underline-offset:4px}",
    ".qx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}",
    ".qx-card{background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;cursor:pointer;display:flex;flex-direction:column;transition:box-shadow .15s}",
    ".qx-card:hover{box-shadow:0 6px 18px rgba(76,18,38,.12)}",
    ".qx-card.mine{border:2px solid var(--wine)}",
    ".qx-card .qx-th{aspect-ratio:4/3;background:#f6eef0 center/cover no-repeat}",
    ".qx-card .qx-cb{padding:10px 12px 12px;display:flex;flex-direction:column;gap:3px;flex:1}",
    ".qx-card .qx-cm{font-size:11px;color:var(--wine);font-weight:700}",
    ".qx-card .qx-ci{font-size:13.5px;font-weight:700;color:var(--ink);line-height:1.4}",
    ".qx-card .qx-ca{font-size:11.5px;color:var(--ink-soft)}",
    ".qx-card .qx-cf{display:flex;gap:10px;font-size:12px;color:var(--ink-soft);margin-top:auto;padding-top:6px}",
    ".qx-card .qx-cf .liked{color:#d23c64;font-weight:800}",
    ".qx-best{font-size:10px;font-weight:800;background:#e8b04b;color:#4c1226;border-radius:6px;padding:1px 6px;margin-left:4px}",
    ".qx-empty{grid-column:1/-1;text-align:center;padding:36px 12px;color:var(--ink-soft);font-size:13.5px}",
    ".qx-modal{position:fixed;inset:0;z-index:9000;background:rgba(30,12,20,.55);display:flex;align-items:flex-start;justify-content:center;padding:28px 14px;overflow-y:auto}",
    ".qx-sheet{background:#fff;border-radius:18px;width:100%;max-width:760px;padding:22px;position:relative}",
    ".qx-x{position:absolute;top:12px;right:12px;width:36px;height:36px;border-radius:50%;border:0;background:var(--cream);font-size:20px;cursor:pointer;color:var(--ink)}",
    ".qx-dm{font-size:12px;color:var(--wine);font-weight:700}",
    ".qx-dt{font-size:19px;font-weight:800;color:var(--ink);margin:4px 40px 2px 0;line-height:1.35}",
    ".qx-da{font-size:12.5px;color:var(--ink-soft)}",
    ".qx-dimg{margin-top:14px;background:#f6eef0;border-radius:12px;min-height:160px;display:flex;align-items:center;justify-content:center;color:var(--ink-soft);font-size:13px;overflow:hidden}",
    ".qx-dimg img{width:100%;display:block;cursor:zoom-in}",
    ".qx-sec{margin-top:14px}.qx-sec .k{font-size:12px;font-weight:800;color:var(--wine-deep);margin-bottom:4px}",
    ".qx-sec .t{font-size:13.5px;line-height:1.7;white-space:pre-wrap;word-break:break-word;color:var(--ink)}",
    ".qx-dtags{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}",
    ".qx-dtags span{font-size:12px;font-weight:700;color:var(--wine);background:var(--blush);border-radius:99px;padding:3px 10px}",
    ".qx-like{display:flex;align-items:center;gap:10px;margin-top:16px;padding-top:14px;border-top:1px solid var(--line);flex-wrap:wrap}",
    ".qx-likebtn{border:1.5px solid #f0c2cf;background:#fff;color:#d23c64;border-radius:99px;padding:9px 18px;font-weight:800;font-size:14px;cursor:pointer}",
    ".qx-likebtn.on{background:#d23c64;border-color:#d23c64;color:#fff}",
    ".qx-likebtn[disabled]{opacity:.55;cursor:not-allowed}",
    ".qx-cmts{margin-top:14px;display:flex;flex-direction:column;gap:8px}",
    ".qx-c{background:var(--cream);border-radius:12px;padding:10px 12px;font-size:13.5px;line-height:1.6}",
    ".qx-c.rep{margin-left:26px;background:#f3e7ec}",
    ".qx-c .who{font-size:12px;font-weight:800;color:var(--ink);display:flex;gap:6px;align-items:center;flex-wrap:wrap}",
    ".qx-c .who .tm{font-weight:500;color:var(--ink-soft)}",
    ".qx-c .tx{white-space:pre-wrap;word-break:break-word;margin-top:2px}",
    ".qx-badge{font-size:10.5px;font-weight:800;border-radius:6px;padding:1px 7px;background:#e3eefb;color:#2c5f9e}",
    ".qx-badge.m{background:var(--wine);color:#fff}",
    ".qx-badge.wait{background:#fff4e2;color:#9a6a0c}",
    ".qx-rb{border:0;background:none;color:var(--wine);font-weight:700;font-size:12px;cursor:pointer;padding:2px 0;margin-top:2px}",
    ".qx-add{display:flex;gap:8px;margin-top:10px;align-items:flex-end}",
    ".qx-add textarea{flex:1;border:1.5px solid var(--line);border-radius:11px;padding:10px 12px;font:inherit;font-size:13.5px;min-height:44px;resize:vertical;background:var(--cream);outline:0}",
    ".qx-replying{font-size:12px;color:var(--wine);margin-top:10px;display:flex;gap:8px;align-items:center}",
    ".qx-replying button{border:0;background:none;color:var(--ink-soft);cursor:pointer;font-size:12px;text-decoration:underline}",
    ".qx-awards{display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12.5px;line-height:1.7}",
    ".qx-awards > div{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px}",
    ".qx-awards b{color:var(--wine-deep)}",
    ".qx-wait{background:#fff;border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin-top:10px}",
    ".qx-wait .qx-wi{display:flex;gap:8px;align-items:center;padding:6px 0;border-top:1px dashed var(--line);font-size:13px;cursor:pointer}",
    ".qx-wait .qx-wi:first-of-type{border-top:0}",
    "@media(max-width:760px){.qx-form{grid-template-columns:1fr}.qx-quests,.qx-awards{grid-template-columns:1fr}.qx-banner .qx-b-right{margin-left:0;text-align:left}.qx-sort{margin-left:0;width:100%}.qx-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.qx-sheet{padding:18px 14px}.qx-stats .v{font-size:19px}}"
  ].join("\n");
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  /* ---------- 데이터 정리 ---------- */
  function latestPosts(){
    /* 같은 멘토가 다시 올리면 가장 최근 시간표만 보여요 */
    var by = {};
    S.posts.forEach(function(x){
      if(x.p.hidden) return;
      var k = ownerKey(x.p);
      if(!by[k] || (x.p.ts || 0) > (by[k].p.ts || 0)) by[k] = x;
    });
    return Object.keys(by).map(function(k){ return by[k]; });
  }
  function cmtsOf(id){ return S.cmts.filter(function(c){ return c.c.postId === id; }); }
  function likeCount(p){ return (p.likedBy || []).length; }
  function myPost(){
    var k = myOwnerKey();
    return latestPosts().filter(function(x){ return ownerKey(x.p) === k; })[0] || null;
  }
  function myLikesGiven(){
    var k = myKey(), n = 0;
    latestPosts().forEach(function(x){ if((x.p.likedBy || []).indexOf(k) >= 0) n++; });
    return n;
  }
  function myComments(){
    var k = myOwnerKey();
    var ids = {}; latestPosts().forEach(function(x){ ids[x.id] = 1; });
    return S.cmts.filter(function(c){ return ids[c.c.postId] && (c.c.rosterId ? c.c.rosterId === S.me.rosterId : (c.c.author === S.me.name && c.c.team === S.me.team)); });
  }
  function menteeRank(){
    var counts = {};
    latestPosts().forEach(function(x){ (x.p.likedBy || []).forEach(function(k){ counts[k] = (counts[k] || 0) + 1; }); });
    var mine = counts[myKey()] || 0;
    if(!mine) return null;
    var higher = 0;
    Object.keys(counts).forEach(function(k){ if(counts[k] > mine) higher++; });
    return higher + 1;
  }
  /* 멘토 퀘스트 2: 내 시간표에 달린 멘티 질문에 단 답글 */
  function myAnswers(){
    var mp = myPost(); if(!mp) return [];
    var cs = cmtsOf(mp.id);
    return cs.filter(function(c){
      if(c.c.role !== "멘토" || !c.c.replyTo) return false;
      if(c.c.rosterId ? c.c.rosterId !== S.me.rosterId : c.c.author !== S.me.name) return false;
      var q = cs.filter(function(x){ return x.id === c.c.replyTo; })[0];
      return !!(q && q.c.role !== "멘토");
    });
  }
  /* 내 시간표에 달린 멘티 질문 중 아직 멘토 답글이 없는 것 */
  function waitingQuestions(post){
    if(!post) return [];
    var cs = cmtsOf(post.id);
    return cs.filter(function(c){
      if(c.c.role === "멘토" || c.c.replyTo) return false;
      return !cs.some(function(r){ return r.c.replyTo === c.id && r.c.role === "멘토"; });
    });
  }

  /* ---------- 이미지 줄이기 ---------- */
  function loadImage(file){
    return new Promise(function(res, rej){
      var r = new FileReader();
      r.onload = function(){ var im = new Image(); im.onload = function(){ res(im); }; im.onerror = function(){ rej(new Error("사진을 읽지 못했어요. JPG·PNG 캡처 파일로 올려 주세요.")); }; im.src = r.result; };
      r.onerror = function(){ rej(new Error("사진을 읽지 못했어요.")); };
      r.readAsDataURL(file);
    });
  }
  function shrink(im, maxSide, q, maxLen){
    var side = maxSide, out = "";
    for(var tries = 0; tries < 8; tries++){
      var sc = Math.min(1, side / Math.max(im.width, im.height));
      var cv = document.createElement("canvas");
      cv.width = Math.max(1, Math.round(im.width * sc)); cv.height = Math.max(1, Math.round(im.height * sc));
      var ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(im, 0, 0, cv.width, cv.height);
      out = cv.toDataURL("image/jpeg", q);
      if(out.length <= maxLen) return out;
      if(q > 0.5) q -= 0.1; else side = Math.round(side * 0.85);
    }
    return out.length <= maxLen ? out : null;
  }

  /* ---------- 화면 ---------- */
  function questCards(){
    var mp = myPost();
    var items;
    if(isMentor()){
      var ans = myAnswers().length;
      items = [
        { n: "멘토 퀘스트 1", t: "시간표 캡처 업로드", s: mp ? "등록 완료 · ♥ " + likeCount(mp.p) + " · 💬 " + cmtsOf(mp.id).length : "아래 [나의 전공 시간표 등록]에서 학번·이름 등 개인정보를 가린 시간표 캡처 사진을 올려 주세요", done: !!mp },
        { n: "멘토 퀘스트 2", t: "멘티 질문에 답글 달기", s: ans ? "답글 " + ans + "개 작성" + (mp && waitingQuestions(mp).length ? " · 답변 대기 " + waitingQuestions(mp).length + "개" : "") : (mp ? "멘티가 내 시간표에 질문(댓글)을 남기면 [답변을 기다리는 질문]에 표시돼요. 질문 아래 '↳ 답글 달기'를 눌러 대댓글로 답해 주세요" : "시간표를 등록하고 멘티가 내 시간표에 질문(댓글)을 남기면, 그 질문 아래 '↳ 답글 달기'를 눌러 대댓글로 답할 수 있어요"), done: ans > 0 }
      ];
    } else {
      var lk = myLikesGiven(), cm = myComments().length;
      items = [
        { n: "멘티 퀘스트 1", t: "관심 있는 시간표에 ♥ 누르기", s: lk ? "♥ " + lk + "개 누름" : "아래 [선배 전공 시간표 둘러보기]에서 시간표 카드를 누른 뒤, 마음에 드는 시간표에 ♥(좋아요)를 눌러 주세요. 시간표마다 1번씩 누를 수 있어요", done: lk > 0 },
        { n: "멘티 퀘스트 2", t: "시간표에 궁금한 점 댓글 달기", s: cm ? "댓글 " + cm + "개 작성" : "시간표 카드를 누르고 맨 아래 댓글 칸에 선배에게 궁금한 점을 남겨 주세요. 선배가 대댓글(답글)로 답해 줘요", done: cm > 0 }
      ];
    }
    return '<div class="qx-quests">' + items.map(function(q){
      return '<div class="qx-q' + (q.done ? " done" : "") + '"><div class="qx-chk">' + (q.done ? "✓" : "") + '</div><div><div class="qx-qn">' + q.n + '</div><div class="qx-qt">' + q.t + '</div><div class="qx-qs">' + esc(q.s) + '</div></div></div>';
    }).join("") + '</div>';
  }

  function previewCard(d){
    return '<div class="qx-card" style="cursor:default;max-width:260px">' +
      '<div class="qx-th" style="' + (d.thumb ? "background-image:url(" + d.thumb + ")" : "") + '">' + (d.thumb ? "" : '<div style="height:100%;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--ink-soft)">시간표 사진</div>') + '</div>' +
      '<div class="qx-cb"><div class="qx-cm">' + esc(metaLine(d) || "단과대학 · 전공 · 몇 학년 몇 학기 시간표") + '</div>' +
      '<div class="qx-ci">' + esc(d.intro || "한 줄 소개가 여기에 보여요") + '</div>' +
      '<div class="qx-ca">' + esc(S.me.name) + ' 멘토</div>' +
      '<div class="qx-cf"><span>♥ 0</span><span>💬 0</span></div></div></div>';
  }

  function mentorForm(){
    var d = S.draft;
    if(d.college == null) d.college = COLLEGES.indexOf(S.me.college) >= 0 ? S.me.college : "";
    return '<div class="card qx-form" id="qx-form">' +
      '<div class="qx-col">' +
        '<label>시간표 사진 <span style="font-weight:500;color:var(--ink-soft);font-size:11.5px">학번·이름 등 개인정보는 가리고 캡처해 주세요</span>' +
          '<div class="qx-drop" id="qx-drop">' + (d.thumb ? '<img src="' + d.full + '" alt="">' + '<span style="font-size:12px">다른 사진으로 바꾸려면 눌러 주세요</span>' : '<span style="font-size:28px">🗓️</span><b>전공 시간표 캡처 1장 올리기</b><span>에브리타임·포털 시간표 화면 캡처 (JPG·PNG)</span>') + '</div>' +
          '<input type="file" id="qx-file" accept="image/*" style="display:none"></label>' +
        '<div class="qx-2">' +
          '<label>단과대학<select id="qx-college"><option value="">선택</option>' + COLLEGES.map(function(c){ return '<option' + (d.college === c ? " selected" : "") + '>' + c + '</option>'; }).join("") + '</select></label>' +
          '<label>전공<input type="text" id="qx-major" maxlength="30" placeholder="예) 경영학전공" value="' + esc(d.major || "") + '"></label>' +
        '</div>' +
        '<label>몇 학년 몇 학기 시간표인가요?<select id="qx-sem"><option value="">선택</option>' + SEMS.map(function(x){ return '<option' + (d.sem === x ? " selected" : "") + '>' + x + '</option>'; }).join("") + '</select></label>' +
        '<label>시간표 한 줄 소개 <span class="qx-cnt" id="qx-intro-c">' + (d.intro || "").length + '/40</span><input type="text" id="qx-intro" maxlength="40" placeholder="예) 공강 금요일 사수! 마케팅 집중 시간표" value="' + esc(d.intro || "") + '"></label>' +
        '<label>이렇게 짠 이유 <span class="qx-cnt" id="qx-reason-c">' + (d.reason || "").length + '/400</span><textarea id="qx-reason" maxlength="400" placeholder="예) 전공필수를 먼저 채우고, 실습 수업은 오후로 몰았어요. 1학년 때 이런 걸 알았으면 좋았을 것 같아요!">' + esc(d.reason || "") + '</textarea></label>' +
        '<label>추천 수업 · 교수님 <span style="font-weight:500;color:var(--ink-soft);font-size:11.5px">좋았던 점만 적어 주세요</span><textarea id="qx-rec" maxlength="300" placeholder="예) 마케팅원론 — 실제 사례 위주라 1학년이 듣기에도 좋아요. 과제 피드백이 꼼꼼해요.">' + esc(d.rec || "") + '</textarea></label>' +
        '<label>태그 <span style="font-weight:500;color:var(--ink-soft);font-size:11.5px">최대 3개</span><div class="qx-tags" id="qx-tags">' +
          TAGS.map(function(t){ return '<button type="button" class="qx-tag' + (d.tags.indexOf(t) >= 0 ? " on" : "") + '" data-tag="' + t + '">' + t + '</button>'; }).join("") + '</div></label>' +
        '<label class="qx-agree"><input type="checkbox" id="qx-agree"' + (d.agree ? " checked" : "") + '> 시간표 사진의 학번·이름 등 개인정보를 가렸고, 수업 추천은 좋았던 점만 적었어요. 내 시간표를 멘토링 참여자에게 공개하는 데 동의해요.</label>' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
          (S.editing ? '<button type="button" class="qx-btn ghost" id="qx-cancel">취소</button>' : '') +
          '<button type="button" class="qx-btn" id="qx-submit" style="flex:1"' + (isOpen() ? "" : " disabled") + '>' + (isOpen() ? (myPost() ? "새 시간표로 다시 등록하기" : "시간표 등록하기") : (isClosed() ? "퀘스트가 마감됐어요" : "11/12(목) 오전 9시에 열려요")) + '</button>' +
        '</div><div class="qx-msg" id="qx-msg"></div>' +
      '</div>' +
      '<div class="qx-col">' +
        '<div class="qx-guide"><b>✍️ 이렇게 참여해 주세요</b><br>1. 에브리타임이나 포털에서 <b>보여주고 싶거나 자랑하고 싶은</b> 내 전공 시간표 화면을 캡처해요. 학년·학기는 상관없어요.<br>2. 캡처한 사진에서 학번·이름 등 <b>개인정보는 꼭 가려</b> 주세요.<br>3. 왼쪽 칸에 사진을 올리고, <b>몇 학년 몇 학기</b> 시간표인지 고른 뒤 한 줄 소개, \'이렇게 짠 이유\', 추천 수업을 적어요.<br>4. [시간표 등록하기]를 누르면 <b>멘토 퀘스트 1 완료!</b> 멘티들에게 내 시간표가 공개돼요.<br>5. 멘티가 내 시간표에 질문(댓글)을 남기면, 질문 아래 <b>\'↳ 답글 달기\'</b>를 눌러 대댓글로 답해 주세요. 답글 1개 이상이면 <b>멘토 퀘스트 2 완료!</b></div>' +
        '<div class="qx-pv-label">멘티에게 보이는 모습</div><div id="qx-preview">' + previewCard(d) + '</div>' +
      '</div>' +
    '</div>';
  }

  function myPostBox(mp){
    var wq = waitingQuestions(mp);
    return '<div class="qx-stats">' +
        '<div class="qx-stat"><div class="l">내 시간표가 받은 ♥</div><div class="v">' + likeCount(mp.p) + '<small>개</small></div></div>' +
        '<div class="qx-stat"><div class="l">내 시간표 댓글</div><div class="v">' + cmtsOf(mp.id).length + '<small>개</small></div></div>' +
        '<div class="qx-stat"><div class="l">내가 단 답글 (퀘스트 2)</div><div class="v">' + myAnswers().length + '<small>개</small></div></div>' +
      '</div>' +
      '<div class="qx-wait"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><b style="font-size:13.5px;color:var(--wine-deep)">답변을 기다리는 질문</b><span class="qx-badge wait">' + wq.length + '개</span>' +
        '<span style="margin-left:auto;display:flex;gap:6px"><button type="button" class="qx-btn ghost" style="padding:7px 12px;font-size:12.5px" data-qx-open="' + esc(mp.id) + '">내 시간표 보기</button>' +
        '<button type="button" class="qx-btn ghost" style="padding:7px 12px;font-size:12.5px" id="qx-reedit">다시 올리기</button></span></div>' +
        (wq.length ? wq.slice(0, 5).map(function(c){ return '<div class="qx-wi" data-qx-open="' + esc(mp.id) + '"><span class="qx-badge">질문</span><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(c.c.text) + '</span><span style="font-size:11.5px;color:var(--ink-soft)">' + esc(c.c.author) + ' · ' + ago(c.c.ts) + '</span></div>'; }).join("")
          : '<div style="font-size:12.5px;color:var(--ink-soft);margin-top:6px">아직 답변할 질문이 없어요. 멘티가 내 시간표에 질문(댓글)을 남기면 여기에 표시되고, 누르면 바로 답글을 달 수 있어요.</div>') +
      '</div>';
  }

  function menteeStatus(){
    var rk = menteeRank();
    return '<div class="qx-stats">' +
      '<div class="qx-stat"><div class="l">내가 누른 ♥</div><div class="v">' + myLikesGiven() + '<small>개</small></div></div>' +
      '<div class="qx-stat"><div class="l">내가 단 댓글</div><div class="v">' + myComments().length + '<small>개</small></div></div>' +
      '<div class="qx-stat"><div class="l">한국인의정성상 순위</div><div class="v">' + (rk ? rk + '<small>위</small>' : '-') + '</div></div>' +
    '</div>';
  }

  function browseList(){
    var list = latestPosts();
    var tagsUsed = {};
    list.forEach(function(x){ (x.p.tags || []).forEach(function(t){ tagsUsed[t] = 1; }); });
    if(S.college !== "전체") list = list.filter(function(x){ return x.p.college === S.college; });
    if(S.tag) list = list.filter(function(x){ return (x.p.tags || []).indexOf(S.tag) >= 0; });
    var cc = function(x){ return cmtsOf(x.id).length; };
    list.sort(function(a, b){
      if(S.sort === "like") return likeCount(b.p) - likeCount(a.p) || (b.p.ts || 0) - (a.p.ts || 0);
      if(S.sort === "cmt") return cc(b) - cc(a) || (b.p.ts || 0) - (a.p.ts || 0);
      return (b.p.ts || 0) - (a.p.ts || 0);
    });
    var all = latestPosts(), maxLike = 0;
    all.forEach(function(x){ maxLike = Math.max(maxLike, likeCount(x.p)); });
    var me = myKey(), mk = myOwnerKey();
    var filt = '<div class="qx-filters">' +
      ["전체"].concat(COLLEGES).map(function(c){ return '<button type="button" class="qx-chip' + (S.college === c ? " on" : "") + '" data-qx-college="' + c + '">' + c + '</button>'; }).join("") +
      '</div><div class="qx-filters">' +
      Object.keys(tagsUsed).sort().map(function(t){ return '<button type="button" class="qx-chip' + (S.tag === t ? " on" : "") + '" data-qx-tag="' + esc(t) + '">' + esc(t) + '</button>'; }).join("") +
      '<div class="qx-sort">' + [["like","좋아요순"],["cmt","댓글순"],["new","최신순"]].map(function(s){ return '<button type="button" class="' + (S.sort === s[0] ? "on" : "") + '" data-qx-sort="' + s[0] + '">' + s[1] + '</button>'; }).join("") + '</div></div>';
    var grid = '<div class="qx-grid">' + (list.length ? list.map(function(x){
      var p = x.p, liked = (p.likedBy || []).indexOf(me) >= 0, lc = likeCount(p);
      return '<div class="qx-card' + (ownerKey(p) === mk ? " mine" : "") + '" data-qx-open="' + esc(x.id) + '">' +
        '<div class="qx-th" style="background-image:url(' + (/^data:image\//.test(p.thumb || "") ? p.thumb : "") + ')"></div>' +
        '<div class="qx-cb"><div class="qx-cm">' + esc(metaLine(p)) + '</div>' +
        '<div class="qx-ci">' + esc(p.intro || "") + (lc && lc === maxLike ? '<span class="qx-best">BEST</span>' : '') + '</div>' +
        '<div class="qx-ca">' + esc(p.author || "멘토") + ' 멘토</div>' +
        '<div class="qx-cf"><span class="' + (liked ? "liked" : "") + '">♥ ' + lc + '</span><span>💬 ' + cc(x) + '</span></div></div></div>';
    }).join("") : '<div class="qx-empty card">' + (all.length ? "조건에 맞는 시간표가 없어요." : "아직 등록된 시간표가 없어요." + (isMentor() ? " 첫 번째로 올려 보세요!" : " 선배들의 시간표가 곧 올라와요!")) + '</div>') + '</div>';
    return filt + grid;
  }

  function awardsBox(){
    return '<div class="qx-awards">' +
      '<div><b>🏆 멘토 시상 (5명)</b><br>봄날의햇살상 3명 — 내 시간표 ♥ 최다<br>댓글부자상 1명 — 내 시간표 댓글 최다<br>소통이남다르상 2명 — 멘티 질문에 가장 성실한 답변</div>' +
      '<div><b>🏆 멘티 시상 (15명)</b><br>한국인의정성상 10명 — ♥를 가장 많이 누른 멘티<br>어쩜이렇게잘하상 5명 — 가장 좋은 질문·댓글<br><span style="color:var(--ink-soft)">※ 상품: 커피 쿠폰 · ♥는 시간표 1개당 1회, 마감 시점 기준</span></div>' +
    '</div>';
  }

  function render(){
    var sec = $("page-quest"); if(!sec || !S.me) return;
    var body = $("qx-body"); if(!body) return;
    /* 입력 중에는 실시간 갱신으로 화면을 덮지 않아요 */
    var ae = document.activeElement;
    if(ae && body.contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)){ S.pending = true; return; }
    S.pending = false;
    var all = latestPosts(), totalLikes = 0;
    all.forEach(function(x){ totalLikes += likeCount(x.p); });
    var h = '<div class="qx-banner"><div><b>🗓️ 11월 퀘스트 (멘토링 Mission Quest) · 선배 전공 시간표 공개</b><div class="qx-b-sub">기간 11. 12.(목) ~ 11. 20.(금) · ' + (isClosed() ? "마감됐어요 — 결과를 집계하고 있어요" : (now() < START ? "11/12(목) 오전 9시 오픈 (미리보기)" : "지금 참여할 수 있어요")) + '</div></div>' +
      '<div class="qx-b-right">등록 시간표 <b>' + all.length + '</b>개<br>누적 ♥ <b>' + totalLikes + '</b>개</div></div>';
    h += '<div class="qx-intro"><b>퀘스트란?</b> 멘토와 멘티가 함께 참여하는 월별 온라인 멘토링 미션이에요. 11월 퀘스트는 <b>멘토(선배)</b>가 자신의 전공 시간표를 공개하고, <b>멘티(후배)</b>가 마음에 드는 시간표에 ♥를 누르거나 궁금한 점을 댓글로 질문하면, 멘토가 대댓글(답글)로 답해 주는 방식으로 진행돼요. 아래 내 퀘스트 2개를 모두 완료해 주세요!<div class="qx-note">※ 퀘스트 참여 내용(시간표·♥·댓글·답글)은 장학금 지급을 위한 결과보고서와 성과보고회 활동자료로 활용됩니다.</div></div>';
    h += questCards();
    if(isMentor()){
      var mp = myPost(), wq = mp ? waitingQuestions(mp).length : 0;
      h += '<div class="qx-tabs"><button type="button" class="' + (S.mtab !== "browse" ? "on" : "") + '" data-qx-mtab="mine">내 시간표' + (wq ? ' <span class="qx-badge wait">질문 ' + wq + '</span>' : '') + '</button>' +
        '<button type="button" class="' + (S.mtab === "browse" ? "on" : "") + '" data-qx-mtab="browse">선배 시간표 둘러보기</button></div>';
      if(S.mtab === "browse"){
        h += '<div class="qx-h">선배 전공 시간표 둘러보기 <small>다른 멘토들의 시간표를 둘러보며 참고할 수 있어요 (♥는 멘티만 누를 수 있어요)</small></div>' + browseList();
      } else if(!mp || S.editing){
        h += '<div class="qx-h">나의 전공 시간표 등록 <small>' + (mp ? "다시 올리면 새 시간표로 바뀌고, 이전 시간표의 ♥·댓글은 옮겨지지 않아요" : "멘토 퀘스트 1") + '</small></div>' + mentorForm();
      } else {
        h += '<div class="qx-h">내 시간표 현황 <small>멘토 퀘스트 2 — 멘티가 내 시간표에 남긴 질문에 대댓글(답글)로 답해 주세요</small></div>' + myPostBox(mp);
      }
    } else {
      h += '<div class="qx-h">내 참여 현황</div>' + menteeStatus();
      h += '<div class="qx-h">선배 전공 시간표 둘러보기 <small>시간표 카드를 누르면 ♥(좋아요)와 질문 댓글을 남길 수 있어요</small></div>';
      h += browseList();
    }
    h += '<div class="qx-h">시상 안내 <small>총 20명 · 커피 쿠폰</small></div>' + awardsBox();
    body.innerHTML = h;
    if(S.openId) renderDetail();
  }

  function updatePreview(){
    var d = S.draft, pv = $("qx-preview"); if(pv) pv.innerHTML = previewCard(d);
  }

  /* ---------- 상세 ---------- */
  function closeDetail(){ S.openId = null; S.replyTo = null; var m = $("qx-modal"); if(m) m.remove(); document.body.style.overflow = ""; }
  function renderDetail(){
    var x = S.posts.filter(function(y){ return y.id === S.openId; })[0];
    if(!x){ closeDetail(); return; }
    var m = $("qx-modal");
    var keepDraft = "", focus = false, scroll = 0;
    if(m){
      var ta = m.querySelector("#qx-ctext"); if(ta){ keepDraft = ta.value; focus = document.activeElement === ta; }
      scroll = m.scrollTop;
    } else {
      m = document.createElement("div"); m.id = "qx-modal"; m.className = "qx-modal";
      document.body.appendChild(m); document.body.style.overflow = "hidden";
      m.addEventListener("click", onModalClick);
      m.addEventListener("keydown", function(e){ if(e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.target.id === "qx-ctext"){ e.preventDefault(); sendComment(); } });
    }
    var p = x.p, me = myKey(), liked = (p.likedBy || []).indexOf(me) >= 0;
    var cs = cmtsOf(x.id).sort(function(a, b){ return (a.c.ts || 0) - (b.c.ts || 0); });
    var top = cs.filter(function(c){ return !c.c.replyTo || !cs.some(function(y){ return y.id === c.c.replyTo; }); });
    var owner = ownerKey(p);
    var canAnswer = isMentor() && isOpen() && ownerKey(p) === myOwnerKey();
    function cHtml(c, isRep){
      var cc = c.c, mentor = cc.role === "멘토", isOwner = mentor && ((cc.rosterId && cc.rosterId === p.rosterId) || (!cc.rosterId && cc.author === p.author));
      return '<div class="qx-c' + (isRep ? " rep" : "") + '"><div class="who">' + esc(cc.author || "참여자") +
        (mentor ? '<span class="qx-badge m">' + (isOwner ? "멘토 답변 · 작성 선배" : "멘토 답변") + '</span>' : '<span class="qx-badge">' + (isRep ? "멘티" : "질문") + '</span>') +
        '<span class="tm">' + esc(cc.teamName || "") + ' · ' + ago(cc.ts) + '</span></div><div class="tx">' + esc(cc.text) + '</div>' +
        (!isRep && canAnswer && !mentor ? '<button type="button" class="qx-rb" data-qx-reply="' + esc(c.id) + '">↳ 답글 달기</button>' : '') + '</div>';
    }
    var cmtHtml = top.map(function(c){
      return cHtml(c, false) + cs.filter(function(r){ return r.c.replyTo === c.id; }).map(function(r){ return cHtml(r, true); }).join("");
    }).join("");
    var rt = S.replyTo && cs.filter(function(c){ return c.id === S.replyTo; })[0];
    var full = S.imgCache[p.imgId];
    var isOwnerMe = owner === myOwnerKey();
    var likeDisabled = isMentor() || !isOpen();
    m.innerHTML = '<div class="qx-sheet"><button type="button" class="qx-x" data-qx-close>×</button>' +
      '<div class="qx-dm">' + esc(metaLine(p)) + '</div>' +
      '<div class="qx-dt">' + esc(p.intro || "") + '</div>' +
      '<div class="qx-da">' + esc(p.author || "멘토") + ' 멘토' + (p.teamName ? " · " + esc(p.teamName) : "") + ' · ' + ago(p.ts) + '</div>' +
      '<div class="qx-dimg" id="qx-dimg">' + (full ? '<img src="' + full + '" data-pz="qx_' + esc(x.id) + '" alt="시간표">' : (p.thumb ? '<img src="' + p.thumb + '" alt="시간표" style="filter:blur(1px);opacity:.7">' : "시간표 사진을 불러오는 중…")) + '</div>' +
      '<div style="font-size:11.5px;color:var(--ink-soft);margin-top:4px">사진을 누르면 크게 볼 수 있어요</div>' +
      (p.reason ? '<div class="qx-sec"><div class="k">이렇게 짠 이유</div><div class="t">' + esc(p.reason) + '</div></div>' : '') +
      (p.rec ? '<div class="qx-sec"><div class="k">추천 수업 · 교수님</div><div class="t">' + esc(p.rec) + '</div></div>' : '') +
      ((p.tags || []).length ? '<div class="qx-dtags">' + p.tags.map(function(t){ return '<span>' + esc(t) + '</span>'; }).join("") + '</div>' : '') +
      '<div class="qx-like"><button type="button" class="qx-likebtn' + (liked ? " on" : "") + '" data-qx-like' + (likeDisabled ? " disabled" : "") + '>♥ ' + (liked ? "좋아요 취소" : "좋아요") + ' · ' + likeCount(p) + '</button>' +
        '<span style="font-size:12px;color:var(--ink-soft)">' + (isMentor() ? (isOwnerMe ? "내 시간표예요. 아래 멘티 질문마다 '↳ 답글 달기'를 눌러 대댓글로 답해 주세요." : "♥(좋아요)는 멘티만 누를 수 있어요. 다른 멘토의 시간표는 둘러보며 참고만 할 수 있어요.") : (isOpen() ? "마음에 들면 ♥를 눌러 주세요. 시간표마다 1번씩 누를 수 있고, 다시 누르면 취소돼요." : "퀘스트 기간이 아니에요")) + '</span></div>' +
      '<div class="qx-h" style="margin-top:18px">댓글 ' + cs.length + '</div>' +
      '<div class="qx-cmts">' + (cmtHtml || '<div style="font-size:13px;color:var(--ink-soft)">' + (isMentor() ? "아직 멘티 질문이 없어요. 질문이 달리면 여기서 '↳ 답글 달기'로 답할 수 있어요." : "아직 댓글이 없어요. 아래 칸에 선배에게 궁금한 점을 남겨 보세요! 선배가 답글로 답해 줘요.") + '</div>') + '</div>' +
      (isOpen() ? ((rt ? '<div class="qx-replying">↳ <b>' + esc(rt.c.author) + '</b>님 질문에 답글 다는 중 <button type="button" data-qx-reply-cancel>취소</button></div>' : '') +
        '<div class="qx-add"><textarea id="qx-ctext" maxlength="500" placeholder="' + (isMentor() ? (rt ? "멘티 질문에 답글을 남겨 주세요" : "멘티에게 남길 말을 적어 주세요 (질문에 답하려면 질문 아래 '↳ 답글 달기'를 눌러 주세요)") : "선배에게 궁금한 점을 남겨 주세요 (예: 이 수업 2학년 때 들어도 괜찮을까요?)") + '"></textarea>' +
        '<button type="button" class="qx-btn" data-qx-send>' + (rt ? "답글 등록" : "등록") + '</button></div>') : '<div style="font-size:12.5px;color:var(--ink-soft);margin-top:10px">퀘스트 기간(11/12~11/20)에만 댓글과 답글을 남길 수 있어요.</div>') +
    '</div>';
    window.__PZ = window.__PZ || {}; if(full) window.__PZ["qx_" + x.id] = [full];
    var ta2 = m.querySelector("#qx-ctext"); if(ta2){ ta2.value = keepDraft; if(focus || rt) ta2.focus(); }
    m.scrollTop = scroll;
    if(!full && p.imgId && db && !S.imgLoading){
      S.imgLoading = p.imgId;
      db.collection("photo_posts").doc(p.imgId).get().then(function(s){
        S.imgLoading = null;
        var im = s.exists ? (s.data() || {}).image : "";
        if(/^data:image\//.test(im || "")){ S.imgCache[p.imgId] = im; if(S.openId === x.id) renderDetail(); }
        else { var el = $("qx-dimg"); if(el && p.thumb) el.innerHTML = '<img src="' + p.thumb + '" alt="시간표">'; }
      }).catch(function(){ S.imgLoading = null; });
    }
  }
  function onModalClick(e){
    var m = $("qx-modal");
    if(e.target === m || e.target.closest("[data-qx-close]")){ closeDetail(); return; }
    var x = S.posts.filter(function(y){ return y.id === S.openId; })[0]; if(!x) return;
    if(e.target.closest("[data-qx-like]")){
      if(isMentor() || !isOpen() || !db) return;
      var cur = (x.p.likedBy || []).slice(), k = myKey(), i = cur.indexOf(k);
      if(i >= 0) cur.splice(i, 1); else cur.push(k);
      x.p.likedBy = cur; renderDetail(); render();
      db.collection("photo_posts").doc(x.id).update({ likedBy: cur }).catch(function(){ alert("좋아요를 저장하지 못했어요. 새로고침 후 다시 시도해 주세요."); });
      return;
    }
    var rb = e.target.closest("[data-qx-reply]");
    if(rb){ S.replyTo = rb.getAttribute("data-qx-reply"); renderDetail(); return; }
    if(e.target.closest("[data-qx-reply-cancel]")){ S.replyTo = null; renderDetail(); return; }
    if(e.target.closest("[data-qx-send]")){ sendComment(); return; }
  }
  function sendComment(){
    var ta = $("qx-ctext"); if(!ta || !db || !isOpen()) return;
    var text = ta.value.trim(); if(!text){ ta.focus(); return; }
    var btn = document.querySelector("[data-qx-send]"); if(btn) btn.disabled = true;
    var d = { kind: "quest", postId: S.openId, replyTo: S.replyTo || "", author: S.me.name || "참여자", rosterId: S.me.rosterId || "",
      role: S.me.role || "멘티", college: S.me.college || "", team: S.me.team || "", teamName: S.me.teamName || "", text: text, ts: Date.now() };
    db.collection("photo_comments").add(d).then(function(){
      ta.value = ""; S.replyTo = null;
    }).catch(function(){ alert("댓글을 저장하지 못했어요. 새로고침 후 다시 시도해 주세요."); }).then(function(){ if(btn) btn.disabled = false; });
  }

  /* ---------- 등록 ---------- */
  function readForm(){
    var d = S.draft;
    var g = function(id){ var el = $(id); return el ? el.value.trim() : ""; };
    d.college = g("qx-college"); d.major = g("qx-major"); d.sem = g("qx-sem"); d.intro = g("qx-intro"); d.reason = g("qx-reason"); d.rec = g("qx-rec");
    var ag = $("qx-agree"); d.agree = !!(ag && ag.checked);
  }
  function submit(){
    readForm();
    var d = S.draft, msg = $("qx-msg"), btn = $("qx-submit");
    var fail = function(t){ if(msg) msg.textContent = t; };
    if(!isOpen()) return fail("퀘스트 기간이 아니에요.");
    if(!d.full) return fail("시간표 사진을 올려 주세요.");
    if(!d.college) return fail("단과대학을 선택해 주세요.");
    if(!d.major) return fail("전공을 적어 주세요.");
    if(!d.sem) return fail("몇 학년 몇 학기 시간표인지 골라 주세요.");
    if(!d.intro) return fail("시간표 한 줄 소개를 적어 주세요.");
    if(!d.reason) return fail("'이렇게 짠 이유'를 적어 주세요.");
    if(!d.agree) return fail("개인정보 가림·공개 동의에 체크해 주세요.");
    if(!db) return fail("서버에 연결하지 못했어요. 새로고침해 주세요.");
    btn.disabled = true; fail("올리는 중이에요…");
    var base = { author: S.me.name || "멘토", rosterId: S.me.rosterId || "", role: "멘토", college: d.college, myCollege: S.me.college || "", team: S.me.team || "", teamName: S.me.teamName || "", ts: Date.now() };
    var col = db.collection("photo_posts");
    col.add(Object.assign({ type: "quest_tt_img", image: d.full }, base)).then(function(ref){
      return col.add(Object.assign({ type: "quest_tt", imgId: ref.id, thumb: d.thumb, major: d.major, sem: d.sem, intro: d.intro, reason: d.reason, rec: d.rec, tags: d.tags.slice(0, 3), likedBy: [], agree: true }, base));
    }).then(function(){
      S.imgCache = S.imgCache || {};
      S.draft = { tags: [] }; S.editing = false;
      render();
      window.scrollTo(0, 0);
    }).catch(function(e){
      btn.disabled = false; fail("저장하지 못했어요. 사진 용량을 줄이거나 잠시 후 다시 시도해 주세요. (" + (e && e.code ? e.code : "오류") + ")");
    });
  }
  function onPick(file){
    var msg = $("qx-msg");
    if(!file) return;
    if(!/^image\//.test(file.type)){ if(msg) msg.textContent = "사진(JPG·PNG) 파일만 올릴 수 있어요."; return; }
    if(msg) msg.textContent = "사진을 준비하는 중이에요…";
    readForm();
    loadImage(file).then(function(im){
      var full = shrink(im, 1400, 0.8, 640000), thumb = shrink(im, 440, 0.6, 70000);
      if(!full || !thumb) throw new Error("사진 용량이 너무 커요. 시간표 부분만 잘라서 다시 캡처해 주세요.");
      S.draft.full = full; S.draft.thumb = thumb;
      if(document.activeElement && document.activeElement.blur) document.activeElement.blur();
      render();
      var m2 = $("qx-msg"); if(m2) m2.textContent = "";
    }).catch(function(e){ var m3 = $("qx-msg"); if(m3) m3.textContent = e.message; });
  }

  /* ---------- 이벤트 ---------- */
  function wire(){
    var body = $("qx-body");
    body.addEventListener("click", function(e){
      var t;
      if((t = e.target.closest("[data-qx-open]"))){ S.openId = t.getAttribute("data-qx-open"); S.replyTo = null; renderDetail(); return; }
      if((t = e.target.closest("[data-qx-mtab]"))){ S.mtab = t.getAttribute("data-qx-mtab"); render(); return; }
      if((t = e.target.closest("[data-qx-college]"))){ S.college = t.getAttribute("data-qx-college"); render(); return; }
      if((t = e.target.closest("[data-qx-tag]"))){ var tg = t.getAttribute("data-qx-tag"); S.tag = S.tag === tg ? "" : tg; render(); return; }
      if((t = e.target.closest("[data-qx-sort]"))){ S.sort = t.getAttribute("data-qx-sort"); render(); return; }
      if(e.target.closest("#qx-drop")){ var f = $("qx-file"); if(f) f.click(); return; }
      if((t = e.target.closest("[data-tag]"))){
        var tags = S.draft.tags, v = t.getAttribute("data-tag"), i = tags.indexOf(v);
        if(i >= 0) tags.splice(i, 1); else if(tags.length < 3) tags.push(v); else { var mm = $("qx-msg"); if(mm) mm.textContent = "태그는 3개까지 고를 수 있어요."; return; }
        t.classList.toggle("on", tags.indexOf(v) >= 0); return;
      }
      if(e.target.closest("#qx-submit")){ submit(); return; }
      if(e.target.closest("#qx-reedit")){ S.editing = true; render(); return; }
      if(e.target.closest("#qx-cancel")){ S.editing = false; render(); return; }
    });
    body.addEventListener("change", function(e){
      if(e.target.id === "qx-file"){ onPick(e.target.files && e.target.files[0]); e.target.value = ""; }
      if(e.target.id === "qx-college" || e.target.id === "qx-sem"){ readForm(); updatePreview(); }
    });
    body.addEventListener("input", function(e){
      if(!e.target.closest("#qx-form")) return;
      readForm(); updatePreview();
      var c1 = $("qx-intro-c"); if(c1) c1.textContent = (S.draft.intro || "").length + "/40";
      var c2 = $("qx-reason-c"); if(c2) c2.textContent = (S.draft.reason || "").length + "/400";
    });
    body.addEventListener("focusout", function(){ setTimeout(function(){ if(S.pending) render(); }, 200); });
    document.addEventListener("keydown", function(e){ if(e.key === "Escape" && $("qx-modal") && !document.querySelector("[data-z]")) closeDetail(); });
  }

  function watch(){
    if(!db || S.unsubP) return;
    S.unsubP = db.collection("photo_posts").where("type", "==", "quest_tt").onSnapshot(function(snap){
      S.posts = snap.docs.map(function(d){ return { id: d.id, p: d.data() || {} }; });
      render(); if(S.openId) renderDetail();
    }, function(){ var b = $("qx-body"); if(b) b.innerHTML = '<div class="offline-note" style="margin-top:18px">시간표를 불러오지 못했어요. 새로고침해 주세요.</div>'; });
    S.unsubC = db.collection("photo_comments").where("kind", "==", "quest").onSnapshot(function(snap){
      S.cmts = snap.docs.map(function(d){ return { id: d.id, c: d.data() || {} }; });
      render(); if(S.openId) renderDetail();
    }, function(){});
  }

  function setupNav(){
    var nav = $("nav-quest");
    if(nav) nav.style.display = visible() ? "" : "none";
  }

  function start(me){
    if(S.started) return;
    S.started = true; S.me = me;
    try{ if(!firebase.apps.length) return; db = firebase.firestore(); }catch(e){ return; }
    setupNav();
    var sec = $("page-quest");
    if(sec && !$("qx-body")){ var b = document.createElement("div"); b.id = "qx-body"; sec.appendChild(b); wire(); }
    /* 메뉴를 처음 열 때 데이터를 불러와요 */
    var nav = $("nav-quest");
    if(nav) nav.addEventListener("click", function(){ watch(); render(); });
    if(sec && sec.style.display === "block"){ watch(); render(); }
    if(!visible()){
      var wait = START - Date.now();
      if(wait > 0 && wait < 24 * 3600 * 1000) setTimeout(setupNav, wait + 1000);
    }
  }
  /* 다른 곳(홈 바로가기 등)에서 열렸을 때 */
  window.DSFMQuest = { open: function(){ watch(); render(); } };

  window.addEventListener("dsfm:login", function(e){ start(e.detail || {}); });
  if(window.DSFM && window.DSFM.me) start(window.DSFM.me);
})();

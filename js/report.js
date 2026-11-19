/* =====================================================================
   DS-FM/GLM 결과보고서 — 멘토 결과보고서 (멘토 전용 · 비공개)
   ① 빈 양식(PPTX) 내려받기
   ② 공유공간에 올린 우리 팀 글·사진을 골라 양식에 자동으로 채워서 내려받기
   ③ 작성한 파일(PPTX·PDF, 5MB 이하) 제출 → 제출 완료 / 확인 완료
   데이터 (Firestore)
     suggestion_posts kind "final_report" : 제출 정보 (파일 내용은 넣지 않아요)
     attendance_votes kind "report_chunk" : 파일 조각 (parentId = 제출 문서 ID)
   ===================================================================== */
(function(){
  "use strict";

  var TPL_URL = "assets/report_template.pptx?v=20261119";
  var JSZIP_URL = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
  var DUE_TEXT = "11. 23.(월)";
  var MAX_FILE = 5 * 1024 * 1024;
  var CHUNK = 700000;

  var S = { me: null, started: false, loaded: false, loading: false, items: [], roster: [], quest: [], replies: [],
            sel: {}, mine: [], unsubMine: null, busy: false, file: null };
  var db = null;
  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function md(ts){ if(!ts) return ""; var d = new Date(ts); return (d.getMonth() + 1) + "/" + d.getDate(); }
  function mdLong(ts){ if(!ts) return ""; var d = new Date(ts); return (d.getMonth() + 1) + ". " + d.getDate() + ".(" + "일월화수목금토"[d.getDay()] + ")"; }
  function fmtTime(ts){ if(!ts) return ""; var d = new Date(ts); return md(ts) + " " + ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }
  function cut(s, n){ s = String(s || "").replace(/\s+\n/g, "\n").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function isMentor(){ return S.me && S.me.role === "멘토"; }

  /* ---------- 슬롯 (양식의 사진·글 칸) ---------- */
  var PICNIC_NAMES = { b2: "강의동 거울샷", b4: "0.5배 항공샷", b5: "멘토 몰아주기" };
  var SLOTS = [
    { key: "team",  type: "photo", slide: 3,  frame: 0, group: "우리 팀 소개", label: "팀 단체사진" },
    { key: "s1a",   type: "photo", slide: 5,  frame: 0, group: "1학기 활동", label: "1학기 활동 사진 ①" },
    { key: "s1b",   type: "photo", slide: 5,  frame: 1, group: "1학기 활동", label: "1학기 활동 사진 ②" },
    { key: "pk1",   type: "photo", slide: 6,  frame: 0, group: "PICNIC DAY 스탬프 미션", label: "스탬프 미션 사진 ①", cap: 0 },
    { key: "pk2",   type: "photo", slide: 6,  frame: 1, group: "PICNIC DAY 스탬프 미션", label: "스탬프 미션 사진 ②", cap: 1 },
    { key: "pk3",   type: "photo", slide: 6,  frame: 2, group: "PICNIC DAY 스탬프 미션", label: "스탬프 미션 사진 ③", cap: 2 },
    { key: "pk4",   type: "photo", slide: 6,  frame: 3, group: "PICNIC DAY 스탬프 미션", label: "스탬프 미션 사진 ④", cap: 3 },
    { key: "t1",    type: "text",  slide: 7,  group: "PICNIC DAY 글 인증", label: "① 한 줄 각오", ph: "[멘토링을 시작하며 적은 한 줄 각오를 옮겨 적어 주세요]", by: 0, max: 120 },
    { key: "t2",    type: "text",  slide: 7,  group: "PICNIC DAY 글 인증", label: "② 멘토링에 바라는 점", ph: "[멘토링에 바라는 점을 옮겨 적어 주세요]", by: 1, max: 120 },
    { key: "q1",    type: "photo", slide: 8,  frame: 0, group: "11월 퀘스트", label: "미션 ① 시간표 공개 사진" },
    { key: "q2",    type: "photo", slide: 9,  frame: 0, group: "11월 퀘스트", label: "미션 ② 멘티 질문 답글 사진" },
    { key: "best",  type: "photo", slide: 10, frame: 0, group: "BEST MOMENT", label: "BEST MOMENT 사진" },
    { key: "voice", type: "text",  slide: 11, group: "멘토링 성과와 변화", label: "멘티 한마디", ph: "[“멘티가 직접 남긴 한마디를 옮겨 주세요” — 멘티 이름]", max: 110 },
    { key: "mentor",type: "photo", slide: 12, frame: 0, group: "멘토 소감", label: "멘토 사진 (선택)" }
  ];
  function slot(k){ return SLOTS.filter(function(s){ return s.key === k; })[0]; }
  function item(id){ return S.items.filter(function(x){ return x.id === id; })[0]; }

  /* ---------- 스타일 ---------- */
  var css = [
    "#page-report .rp-card{background:#fff;border:1px solid var(--line,#ecdde1);border-radius:16px;padding:18px 20px;margin-bottom:16px}",
    "#page-report .rp-h{font-weight:800;font-size:16px;color:var(--wine-deep,#4c1226);margin-bottom:6px;display:flex;align-items:center;gap:8px}",
    "#page-report .rp-h .no{display:inline-flex;width:24px;height:24px;border-radius:50%;background:var(--wine,#7c1f3d);color:#fff;font-size:13px;align-items:center;justify-content:center}",
    "#page-report .rp-d{font-size:13.5px;color:var(--ink-soft,#8a737a);line-height:1.6;margin-bottom:12px}",
    "#page-report .rp-btns{display:flex;gap:8px;flex-wrap:wrap}",
    "#page-report .rp-btn{border:0;border-radius:12px;padding:11px 16px;font:inherit;font-weight:700;font-size:14px;cursor:pointer;background:var(--wine,#7c1f3d);color:#fff}",
    "#page-report .rp-btn.ghost{background:#fff;color:var(--wine,#7c1f3d);border:1.5px solid var(--wine,#7c1f3d)}",
    "#page-report .rp-btn.sm{padding:6px 10px;font-size:12.5px;border-radius:9px}",
    "#page-report .rp-btn[disabled]{opacity:.5;cursor:default}",
    "#page-report .rp-grp{font-size:13px;font-weight:800;color:var(--wine,#7c1f3d);margin:16px 0 8px}",
    "#page-report .rp-slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}",
    "#page-report .rp-slot{border:1.5px dashed #d9c3ca;border-radius:12px;padding:8px;display:flex;flex-direction:column;gap:6px;background:#fbf7f8}",
    "#page-report .rp-slot.on{border-style:solid;border-color:var(--wine,#7c1f3d);background:#fff}",
    "#page-report .rp-slot .lb{font-size:12px;font-weight:700;color:var(--ink,#2a1e22)}",
    "#page-report .rp-slot .th{height:96px;border-radius:8px;background:#f1e6e9 center/cover no-repeat;display:flex;align-items:center;justify-content:center;font-size:12px;color:#a8939a;text-align:center;padding:6px;overflow:hidden}",
    "#page-report .rp-slot .tx{min-height:96px;border-radius:8px;background:#f7f1f3;font-size:12px;line-height:1.5;padding:8px;color:var(--ink,#2a1e22);overflow:hidden;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical}",
    "#page-report .rp-slot .tx.empty{color:#a8939a;display:flex;align-items:center;justify-content:center;text-align:center}",
    "#page-report .rp-slot .act{display:flex;gap:6px}",
    "#page-report .rp-slot .act button{flex:1}",
    "#page-report .rp-msg{font-size:13px;color:var(--wine,#7c1f3d);margin-top:10px;min-height:18px}",
    "#page-report .rp-auto{font-size:12.5px;background:var(--cream,#fbf5f1);border-radius:10px;padding:10px 12px;line-height:1.6;color:var(--ink,#2a1e22)}",
    "#page-report .rp-sub{border-top:1px dashed var(--line,#ecdde1);padding-top:12px;margin-top:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13.5px}",
    "#page-report .rp-st{font-size:12px;font-weight:800;padding:3px 10px;border-radius:10px;background:#fff4e2;color:#9a6a0c}",
    "#page-report .rp-st.ok{background:#e3f1e8;color:#2f7a4b}",
    ".rp-mo{position:fixed;inset:0;background:rgba(30,15,20,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}",
    ".rp-mo .bx{background:#fff;border-radius:18px;width:min(760px,100%);max-height:88vh;display:flex;flex-direction:column;overflow:hidden;font-family:inherit}",
    ".rp-mo .hd{padding:16px 18px;border-bottom:1px solid #ecdde1;display:flex;align-items:center;gap:10px}",
    ".rp-mo .hd b{font-size:16px;color:#4c1226;flex:1}",
    ".rp-mo .hd button{border:0;background:#f1e6e9;border-radius:10px;padding:7px 12px;font:inherit;font-weight:700;cursor:pointer}",
    ".rp-mo .bd{padding:14px 18px;overflow:auto}",
    ".rp-mo .flt{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}",
    ".rp-mo .flt button{border:1.5px solid #ecdde1;background:#fff;border-radius:16px;padding:5px 11px;font:inherit;font-size:12.5px;cursor:pointer}",
    ".rp-mo .flt button.on{background:#7c1f3d;color:#fff;border-color:#7c1f3d}",
    ".rp-mo .pg{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}",
    ".rp-mo .pi{border:2px solid transparent;border-radius:12px;overflow:hidden;cursor:pointer;background:#fbf7f8;text-align:left;padding:0;font:inherit}",
    ".rp-mo .pi.on{border-color:#7c1f3d}",
    ".rp-mo .pi .im{height:110px;background:#f1e6e9 center/cover no-repeat}",
    ".rp-mo .pi .ca{padding:6px 8px;font-size:11.5px;line-height:1.4;color:#2a1e22}",
    ".rp-mo .pi .ca small{display:block;color:#8a737a}",
    ".rp-mo .ti{display:block;width:100%;border:2px solid #ecdde1;border-radius:12px;padding:10px 12px;margin-bottom:8px;background:#fff;text-align:left;font:inherit;font-size:13.5px;line-height:1.55;cursor:pointer;white-space:pre-wrap}",
    ".rp-mo .ti.on{border-color:#7c1f3d;background:#fbf5f1}",
    ".rp-mo .ti small{display:block;color:#8a737a;font-size:11.5px;margin-top:4px}",
    ".rp-mo .em{padding:30px 10px;text-align:center;color:#8a737a;font-size:13.5px}"
  ].join("\n");

  /* ---------- 데이터 불러오기 ---------- */
  function chunks(arr, n){ var o = []; for(var i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; }
  function byAuthor(colName, names){
    if(!names.length) return Promise.resolve([]);
    return Promise.all(chunks(names, 10).map(function(part){
      return db.collection(colName).where("author", "in", part).get().then(function(s){ return s.docs; }, function(){ return []; });
    })).then(function(r){ return [].concat.apply([], r); });
  }
  function byField(colName, f, v){
    return db.collection(colName).where(f, "==", v).get().then(function(s){ return s.docs; }, function(){ return []; });
  }
  function sameTeam(d){
    var me = S.me;
    if(d.team && d.team !== me.team) return false;
    if(d.myCollege && d.myCollege !== me.college) return false;
    if(!d.myCollege && d.college && d.type !== "quest_tt" && d.college !== me.college) return false;
    return true;
  }
  function load(){
    if(S.loaded || S.loading || !db) return;
    S.loading = true; render();
    var me = S.me;
    byField("team_roster", "teamKey", me.team).then(function(rs){
      S.roster = rs.map(function(x){ var d = x.data(); return { id: x.id, name: d.name || "", role: d.role || "", major: d.major || "", createdAt: d.createdAt || 0 }; })
        .sort(function(a, b){ return (a.role === "멘토" ? 0 : 1) - (b.role === "멘토" ? 0 : 1) || a.createdAt - b.createdAt; });
      var names = S.roster.map(function(r){ return r.name; }).filter(Boolean);
      if(names.indexOf(me.name) < 0) names.push(me.name);
      return Promise.all([
        byAuthor("photo_posts", names), byField("verify_posts", "team", me.team), byAuthor("verify_posts", names),
        byAuthor("private_posts", names), byAuthor("suggestion_posts", names), byField("team_posts", "team", me.team),
        byField("photo_comments", "team", me.team)
      ]);
    }).then(function(r){
      var items = [], seen = {};
      function add(o){ if(seen[o.id]) return; seen[o.id] = 1; items.push(o); }
      r[0].forEach(function(x){
        var d = x.data(); if(!sameTeam(d)) return;
        if(d.type === "quest_tt"){ S.quest.push({ id: x.id, d: d }); return; }
        if(!d.image) return;
        var isQ = d.type === "quest_tt_img";
        add({ id: "p_" + x.id, kind: "photo", src: isQ ? "11월 퀘스트" : (d.picnic ? "PICNIC DAY" : "사진 게시판"), img: d.image,
              title: isQ ? "11월 퀘스트 시간표" : String(d.title || "").replace(/^\[PICNIC DAY\]\s*/, ""), text: d.caption || "",
              author: d.author || "", ts: d.createdAt || d.ts || 0, picnic: d.picnic || "", quest: isQ ? x.id : "" });
      });
      r[1].concat(r[2]).forEach(function(x){
        var d = x.data(); if(!sameTeam(d)) return;
        var imgs = (d.images && d.images.length) ? d.images : (d.image ? [d.image] : []);
        imgs.forEach(function(im, i){
          add({ id: "v_" + x.id + "_" + i, kind: "photo", src: d.picnicTeamId ? "PICNIC DAY" : "인증게시판", img: im,
                title: d.picnicTeamId ? "피크닉 사진 인증" : (d.category || "미션 인증"), text: String(d.caption || "").replace(/^\[[^\]]*\]\s*/, ""),
                author: d.author || "", ts: d.createdAt || 0, teamPhoto: !!d.picnicTeamId });
        });
      });
      r[3].forEach(function(x){ var d = x.data(); if(!sameTeam(d) || !d.text) return;
        add({ id: "f_" + x.id, kind: "text", src: "자유게시판", text: d.text, author: d.anon ? "익명" : (d.author || ""), ts: d.createdAt || 0 }); });
      r[4].forEach(function(x){ var d = x.data(); if(d.kind || !sameTeam(d) || !d.text) return;
        add({ id: "s_" + x.id, kind: "text", src: "운영진에게 건의", text: d.text, author: d.author || "", ts: d.createdAt || 0 }); });
      r[5].forEach(function(x){ var d = x.data(); if(!d.text) return;
        add({ id: "t_" + x.id, kind: "text", src: "팀별 게시판", text: d.text, author: d.author || "", ts: d.createdAt || 0 }); });
      r[6].forEach(function(x){ var d = x.data(); if(d.kind !== "quest" || !d.text) return;
        add({ id: "c_" + x.id, kind: "text", src: "11월 퀘스트 댓글", text: d.text, author: d.author || "", role: d.role || "", ts: d.ts || 0, reply: !!d.replyTo });
        if(d.replyTo && d.author === me.name && d.role === "멘토") S.replies.push(d.ts || 0);
      });
      S.items = items.sort(function(a, b){ return b.ts - a.ts; });
      autoPick();
      S.loaded = true; S.loading = false; render();
    }).catch(function(e){ console.warn(e); S.loading = false; S.loadErr = true; render(); });
  }
  function autoPick(){
    var used = {};
    function take(k, fn){ if(S.sel[k]) return; var it = S.items.filter(function(x){ return !used[x.id] && fn(x); })[0]; if(it){ S.sel[k] = it.id; used[it.id] = 1; } }
    take("pk1", function(x){ return x.kind === "photo" && x.picnic === "b2"; });
    take("pk2", function(x){ return x.kind === "photo" && x.picnic === "b4"; });
    take("pk3", function(x){ return x.kind === "photo" && x.picnic === "b5"; });
    take("pk4", function(x){ return x.kind === "photo" && x.teamPhoto; });
    take("t1", function(x){ return x.kind === "text" && /^\[PICNIC DAY 각오\]/.test(x.text); });
    take("t2", function(x){ return x.kind === "text" && /^\[멘토링에 바라는 점\]/.test(x.text); });
    take("q1", function(x){ return x.kind === "photo" && x.quest && x.author === S.me.name; });
  }

  /* ---------- 화면 ---------- */
  function ensureDom(){
    var sec = $("page-report"); if(!sec) return null;
    if(!$("rp-style")){ var st = document.createElement("style"); st.id = "rp-style"; st.textContent = css; document.head.appendChild(st); }
    if(!$("rp-body")){ var b = document.createElement("div"); b.id = "rp-body"; sec.appendChild(b); wire(b); }
    return $("rp-body");
  }
  function slotHtml(s){
    var it = item(S.sel[s.key]);
    var inner;
    if(s.type === "photo") inner = it ? '<div class="th" style="background-image:url(' + esc(it.img) + ')"></div>' : '<div class="th">비어 있음<br>(양식에 빈 칸으로 남아요)</div>';
    else inner = it ? '<div class="tx">' + esc(cleanText(it.text)) + '<br><small style="color:#8a737a">— ' + esc(it.author) + '</small></div>' : '<div class="tx empty">비어 있음</div>';
    return '<div class="rp-slot' + (it ? " on" : "") + '"><div class="lb">' + esc(s.label) + '</div>' + inner +
      '<div class="act"><button class="rp-btn sm ghost" type="button" data-rp-pick="' + s.key + '">' + (it ? "바꾸기" : "고르기") + '</button>' +
      (it ? '<button class="rp-btn sm ghost" type="button" data-rp-clear="' + s.key + '">비우기</button>' : '') + '</div></div>';
  }
  function cleanText(t){ return String(t || "").replace(/^\[(PICNIC DAY 각오|멘토링에 바라는 점)\]\s*/, ""); }
  function render(){
    var el = ensureDom(); if(!el || !S.me) return;
    if(!isMentor()){ el.innerHTML = '<div class="rp-card">결과보고서는 멘토만 제출할 수 있어요.</div>'; return; }
    var h = '';
    h += '<div class="rp-card"><div class="rp-h"><span class="no">1</span>결과보고서 양식 받기</div>' +
      '<div class="rp-d">팀별로 멘토 1명이 작성해요. 양식을 채워 <b>' + DUE_TEXT + '까지</b> 아래 ③에서 제출해 주세요. 발표는 팀당 5분이에요.<br>' +
      '빈 양식을 받아 직접 채워도 되고, ②에서 공유공간에 올린 글·사진을 골라 <b>미리 채워진 양식</b>으로 받을 수도 있어요.<br>받은 PPT의 글·사진·표는 <b>모두 자유롭게 고치거나 지울 수 있어요.</b> 꼭 이 양식이 아니어도 괜찮아요. <b>본인만의 양식</b>으로 만들어 제출해도 돼요.</div>' +
      '<div class="rp-btns"><button class="rp-btn ghost" type="button" data-rp="blank">📄 빈 양식 받기 (PPTX)</button></div></div>';

    h += '<div class="rp-card"><div class="rp-h"><span class="no">2</span>내 글·사진 골라서 채우기</div>' +
      '<div class="rp-d">우리 팀(멘토·멘티)이 공유공간에 올린 글과 사진 중에서 양식의 각 칸에 넣을 것을 골라 주세요.<br>피크닉데이·11월 퀘스트 기록은 미리 골라 두었어요. 받은 파일은 PowerPoint에서 자유롭게 고칠 수 있어요.</div>';
    if(S.loading) h += '<div class="rp-auto">우리 팀 기록을 불러오는 중이에요…</div>';
    else if(S.loadErr) h += '<div class="rp-auto">기록을 불러오지 못했어요. 새로고침 후 다시 열어 주세요. (빈 양식은 위에서 받을 수 있어요)</div>';
    else if(S.loaded){
      var mentees = S.roster.filter(function(r){ return r.role === "멘티"; });
      h += '<div class="rp-auto"><b>자동으로 들어가는 내용</b> · 팀명 ' + esc(S.me.teamName || "-") + ' · 멘토 ' + esc(S.me.name) +
        ' · 멘티 ' + (mentees.length ? esc(mentees.map(function(m){ return m.name; }).join(", ")) : "(명단 없음)") +
        ' · 미션 체크리스트 수행일 · 11월 퀘스트 미션명' + (S.replies.length ? ' · 멘티 질문 답글 ' + S.replies.length + '개' : '') + '</div>';
      var groups = [];
      SLOTS.forEach(function(s){ if(groups.indexOf(s.group) < 0) groups.push(s.group); });
      groups.forEach(function(g){
        h += '<div class="rp-grp">' + esc(g) + '</div><div class="rp-slots">' + SLOTS.filter(function(s){ return s.group === g; }).map(slotHtml).join("") + '</div>';
      });
      h += '<div class="rp-btns" style="margin-top:16px"><button class="rp-btn" type="button" data-rp="make"' + (S.busy ? " disabled" : "") + '>' + (S.busy ? "만드는 중…" : "⬇ 골라 둔 내용으로 PPTX 받기") + '</button></div>';
    }
    h += '<div class="rp-msg" id="rp-msg2"></div></div>';

    var last = S.mine[0];
    h += '<div class="rp-card"><div class="rp-h"><span class="no">3</span>결과보고서 제출</div>' +
      '<div class="rp-d">완성한 보고서를 <b>PDF 파일로 저장해서</b> 올려 주세요 (5MB 이하). PowerPoint에서는 <b>[파일 → 다른 이름으로 저장 → 파일 형식: PDF]</b>를 고르면 돼요. 본인만의 양식으로 만든 보고서도 PDF로 올리면 돼요.<br>파일명은 <b>팀번호_멘토이름_학번_전공_결과보고서.pdf</b>로 해 주세요. (예: 07_김덕성_20240000_시각디자인_결과보고서.pdf) 다시 올리면 마지막 파일로 바뀌어요. 제출한 파일은 <b>본인과 운영진만</b> 볼 수 있어요.</div>' +
      '<input type="file" id="rp-file" accept=".pdf,application/pdf">' +
      '<div class="rp-btns" style="margin-top:10px"><button class="rp-btn" type="button" data-rp="submit"' + (S.busy ? " disabled" : "") + '>제출하기</button></div>' +
      '<div class="rp-msg" id="rp-msg"></div>' +
      (last ? '<div class="rp-sub"><span class="rp-st' + (last.d.status === "확인완료" ? " ok" : "") + '">' + (last.d.status === "확인완료" ? "✅ 확인 완료" : "📨 제출 완료") + '</span>' +
        '<span>' + esc(last.d.fileName || "") + '</span><span style="color:#8a737a">' + fmtTime(last.d.createdAt) + '</span>' +
        (last.d.reply ? '<div style="flex-basis:100%;background:#fbf5f1;border-radius:10px;padding:8px 10px">운영진: ' + esc(last.d.reply) + '</div>' : '') + '</div>'
        : '<div class="rp-sub"><span class="rp-st">아직 제출하지 않았어요</span></div>') +
      '</div>';
    el.innerHTML = h;
  }
  function msg(id, t){ var m = $(id); if(m) m.textContent = t || ""; }

  /* ---------- 고르기 창 ---------- */
  function openPicker(k){
    var s = slot(k); if(!s) return;
    var menteeNames = mentees().map(function(m){ return m.name; });
    var list = S.items.filter(function(x){ return x.kind === s.type && (k !== "voice" || menteeNames.indexOf(x.author) >= 0); });
    var srcs = []; list.forEach(function(x){ if(srcs.indexOf(x.src) < 0) srcs.push(x.src); });
    var flt = "전체";
    var w = document.createElement("div"); w.className = "rp-mo";
    function draw(){
      var L = list.filter(function(x){ return flt === "전체" || x.src === flt; });
      var body = !list.length ? '<div class="em">' + (k === "voice" ? "멘티가 올린 글이 없어요." : "우리 팀이 올린 " + (s.type === "photo" ? "사진" : "글") + "이 없어요.") + '</div>' :
        s.type === "photo" ? '<div class="pg">' + L.map(function(x){
          return '<button type="button" class="pi' + (S.sel[k] === x.id ? " on" : "") + '" data-id="' + esc(x.id) + '"><div class="im" style="background-image:url(' + esc(x.img) + ')"></div>' +
            '<div class="ca">' + esc(cut(x.title || x.text || x.src, 30)) + '<small>' + esc(x.src) + ' · ' + esc(x.author) + ' · ' + md(x.ts) + '</small></div></button>';
        }).join("") + '</div>' :
        L.map(function(x){
          return '<button type="button" class="ti' + (S.sel[k] === x.id ? " on" : "") + '" data-id="' + esc(x.id) + '">' + esc(cut(cleanText(x.text), 200)) + '<small>' + esc(x.src) + ' · ' + esc(x.author) + ' · ' + md(x.ts) + '</small></button>';
        }).join("");
      w.innerHTML = '<div class="bx"><div class="hd"><b>' + esc(s.label) + ' 고르기</b><button type="button" data-x>닫기</button></div><div class="bd">' +
        (srcs.length > 1 ? '<div class="flt">' + ["전체"].concat(srcs).map(function(f){ return '<button type="button" data-f="' + esc(f) + '" class="' + (f === flt ? "on" : "") + '">' + esc(f) + '</button>'; }).join("") + '</div>' : '') +
        body + '</div></div>';
    }
    draw();
    w.addEventListener("click", function(e){
      if(e.target === w || e.target.closest("[data-x]")){ w.remove(); return; }
      var f = e.target.closest("[data-f]"); if(f){ flt = f.getAttribute("data-f"); draw(); return; }
      var b = e.target.closest("[data-id]"); if(b){ S.sel[k] = b.getAttribute("data-id"); w.remove(); render(); }
    });
    document.body.appendChild(w);
  }

  /* ---------- PPTX 만들기 ---------- */
  var jszipP = null;
  function loadZip(){
    if(window.JSZip) return Promise.resolve(window.JSZip);
    if(jszipP) return jszipP;
    jszipP = new Promise(function(ok, no){
      var sc = document.createElement("script"); sc.src = JSZIP_URL;
      sc.onload = function(){ window.JSZip ? ok(window.JSZip) : no(new Error("JSZip")); };
      sc.onerror = function(){ jszipP = null; no(new Error("JSZip load")); };
      document.head.appendChild(sc);
    });
    return jszipP;
  }
  function getTpl(){ return fetch(TPL_URL, { cache: "no-cache" }).then(function(r){ if(!r.ok) throw new Error("tpl"); return r.arrayBuffer(); }); }
  /* 양식 안내 슬라이드의 메뉴 이름을 지금 메뉴 이름으로 */
  function fixGuide(zip){
    var f = zip.file("ppt/slides/slide1.xml"); if(!f) return Promise.resolve();
    return f.async("string").then(function(x){ zip.file("ppt/slides/slide1.xml", x.split("「성과보고회」 메뉴").join("「결과보고서」 메뉴").split("팀번호_멘토이름_결과보고서.pptx  (예: 07_김덕성_결과보고서.pptx)").join("팀번호_멘토이름_학번_전공_결과보고서.pdf  (예: 07_김덕성_20240000_시각디자인_결과보고서.pdf)")); });
  }
  var PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  function blankTpl(){
    return Promise.all([loadZip(), getTpl()]).then(function(r){
      return r[0].loadAsync(r[1]).then(function(zip){ return fixGuide(zip).then(function(){ return zip.generateAsync({ type: "blob", mimeType: PPTX_MIME, compression: "DEFLATE" }); }); });
    }).catch(function(){ return getTpl().then(function(buf){ return new Blob([buf], { type: PPTX_MIME }); }); });
  }
  function saveBlob(blob, name){
    var url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 8000);
  }
  function teamNo(){ var m = String(S.me.teamName || "").match(/\d+/); return m ? ("0" + m[0]).slice(-2) : "00"; }
  function fileBase(){ return teamNo() + "_" + (S.me.name || "멘토") + "_결과보고서"; }

  var A = "http://schemas.openxmlformats.org/drawingml/2006/main";
  var P = "http://schemas.openxmlformats.org/presentationml/2006/main";
  var R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  var PR = "http://schemas.openxmlformats.org/package/2006/relationships";
  function parse(x){ return new DOMParser().parseFromString(x, "application/xml"); }
  function ser(d){ return new XMLSerializer().serializeToString(d); }
  function tList(doc, txt){ return Array.prototype.filter.call(doc.getElementsByTagNameNS(A, "t"), function(t){ return t.textContent === txt; }); }
  function setRun(t, text){
    var r = t.parentNode, rPr = r.getElementsByTagNameNS(A, "rPr")[0];
    if(rPr){ var c = rPr.getElementsByTagNameNS(A, "srgbClr")[0]; if(c && c.getAttribute("val") === "A8939A") c.setAttribute("val", "2A2226"); }
    var lines = String(text).split("\n");
    t.textContent = lines[0];
    var after = r;
    for(var i = 1; i < lines.length; i++){
      var br = r.ownerDocument.createElementNS(A, "a:br");
      if(rPr) br.appendChild(rPr.cloneNode(true));
      var r2 = r.cloneNode(true); r2.getElementsByTagNameNS(A, "t")[0].textContent = lines[i];
      after.parentNode.insertBefore(br, after.nextSibling); br.parentNode.insertBefore(r2, br.nextSibling); after = r2;
    }
  }
  function setT(doc, oldT, newT, nth){
    if(newT == null || newT === "") return;
    var L = tList(doc, oldT);
    var targets = nth === "all" ? L : [L[nth || 0]];
    targets.forEach(function(t){ if(t) setRun(t, newT); });
  }
  function spByName(doc, name){
    return Array.prototype.filter.call(doc.getElementsByTagNameNS(P, "sp"), function(sp){
      var c = sp.getElementsByTagNameNS(P, "cNvPr")[0]; return c && c.getAttribute("name") === name;
    });
  }
  function prepImage(src){
    return new Promise(function(ok){
      var im = new Image();
      im.onload = function(){
        var w = im.naturalWidth, h = im.naturalHeight, sc = Math.min(1, 1600 / Math.max(w, h));
        var cv = document.createElement("canvas"); cv.width = Math.round(w * sc); cv.height = Math.round(h * sc);
        var cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(im, 0, 0, cv.width, cv.height);
        ok({ b64: cv.toDataURL("image/jpeg", 0.88).split(",")[1], w: cv.width, h: cv.height });
      };
      im.onerror = function(){ ok(null); };
      im.src = src;
    });
  }
  function putPhotos(doc, rels, slideNo, jobs, zip){
    var frames = spByName(doc, "photo-frame"), guides = spByName(doc, "photo-guide");
    jobs.forEach(function(j, n){
      var sp = frames[j.frame]; if(!sp || !j.img) return;
      var off = sp.getElementsByTagNameNS(A, "off")[0], ext = sp.getElementsByTagNameNS(A, "ext")[0];
      var x = +off.getAttribute("x"), y = +off.getAttribute("y"), cx = +ext.getAttribute("cx"), cy = +ext.getAttribute("cy");
      var fa = cx / cy, ia = j.img.w / j.img.h, l = 0, t = 0;
      if(ia > fa) l = Math.round((1 - fa / ia) / 2 * 100000); else t = Math.round((1 - ia / fa) / 2 * 100000);
      var rid = "rIdRp" + n, media = "rp_s" + slideNo + "_" + n + ".jpg";
      zip.file("ppt/media/" + media, j.img.b64, { base64: true });
      var rel = rels.createElementNS(PR, "Relationship");
      rel.setAttribute("Id", rid); rel.setAttribute("Type", R + "/image"); rel.setAttribute("Target", "../media/" + media);
      rels.documentElement.appendChild(rel);
      var px = '<p:pic xmlns:p="' + P + '" xmlns:a="' + A + '" xmlns:r="' + R + '"><p:nvPicPr><p:cNvPr id="' + (9000 + slideNo * 10 + n) + '" name="photo ' + (n + 1) + '"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>' +
        '<p:blipFill><a:blip r:embed="' + rid + '"/><a:srcRect l="' + l + '" t="' + t + '" r="' + l + '" b="' + t + '"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>' +
        '<p:spPr><a:xfrm><a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 5263"/></a:avLst></a:prstGeom></p:spPr></p:pic>';
      var pic = doc.importNode(parse(px).documentElement, true);
      sp.parentNode.replaceChild(pic, sp);
      if(guides[j.frame] && guides[j.frame].parentNode) guides[j.frame].parentNode.removeChild(guides[j.frame]);
    });
  }
  function mentees(){ return S.roster.filter(function(r){ return r.role === "멘티"; }); }
  function mentorRow(){ return S.roster.filter(function(r){ return r.role === "멘토" && r.name === S.me.name; })[0] || { name: S.me.name, major: "" }; }
  function fixMenteeRows(doc, n){
    var trs = Array.prototype.filter.call(doc.getElementsByTagNameNS(A, "tr"), function(tr){
      var t = tr.getElementsByTagNameNS(A, "t")[0]; return t && t.textContent === "멘티";
    });
    if(!trs.length) return;
    var last = trs[trs.length - 1];
    for(var i = trs.length; i < n; i++){ var c = last.cloneNode(true); last.parentNode.insertBefore(c, last.nextSibling); last = c; }
    for(var j = trs.length - 1; j >= Math.max(n, 1); j--) trs[j].parentNode.removeChild(trs[j]);
  }
  function build(){
    var picked = {}; Object.keys(S.sel).forEach(function(k){ var it = item(S.sel[k]); if(it) picked[k] = it; });
    var imgJobs = SLOTS.filter(function(s){ return s.type === "photo" && picked[s.key]; });
    return Promise.all([loadZip(), getTpl(), Promise.all(imgJobs.map(function(s){ return prepImage(picked[s.key].img); }))]).then(function(r){
      var JSZip = r[0], imgs = {};
      imgJobs.forEach(function(s, i){ imgs[s.key] = r[2][i]; });
      return JSZip.loadAsync(r[1]).then(function(zip){ return fixGuide(zip).then(function(){ return zip; }); }).then(function(zip){
        var slides = {}, rels = {};
        var nums = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
        return Promise.all(nums.map(function(n){
          return Promise.all([zip.file("ppt/slides/slide" + n + ".xml").async("string"), zip.file("ppt/slides/_rels/slide" + n + ".xml.rels").async("string")])
            .then(function(x){ slides[n] = parse(x[0]); rels[n] = parse(x[1]); });
        })).then(function(){
          var me = S.me, mt = mentees(), mr = mentorRow(), tn = me.teamName || "";
          var mNames = mt.map(function(m){ return m.name; }).join(", ");
          /* 표지·마무리 */
          setT(slides[2], "[팀명] 멘토링 결과보고서", tn + " 멘토링 결과보고서");
          setT(slides[2], "[학과] [학년] [이름]", [mr.major || me.college, me.name].filter(Boolean).join(" "));
          setT(slides[2], "[이름], [이름], [이름], [이름]", mNames);
          setT(slides[2], "[00]", teamNo());
          setT(slides[13], "[팀명] · 멘토 [이름] · 멘티 [이름], [이름], [이름], [이름]", tn + " · 멘토 " + me.name + (mNames ? " · 멘티 " + mNames : ""));
          /* 팀 소개 표 */
          fixMenteeRows(slides[3], mt.length);
          setT(slides[3], "[이름]", me.name, 0);
          setT(slides[3], "[학과·학년]", mr.major || me.college);
          mt.forEach(function(m, i){ setT(slides[3], "[이름]", m.name, 0); if(m.major) setT(slides[3], "[희망 전공]", m.major, 0); else tList(slides[3], "[희망 전공]")[0] && (tList(slides[3], "[희망 전공]")[0].textContent = "[희망 전공] "); });
          tList(slides[3], "[희망 전공] ").forEach(function(t){ t.textContent = "[희망 전공]"; });
          /* PICNIC 사진 캡션 */
          ["pk1", "pk2", "pk3", "pk4"].forEach(function(k, i){
            var it = picked[k];
            var name = it ? (PICNIC_NAMES[it.picnic] || (it.teamPhoto ? "피크닉 사진 인증" : (it.title || ""))) : "";
            var desc = it ? cut(it.text || "", 40) : "";
            var mt1 = tList(slides[6], "[미션명]"), ds = tList(slides[6], "[한 줄 설명]");
            if(name && mt1[0]) setRun(mt1[0], name); else if(mt1[0]) mt1[0].textContent = "[미션명] ";
            if(desc && ds[0]) setRun(ds[0], desc); else if(ds[0]) ds[0].textContent = "[한 줄 설명] ";
          });
          tList(slides[6], "[미션명] ").forEach(function(t){ t.textContent = "[미션명]"; });
          tList(slides[6], "[한 줄 설명] ").forEach(function(t){ t.textContent = "[한 줄 설명]"; });
          /* 글 인증 · 멘티 한마디 */
          ["t1", "t2"].forEach(function(k){
            var s = slot(k), it = picked[k]; if(!it) return;
            setT(slides[7], s.ph, cut(cleanText(it.text), s.max));
          });
          var by = tList(slides[7], "— [작성자 이름]");
          if(picked.t1 && by[0]) setRun(by[0], "— " + picked.t1.author);
          if(picked.t2 && by[1]) setRun(by[1], "— " + picked.t2.author);
          if(picked.voice) setT(slides[11], slot("voice").ph, "“" + cut(cleanText(picked.voice.text), 100) + "” — " + picked.voice.author);
          /* 11월 퀘스트 */
          setT(slides[8], "11월 퀘스트 미션 ① · [미션명]", "11월 퀘스트 미션 ① · 시간표 공개");
          setT(slides[9], "11월 퀘스트 미션 ② · [미션명]", "11월 퀘스트 미션 ② · 멘티 질문 답글");
          var myQ = S.quest.filter(function(q){ return q.d.author === me.name; }).sort(function(a, b){ return (b.d.ts || 0) - (a.d.ts || 0); })[0];
          if(myQ){
            setT(slides[8], "[예: 11. 17.(화) 점심, 학생회관]", mdLong(myQ.d.ts) + " · 공유공간 「11월 퀘스트」");
            setT(slides[8], "[미션 수행 과정을 2~3줄로 적어 주세요]", cut((myQ.d.sem ? myQ.d.sem + " 시간표 공개 · " : "") + (myQ.d.intro || "") + (myQ.d.reason ? "\n" + myQ.d.reason : ""), 150));
          }
          var lastRep = S.replies.length ? Math.max.apply(null, S.replies) : 0;
          if(S.replies.length){
            setT(slides[9], "[예: 11. 17.(화) 점심, 학생회관]", "~ " + mdLong(lastRep) + " · 공유공간 「11월 퀘스트」");
            setT(slides[9], "[미션 수행 과정을 2~3줄로 적어 주세요]", "내 시간표에 달린 멘티 질문에 답글 " + S.replies.length + "개를 달았어요.");
          }
          /* 미션 체크리스트 */
          var rowsDone = [
            null,
            picked.pk1 && picked.pk1.ts, picked.pk2 && picked.pk2.ts, picked.pk3 && picked.pk3.ts, picked.pk4 && picked.pk4.ts,
            picked.t1 && picked.t1.ts, picked.t2 && picked.t2.ts,
            myQ ? (myQ.d.ts || 1) : null, lastRep || null
          ];
          var dates = tList(slides[4], "[  /  ]"), boxes = tList(slides[4], "☐"), cnt = 0;
          rowsDone.forEach(function(ts, i){ if(!ts) return; cnt++; if(dates[i]) setRun(dates[i], md(ts)); if(boxes[i]) setRun(boxes[i], "☑"); });
          setT(slides[4], "미션 ① [미션명]", "미션 ① 시간표 공개");
          setT(slides[4], "미션 ② [미션명]", "미션 ② 멘티 질문 답글");
          setT(slides[4], "[0]", String(cnt), 0);
          /* 사진 */
          var bySlide = {};
          imgJobs.forEach(function(s){ (bySlide[s.slide] = bySlide[s.slide] || []).push({ frame: s.frame, img: imgs[s.key] }); });
          Object.keys(bySlide).forEach(function(n){ putPhotos(slides[n], rels[n], +n, bySlide[n].sort(function(a, b){ return a.frame - b.frame; }), zip); });
          nums.forEach(function(n){ zip.file("ppt/slides/slide" + n + ".xml", ser(slides[n])); zip.file("ppt/slides/_rels/slide" + n + ".xml.rels", ser(rels[n])); });
          return zip.file("[Content_Types].xml").async("string").then(function(ct){
            if(!/Extension="jpg"/i.test(ct)) ct = ct.replace(/<Types([^>]*)>/, '<Types$1><Default Extension="jpg" ContentType="image/jpeg"/>');
            zip.file("[Content_Types].xml", ct);
            return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", compression: "DEFLATE" });
          });
        });
      });
    });
  }

  /* ---------- 제출 ---------- */
  function readFile(f){ return new Promise(function(ok, no){ var fr = new FileReader(); fr.onload = function(){ ok(fr.result); }; fr.onerror = no; fr.readAsDataURL(f); }); }
  function submit(){
    var inp = $("rp-file"), f = inp && inp.files && inp.files[0];
    if(!f){ msg("rp-msg", "제출할 파일을 골라 주세요."); return; }
    if(!/\.pdf$/i.test(f.name)){ msg("rp-msg", "PDF 파일만 올릴 수 있어요. PowerPoint에서 [파일 → 다른 이름으로 저장 → PDF]로 저장한 뒤 올려 주세요."); return; }
    if(f.size > MAX_FILE){ msg("rp-msg", "파일이 5MB를 넘어요. PDF로 저장할 때 '최소 크기(온라인 게시)'를 고르거나 사진 용량을 줄여서 다시 올려 주세요."); return; }
    if(!db){ msg("rp-msg", "서버에 연결하지 못했어요. 새로고침해 주세요."); return; }
    S.busy = true; render(); msg("rp-msg", "올리는 중이에요… 창을 닫지 마세요.");
    var me = S.me, ref = db.collection("suggestion_posts").doc();
    readFile(f).then(function(data){
      var parts = []; for(var i = 0; i < data.length; i += CHUNK) parts.push(data.slice(i, i + CHUNK));
      var done = 0;
      return parts.reduce(function(p, part, idx){
        return p.then(function(){
          return db.collection("attendance_votes").add({ choice: "attend", kind: "report_chunk", parentId: ref.id, idx: idx, total: parts.length, data: part, college: me.college || "", createdAt: Date.now() })
            .then(function(){ done++; msg("rp-msg", "올리는 중이에요… (" + done + "/" + parts.length + ")"); });
        });
      }, Promise.resolve()).then(function(){
        return ref.set({ kind: "final_report", text: "[결과보고서] " + f.name, author: me.name || "멘토", rosterId: me.rosterId || "", role: me.role || "",
          college: me.college || "", team: me.team || "", teamName: me.teamName || "", fileName: f.name, fileSize: f.size, fileChunks: parts.length,
          status: "제출", createdAt: Date.now() });
      });
    }).then(function(){
      S.busy = false; render(); msg("rp-msg", "제출했어요! 운영진이 확인하면 '확인 완료'로 바뀌어요.");
    }).catch(function(e){
      console.warn(e); S.busy = false; render(); msg("rp-msg", "제출하지 못했어요. 잠시 후 다시 시도하거나 운영진에게 알려 주세요.");
    });
  }
  function watchMine(){
    if(S.unsubMine || !db || !S.me.rosterId) return;
    S.unsubMine = db.collection("suggestion_posts").where("rosterId", "==", S.me.rosterId).onSnapshot(function(s){
      S.mine = s.docs.map(function(x){ return { id: x.id, d: x.data() }; }).filter(function(x){ return x.d.kind === "final_report"; })
        .sort(function(a, b){ return (b.d.createdAt || 0) - (a.d.createdAt || 0); });
      if(!S.busy) render();
    }, function(){});
  }

  /* ---------- 이벤트 ---------- */
  function wire(el){
    el.addEventListener("click", function(e){
      var p = e.target.closest("[data-rp-pick]"); if(p){ openPicker(p.getAttribute("data-rp-pick")); return; }
      var c = e.target.closest("[data-rp-clear]"); if(c){ delete S.sel[c.getAttribute("data-rp-clear")]; render(); return; }
      var b = e.target.closest("[data-rp]"); if(!b) return;
      var a = b.getAttribute("data-rp");
      if(a === "blank"){
        b.disabled = true;
        blankTpl().then(function(blob){ saveBlob(blob, fileBase() + ".pptx"); })
          .catch(function(){ alert("양식을 내려받지 못했어요. 새로고침 후 다시 시도해 주세요."); }).then(function(){ b.disabled = false; });
      }
      if(a === "make"){
        S.busy = true; render(); msg("rp-msg2", "파일을 만드는 중이에요…");
        build().then(function(blob){ saveBlob(blob, fileBase() + ".pptx"); S.busy = false; render(); msg("rp-msg2", "다운로드했어요! PowerPoint에서 빈 칸(슬로건·소감 등)을 채운 뒤 ③에서 제출해 주세요."); })
          .catch(function(err){ console.warn(err); S.busy = false; render(); msg("rp-msg2", "파일을 만들지 못했어요. 빈 양식을 받아 직접 작성해 주세요."); });
      }
      if(a === "submit") submit();
    });
  }

  function open(){ if(!S.me) return; render(); if(isMentor()){ load(); watchMine(); } }
  function start(me){
    if(S.started) return;
    S.started = true; S.me = me;
    try{ if(!firebase.apps.length) return; db = firebase.firestore(); }catch(e){ return; }
    var nav = $("nav-report");
    if(nav){ nav.style.display = isMentor() ? "" : "none"; nav.addEventListener("click", function(){ setTimeout(open, 0); }); }
    var sec = $("page-report");
    if(sec && sec.style.display === "block") open();
  }
  window.DSFMReport = { open: open };
  window.addEventListener("dsfm:login", function(e){ start(e.detail || {}); });
  if(window.DSFM && window.DSFM.me) start(window.DSFM.me);
})();

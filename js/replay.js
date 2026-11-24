/* =====================================================================
   DS-FM/GLM 2학기 성과보고회 (DS-FM REPLAY) 홈 — 로그인하면 첫 화면
   ① 참석 투표 (선착순 100명)  ② 우수멘토 사전투표 (11.24~11.25)
   ③ 럭키드로우 상품보기       ④ 공유공간 들어가기
   데이터 (Firestore)
     poll_votes (pollId = POLL_ID)              : 11/20까지 받은 기존 참여 신청
     attendance_votes/replay1126_{명단ID}       : 새 참석 신청 (kind "replay_rsvp")
     attendance_votes/prevote1126_{명단ID}      : 사전투표 1인 1표 (kind "prevote")
     suggestion_posts kind "final_report"       : 멘토가 제출한 결과보고서
     attendance_votes/live1126_{명단ID}         : 당일 현장투표 1인 1표 (kind "livevote")
     attendance_votes/apply2027_{명단ID}        : 2027 멘토 신청 기록 (연락처·학번은 시트로만 보냄)
     polls/replay_prevote                       : 운영 설정 (후보·발표자·현장투표 열기·멘토 신청 열기·시트 주소)
     QR 바로가기: ?go=live (현장투표) · ?go=apply (2027 멘토 신청)
   ===================================================================== */
(function(){
  "use strict";

  var POLL_ID = "Vypn1dWt0tPgNl5a6N0J";
  var CAP = 100;
  var EVENT_TEXT = "2026. 11. 26.(목) 18:00";
  var PLACE = "차미리사관 136호";
  var VOTE_START = new Date("2026-11-24T00:00:00+09:00").getTime();
  var VOTE_END   = new Date("2026-11-25T23:59:59+09:00").getTime();
  var RSVP_END   = new Date("2026-11-26T23:59:59+09:00").getTime();   /* 참석 신청: 행사 당일까지 */
  function rsvpClosed(){ return now() > RSVP_END; }
  var AWARDS = [ { name: "🥇 대상", gift: "올리브영 10만원권 + 꽃다발" }, { name: "🥈 최우수상", gift: "올리브영 5만원권 + 꽃다발" }, { name: "🥉 우수상", gift: "올리브영 3만원권 + 꽃다발" }, { name: "🙌 최대 참여팀", gift: "스타벅스 10만원권" } ];
  var PRIZES = [ { name: "스타벅스 텀블러 세트", qty: "1명" }, { name: "스타벅스 머그컵 세트", qty: "1명" }, { name: "스타벅스 상품권 1만원권", qty: "2명" }, { name: "아로닉스 비건 핸드크림 세트", qty: "2명" },
                 { name: "송월타올 고리수건 핸드타월 세트", qty: "2명" }, { name: "모나미 DIY 펜키트 12종 세트", qty: "2명" }, { name: "엘쏘캐릭터 수면양말 세트", qty: "10명" }, { name: "컴포즈커피 아메리카노 쿠폰", qty: "10명" } ];
  var PROGRAM = [ ["18:00", "접수 · 웰컴 다과", "커피차에서 음료 1잔 + 간식 2종 → 출석 서명 · 식순지 받기"], ["18:30", "성과보고회 설명", "진행 순서 · 평가 방법 안내"], ["18:40", "2026년도 사업 정리", "공유공간 OPEN → PICNIC DAY → 11월 퀘스트"],
                  ["18:50", "결과보고서 발표 (5인)", "사전투표로 뽑힌 멘토 5명 · 1인 5분"], ["19:20", "현장투표", "식순지 QR로 누구나 1표"], ["19:40", "시상", "대상 · 최우수상 · 우수상 · 최대참여팀"],
                  ["19:50", "럭키드로우", "행운권 추첨 · 경품 11종 40명"], ["20:10", "2027 사업 안내", "내년도 신입생 멘토링 안내 · 멘토 신청"] ];
  var OPT_PRESENT = "발표로 참여할게요 (멘토·팀)", OPT_WATCH = "참관으로 참여할게요", OPT_NO = "참석이 어려워요";

  var S = { me: null, started: false, view: "home", rsvp: null, pollMine: null, attend: 0, loading: false,
            reports: null, myVote: null, busy: false, cfg: {}, liveMine: null, applied: null };
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
    "#page-hub .hb-score{display:flex;gap:6px;margin:12px 0 6px}#page-hub .hb-score div{flex:1;border-radius:12px;padding:10px 6px;text-align:center;background:#f3f6f9;color:#4a4a55;font-size:12.5px;font-weight:700;line-height:1.4}#page-hub .hb-score div b{display:block;font-size:20px;font-weight:900}#page-hub .hb-score .main{flex:1.5;background:#459cad;color:#fff}",
    "#page-hub .hb-ask{background:#fff7d6;border:1.5px solid #f2dd68;border-radius:12px;padding:10px 14px;font-size:14px;font-weight:800;color:#5a4d12;margin:6px 0 4px}",
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
    "#page-hub .hb-lead{font-size:15px;color:#4a3a40;line-height:1.7;margin-top:6px}#page-hub .hb-lead b{color:#7c1f3d}",
    "#page-hub .hb-info{width:100%;border-collapse:separate;border-spacing:0 6px;margin:12px 0 4px;font-size:14px}#page-hub .hb-info th{width:76px;background:#205696;color:#fff;font-weight:800;border-radius:10px 0 0 10px;padding:10px 8px;text-align:center;vertical-align:middle}#page-hub .hb-info td{background:#f4f7fb;border-radius:0 10px 10px 0;padding:9px 14px;color:#2a1e22;line-height:1.55}#page-hub .hb-info td b{color:#1f4f85}#page-hub .hb-info td small{display:block;color:#8a737a;font-size:12.5px}",
    "#page-hub .hb-gets{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0 4px}#page-hub .hb-get{border:2px solid #efe2e6;border-radius:14px;padding:12px 14px;background:#fff}#page-hub .hb-get .ic{font-size:22px}#page-hub .hb-get>b{display:block;font-size:14.5px;color:#4f1226;margin:4px 0 2px}#page-hub .hb-get span{font-size:13px;color:#6b5a60;line-height:1.55}#page-hub .hb-get.star{background:#eef7f1;border-color:#bfe0cb}#page-hub .hb-get span b{color:#4f1226}#page-hub .hb-get.star>b,#page-hub .hb-get.star span b{color:#1e6b4a}",
    "#page-hub .hb-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}#page-hub .hb-chips span{background:#fdf3f5;border:1px solid #f1d9df;color:#7c1f3d;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700}",
    "#page-hub .hb-dl{margin-top:14px;background:#fff7e0;border:2px solid #f3c96b;border-radius:14px;padding:11px 14px;font-size:14px;font-weight:800;color:#4f1226;text-align:center}",
    "#page-hub .hb-wait{margin-top:12px;background:#fdf3f5;border:2px solid #e8b9c5;border-radius:14px;padding:14px 16px;font-size:14px;color:#4a3a40;line-height:1.65}#page-hub .hb-wait h4{margin:0 0 6px;font-size:15.5px;color:#7c1f3d}#page-hub .hb-wait .bt{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}#page-hub .hb-wait button{flex:1;min-width:140px;border:0;border-radius:12px;padding:12px;font:inherit;font-weight:800;font-size:14px;cursor:pointer}#page-hub .hb-wait .y{background:#205696;color:#fff}#page-hub .hb-wait .n{background:#fff;color:#8a737a;border:1.5px solid #e2d3d8}",
    "@media(max-width:640px){#page-hub .hb-gets{grid-template-columns:1fr}#page-hub .hb-info th{width:62px;font-size:13px}}",
    "#page-hub .hb-rep{display:flex;align-items:center;gap:12px;border:1px solid #ecdde1;border-radius:14px;padding:14px 16px;margin-top:10px;background:#fff}",
    "#page-hub .hb-rep.mine{background:#fbf7f8}",
    "#page-hub .hb-rep.voted{border:2px solid #2f7f8f;background:#f1f8f3}",
    "#page-hub .hb-rep .nm{flex:1;min-width:0}",
    "#page-hub .hb-rep .nm b{display:block;font-size:16px;color:#2a1e22}",
    "#page-hub .hb-rep .nm small{color:#8a737a;font-size:12.5px}",
    "#page-hub .hb-rep{flex-wrap:wrap}#page-hub .hb-pv{flex-basis:100%;order:3;display:flex;gap:8px;overflow-x:auto;padding:4px 0 2px;cursor:pointer;position:relative;-webkit-overflow-scrolling:touch}#page-hub .hb-pv img{height:150px;width:auto;border-radius:8px;border:1px solid #e6dce0;background:#f4eef0;flex-shrink:0;box-shadow:0 1px 3px rgba(0,0,0,.06)}#page-hub .hb-pv .more{flex-shrink:0;height:150px;min-width:110px;border-radius:8px;border:1.5px dashed #c9b3bb;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#7c1f3d;background:#fbf7f8;padding:0 12px;text-align:center;line-height:1.5}#page-hub .hb-pv .more small{font-weight:600;color:#8a737a;font-size:11.5px}",
    "@media(max-width:640px){#page-hub .hb-pv img,#page-hub .hb-pv .more{height:118px}}",
    "@media(max-width:640px){#page-hub .hb-cm .snack{flex-wrap:wrap}#page-hub .hb-cm .snack .ph{width:100%}#page-hub .hb-cm .snack .ph img{flex:1;width:auto;min-width:0;height:100px}}",
    "#page-hub .hb-btn{border:0;border-radius:10px;padding:9px 13px;font:inherit;font-weight:800;font-size:13px;cursor:pointer;background:#2f7f8f;color:#fff;white-space:nowrap}",
    "#page-hub .hb-btn.gh{background:#fff;color:#4f1226;border:1.5px solid #d9c3ca}",
    "#page-hub .hb-btn[disabled]{opacity:.45;cursor:default}",
    "#page-hub .hb-tag{font-size:11px;font-weight:800;padding:2px 8px;border-radius:8px;background:#f1e6e9;color:#7c1f3d;margin-left:6px}",
    "#page-hub .hb-prize{display:flex;justify-content:space-between;align-items:center;border:1px solid #f3dcb8;background:#fff8ec;border-radius:12px;padding:12px 16px;margin-top:10px;font-size:15px;font-weight:800;color:#5a3a10}",
    "#page-hub .hb-banner{display:flex;align-items:center;gap:12px;width:100%;border:0;border-radius:16px;padding:16px 20px;margin-bottom:12px;font:inherit;font-size:16px;font-weight:900;color:#fff;background:linear-gradient(100deg,#c5637a,#7c1f3d);cursor:pointer;text-align:left;box-shadow:0 6px 18px rgba(124,31,61,.25);animation:hbPulse 1.6s ease-in-out infinite}#page-hub .hb-banner small{display:block;font-size:12.5px;font-weight:600;opacity:.9}#page-hub .hb-banner .go{margin-left:auto;background:#fff;color:#7c1f3d;border-radius:20px;padding:6px 12px;font-size:13px;white-space:nowrap}",
    "#page-hub .hb-banner.apply{background:linear-gradient(100deg,#205696,#459cad);animation:none}",
    "@keyframes hbPulse{0%,100%{transform:none}50%{transform:scale(1.012)}}",
    "#page-hub .hb-tl{list-style:none;margin:10px 0 4px;padding:0}#page-hub .hb-tl li{display:flex;gap:12px;padding:9px 0;border-bottom:1px dashed #efe2e6;font-size:14px;color:#4a3a40;line-height:1.5}#page-hub .hb-tl li b{color:#4f1226}#page-hub .hb-tl .tm{flex:none;width:48px;font-weight:900;color:#7c1f3d}#page-hub .hb-tl small{display:block;color:#8a737a;font-size:12.5px}",
    "#page-hub .hb-menu{background:#faf6f7;border-radius:12px;padding:12px 14px;font-size:13.5px;color:#4a3a40;line-height:1.7;margin-top:8px}#page-hub .hb-menu b{color:#4f1226}",
    "#page-hub .hb-form label{display:block;font-size:13.5px;font-weight:800;color:#4f1226;margin:12px 0 5px}#page-hub .hb-form input,#page-hub .hb-form textarea{width:100%;box-sizing:border-box;border:1.5px solid #e8d9de;border-radius:10px;padding:11px 12px;font:inherit;font-size:14.5px;background:#fff}#page-hub .hb-form textarea{min-height:96px;resize:vertical}",
    "#page-hub .hb-cm{background:#f0efdc;border:2px dashed #a3528f;border-radius:16px;overflow:hidden;color:#a3528f;text-align:center;margin-top:10px}",
    "#page-hub .hb-cm .top{padding:22px 12px;background-color:#f0efdc;background-image:conic-gradient(from 45deg,#a3528f 25%,transparent 0 50%,#a3528f 0 75%,transparent 0);background-size:56px 56px}",
    "#page-hub .hb-cm .oval{display:inline-block;background:#f0efdc;border:2px dashed #a3528f;border-radius:50%;padding:16px 34px 14px}#page-hub .hb-cm .oval small{display:block;font-size:11px;font-weight:800;letter-spacing:.5px}#page-hub .hb-cm .oval b{display:block;font:italic 900 30px/1.1 Georgia,'Times New Roman',serif;color:#a3528f;transform:rotate(-6deg);margin-top:4px}",
    "#page-hub .hb-cm .cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:6px 10px;padding:18px 14px 6px}#page-hub .hb-cm h4{font-size:18px;font-weight:900;margin:6px 0 6px}#page-hub .hb-cm p{margin:0;font-size:14.5px;line-height:1.8;color:#8f4a7e}",
    "#page-hub .hb-cm .snack{display:flex;align-items:center;gap:14px;margin:8px 14px 14px;padding:12px;background:#fff;border-radius:12px;text-align:left}#page-hub .hb-cm .snack .ph{display:flex;gap:6px;flex-shrink:0}#page-hub .hb-cm .snack img{width:130px;height:84px;object-fit:cover;border-radius:10px;flex:none}#page-hub .hb-cm .snack b{display:block;font-size:15px;color:#a3528f}#page-hub .hb-cm .snack span{font-size:13px;color:#7a6070;line-height:1.5}",
    "#page-hub .hb-cm .ty{background:#a3528f;color:#f0efdc;font:italic 900 20px Georgia,serif;letter-spacing:1px;padding:10px}",
    "#page-hub .hb-more{display:block;margin:14px auto 0;border:1.5px solid #a3528f;background:#f6f3e6;color:#a3528f;border-radius:22px;padding:10px 18px;font:inherit;font-weight:800;font-size:14px;cursor:pointer}",
    "#page-hub .hb-agree{margin-top:16px;border:1.5px solid #e8d9de;border-radius:12px;padding:12px 14px;background:#fcfafb;font-size:13px;color:#4a3a40}#page-hub .hb-agree b{display:block;font-size:14px;color:#4f1226;margin-bottom:8px}#page-hub .hb-agree table{width:100%;border-collapse:collapse}#page-hub .hb-agree th,#page-hub .hb-agree td{border:1px solid #eadde1;padding:6px 8px;text-align:left;vertical-align:top;line-height:1.5}#page-hub .hb-agree th{width:96px;background:#f5eef0;font-weight:800;color:#4f1226}#page-hub .hb-agree p{margin:8px 0 4px;color:#8a737a;font-size:12.5px}",
    "#page-hub .hb-form .hb-agree label.ck{display:flex;gap:8px;align-items:flex-start;margin:8px 0 0;font-size:13.5px;color:#4f1226;cursor:pointer}#page-hub .hb-form .hb-agree label.ck input{width:18px;height:18px;flex:none;margin:1px 0 0}",
    "#page-hub .hb-lineup{display:block;width:100%;height:auto;border-radius:14px;border:1px solid #efe2e6;margin-top:6px}",
    "#page-hub .hb-prize.aw{background:#eef7f9;border-color:#bfe0e7;color:#1f4f5a}",
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
      /* 공지 투표와 성과보고회 홈 응답 중 더 나중에 누른 응답을 기준으로 해요 */
      var at = {}, pollAt = 0;
      r[0].docs.forEach(function(x){ var d = x.data(); if(!d.rosterId) return; m[d.rosterId] = isAttend(d.choice); at[d.rosterId] = Number(d.updatedAt || d.createdAt || 0); if(d.rosterId === S.me.rosterId){ S.pollMine = d.choice; pollAt = at[d.rosterId]; } });
      r[1].docs.forEach(function(x){ var d = x.data(); if(!d.rosterId) return; var u = Number(d.updatedAt || 0);
        if(!(d.rosterId in at) || u >= at[d.rosterId]) m[d.rosterId] = d.choice === "attend";
        if(d.rosterId === S.me.rosterId) S.rsvp = (u >= pollAt) ? d : null; });
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
  function loadThumbs(){
    if(S.thumbs) return Promise.resolve();
    return db.collection("attendance_votes").where("kind", "==", "report_thumb").get().then(function(s){
      var m = {}; s.docs.forEach(function(x){ var d = x.data(); if(!d.parentId || !d.data) return; var t = m[d.parentId] || (m[d.parentId] = { pages: 0, imgs: [] }); t.pages = d.pages || t.pages; t.imgs.push({ i: d.idx || 0, src: d.data }); });
      Object.keys(m).forEach(function(k){ m[k].imgs.sort(function(a, b){ return a.i - b.i; }); });
      S.thumbs = m;
    }).catch(function(){ S.thumbs = {}; });
  }
  function previewHtml(x){
    var t = S.thumbs && S.thumbs[x.d.fileId || x.id]; if(!t || !t.imgs.length) return "";
    var mb = x.d.fileChunks ? Math.max(1, Math.round(x.d.fileChunks * 0.52)) : 0;
    return '<div class="hb-pv" data-view="' + esc(x.id) + '" title="눌러서 전체 보고서 보기">' + t.imgs.map(function(im){ return '<img src="' + im.src + '" alt="' + esc(teamTitle(x.d)) + ' ' + im.i + '쪽" loading="lazy">'; }).join("") +
      '<span class="more">전체 보기 →<small>총 ' + (t.pages || "") + '쪽' + (mb ? " · 약 " + mb + "MB" : "") + '</small></span></div>';
  }
  function loadMyVote(){
    return voteRef().get().then(function(s){ S.myVote = s.exists ? s.data() : null; }).catch(function(){ S.myVote = null; });
  }
  function teamTitle(d){
    if(d.title) return d.title;
    var f = String(d.fileName || "").replace(/\.[^.]+$/, "").split("_")[0];
    return f && f !== "팀이름" && f !== "팀번호" ? f : (d.teamName || "팀");
  }

  function coffeeMenu(){
    var g = function(t, items){ return '<div><h4>' + t + '</h4><p>' + items.join("<br>") + '</p></div>'; };
    return '<div class="hb-cm"><div class="top"><span class="oval"><small>ME,STAR FOOD TRUCK</small><b>Choice Package</b></span></div>' +
      '<div class="cols">' + g("커피 (COFFEE)", ["아메리카노", "헤이즐넛 아메리카노", "바닐라 아메리카노"]) + g("에이드 (ADE)", ["자몽 에이드", "망고 에이드", "청포도 에이드"]) + g("음료 &amp; 차 (TEA)", ["복숭아 아이스티", "아.샷.추", "유자차"]) + '</div>' +
      '<div class="snack"><span class="ph"><img src="assets/coffee_snack.webp" alt="소떡소떡" loading="lazy"><img src="assets/coffee_churros.webp" alt="츄러스" loading="lazy"></span><div><b>+ 간식 2종</b><span>소떡소떡 1개<br>미니츄러스 약 3개<br>받아서 가지고 입장해요</span></div></div>' +
      '<div class="ty">✦ THANK YOU ✦</div></div>';
  }
  /* ---------- 화면 ---------- */
  function ensure(){
    var sec = $("page-hub"); if(!sec) return null;
    if(!$("hb-style")){ var st = document.createElement("style"); st.id = "hb-style"; st.textContent = css; document.head.appendChild(st); }
    if(!$("hb-body")){ var b = document.createElement("div"); b.id = "hb-body"; sec.appendChild(b); wire(b); }
    return $("hb-body");
  }
  function head(){
    return '<div class="hb-head"><small>덕성여대 신입생 멘토링(DS-FM/GLM)</small><b>2학기 멘토링 성과보고회<span>DS-FM REPLAY</span></b><p>📅 ' + EVENT_TEXT + ' (본 행사 18:30)<span class="dt"> · </span><br class="mb">📍 ' + PLACE + '</p></div>';
  }
  function render(){
    var el = ensure(); if(!el || !S.me) return;
    var v = S.view, h = "";
    if(v === "home"){
      var vs = voteState(), full = S.attend >= CAP;
      var cf = S.cfg || {};
      h = head() +
        (cf.liveOpen ? '<button type="button" class="hb-banner" data-hb="live">🗳️<span>지금 현장투표 중이에요!<small>발표를 들은 멘토 5명 중 1명에게 투표해 주세요</small></span><span class="go">투표하기 →</span></button>' : '') +
        (cf.applyOpen ? '<button type="button" class="hb-banner apply" data-hb="apply">🙋<span>2027학년도 멘토 신청<small>내년 신입생의 선배 멘토가 되어 주세요</small></span><span class="go">신청하기 →</span></button>' : '') +
        '<div class="hb-intro">11. 26.(목) <b>성과보고회</b>에 오실 분은 <b>참석 투표</b>,<br class="mb"> 11. 24.~25.에는 <b>우수멘토 사전투표</b>에 참여해 주세요.<br>기존 메뉴는 <b>공유공간 들어가기</b>에 있어요.</div>' + '<div class="hb-grid">' +
        '<button type="button" class="hb-tile t1" data-hb="rsvp">' + IC.vote + '<b>성과보고회<br>참석 투표</b><span class="sub">멘토·멘티 누구나<span class="dt"> · </span><br class="mb">선착순 ' + CAP + '명</span><span class="pill">' + (rsvpClosed() ? "신청 마감" : full ? "선착순 마감" : S.attend + " / " + CAP + "명 · ~11.26(목)") + '</span></button>' +
        '<button type="button" class="hb-tile t2" data-hb="vote">' + IC.ballot + '<b>우수멘토<br>사전투표</b><span class="sub">최종 점수의 50%!<br class="mb"> 많이 참여해 주세요</span><span class="pill">' + (vs === "open" ? "투표 중 · ~11.25(수)" : vs === "before" ? "11.24(화)~25(수)" : "사전투표 마감") + '</span></button>' +
        '<button type="button" class="hb-tile t3" data-hb="lucky">' + IC.gift + '<b>성과보고회<br>럭키드로우 상품보기</b><span class="sub">식순지 행운권<span class="dt"> → </span><br class="mb">시상 후 추첨</span><span class="pill">경품 11종 40명</span></button>' +
        '<button type="button" class="hb-tile t4" data-hb="space">' + IC.door + '<b>공유공간<br>들어가기</b><span class="sub">공지·게시판·<br class="mb">결과보고서·미션</span><span class="pill">기존 기능</span></button>' +
        '</div><button type="button" class="hb-more" data-hb="menu">☕ 18:00 커피차 메뉴 보기</button>';
    } else if(v === "rsvp"){
      var mine = myOption(), att = isAttend(mine), closed = rsvpClosed(), full2 = S.attend >= CAP && !att, pct = Math.min(100, Math.round(S.attend / CAP * 100));
      var opt = function(o, attendOpt){ return '<button type="button" class="hb-opt' + (mine === o ? " on" : "") + '" data-opt="' + esc(o) + '"' + ((attendOpt && full2) || closed || S.busy ? " disabled" : "") + '>' + (mine === o ? "✓ " : "") + esc(o) + '</button>'; };
      h = '<button type="button" class="hb-back" data-hb="home">← 처음 화면으로</button>' + head() +
        '<div class="hb-card"><h3>성과보고회 참석 투표</h3>' +
        '<div class="hb-lead">한 학기 동안 함께한 멘토링, <b>마지막 날을 같이 마무리해요!</b><br>커피차 음료·간식, 경품 11종 40명 럭키드로우, 우수멘토 시상까지 준비했어요.</div>' +
        '<table class="hb-info">' +
          '<tr><th>일시</th><td><b>2026. 11. 26.(목) 18:00 ~ 20:30</b><small>18:00 커피차·접수 → 18:30 본 행사 시작</small></td></tr>' +
          '<tr><th>장소</th><td><b>' + PLACE + '</b><small>입구에서 식순지(행운권 번호)를 받아 입장해요</small></td></tr>' +
          '<tr><th>대상</th><td>DS-FM 멘토·멘티 <b>누구나</b><small>자리 준비를 위해 선착순 ' + CAP + '명까지 받아요</small></td></tr>' +
          '<tr><th>신청</th><td><b>11. 26.(목) 행사 당일까지</b> 이 화면에서 응답<small>11/20까지 참여 신청 투표에 응답한 분은 이미 포함돼 있어요</small></td></tr>' +
        '</table>' +
        '<div class="hb-sec">참석하면 받아요</div><div class="hb-gets">' +
          '<div class="hb-get"><div class="ic">☕</div><b>커피차 웰컴 다과</b><span>18:00부터 1인 <b>음료 1잔 + 간식 2종</b><br>(소떡소떡 1개 · 미니츄러스 약 3개)<br>받아서 가지고 입장해요</span></div>' +
          '<div class="hb-get"><div class="ic">🎁</div><b>럭키드로우 11종 · 40명</b><span>식순지 행운권으로 추첨해요.<br>시상이 끝난 뒤 <b>현장에 있어야</b> 받을 수 있어요</span></div>' +
          '<div class="hb-get"><div class="ic">🗳️</div><b>현장투표 1표</b><span>우수멘토 5명의 발표를 듣고<br>대상·최우수상·우수상을 직접 뽑아요</span></div>' +
          '<div class="hb-get star"><div class="ic">🏆</div><b>최대 참여팀 · 스타벅스 10만원권</b><span>가장 많이 참석한 팀의 <b>멘토</b>에게 드려요.<br>팀원들과 함께 와 주세요!</span></div>' +
        '</div>' +
        '<button type="button" class="hb-more" style="margin-top:10px" data-hb="lucky">🎁 경품 11종 40명 라인업 보기</button>' +
        '<div class="hb-sec">응답 방법</div><div class="hb-d">· <b>발표로 참여</b>: 사전투표로 선발된 멘토와 그 팀원<br>· <b>참관으로 참여</b>: 발표하지 않고 참석하는 멘토·멘티 (대부분 여기예요!)<br>· 응답은 <b>11. 26.(목) 당일까지</b> 언제든 바꿀 수 있어요.</div>' +
        '<div class="hb-dl">' + (closed ? '참석 신청이 마감됐어요' : '📌 신청 마감 · 11. 26.(목) 당일까지 · 선착순 ' + CAP + '명') + '</div>' +
        '<div class="hb-bar"><i style="width:' + pct + '%"></i></div><div class="hb-d"><b style="color:#205696">' + S.attend + '명</b> / ' + CAP + '명 신청' + (S.attend >= CAP ? ' · 선착순 마감' : '') + '</div>' +
        '<div class="hb-opts">' + opt(OPT_PRESENT, true) + opt(OPT_WATCH, true) + opt(OPT_NO, false) + '</div>' +
        (S.noAsk && !closed ? '<div class="hb-wait"><h4>잠깐! 한 번만 더 생각해 주세요 🙏</h4>· 18:00 커피차에서 <b>음료 1잔 + 간식 2종</b>을 받아요.<br>· 경품 <b>11종 40명</b> 럭키드로우 — 참석자만 추첨해요.<br>· 우리 팀이 많이 오면 <b>멘토님이 스타벅스 10만원권</b>을 받아요.<br>· 응답은 11. 26.(목) 당일까지 언제든 바꿀 수 있어요.' +
          '<div class="bt"><button type="button" class="y" data-opt="' + esc(OPT_WATCH) + '">참관으로 참여할게요</button><button type="button" class="n" data-noyes="1">그래도 참석이 어려워요</button></div></div>' : '') +
        (full2 ? '<div class="hb-msg">선착순 ' + CAP + '명이 모두 차서 참석 신청이 마감됐어요.</div>' : '') +
        (mine ? '<div class="hb-mine">내 응답: ' + esc(mine) + (att ? ' · 신청 완료' : '') + '</div>' + (closed ? '' : '<div class="hb-d" style="margin-top:4px">다른 항목을 누르면 응답이 바뀌어요.</div>') : '<div class="hb-d" style="margin-top:12px">' + (closed ? '응답 기간이 끝났어요.' : '아직 응답하지 않았어요.') + '</div>') +
        '<div class="hb-msg" id="hb-msg"></div>' +
        '<div class="hb-sec" style="margin-top:22px">☕ 커피차 메뉴 (1인 음료 1잔 + 간식 2종)</div>' + coffeeMenu() +
        '<div class="hb-sec">📋 당일 진행 순서</div><ul class="hb-tl">' + PROGRAM.map(function(r){ return '<li><span class="tm">' + r[0] + '</span><span><b>' + esc(r[1]) + '</b><small>' + esc(r[2]) + '</small></span></li>'; }).join("") + '</ul>' +
        '</div>';
    } else if(v === "vote"){
      var vs2 = voteState(), list = S.reports, myVoteId = S.myVote && S.myVote.reportId;
      h = '<button type="button" class="hb-back" data-hb="home">← 처음 화면으로</button>' + head() +
        '<div class="hb-card"><h3>우수멘토 사전투표</h3><div class="hb-d">기간 <b>11. 24.(화) 0시 ~ 11. 25.(수) 23:59</b> · 멘토들이 제출한 <b>2026년 결과보고서</b>를 읽어 보고, 가장 인상 깊었던 팀에 투표해 주세요.</div>' +
        '<div class="hb-sec">최종 점수는 이렇게 매겨요</div><div class="hb-score"><div class="main">사전투표<b>50%</b></div><div>현장투표<b>20%</b></div><div>전문가평가<b>30%</b></div></div>' +
        '<div class="hb-ask">📣 사전투표 점수 비중이 가장 커요! 여러분의 한 표가 우수멘토를 결정하니 많이 참여해 주세요.</div>' +
        '<div class="hb-sec">우수멘토는 이렇게 뽑아요</div><ul class="hb-steps"><li><b>사전투표 (11. 24.~25.)</b> — 후보 멘토 <b>8명</b>의 결과보고서를 보고 투표해, 발표할 <b>5명</b>을 뽑아요.</li><li><b>현장 발표 (11. 26. 18:50)</b> — 선발된 <b>5명</b>이 1인 5분씩 발표하고, 평가위원이 현장에서 채점해요 (전문가평가).</li><li><b>현장투표 (19:20)</b> — 참석자 누구나 식순지 QR로 <b>1표</b>를 투표해요.</li><li><b>시상 (19:40)</b> — 앞서 받은 <b>사전투표 점수</b>에 현장투표·전문가평가 점수를 더해 <b>대상 · 최우수상 · 우수상</b>을 드려요.</li></ul>' +
        '<div class="hb-sec">투표 방법</div><div class="hb-d">① 아래 목록에서 <b>📄 보고서 보기</b>로 결과보고서를 읽어요.<br>② 가장 좋았던 팀의 <b>이 팀에 투표</b>를 눌러요. (1인 1표)<br>③ <b>우리 팀</b>에는 투표할 수 없고, 마감 전까지 다른 팀으로 바꿀 수 있어요.<br>' +
        (vs2 === "before" ? '<b style="color:#7c1f3d">투표는 11. 24.(화) 0시부터 할 수 있어요.</b> 지금은 제출된 보고서를 미리 볼 수 있어요.' : vs2 === "after" ? '<b style="color:#7c1f3d">사전투표가 마감됐어요.</b>' : '<b style="color:#2f7f8f">지금 투표할 수 있어요!</b>') +
        '<br><span style="font-size:12.5px">※ 아래에 <b>후보 멘토 8명</b>의 결과보고서가 보여요. 보고서는 투표를 위해 공유공간 참여자에게 공개돼요.</span></div>' +
        (myVoteId ? '<div class="hb-mine">✓ 내 투표: ' + esc(S.myVote.reportTeam || "") + '</div>' : '') +
        '<div class="hb-msg" id="hb-msg"></div>' +
        (list === null ? '<div class="hb-d" style="margin-top:12px">불러오는 중이에요…</div>' : !list.length ? '<div class="hb-d" style="margin-top:12px">후보 결과보고서를 준비하고 있어요. 11. 24.(화)까지 올라와요.</div>' :
          list.map(function(x){
            var d = x.d, isMine = d.team && d.team === S.me.team, voted = myVoteId === x.id;
            return '<div class="hb-rep' + (isMine ? " mine" : "") + (voted ? " voted" : "") + '"><div class="nm"><b>' + esc(teamTitle(d)) + (isMine ? '<span class="hb-tag">우리 팀</span>' : '') + (voted ? '<span class="hb-tag" style="background:#e3f1e8;color:#2f7a4b">내 투표</span>' : '') + '</b><small>' + esc([d.college, d.team, "멘토 " + (d.author || "")].filter(Boolean).join(" · ")) + '</small></div>' + previewHtml(x) +
              '<button type="button" class="hb-btn gh" data-view="' + esc(x.id) + '">📄 보고서 보기</button>' +
              '<button type="button" class="hb-btn" data-vote="' + esc(x.id) + '"' + (isMine || vs2 !== "open" || voted || S.busy ? " disabled" : "") + '>' + (voted ? "투표함" : "이 팀에 투표") + '</button></div>';
          }).join("")) + '</div>';
    } else if(v === "lucky"){
      h = '<button type="button" class="hb-back" data-hb="home">← 처음 화면으로</button>' + head() +
        '<div class="hb-card"><h3>🎁 성과보고회 럭키드로우</h3><div class="hb-d">성과보고회 <b>참석자 전원</b>이 행운권 추첨에 참여해요. 선착순 100명 중 <b>40명</b>(경품추첨 30명 + 추가 경품 10명)에게 <b>11종</b>의 경품을 드려요.</div>' +
        '<div class="hb-sec">🎁 럭키드로우 경품 라인업 <span style="font-size:12px;font-weight:600;color:#8a737a">(눌러서 크게 보기)</span></div><a href="assets/lucky_lineup.webp" target="_blank" rel="noopener"><img class="hb-lineup" src="assets/lucky_lineup.webp" alt="럭키드로우 경품 라인업 총 40명: 스타벅스 텀블러 세트 1명, 스타벅스 머그컵 세트 1명, 스타벅스 1만원 상품권 2명, 아로닉스 비건 핸드크림 세트 2명, 송월타올 고리수건 핸드타월 세트 2명, 모나미 DIY 펜키트 12종 세트 2명, 엘쏘캐릭터 수면양말 세트 10명, 컴포즈커피 아메리카노 쿠폰 10명, 추가 경품 볼펜 꾸미기 세트 3명, 1구 키캡 세트 3명, 알파벳 키링 세트 4명"></a>' +
        '<div class="hb-sec">추첨은 이렇게 진행돼요</div><ul class="hb-steps"><li><b>접수 (18:00)</b> — 식순지를 받을 때 운영진이 <b>행운권 번호</b>를 적어 드려요.</li><li><b>추첨함에 넣기</b> — 식순지 오른쪽 아래 행운권을 점선대로 잘라 추첨함에 넣고, 같은 번호가 적힌 식순지는 <b>본인이 보관</b>해요.</li><li><b>추첨 (19:50)</b> — 시상이 끝난 뒤 번호를 뽑아 상품을 바로 드려요. <b>현장에 있어야</b> 받을 수 있어요.</li></ul>' +
        '<div class="hb-sec">🏆 시상 상품</div>' +
        AWARDS.map(function(p){ return '<div class="hb-prize aw"><span>' + esc(p.name) + '</span><span>' + esc(p.gift) + '</span></div>'; }).join("") +
        
        '<div style="margin-top:16px"><button type="button" class="hb-btn" style="background:#205696;padding:12px 18px;font-size:14.5px" data-hb="rsvp">참석 투표하러 가기 →</button></div></div>';
    } else if(v === "menu"){
      h = '<button type="button" class="hb-back" data-hb="home">← 처음 화면으로</button>' + head() +
        '<div class="hb-card"><h3>☕ 웰컴 커피차</h3><div class="hb-d"><b>11. 26.(목) 18:00</b>부터 행사장(차미리사관 136호) 밖 커피차에서 <b>1인 음료 1잔 + 간식 2종</b>을 받아요. 받은 음료와 간식은 <b>가지고 입장</b>하시면 돼요.</div>' + coffeeMenu() + '</div>';
    } else if(v === "live"){
      var cfl = S.cfg || {}, pres = cfl.presenters || [], lm = S.liveMine && S.liveMine.presenterId;
      h = '<button type="button" class="hb-back" data-hb="home">← 처음 화면으로</button>' + head() +
        '<div class="hb-card"><h3>🗳️ 현장투표</h3><div class="hb-d">발표를 들은 <b>멘토 5명</b> 중 가장 좋았던 1명에게 투표해 주세요. 참석자 <b>누구나 1표</b>이고, 투표가 열려 있는 동안 바꿀 수 있어요. 현장투표는 최종 점수의 <b>20%</b>예요.</div>' +
        (cfl.liveOpen ? '<div class="hb-ask" style="background:#e9f5f7;border-color:#459cad;color:#1f4f5a">지금 투표할 수 있어요!</div>' : '<div class="hb-ask">현장투표는 성과보고회 당일 <b>19:20</b>에 열려요. 진행자 안내에 맞춰 다시 들어와 주세요.</div>') +
        (lm ? '<div class="hb-mine">✓ 내 투표: ' + esc(S.liveMine.team || "") + ' (멘토 ' + esc(S.liveMine.mentor || "") + ')</div>' : '') +
        '<div class="hb-msg" id="hb-msg"></div>' +
        (!pres.length ? '<div class="hb-d" style="margin-top:12px">발표자 5명은 사전투표가 끝난 뒤 안내돼요.</div>' :
          pres.map(function(x, i){
            var mineT = x.teamKey && x.teamKey === S.me.team, on = lm === x.id;
            return '<div class="hb-rep' + (mineT ? " mine" : "") + (on ? " voted" : "") + '"><div class="nm"><b>' + (i + 1) + '. ' + esc(x.team || "") + (mineT ? '<span class="hb-tag">우리 팀</span>' : '') + (on ? '<span class="hb-tag" style="background:#e3f1e8;color:#2f7a4b">내 투표</span>' : '') + '</b><small>' + esc([x.college, "멘토 " + (x.mentor || "")].filter(Boolean).join(" · ")) + '</small></div>' +
              '<button type="button" class="hb-btn" data-live="' + esc(x.id) + '"' + (mineT || !cfl.liveOpen || on || S.busy ? " disabled" : "") + '>' + (on ? "투표함" : "이 멘토에게 투표") + '</button></div>';
          }).join("")) +
        '<div class="hb-d" style="margin-top:12px;font-size:12.5px">※ 우리 팀에는 투표할 수 없어요.</div></div>';
    } else if(v === "apply"){
      var cfa = S.cfg || {}, ap = S.applied;
      h = '<button type="button" class="hb-back" data-hb="home">← 처음 화면으로</button>' + head() +
        '<div class="hb-card"><h3>🙋 2027학년도 멘토 신청</h3><div class="hb-d">2027학년도 신입생 멘토링(DS-FM/GLM)에서 <b>선배 멘토</b>로 함께할 분을 모집해요. 아래 내용을 적어 신청해 주세요.</div>' +
        (!cfa.applyOpen ? '<div class="hb-ask">멘토 신청은 아직 열리지 않았어요.</div>' : !cfa.sheetUrl ? '<div class="hb-ask">신청 접수를 준비하고 있어요. 잠시 후 다시 들어와 주세요.</div>' :
          (ap ? '<div class="hb-mine">✓ ' + esc(S.me.name || "") + '님, 신청이 접수됐어요. 다시 제출하면 마지막 내용으로 바뀌어요.</div>' : '') +
          '<div class="hb-form"><label>이름</label><input value="' + esc(S.me.name || "") + '" disabled>' +
          '<label>학번</label><input id="ap-sid" inputmode="numeric" placeholder="예: 20260000">' +
          '<label>학과(전공)</label><input id="ap-major" placeholder="예: 시각디자인전공">' +
          '<label>연락처</label><input id="ap-phone" inputmode="tel" placeholder="010-0000-0000">' +
          '<label>지원 동기 (선택)</label><textarea id="ap-why" placeholder="멘토가 되고 싶은 이유를 자유롭게 적어 주세요"></textarea>' +
          '<div class="hb-agree"><b>개인정보 수집·이용 동의 (필수)</b><table>' +
          '<tr><th>수집 항목</th><td>이름, 학번, 학과(전공), 연락처, 소속 단과대·팀, 지원 동기</td></tr>' +
          '<tr><th>수집·이용 목적</th><td>2027학년도 신입생 멘토링(DS-FM/GLM) 멘토 선발·연락 및 운영 안내</td></tr>' +
          '<tr><th>보유·이용 기간</th><td>2027학년도 멘토링 사업 종료 시까지 보관 후 파기</td></tr>' +
          '<tr><th>수집·운영</th><td>덕성여자대학교 · 그릿마인드랩(운영 위탁)</td></tr></table>' +
          '<p>개인정보 수집·이용에 동의하지 않을 수 있으며, 동의하지 않으면 멘토 신청을 할 수 없어요.</p>' +
          '<label class="ck"><input type="checkbox" id="ap-agree"> 위 내용을 확인했고, 개인정보 수집·이용에 동의합니다.</label></div>' +
          '<div style="margin-top:14px"><button type="button" class="hb-btn" style="background:#205696;padding:12px 22px;font-size:15px" data-apply="1"' + (S.busy ? " disabled" : "") + '>신청하기</button></div>' +
          '<div class="hb-d" style="margin-top:8px;font-size:12.5px">※ 학번·연락처는 운영진만 볼 수 있는 신청 명단(스프레드시트)으로만 전달돼요.</div></div>') +
        '<div class="hb-msg" id="hb-msg"></div></div>';
    }
    el.innerHTML = h;
  }
  function msg(t){ var m = $("hb-msg"); if(m) m.textContent = t || ""; }

  /* ---------- 동작 ---------- */
  function saveRsvp(opt){
    if(!db || S.busy) return;
    if(rsvpClosed()){ msg("참석 신청이 마감됐어요."); return; }
    var attend = isAttend(opt);
    S.busy = true; render(); msg("저장하는 중이에요…");
    loadCount().then(function(){
      if(attend && !isAttend(myOption()) && S.attend >= CAP) throw new Error("full");
      var me = S.me, t = now();
      return rsvpRef().set({ choice: attend ? "attend" : "absent", kind: "replay_rsvp", option: opt, pollId: POLL_ID,
        name: me.name || "", rosterId: me.rosterId || "", role: me.role || "", college: me.college || "", team: me.team || "", teamName: me.teamName || "",
        firstAt: (S.rsvp && S.rsvp.firstAt) || t, updatedAt: t });
    }).then(function(){
      /* 공지사항 참석 신청 투표(poll_votes)에도 같은 응답을 기록 — 관리자 '투표' 탭 집계와 맞추기 */
      var me = S.me, t = now(), pv = { pollId: POLL_ID, rosterId: me.rosterId || "", name: me.name || "", college: me.college || "", team: me.team || "", teamKey: me.team || "", role: me.role || "", choice: opt, reason: "", updatedAt: t };
      if(!S.pollMine) pv.createdAt = t;
      if(!me.rosterId) return;
      return db.collection("poll_votes").doc(POLL_ID + "_" + me.rosterId).set(pv, { merge: true }).then(function(){ S.pollMine = opt; }).catch(function(){});
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
  function liveRef(){ return db.collection("attendance_votes").doc("live1126_" + S.me.rosterId); }
  function castLive(id){
    var cf = S.cfg || {}; if(!db || S.busy || !cf.liveOpen) return;
    var x = (cf.presenters || []).filter(function(p){ return p.id === id; })[0]; if(!x) return;
    if(x.teamKey && x.teamKey === S.me.team){ msg("우리 팀에는 투표할 수 없어요."); return; }
    if(!confirm("'" + (x.team || "") + "' (멘토 " + (x.mentor || "") + ")에게 투표할까요?")) return;
    S.busy = true; render(); var me = S.me;
    liveRef().set({ choice: "attend", kind: "livevote", presenterId: x.id, team: x.team || "", mentor: x.mentor || "", presenterTeamKey: x.teamKey || "",
      name: me.name || "", rosterId: me.rosterId || "", role: me.role || "", college: me.college || "", voterTeam: me.team || "", updatedAt: now() })
      .then(function(){ return liveRef().get(); }).then(function(s){ S.liveMine = s.exists ? s.data() : null; S.busy = false; render(); msg("투표했어요! 고마워요."); })
      .catch(function(){ S.busy = false; render(); msg("투표하지 못했어요. 잠시 후 다시 시도해 주세요."); });
  }
  function applyRef(){ return db.collection("attendance_votes").doc("apply2027_" + S.me.rosterId); }
  function submitApply(){
    var cf = S.cfg || {}; if(!db || S.busy || !cf.applyOpen || !cf.sheetUrl) return;
    var g = function(id){ var e = $(id); return e ? String(e.value || "").trim() : ""; };
    var sid = g("ap-sid"), major = g("ap-major"), phone = g("ap-phone"), why = g("ap-why");
    if(!/^\d{6,10}$/.test(sid)){ msg("학번을 숫자로 적어 주세요."); return; }
    if(!major){ msg("학과(전공)를 적어 주세요."); return; }
    if(!/^[0-9\-\s]{9,14}$/.test(phone)){ msg("연락처를 확인해 주세요. (예: 010-0000-0000)"); return; }
    if(why.length > 1000){ msg("지원 동기는 1000자 이내로 적어 주세요."); return; }
    var ag = $("ap-agree"); if(!ag || !ag.checked){ msg("개인정보 수집·이용에 동의해야 신청할 수 있어요."); return; }
    var me = S.me, t = now();
    var full = { type: "apply2027", name: me.name || "", college: me.college || "", team: me.teamName || "", role: me.role || "", rosterId: me.rosterId || "", studentId: sid, major: major, phone: phone, why: why, consent: "동의", at: new Date(t).toISOString() };
    S.busy = true; render(); msg("신청하는 중이에요…");
    var send = cf.sheetUrl ? fetch(cf.sheetUrl, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(full) }).catch(function(){ return null; }) : Promise.resolve(null);
    send.then(function(){
      return applyRef().set({ choice: "attend", kind: "apply2027", name: me.name || "", rosterId: me.rosterId || "", role: me.role || "", college: me.college || "", team: me.teamName || "", major: major, consent: true, consentAt: t, sentToSheet: !!cf.sheetUrl, appliedAt: (S.applied && S.applied.appliedAt) || t, updatedAt: t });
    }).then(function(){ return applyRef().get(); }).then(function(s){ S.applied = s.exists ? s.data() : null; S.busy = false; render(); msg("신청이 접수됐어요. 고마워요!"); })
      .catch(function(){ S.busy = false; render(); msg("신청하지 못했어요. 잠시 후 다시 시도해 주세요."); });
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
    if(v === "vote"){ Promise.all([loadReports(), loadMyVote()]).then(render).then(function(){ return loadThumbs(); }).then(render); }
    if(v === "live" && db) liveRef().get().then(function(s){ S.liveMine = s.exists ? s.data() : null; render(); }).catch(function(){});
    if(v === "apply" && db) applyRef().get().then(function(s){ S.applied = s.exists ? s.data() : null; render(); }).catch(function(){});
  }
  function wire(el){
    el.addEventListener("click", function(e){
      var t = e.target.closest("[data-hb]");
      if(t){
        var a = t.getAttribute("data-hb");
        if(a === "space"){ if(window.DSFM && window.DSFM.goToPage) window.DSFM.goToPage("announce"); return; }
        go(a); return;
      }
      if((t = e.target.closest("[data-noyes]"))){ S.noAsk = false; saveRsvp(OPT_NO); return; }
      if((t = e.target.closest("[data-opt]")) && !t.disabled){
        var o = t.getAttribute("data-opt");
        if(o === OPT_NO && myOption() !== OPT_NO){ S.noAsk = true; render(); var wb = el.querySelector(".hb-wait"); if(wb && wb.scrollIntoView) wb.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
        S.noAsk = false; saveRsvp(o); return;
      }
      if((t = e.target.closest("[data-vote]")) && !t.disabled){ castVote(t.getAttribute("data-vote")); return; }
      if((t = e.target.closest("[data-view]")) && !t.disabled){ var vb = t.classList.contains("hb-pv") ? (t.parentNode.querySelector("button[data-view]") || t) : t; if(!vb.disabled) viewReport(t.getAttribute("data-view"), vb); return; }
      if((t = e.target.closest("[data-live]")) && !t.disabled){ castLive(t.getAttribute("data-live")); return; }
      if((t = e.target.closest("[data-apply]")) && !t.disabled){ submitApply(); return; }
    });
  }

  function open(){ if(!S.me) return; go(S.view === "home" ? "home" : S.view); }
  function start(me){
    if(S.started) return;
    S.started = true; S.me = me;
    try{ if(firebase.apps.length) db = firebase.firestore(); }catch(e){}
    var qrGo = (location.search.match(/[?&]go=(live|apply|vote|lucky|rsvp|menu)\b/) || [])[1] || "";
    if(qrGo) S.view = qrGo;
    render();
    loadCount().then(render);
    /* 운영 설정(현장투표 열기·멘토 신청 열기·발표자)은 실시간으로 받아요 */
    if(db){ try{ db.collection("polls").doc("replay_prevote").onSnapshot(function(s){ S.cfg = s.exists ? (s.data() || {}) : {}; render(); }, function(){}); }catch(e){} }
    /* 로그인하면 첫 화면은 성과보고회 홈 (QR로 들어온 피크닉 등은 그대로) */
    setTimeout(function(){
      if(window.__dsfmPicnicFromQr) return;
      if(window.DSFM && window.DSFM.goToPage) window.DSFM.goToPage("hub");
      if(qrGo) go(qrGo);
    }, 0);
  }
  window.DSFMReplay = { open: open };
  window.addEventListener("dsfm:login", function(e){ start(e.detail || {}); });
  if(window.DSFM && window.DSFM.me) start(window.DSFM.me);
})();

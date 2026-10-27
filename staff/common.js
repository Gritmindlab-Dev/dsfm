/* =====================================================================
   PICNIC DAY 스태프 페이지 공통 (로그인 · 상수 · 도우미)
   - 운영진 페이지(admin/)와 같은 운영진 계정으로 로그인해요: 이름 + 휴대폰 뒷자리 + 비밀번호
   - 최고·총괄·운영 관리자, 그리고 "행사 스태프" 계정이 들어올 수 있어요
   ===================================================================== */
(function(){
  "use strict";
  var firebaseConfig = {
    apiKey: "AIzaSyDiPlp8TEQhaFJISh6DgRY4UlOx-_cDFBw",
    authDomain: "dsfm-455c1.firebaseapp.com",
    projectId: "dsfm-455c1",
    storageBucket: "dsfm-455c1.firebasestorage.app",
    messagingSenderId: "431929065623",
    appId: "1:431929065623:web:bbd20ab2a8319fe2b569d2"
  };
  var OWNER_UIDS = ["0Amr9PWdKTNxUCeFuwVOFGD3AWo2"];
  var ROLES = ["최고","총괄","운영","스태프"];

  var P = window.PK = {
    EVENT_START: new Date("2026-10-29T10:00:00+09:00").getTime(),
    EVENT_END: new Date("2026-10-29T16:00:00+09:00").getTime(),
    POINT_KEYS: ["b1","b2","b3","b4","b5"],
    DEFAULT_POINT_NAMES: { b1:"대학본부", b2:"차미리사기념관", b3:"학생회관", b4:"자연관", b5:"예술관" },
    BOOTHS: [
      { key:"tarot",   booth:1, name:"진로타로상담",            total:0 },
      { key:"color",   booth:2, name:"퍼스널컬러 진단 + 화장법 상담", total:0 },
      { key:"keycap",  booth:3, name:"키캡 꾸미기",             total:80 },
      { key:"pen",     booth:3, name:"볼꾸 (볼펜 꾸미기)",       total:80 },
      { key:"keyring", booth:3, name:"이니셜 키링 만들기",       total:150 }
    ],
    SNACK_TOTAL: 100,
    db: null, user: null, admin: null,
    esc: function(s){
      return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
        return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
      });
    },
    hhmm: function(ts){ if(!ts) return "-"; var d = new Date(ts); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); },
    full: function(ts){ if(!ts) return ""; var d = new Date(ts); return d.getFullYear() + "-" + ("0" + (d.getMonth()+1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2) + " " + ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) + ":" + ("0" + d.getSeconds()).slice(-2); },
    stampCount: function(u){ var s = (u && u.stamps) || {}; return P.POINT_KEYS.filter(function(k){ return !!s[k]; }).length; },
    pointName: function(cfg, k){ return (cfg && cfg.points && cfg.points[k]) || P.DEFAULT_POINT_NAMES[k]; },
    boothTotal: function(cfg, b){ var c = cfg && cfg.booths && cfg.booths[b.key]; return c && typeof c.total === "number" ? c.total : b.total; },
    boothUsed: function(cfg, b){ var c = cfg && cfg.booths && cfg.booths[b.key]; return (c && c.used) || 0; },
    qrOpenNow: function(cfg){
      var mode = (cfg && cfg.qrMode) || "auto";
      if(mode === "on") return true;
      if(mode === "off") return false;
      var n = Date.now(); return n >= P.EVENT_START && n <= P.EVENT_END;
    },
    toast: function(msg, kind){
      var t = document.createElement("div");
      t.className = "st-toast" + (kind ? " " + kind : "");
      t.textContent = msg; document.body.appendChild(t);
      setTimeout(function(){ t.style.opacity = "0"; }, 3000);
      setTimeout(function(){ t.remove(); }, 3500);
    },
    csv: function(filename, rows){
      function cell(v){ v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
      var text = "﻿" + rows.map(function(r){ return r.map(cell).join(","); }).join("\n");
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
      a.download = filename; document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
    },
    roleLabel: function(r){ return r === "최고" ? "최고 관리자" : r === "총괄" ? "총괄 관리자" : r === "운영" ? "운영 관리자" : "행사 스태프"; },
    canSetup: function(){ return P.admin && (P.admin.role === "최고" || P.admin.role === "총괄"); }
  };

  var css = [
    ":root{--wine:#7c1f3d;--wine-deep:#4c1226;--wine-soft:#a8446a;--blush:#f3d9e0;--cream:#fbf5f1;--ink:#2a1e22;--ink-soft:#8a737a;--line:#ecdde1;--good:#3f7a5c;--bad:#b23b3b}",
    "*{box-sizing:border-box}html,body{margin:0}body{background:var(--cream);color:var(--ink);font-family:'Noto Sans KR',system-ui,sans-serif;word-break:keep-all;-webkit-font-smoothing:antialiased}",
    "button,input,select,textarea{font-family:inherit}input,select,textarea{font-size:16px}",
    "#st-login{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:radial-gradient(1000px 600px at 50% -10%,#fdf1f3 0,var(--blush) 62%)}",
    ".st-lc{width:100%;max-width:360px;background:#fff;border-radius:18px;padding:28px 24px;box-shadow:0 20px 50px rgba(42,30,34,.14)}",
    ".st-lc h1{font-size:20px;margin:0 0 4px;color:var(--wine-deep)}.st-lc .sub{font-size:13px;color:var(--ink-soft);margin-bottom:18px}",
    ".st-in{width:100%;border:1.5px solid var(--line);border-radius:10px;padding:12px 13px;margin-bottom:10px;background:var(--cream);outline:0}",
    ".st-in:focus{border-color:var(--wine-soft);background:#fff}",
    ".st-btn{all:unset;box-sizing:border-box;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:11px 16px;border-radius:11px;background:var(--wine-deep);color:#fff;font-weight:700;font-size:14.5px;text-align:center}",
    ".st-btn.block{display:flex;width:100%;padding:14px}.st-btn.ghost{background:#fff;color:var(--wine-deep);border:1.5px solid var(--line)}",
    ".st-btn.good{background:var(--good)}.st-btn.bad{background:var(--bad)}.st-btn.sm{padding:7px 11px;font-size:13px;border-radius:9px}",
    ".st-btn.big{padding:16px 18px;font-size:17px;border-radius:14px}.st-btn[disabled]{opacity:.45;cursor:default}",
    ".st-err{display:none;margin-top:10px;font-size:13px;color:var(--bad);background:#fbe8e8;border-radius:9px;padding:9px 11px}",
    ".st-top{position:sticky;top:0;z-index:30;background:linear-gradient(120deg,var(--wine-deep),var(--wine));color:#fff;padding:12px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}",
    ".st-top .b{font-weight:900;font-size:16px}.st-top .w{font-size:11.5px;opacity:.75}",
    ".st-top a,.st-top button{all:unset;cursor:pointer;font-size:12.5px;font-weight:700;border:1px solid rgba(255,255,255,.45);border-radius:999px;padding:6px 12px;color:#fff}",
    ".st-main{max-width:980px;margin:0 auto;padding:16px 14px 60px}",
    ".st-card{background:#fff;border:1.5px solid var(--line);border-radius:16px;padding:16px;margin-bottom:12px}",
    ".st-card h3{margin:0 0 10px;font-size:16px}",
    ".st-tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;background:var(--blush);color:var(--wine-deep)}",
    ".st-tag.ok{background:#e6f2ec;color:#2f6a4c}.st-tag.gray{background:#eee;color:#777}.st-tag.bad{background:#fbe8e8;color:var(--bad)}.st-tag.gold{background:#fff1cc;color:#6b4a00}",
    ".st-toast{position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:9999;max-width:calc(100vw - 32px);padding:12px 18px;border-radius:12px;background:#2a1e22;color:#fff;font-weight:700;box-shadow:0 10px 30px rgba(0,0,0,.25);transition:opacity .4s}",
    ".st-toast.ok{background:var(--good)}.st-toast.bad{background:var(--bad)}",
    ".st-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}",
    ".st-muted{color:var(--ink-soft);font-size:12.5px}"
  ].join("\n");
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  function adminKey(name, pin){
    var text = "dsfm-admin|" + String(name).replace(/\s+/g, "") + "|" + String(pin).replace(/\D/g, "");
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function(buf){
      return Array.prototype.map.call(new Uint8Array(buf), function(b){ return ("0" + b.toString(16)).slice(-2); }).join("");
    });
  }

  /* opts: { title, onReady(P) } */
  P.boot = function(opts){
    var loginEl = document.createElement("div");
    loginEl.id = "st-login";
    loginEl.innerHTML = '<div class="st-lc"><h1>' + P.esc(opts.title) + '</h1><div class="sub">운영진·스태프 계정으로 로그인해 주세요.</div>' +
      '<input class="st-in" id="st-name" placeholder="이름" autocomplete="name">' +
      '<input class="st-in" id="st-pin" placeholder="휴대폰 뒷자리 4자리" inputmode="numeric" maxlength="4">' +
      '<input class="st-in" id="st-pw" type="password" placeholder="비밀번호" autocomplete="current-password">' +
      '<button class="st-btn block" id="st-go" type="button">로그인</button>' +
      '<div class="st-err" id="st-err"></div>' +
      '<div class="st-muted" style="margin-top:14px;line-height:1.6">최고 관리자(이메일 계정)는 <a href="../admin/" style="color:var(--wine-deep);font-weight:700">운영진 페이지</a>에서 먼저 로그인한 뒤 이 페이지를 열면 바로 들어와요.</div></div>';
    loginEl.style.display = "none";
    document.body.appendChild(loginEl);
    var app = document.getElementById("st-app");
    var err = loginEl.querySelector("#st-err");
    function showErr(m){ err.textContent = m; err.style.display = "block"; }

    if(typeof firebase === "undefined"){ loginEl.style.display = "flex"; showErr("Firebase를 불러오지 못했어요. 인터넷 연결을 확인해 주세요."); return; }
    firebase.initializeApp(firebaseConfig);
    try{ firebase.firestore().enablePersistence({ synchronizeTabs: true }).catch(function(){}); }catch(e){}  /* 다시 열 때 바뀐 것만 읽기 */
    P.db = firebase.firestore();

    function login(){
      err.style.display = "none";
      var name = loginEl.querySelector("#st-name").value.replace(/\s+/g, "");
      var pin = loginEl.querySelector("#st-pin").value.replace(/\D/g, "");
      var pw = loginEl.querySelector("#st-pw").value;
      if(!name) return showErr("이름을 입력해 주세요.");
      if(pin.length !== 4) return showErr("휴대폰 뒷자리 4자리를 입력해 주세요.");
      if(!pw) return showErr("비밀번호를 입력해 주세요.");
      adminKey(name, pin).then(function(key){ return P.db.collection("login_keys").doc(key).get(); }).then(function(snap){
        var d = snap.exists ? snap.data() : null;
        if(!d || !d.adminEmail){ showErr("등록된 운영진·스태프가 아니에요. 이름과 휴대폰 뒷자리를 확인해 주세요."); return; }
        return firebase.auth().signInWithEmailAndPassword(d.adminEmail, pw).catch(function(e){
          showErr(e.code === "auth/invalid-credential" || e.code === "auth/wrong-password" ? "비밀번호가 맞지 않아요." : "로그인하지 못했어요: " + (e.message || e.code));
        });
      }).catch(function(e){ showErr("로그인하지 못했어요: " + (e.message || e.code)); });
    }
    loginEl.querySelector("#st-go").addEventListener("click", login);
    loginEl.querySelectorAll("input").forEach(function(i){ i.addEventListener("keydown", function(e){ if(e.key === "Enter" && !e.isComposing) login(); }); });

    var ready = false;
    firebase.auth().onAuthStateChanged(function(user){
      if(!user){ loginEl.style.display = "flex"; if(app) app.style.display = "none"; if(ready) location.reload(); return; }
      var email = String(user.email || "").toLowerCase();
      var getAdmin = OWNER_UIDS.indexOf(user.uid) >= 0 ? Promise.resolve({ role: "최고", name: "사이트 관리자" }) :
        P.db.collection("admins").doc(email).get().then(function(s){ return s.exists ? s.data() : null; });
      getAdmin.then(function(a){
        if(!a || ROLES.indexOf(a.role) < 0){ firebase.auth().signOut(); showErr("운영진·스태프 권한이 없는 계정이에요."); return; }
        P.user = user; P.admin = a; ready = true;
        loginEl.style.display = "none";
        if(app) app.style.display = "block";
        var who = document.getElementById("st-who");
        if(who) who.textContent = (a.name || email) + " · " + P.roleLabel(a.role);
        var lo = document.getElementById("st-logout");
        if(lo) lo.onclick = function(){ firebase.auth().signOut(); };
        opts.onReady(P);
      }).catch(function(e){ firebase.auth().signOut(); showErr("권한을 확인하지 못했어요: " + (e.message || e.code)); });
    });
  };
})();

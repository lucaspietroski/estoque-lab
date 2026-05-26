import{s as C}from"./index-B6AuiEdt.js";import"https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";window.DEBUG_MODE=localStorage.getItem("DEBUG_MODE")==="true";const A=500;window.debugLogs=[];function O(e){if(!e)return"";try{const t=new URL(e,window.location.origin);return["apikey","access_token","refresh_token"].forEach(a=>{t.searchParams.has(a)&&t.searchParams.set(a,"[redacted]")}),t.toString()}catch{return String(e)}}function i(e,t,a=null){const o={id:Date.now()+"-"+Math.random().toString(36).substr(2,9),timestamp:new Date,category:e,message:t,details:a};window.debugLogs.push(o),window.debugLogs.length>A&&window.debugLogs.shift();const n=new CustomEvent("debug-log-added",{detail:o});if(window.dispatchEvent(n),window.DEBUG_MODE){const u={AUTH:"#3b82f6",FETCH:"#10b981",RENDER:"#8b5cf6",ERROR:"#ef4444",PERF:"#f59e0b",STATE:"#ec4899",LIFECYCLE:"#6b7280"}[e]||"#6b7280";console.log(`%c[${e}]%c ${t}`,`color: white; background-color: ${u}; padding: 2px 5px; border-radius: 3px; font-weight: bold;`,"color: inherit;",a||"")}}window.logEvent=i;i("LIFECYCLE","🚀 Debug Center Initializing...");const B=window.fetch;let b=0;window.fetch=async function(e,t){b++,E();let a="",o="GET";typeof e=="string"?a=e:e&&typeof e=="object"&&typeof e.url=="string"&&(a=e.url),t&&t.method?o=t.method:e&&typeof e=="object"&&e.method&&(o=e.method);const n=performance.now(),u=a.includes("/auth/v1/")?"AUTH":"FETCH",d=O(a);i(u,`🌐 [${o}] Fetch Start: ${d}`,{method:o,url:d,visibilityState:document.visibilityState});try{const s=await B.apply(this,arguments),r=performance.now()-n;b--,E();const p=`${s.status} ${s.statusText}`;return s.ok?i(u,`✅ [${o}] Fetch Success: ${d} (${p}) in ${r.toFixed(1)}ms`,{status:s.status,durationMs:r}):i("ERROR",`⚠️ [${o}] Fetch Bad Response: ${d} (${p}) in ${r.toFixed(1)}ms`,{status:s.status,statusText:s.statusText,durationMs:r}),s}catch(s){const r=performance.now()-n;throw b--,E(),i("ERROR",`❌ [${o}] Fetch Error/Aborted: ${d} after ${r.toFixed(1)}ms - ${s.message}`,{error:s.stack||s,durationMs:r}),s}};window.addEventListener("error",e=>{i("ERROR",`🚨 Uncaught Exception: ${e.message} at ${e.filename}:${e.lineno}`,{message:e.message,filename:e.filename,lineno:e.lineno,colno:e.colno,error:e.error?e.error.stack:null})});window.addEventListener("unhandledrejection",e=>{i("ERROR",`🚨 Unhandled Rejection: ${e.reason}`,{reason:e.reason,stack:e.reason instanceof Error?e.reason.stack:null})});window.supabase=C;try{C.auth.onAuthStateChange((e,t)=>{var o;const a=((o=t==null?void 0:t.user)==null?void 0:o.email)||"N/A";i("AUTH",`🔑 Supabase Auth: [${e}] User: ${a}`,{event:e,session:t?{user:t.user,expires_at:t.expires_at,expires_in:t.expires_in}:null}),S(t)})}catch(e){i("ERROR",`🚨 Failed to bind Supabase Auth Listener: ${e.message}`)}const U=["renderEstoque","renderHistorico","updateDashboard","renderModeloCusto","renderMovDashboard","selectEnvironment","openSaidaModal"];U.forEach(e=>{let t;Object.defineProperty(window,e,{get(){return t},set(a){if(typeof a=="function"&&a.__isProxy){t=a;return}i("LIFECYCLE",`⚙️ Hooked dynamic rendering function: window.${e}`);const o=async function(...n){const c=performance.now(),u=e==="selectEnvironment"?"STATE":"RENDER";i(u,`🎨 Starting: ${e}`,{arguments:n});try{const d=await a.apply(this,n),s=performance.now()-c;return i(u,`✅ Completed: ${e} in ${s.toFixed(1)}ms`,{durationMs:s}),d}catch(d){const s=performance.now()-c;throw i("ERROR",`❌ Failed: ${e} after ${s.toFixed(1)}ms - Error: ${d.message}`,{error:d.stack||d,durationMs:s}),d}};o.__isProxy=!0,t=o},configurable:!0})});document.addEventListener("visibilitychange",()=>{const e=document.visibilityState;i("LIFECYCLE",`👁️ Visibility Change: Tab is now [${e.toUpperCase()}]`,{visibilityState:e}),e==="visible"&&i("LIFECYCLE","🔄 Tab visible again. Re-verifying connectivity and states.")});window.addEventListener("focus",()=>{i("LIFECYCLE","🔌 Window/Tab focused")});window.addEventListener("blur",()=>{i("LIFECYCLE","🔌 Window/Tab lost focus")});let k=performance.now(),w=0;setInterval(()=>{const e=performance.now(),t=e-k-1e3;w=Math.max(0,t),T(w),t>2e3&&i("PERFORMANCE",`⚠️ CPU FREEZE DETECTED: Main-thread blocked for ${(t/1e3).toFixed(2)}s!`,{delayMs:t,timestamp:new Date}),k=e},1e3);function z(){if(performance.memory){const e=(performance.memory.usedJSHeapSize/1048576).toFixed(1),t=(performance.memory.jsHeapSizeLimit/(1024*1024)).toFixed(0);return`${e}MB / ${t}MB`}return"N/A"}setInterval(()=>{window.DEBUG_MODE&&$()},3e3);let l=null,y="ALL",f="",v=!1;function H(){v||(v=!0,requestAnimationFrame(()=>{v=!1,g()}))}function _(){if(document.getElementById("debug-overlay-styles"))return;const e=document.createElement("style");e.id="debug-overlay-styles",e.textContent=`
    .debug-overlay {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 420px;
      height: 600px;
      background: rgba(15, 23, 42, 0.88);
      backdrop-filter: blur(16px) saturate(180%);
      -webkit-backdrop-filter: blur(16px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      box-shadow: 0 12px 40px 0 rgba(0, 0, 0, 0.6);
      z-index: 999999;
      display: flex;
      flex-direction: column;
      color: #f8fafc;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow: hidden;
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease, height 0.3s cubic-bezier(0.16, 1, 0.3, 1), width 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .debug-overlay.minimized {
      height: 48px;
      width: 250px;
    }
    .debug-overlay.minimized > *:not(.debug-overlay-header) {
      display: none !important;
    }
    .debug-overlay-header {
      padding: 12px 16px;
      background: rgba(30, 41, 59, 0.5);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: move;
      user-select: none;
    }
    .debug-title {
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 0.5px;
      display: flex;
      align-items: center;
      gap: 8px;
      background: linear-gradient(135deg, #60a5fa, #c084fc);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .debug-header-actions {
      display: flex;
      gap: 6px;
    }
    .debug-btn {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #cbd5e1;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 11px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: all 0.2s ease;
    }
    .debug-btn:hover {
      background: rgba(255, 255, 255, 0.15);
      color: #fff;
      border-color: rgba(255, 255, 255, 0.2);
    }
    .debug-kpis {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
      padding: 12px;
      background: rgba(15, 23, 42, 0.4);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .kpi-card {
      background: rgba(30, 41, 59, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.05);
      padding: 8px;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
    }
    .kpi-label {
      font-size: 9px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .kpi-value {
      font-size: 11px;
      font-weight: 600;
      color: #e2e8f0;
      word-break: break-all;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .kpi-value.green { color: #34d399; }
    .kpi-value.red { color: #f87171; }
    .kpi-value.yellow { color: #fbbf24; }
    
    .debug-tabs {
      display: flex;
      overflow-x: auto;
      gap: 4px;
      padding: 8px 12px;
      background: rgba(15, 23, 42, 0.2);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      scrollbar-width: none;
    }
    .debug-tabs::-webkit-scrollbar {
      display: none;
    }
    .debug-tab {
      padding: 4px 10px;
      font-size: 10px;
      font-weight: 600;
      border-radius: 20px;
      cursor: pointer;
      white-space: nowrap;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.05);
      color: #94a3b8;
      transition: all 0.2s ease;
    }
    .debug-tab:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #cbd5e1;
    }
    .debug-tab.active {
      background: #3b82f6;
      color: #fff;
      border-color: #3b82f6;
    }
    .debug-search-container {
      padding: 8px 12px;
      background: rgba(15, 23, 42, 0.15);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .debug-search-input {
      width: 100%;
      background: rgba(30, 41, 59, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 6px 10px;
      border-radius: 6px;
      color: #fff;
      font-size: 11px;
      box-sizing: border-box;
    }
    .debug-search-input:focus {
      outline: none;
      border-color: #3b82f6;
    }
    .debug-timeline {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-family: monospace;
      font-size: 10px;
      background: rgba(10, 15, 30, 0.6);
    }
    .log-row {
      padding: 6px 8px;
      border-radius: 6px;
      background: rgba(30, 41, 59, 0.25);
      border-left: 3px solid #64748b;
      line-height: 1.4;
      word-break: break-all;
      cursor: pointer;
      transition: background 0.2s ease;
    }
    .log-row:hover {
      background: rgba(30, 41, 59, 0.45);
    }
    .log-row.AUTH { border-left-color: #3b82f6; background: rgba(59, 130, 246, 0.06); }
    .log-row.FETCH { border-left-color: #10b981; background: rgba(16, 185, 129, 0.06); }
    .log-row.RENDER { border-left-color: #8b5cf6; background: rgba(139, 92, 246, 0.06); }
    .log-row.ERROR { border-left-color: #ef4444; background: rgba(239, 68, 68, 0.09); }
    .log-row.PERF { border-left-color: #f59e0b; background: rgba(245, 158, 11, 0.06); }
    .log-row.STATE { border-left-color: #ec4899; background: rgba(236, 72, 153, 0.06); }
    .log-row.LIFECYCLE { border-left-color: #6b7280; background: rgba(107, 114, 128, 0.06); }
    .log-time { color: #64748b; margin-right: 6px; font-size: 9px; }
    .log-cat { font-weight: 700; margin-right: 6px; font-size: 9px; text-transform: uppercase; }
    
    .log-details-modal {
      position: absolute;
      top: 48px;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(15, 23, 42, 0.96);
      backdrop-filter: blur(12px);
      z-index: 10;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      transform: translateY(100%);
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .log-details-modal.open {
      transform: translateY(0);
    }
    .log-details-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding-bottom: 8px;
    }
    .log-details-title {
      font-weight: 700;
      font-size: 12px;
    }
    .log-details-content {
      flex: 1;
      overflow-y: auto;
      background: rgba(10, 15, 30, 0.8);
      padding: 12px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 10px;
      white-space: pre-wrap;
      border: 1px solid rgba(255, 255, 255, 0.05);
      color: #cbd5e1;
    }
  `,document.head.appendChild(e)}function R(){if(l){l.style.display="flex",g();return}_(),l=document.createElement("div"),l.id="debug-center-overlay",l.className="debug-overlay",l.innerHTML=`
    <div class="debug-overlay-header" id="debug-drag-header">
      <div class="debug-title">
        <span>🛠️ DEBUG CENTER</span>
      </div>
      <div class="debug-header-actions">
        <button class="debug-btn" id="debug-btn-min" title="Minimize">➖</button>
        <button class="debug-btn" id="debug-btn-clear" title="Clear Logs">🧹</button>
        <button class="debug-btn" id="debug-btn-export" title="Export JSON">📤</button>
      </div>
    </div>
    
    <div class="debug-kpis">
      <div class="kpi-card">
        <div class="kpi-label">👤 User / Session</div>
        <div class="kpi-value" id="kpi-session-value">Checking...</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">🌐 Active Requests</div>
        <div class="kpi-value" id="kpi-pending-value">0</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">⚡ Event Loop Delay</div>
        <div class="kpi-value" id="kpi-delay-value">0ms</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">💾 JS Heap Memory</div>
        <div class="kpi-value" id="kpi-memory-value">N/A</div>
      </div>
    </div>
    
    <div class="debug-tabs">
      <div class="debug-tab active" data-cat="ALL">📋 ALL</div>
      <div class="debug-tab" data-cat="AUTH">🔑 AUTH</div>
      <div class="debug-tab" data-cat="FETCH">🌐 FETCH</div>
      <div class="debug-tab" data-cat="RENDER">🎨 RENDER</div>
      <div class="debug-tab" data-cat="ERROR">⚠️ ERRORS</div>
      <div class="debug-tab" data-cat="PERF">⚡ PERF</div>
      <div class="debug-tab" data-cat="STATE">🔄 STATE</div>
      <div class="debug-tab" data-cat="LIFECYCLE">⚙️ LIFE</div>
    </div>
    
    <div class="debug-search-container">
      <input type="text" class="debug-search-input" id="debug-search-logs" placeholder="Search logs (e.g. error, fetch, render)...">
    </div>
    
    <div class="debug-timeline" id="debug-timeline-container"></div>
    
    <div class="log-details-modal" id="debug-details-modal">
      <div class="log-details-header">
        <div class="log-details-title" id="debug-details-title">Log Details</div>
        <button class="debug-btn" id="debug-btn-close-details">❌ Close</button>
      </div>
      <div class="log-details-content" id="debug-details-content"></div>
    </div>
  `,document.body.appendChild(l);const e=document.getElementById("debug-drag-header");K(l,e),document.getElementById("debug-btn-min").addEventListener("click",()=>{l.classList.toggle("minimized");const o=l.classList.contains("minimized");document.getElementById("debug-btn-min").textContent=o?"🔲":"➖"}),document.getElementById("debug-btn-clear").addEventListener("click",q),document.getElementById("debug-btn-export").addEventListener("click",J),document.getElementById("debug-search-logs").addEventListener("input",o=>{f=o.target.value,g()});const a=l.querySelectorAll(".debug-tab");a.forEach(o=>{o.addEventListener("click",()=>{a.forEach(n=>n.classList.remove("active")),o.classList.add("active"),y=o.dataset.cat,g()})}),document.getElementById("debug-btn-close-details").addEventListener("click",j),E(),T(w),$(),window.supabase&&window.supabase.auth.getSession().then(({data:{session:o}})=>{S(o)}).catch(o=>{i("ERROR",`Failed initial session retrieve: ${o.message}`)}),g(),window.addEventListener("debug-log-added",()=>{window.DEBUG_MODE&&!l.classList.contains("minimized")&&H()})}function N(){l&&(l.style.display="none")}let x=!1,h="No Session";function S(e){e&&e.user?(h=e.user.email,x=!0):(h="No Session",x=!1);const t=document.getElementById("kpi-session-value");t&&(t.textContent=h,t.className=`kpi-value ${x?"green":"red"}`)}function E(){const e=document.getElementById("kpi-pending-value");e&&(e.textContent=b,e.className=`kpi-value ${b>0?"yellow":"green"}`)}function T(e){const t=document.getElementById("kpi-delay-value");t&&(t.textContent=`${e.toFixed(0)}ms`,e>2e3?t.className="kpi-value red":e>200?t.className="kpi-value yellow":t.className="kpi-value green")}function $(){const e=document.getElementById("kpi-memory-value");e&&(e.textContent=z())}function g(){const e=document.getElementById("debug-timeline-container");if(!e)return;e.innerHTML="",window.debugLogs.filter(a=>{const o=y==="ALL"||a.category===y,n=!f||a.message.toLowerCase().includes(f.toLowerCase())||a.category.toLowerCase().includes(f.toLowerCase());return o&&n}).forEach(a=>{const o=document.createElement("div");o.className=`log-row ${a.category}`;const n=a.timestamp.toTimeString().split(" ")[0]+"."+String(a.timestamp.getMilliseconds()).padStart(3,"0");o.innerHTML=`
      <span class="log-time">${n}</span>
      <span class="log-cat" style="color: ${P(a.category)}">${a.category}</span>
      <span class="log-msg">${Y(a.message)}</span>
    `,o.addEventListener("click",()=>{G(a)}),e.appendChild(o)}),e.scrollTop=e.scrollHeight}function P(e){return{AUTH:"#60a5fa",FETCH:"#34d399",RENDER:"#c084fc",ERROR:"#f87171",PERF:"#fbbf24",STATE:"#f472b6",LIFECYCLE:"#94a3b8"}[e]||"#94a3b8"}function Y(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}function G(e){const t=document.getElementById("debug-details-modal"),a=document.getElementById("debug-details-title"),o=document.getElementById("debug-details-content");if(!t||!a||!o)return;a.textContent=`LOG DETAILS: [${e.category}]`;let n="";if(e.details)try{n=JSON.stringify(e.details,null,2)}catch{n=String(e.details)}else n="No extra payload details recorded for this log event.";o.textContent=`Timestamp: ${e.timestamp.toISOString()}
Category: ${e.category}
Message: ${e.message}

Payload/Details:
${n}`,t.classList.add("open")}function j(){const e=document.getElementById("debug-details-modal");e&&e.classList.remove("open")}function q(){window.debugLogs=[],i("LIFECYCLE","🧹 Debug logs cleared by user."),g()}function J(){try{const e="data:text/json;charset=utf-8,"+encodeURIComponent(JSON.stringify(window.debugLogs,null,2)),t=document.createElement("a");t.setAttribute("href",e),t.setAttribute("download",`estoque_debug_logs_${Date.now()}.json`),document.body.appendChild(t),t.click(),t.remove(),i("LIFECYCLE","📤 Exported debug logs to JSON successfully.")}catch(e){i("ERROR",`❌ Failed to export logs: ${e.message}`)}}function K(e,t){let a=0,o=0,n=0,c=0;t.onmousedown=u;function u(r){r=r||window.event,!r.target.closest(".debug-btn")&&(r.preventDefault(),n=r.clientX,c=r.clientY,document.onmouseup=s,document.onmousemove=d)}function d(r){r=r||window.event,r.preventDefault(),a=n-r.clientX,o=c-r.clientY,n=r.clientX,c=r.clientY;const p=e.offsetTop-o,F=e.offsetLeft-a,I=window.innerHeight-e.offsetHeight,M=window.innerWidth-e.offsetWidth;e.style.top=Math.max(0,Math.min(p,I))+"px",e.style.left=Math.max(0,Math.min(F,M))+"px",e.style.right="auto"}function s(){document.onmouseup=null,document.onmousemove=null}}let m=0,L=null;function D(){const e=document.querySelector(".header-title");e?(e.style.cursor="pointer",e.addEventListener("click",()=>{m++,clearTimeout(L),L=setTimeout(()=>{m=0},3e3),m>=5&&(m=0,W())}),i("LIFECYCLE","🔑 Secret toggle bound to .header-title (5 clicks to activate/deactivate)")):setTimeout(D,500)}function W(){const t=!(localStorage.getItem("DEBUG_MODE")==="true");localStorage.setItem("DEBUG_MODE",String(t)),window.DEBUG_MODE=t,i("STATE",`🔄 DEBUG_MODE toggled to: ${t}`),t?R():N()}window.DEBUG_MODE&&R();D();export{i as logEvent};

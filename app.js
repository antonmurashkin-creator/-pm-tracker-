'use strict';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const iso=d=>{const x=new Date(d);return new Date(x.getTime()-x.getTimezoneOffset()*6e4).toISOString().slice(0,10)};
const TODAY=()=>iso(new Date()),addD=(s,n)=>{const d=new Date(s);d.setDate(d.getDate()+n);return iso(d)};
const days=(a,b)=>Math.round((new Date(b)-new Date(a))/864e5),fd=s=>s?new Date(s).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'}):'—';
const ST={backlog:'Бэклог',todo:'К выполнению',doing:'В работе',waiting:'Ожидание',done:'Готово'};
const STAGE=['Инициация','Планирование','Исполнение','Контроль','Закрытие','На паузе'];
const HEALTH={green:'Зелёный',yellow:'Жёлтый',red:'Красный'};
const REC={none:'Нет',daily:'Ежедневно',weekdays:'По будням',weekly:'Еженедельно',biweekly:'Раз в 2 недели',monthly:'Ежемесячно',quarterly:'Ежеквартально'};
const KEY='pmt-data',CFG='pmt-cfg',MEM={};
const LS={getItem(k){try{return localStorage.getItem(k)}catch(e){return MEM[k]??null}},setItem(k,v){try{localStorage.setItem(k,v)}catch(e){MEM[k]=v}}};
let D=JSON.parse(LS.getItem(KEY)||'null')||{projects:[],tasks:[],risks:[],meetings:[],reviews:[]};
let cfg=JSON.parse(LS.getItem(CFG)||'{}'),dirty=!!cfg.dirty,view=location.hash.slice(1)||'today',F={project:'',status:'',q:'',who:''};
['projects','tasks','risks','meetings','reviews'].forEach(k=>D[k]=D[k]||[]);
function save(){LS.setItem(KEY,JSON.stringify(D));dirty=true;cfg.dirty=true;saveCfg();syncLabel();clearTimeout(save.t);save.t=setTimeout(()=>push(true),2500);render()}
function saveCfg(){LS.setItem(CFG,JSON.stringify(cfg))}
const P=id=>D.projects.find(p=>p.id===id),T=id=>D.tasks.find(t=>t.id===id);
const isOver=t=>t.status!=='done'&&t.due&&t.due<TODAY(),overDays=t=>isOver(t)?days(t.due,TODAY()):0;
function progress(p){if(p.progressMode==='manual')return +p.progress||0;const ts=D.tasks.filter(t=>t.projectId===p.id);return ts.length?Math.round(ts.filter(t=>t.status==='done').length/ts.length*100):0}
function pHealth(p){if(p.health&&p.healthMode!=='auto')return p.health;const ts=D.tasks.filter(t=>t.projectId===p.id),o=ts.filter(isOver).length,r=D.risks.filter(x=>x.projectId===p.id&&x.status!=='closed'&&x.prob*x.impact>=15).length;return o>2||r?'red':o?'yellow':'green'}
const people=()=>[...new Set(D.tasks.map(t=>t.assignee).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
const pname=id=>P(id)?.name||'—',ptag=p=>`<span class="tag P${p}">${esc(p||'P3')}</span>`,htag=h=>`<span class="tag ${h}">${HEALTH[h]||h}</span>`;

/* ---------- синхронизация ---------- */
function syncLabel(){$('#syncState').textContent=!cfg.url?'Только локально':(navigator.onLine?'':'Офлайн · ')+(dirty?'Есть несинхр. изменения':'Синхронизировано '+(cfg.last?new Date(cfg.last).toLocaleTimeString('ru-RU'):''))}
async function pull(){if(!cfg.url)return;try{const r=await fetch(cfg.url+(cfg.token?'?token='+encodeURIComponent(cfg.token):''));const j=await r.json();if(j.error)throw j.error;
  if(dirty&&!confirm('Есть локальные изменения. Заменить их данными из Google Таблицы? (Отмена — отправить локальные)'))return push();
  ['projects','tasks','risks','meetings','reviews'].forEach(k=>D[k]=j[k]||[]);LS.setItem(KEY,JSON.stringify(D));dirty=false;cfg.dirty=false;cfg.last=Date.now();saveCfg();syncLabel();render();takeInbox(j)}catch(e){alert('Ошибка загрузки: '+e)}}
async function push(silent){if(!cfg.url||!navigator.onLine)return;try{const r=await fetch(cfg.url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({token:cfg.token,data:D,taken:cfg.taken||[]})});const j=await r.json();if(!j.ok)throw j.error;cfg.taken=[];dirty=false;cfg.dirty=false;cfg.last=Date.now();saveCfg();syncLabel()}catch(e){if(!silent)alert('Ошибка отправки: '+e);syncLabel()}}
window.addEventListener('online',()=>dirty&&push(true));window.addEventListener('offline',syncLabel);

/* ---------- повторяющиеся ---------- */
function nextDate(s,r){const d=new Date(s||TODAY());if(r==='daily')d.setDate(d.getDate()+1);else if(r==='weekdays'){do d.setDate(d.getDate()+1);while([0,6].includes(d.getDay()))}else if(r==='weekly')d.setDate(d.getDate()+7);else if(r==='biweekly')d.setDate(d.getDate()+14);else if(r==='monthly')d.setMonth(d.getMonth()+1);else if(r==='quarterly')d.setMonth(d.getMonth()+3);return iso(d)}
function setStatus(t,s){const was=t.status;t.status=s;if(s==='done'&&was!=='done'){t.doneAt=TODAY();if(t.recur&&t.recur!=='none'&&!t.spawned){t.spawned=true;const len=t.start&&t.due?days(t.start,t.due):0,due=nextDate(t.due,t.recur);
  D.tasks.push({...t,id:uid(),status:'todo',doneAt:'',actual:'',spawned:false,due,start:t.start?addD(due,-len):'',created:TODAY(),deps:[]})}}if(s!=='done')t.doneAt=''}

/* ---------- навигация ---------- */
const VIEWS={today:'Сегодня',tasks:'Задачи',kanban:'Канбан',backlog:'Бэклог',waiting:'Ожидание',projects:'Проекты',gantt:'Гант',risks:'Риски',meetings:'Встречи',review:'Weekly review',reports:'Отчёты',settings:'Настройки'};
function menu(){const c={today:D.tasks.filter(t=>t.status!=='done'&&t.due&&t.due<=TODAY()).length,backlog:D.tasks.filter(t=>t.status==='backlog').length,waiting:D.tasks.filter(t=>t.status==='waiting').length,risks:D.risks.filter(r=>r.status!=='closed').length};
  $('#menu').innerHTML=Object.entries(VIEWS).map(([k,v])=>`<a class="${k===view?'on':''}" href="#${k}" data-v="${k}">${v}${c[k]?`<span>${c[k]}</span>`:''}</a>`).join('')}
window.addEventListener('hashchange',()=>{view=location.hash.slice(1)||'today';render()});
function render(){menu();$('#title').textContent=VIEWS[view]||'';$('#actions').innerHTML='';(R[view]||R.today)()}
function act(html){$('#actions').innerHTML=html}
const V=h=>$('#view').innerHTML=h;

/* ---------- таблица задач ---------- */
function taskRows(list,cols='full'){if(!list.length)return'<p class="muted">Нет задач</p>';
  return`<table><tr><th>Задача</th><th>Проект</th><th>Исполнитель</th><th>Приор.</th><th>Статус</th><th>Срок</th>${cols==='full'?'<th>Желаемый результат</th>':''}<th></th></tr>${list.map(t=>`<tr class="click" data-t="${t.id}">
  <td>${esc(t.title)}${t.recur&&t.recur!=='none'?' <span class="tag">↻</span>':''}${t.status==='waiting'&&t.waitingFor?`<div class="muted">ждём: ${esc(t.waitingFor)}</div>`:''}${(t.deps||[]).length?`<div class="muted">после: ${t.deps.map(d=>esc(T(d)?.title||'?')).join(', ')}</div>`:''}</td>
  <td>${esc(pname(t.projectId))}</td><td>${esc(t.assignee||'—')}</td><td>${ptag(t.priority)}</td><td>${ST[t.status]}</td>
  <td class="${isOver(t)?'over':''}">${fd(t.due)}${isOver(t)?`<div>+${overDays(t)} дн.</div>`:''}</td>${cols==='full'?`<td class="muted">${esc(t.expected||'')}</td>`:''}
  <td class="noprint">${t.status!=='done'?`<button class="ghost" data-done="${t.id}">✓</button>`:''}</td></tr>`).join('')}</table>`}
const sortT=l=>l.sort((a,b)=>(a.priority||'P3').localeCompare(b.priority||'P3')||(a.due||'9').localeCompare(b.due||'9'));
document.addEventListener('click',e=>{const d=e.target.closest('[data-done]');if(d){e.stopPropagation();setStatus(T(d.dataset.done),'done');return save()}
  const t=e.target.closest('[data-t]');if(t)return editTask(T(t.dataset.t));const p=e.target.closest('[data-p]');if(p)return editProject(P(p.dataset.p))});

const R={};
const H=new Map();let HI=0;function on(fn){const k='h'+(HI++);H.set(k,fn);return k}
['click','change','input'].forEach(ev=>document.addEventListener(ev,e=>{const el=e.target.closest('[data-'+ev+']');if(!el)return;const f=H.get(el.dataset[ev]);if(f){if(ev==='click'&&el.tagName==='A')e.preventDefault();f.call(el,e)}}));
document.addEventListener('click',e=>{const a=e.target.closest('#menu a');if(!a)return;e.preventDefault();go(a.dataset.v)});
function go(v){view=v;try{history.replaceState(null,'','#'+v)}catch(_){}render();window.scrollTo(0,0)}
R.today=()=>{act(`<button data-click="${on(function(e){editTask()})}">+ Задача</button><button class="ghost" data-click="${on(function(e){exportCSV(todayList(),'сегодня')})}">CSV</button><button class="ghost" data-click="${on(function(e){print()})}">Печать/PDF</button>`);
  const open=flt(D.tasks.filter(t=>t.status!=='done'&&t.status!=='backlog')),td=TODAY(),wk=addD(td,7);
  const over=sortT(open.filter(isOver)),today=sortT(open.filter(t=>t.due===td)),week=sortT(open.filter(t=>t.due>td&&t.due<=wk)),doing=sortT(open.filter(t=>t.status==='doing'&&!(t.due&&t.due<=wk))),wait=open.filter(t=>t.status==='waiting');
  const ms=D.projects.flatMap(p=>(p.milestones||[]).filter(m=>!m.done&&m.date&&m.date<=wk).map(m=>({...m,p:p.name}))),meet=D.meetings.filter(m=>m.date>=td&&m.date<=wk);
  V(filters()+`<div class="kpis"><div class="card kpi"><b class="over">${over.length}</b>Просрочено</div><div class="card kpi"><b>${today.length}</b>На сегодня</div><div class="card kpi"><b>${week.length}</b>На 7 дней</div><div class="card kpi"><b>${wait.length}</b>Ожидание</div><div class="card kpi"><b>${D.projects.filter(p=>pHealth(p)==='red').length}</b>Проектов в красной зоне</div></div>
  <h2>Просрочено</h2>${taskRows(over,'s')}<h2>Сегодня · ${fd(td)}</h2>${taskRows(today,'s')}<h2>В работе без близкого срока</h2>${taskRows(doing,'s')}<h2>Ближайшие 7 дней</h2>${taskRows(week,'s')}
  <h2>Ожидание (waiting-for)</h2>${taskRows(wait,'s')}
  <h2>Вехи и встречи на неделе</h2><div class="card">${ms.map(m=>`<div>◆ ${fd(m.date)} — ${esc(m.name)} <span class="muted">(${esc(m.p)})</span></div>`).join('')+meet.map(m=>`<div>● ${fd(m.date)} — ${esc(m.title)}</div>`).join('')||'<span class="muted">Нет</span>'}</div>`)};
window.todayList=()=>D.tasks.filter(t=>t.status!=='done'&&t.status!=='backlog'&&t.due&&t.due<=addD(TODAY(),7));

function filters(){return`<div class="row" style="margin-bottom:10px"><input placeholder="Поиск" value="${esc(F.q)}" data-input="${on(function(e){F.q=this.value;R[view]();this.focus();this.setSelectionRange(99,99)})}" style="width:200px">
 <select data-change="${on(function(e){F.project=this.value;render()})}"><option value="">Все проекты</option>${D.projects.map(p=>`<option value="${p.id}" ${F.project===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select>
 <select data-change="${on(function(e){F.who=this.value;render()})}"><option value="">Все исполнители</option>${people().map(p=>`<option ${F.who===p?'selected':''}>${esc(p)}</option>`).join('')}<option value="—" ${F.who==='—'?'selected':''}>Без исполнителя</option></select>
 ${view==='tasks'?`<select data-change="${on(function(e){F.status=this.value;render()})}"><option value="">Все статусы</option><option value="open" ${F.status==='open'?'selected':''}>Открытые</option>${Object.entries(ST).map(([k,v])=>`<option value="${k}" ${F.status===k?'selected':''}>${v}</option>`).join('')}<option value="over" ${F.status==='over'?'selected':''}>Просроченные</option></select>`:''}</div>`}
const flt=l=>l.filter(t=>(!F.project||t.projectId===F.project)&&(!F.who||(F.who==='—'?!t.assignee:t.assignee===F.who))&&(!F.q||(t.title+' '+(t.expected||'')+' '+(t.assignee||'')).toLowerCase().includes(F.q.toLowerCase())));
R.tasks=()=>{act(`<button data-click="${on(function(e){editTask()})}">+ Задача</button><button class="ghost" data-click="${on(function(e){bulkAdd()})}">+ Списком</button><button class="ghost" data-click="${on(function(e){exportCSV(curList,'задачи')})}">CSV</button>`);
  let l=flt(D.tasks);if(F.status==='open')l=l.filter(t=>t.status!=='done');else if(F.status==='over')l=l.filter(isOver);else if(F.status)l=l.filter(t=>t.status===F.status);window.curList=sortT(l);V(filters()+taskRows(curList))};
R.backlog=()=>{act(`<button data-click="${on(function(e){editTask({status:'backlog'})})}">+ В бэклог</button>`);V(filters()+taskRows(sortT(flt(D.tasks.filter(t=>t.status==='backlog')))))};
R.waiting=()=>{act(`<button data-click="${on(function(e){editTask({status:'waiting'})})}">+ Ожидание</button>`);const l=flt(D.tasks.filter(t=>t.status==='waiting'));
  V(filters()+(l.length?`<table><tr><th>Задача</th><th>От кого ждём</th><th>Проект</th><th>Ждём с</th><th>Срок</th></tr>${l.map(t=>`<tr class="click" data-t="${t.id}"><td>${esc(t.title)}</td><td><b>${esc(t.waitingFor||'—')}</b></td><td>${esc(pname(t.projectId))}</td><td>${fd(t.waitingSince)} ${t.waitingSince?`<span class="muted">(${days(t.waitingSince,TODAY())} дн.)</span>`:''}</td><td class="${isOver(t)?'over':''}">${fd(t.due)}</td></tr>`).join('')}</table>`:'<p class="muted">Ничего не ждём</p>'))};

R.kanban=()=>{act(`<button data-click="${on(function(e){editTask()})}">+ Задача</button>`);const l=flt(D.tasks);
  V(filters()+`<div class="kanban">${Object.entries(ST).map(([k,v])=>{const c=sortT(l.filter(t=>t.status===k));return`<div class="col" data-col="${k}"><h3>${v}<span>${c.length}</span></h3>${c.map(t=>`<div class="kc" draggable="true" data-t="${t.id}">${ptag(t.priority)} ${esc(t.title)}<div class="muted">${esc(pname(t.projectId))}${t.assignee?' · '+esc(t.assignee):''} · <span class="${isOver(t)?'over':''}">${fd(t.due)}</span></div></div>`).join('')}</div>`}).join('')}</div>`);
  document.querySelectorAll('.kc').forEach(c=>c.ondragstart=e=>e.dataTransfer.setData('t',c.dataset.t));
  document.querySelectorAll('.col').forEach(c=>{c.ondragover=e=>{e.preventDefault();c.classList.add('drop')};c.ondragleave=()=>c.classList.remove('drop');c.ondrop=e=>{e.preventDefault();const t=T(e.dataTransfer.getData('t'));if(t){if(c.dataset.col==='waiting'&&!t.waitingSince)t.waitingSince=TODAY();setStatus(t,c.dataset.col);save()}}})};

R.projects=()=>{act(`<button data-click="${on(function(e){editProject()})}">+ Проект</button><button class="ghost" data-click="${on(function(e){exportCSV(D.projects.map(p=>({...p,progress:progress(p),health:pHealth(p),milestones:(p.milestones||[]).map(m=>m.name+' '+m.date+(m.done?' ✓':'')).join('; ')})),'проекты')})}">CSV</button>`);
  V(D.projects.length?`<div class="grid">${D.projects.map(p=>{const ts=D.tasks.filter(t=>t.projectId===p.id),pr=progress(p),ms=p.milestones||[];return`<div class="card click" data-p="${p.id}" style="cursor:pointer">
  <div class="row" style="justify-content:space-between"><b>${esc(p.name)}</b>${htag(pHealth(p))}</div><div class="muted">${esc(p.owner||'без owner')} · ${esc(p.stage||'')} · ${fd(p.start)}–${fd(p.end)}</div>
  <div class="row" style="margin:8px 0"><div class="bar" style="flex:1"><i style="width:${pr}%"></i></div>${pr}%</div>
  <div class="muted">Задач: ${ts.length} · открыто ${ts.filter(t=>t.status!=='done').length} · просрочено <span class="${ts.some(isOver)?'over':''}">${ts.filter(isOver).length}</span> · рисков ${D.risks.filter(r=>r.projectId===p.id&&r.status!=='closed').length}</div>
  ${p.goal?`<div style="margin-top:6px"><b>Цель:</b> ${esc(p.goal)}</div>`:''}${p.result?`<div><b>Факт:</b> ${esc(p.result)}</div>`:''}
  ${ms.length?`<div style="margin-top:6px">${ms.map(m=>`<div class="${!m.done&&m.date<TODAY()?'over':''}">${m.done?'☑':'◆'} ${esc(m.name)} — ${fd(m.date)}</div>`).join('')}</div>`:''}</div>`}).join('')}</div>`:'<p class="muted">Создайте первый проект</p>')};

/* ---------- Гант ---------- */
let GZ=cfg.gz||22;
function ganttSVG(){const items=[];D.projects.filter(p=>!F.project||p.id===F.project).forEach(p=>{items.push({type:'p',p});D.tasks.filter(t=>t.projectId===p.id&&(t.start||t.due)).sort((a,b)=>(a.start||a.due).localeCompare(b.start||b.due)).forEach(t=>items.push({type:'t',t}));(p.milestones||[]).filter(m=>m.date).forEach(m=>items.push({type:'m',m,p}))});
  if(!F.project)D.tasks.filter(t=>!P(t.projectId)&&(t.start||t.due)).forEach(t=>items.push({type:'t',t}));
  const ds=items.flatMap(i=>i.type==='p'?[i.p.start,i.p.end]:i.type==='t'?[i.t.start,i.t.due]:[i.m.date]).filter(Boolean);if(!ds.length)return null;
  let min=addD(ds.reduce((a,b)=>a<b?a:b),-3),max=addD(ds.reduce((a,b)=>a>b?a:b),5);if(TODAY()<min)min=TODAY();if(TODAY()>max)max=addD(TODAY(),3);
  const L=260,RH=26,H=40,n=days(min,max)+1,W=L+n*GZ,X=d=>L+days(min,d)*GZ,h=H+items.length*RH+10,pos={};
  let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" font-family="Segoe UI,Arial" font-size="12"><rect width="100%" height="100%" fill="#fff"/><defs><marker id="ar" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0L8,4L0,8z" fill="#555"/></marker></defs>`;
  for(let i=0;i<n;i++){const d=addD(min,i),dt=new Date(d),we=[0,6].includes(dt.getDay());if(we)s+=`<rect x="${L+i*GZ}" y="${H}" width="${GZ}" height="${h-H}" fill="#f4f3ef"/>`;
    if(dt.getDate()===1||i===0)s+=`<text x="${L+i*GZ+2}" y="14" font-weight="600">${dt.toLocaleDateString('ru-RU',{month:'short',year:'numeric'})}</text><line x1="${L+i*GZ}" y1="0" x2="${L+i*GZ}" y2="${h}" stroke="#ccc"/>`;
    if(GZ>=14||dt.getDay()===1)s+=`<text x="${L+i*GZ+GZ/2}" y="32" text-anchor="middle" fill="#888" font-size="10">${dt.getDate()}</text>`}
  items.forEach((it,i)=>{const y=H+i*RH;s+=`<line x1="0" y1="${y+RH}" x2="${W}" y2="${y+RH}" stroke="#eee"/>`;
    if(it.type==='p'){const p=it.p,c={green:'#2f7d4f',yellow:'#b7791f',red:'#b23b3b'}[pHealth(p)];s+=`<rect x="0" y="${y}" width="${W}" height="${RH}" fill="#eef3f5"/><text x="8" y="${y+17}" font-weight="700">${esc(p.name.slice(0,34))}</text>`;
      if(p.start&&p.end){const pr=progress(p);s+=`<rect x="${X(p.start)}" y="${y+8}" width="${(days(p.start,p.end)+1)*GZ}" height="10" fill="#1f4e5f" opacity=".35" rx="2"/><rect x="${X(p.start)}" y="${y+8}" width="${(days(p.start,p.end)+1)*GZ*pr/100}" height="10" fill="${c}" rx="2"/>`}}
    else if(it.type==='t'){const t=it.t,a=t.start||t.due,b=t.due||t.start,x=X(a),w=Math.max(GZ,(days(a,b)+1)*GZ),col=t.status==='done'?'#8fbf9f':isOver(t)?'#d46a6a':t.status==='waiting'?'#d9a94a':'#4f8aa3';
      pos[t.id]={x1:x,x2:x+w,y:y+RH/2};s+=`<text x="18" y="${y+17}">${esc(t.title.slice(0,36))}</text><rect x="${x}" y="${y+5}" width="${w}" height="${RH-10}" rx="4" fill="${col}"><title>${esc(t.title)} ${fd(a)}–${fd(b)}</title></rect>`}
    else{const x=X(it.m.date)+GZ/2;s+=`<text x="18" y="${y+17}" fill="#555">◆ ${esc(it.m.name.slice(0,34))}</text><path d="M${x},${y+5}l8,8l-8,8l-8,-8z" fill="${it.m.done?'#2f7d4f':'#222'}"/>`}});
  D.tasks.forEach(t=>(t.deps||[]).forEach(d=>{const a=pos[d],b=pos[t.id];if(a&&b){const mx=Math.max(a.x2+6,b.x1-8);s+=`<path d="M${a.x2},${a.y}H${mx}V${b.y}H${b.x1}" fill="none" stroke="#555" stroke-width="1.3" marker-end="url(#ar)"/>`}}));
  const tx=X(TODAY())+GZ/2;s+=`<line x1="${tx}" y1="${H-4}" x2="${tx}" y2="${h}" stroke="#b23b3b" stroke-width="1.5" stroke-dasharray="4 3"/><line x1="${L}" y1="0" x2="${L}" y2="${h}" stroke="#bbb"/></svg>`;return s}
R.gantt=()=>{act(`<select data-change="${on(function(e){GZ=+this.value;cfg.gz=GZ;saveCfg();render()})}" style="width:auto">${[[8,'Месяцы'],[14,'Недели'],[22,'Дни']].map(([v,l])=>`<option value="${v}" ${GZ==v?'selected':''}>${l}</option>`).join('')}</select><button class="ghost" data-click="${on(function(e){dlGantt('svg')})}">SVG</button><button class="ghost" data-click="${on(function(e){dlGantt('png')})}">PNG</button><button class="ghost" data-click="${on(function(e){exportCSV(D.tasks.map(t=>({ID:t.id,Задача:t.title,Проект:pname(t.projectId),Начало:t.start,Окончание:t.due,Статус:ST[t.status],Предшественники:(t.deps||[]).join(',')})),'гант')})}">CSV (связи)</button>`);
  const s=ganttSVG();V(filters()+(s?`<div class="gantt">${s}</div><p class="muted">Стрелки — зависимости «финиш→старт». Красная пунктирная — сегодня. Цвет: синий — в работе, жёлтый — ожидание, красный — просрочено, зелёный — готово.</p>`:'<p class="muted">Укажите даты у проектов/задач</p>'))};
window.dlGantt=f=>{const s=ganttSVG();if(!s)return;if(f==='svg')return dl(new Blob([s],{type:'image/svg+xml'}),'gantt.svg');const img=new Image(),u=URL.createObjectURL(new Blob([s],{type:'image/svg+xml'}));
  img.onload=()=>{const c=document.createElement('canvas');c.width=img.width*2;c.height=img.height*2;const x=c.getContext('2d');x.scale(2,2);x.drawImage(img,0,0);c.toBlob(b=>dl(b,'gantt.png'))};img.src=u};

/* ---------- риски ---------- */
R.risks=()=>{act(`<button data-click="${on(function(e){editRisk()})}">+ Риск</button><button class="ghost" data-click="${on(function(e){exportCSV(D.risks.map(r=>({...r,project:pname(r.projectId),score:r.prob*r.impact})),'риски')})}">CSV</button>`);
  const l=D.risks.filter(r=>!F.project||r.projectId===F.project).sort((a,b)=>(a.status==='closed')-(b.status==='closed')||b.prob*b.impact-a.prob*a.impact);
  V(filters()+(l.length?`<table><tr><th>Риск</th><th>Проект</th><th>Вер.</th><th>Влияние</th><th>Оценка</th><th>Митигация</th><th>Owner</th><th>Статус</th></tr>${l.map(r=>{const sc=r.prob*r.impact;return`<tr class="click" data-click="${on(function(e){editRisk(D.risks.find(x=>x.id===r.id))})}"><td>${esc(r.title)}</td><td>${esc(pname(r.projectId))}</td><td>${r.prob}</td><td>${r.impact}</td><td><span class="tag ${sc>=15?'red':sc>=8?'yellow':'green'}">${sc}</span></td><td>${esc(r.mitigation||'')}</td><td>${esc(r.owner||'')}</td><td>${{open:'Открыт',watch:'Мониторинг',closed:'Закрыт'}[r.status]}</td></tr>`}).join('')}</table>`:'<p class="muted">Рисков нет</p>'))};

/* ---------- встречи ---------- */
R.meetings=()=>{act(`<button data-click="${on(function(e){editMeeting()})}">+ Встреча</button>`);const l=[...D.meetings].sort((a,b)=>b.date.localeCompare(a.date));
  V(l.length?l.map(m=>`<div class="card click" style="margin-bottom:10px;cursor:pointer" data-click="${on(function(e){editMeeting(D.meetings.find(x=>x.id===m.id))})}"><b>${fd(m.date)} · ${esc(m.title)}</b> <span class="muted">${esc(pname(m.projectId))} · ${esc(m.participants||'')}</span>
  ${m.notes?`<div style="white-space:pre-wrap;margin-top:4px">${esc(m.notes)}</div>`:''}${m.decisions?`<div style="margin-top:4px"><b>Решения:</b> <span style="white-space:pre-wrap">${esc(m.decisions)}</span></div>`:''}
  ${D.tasks.filter(t=>t.meetingId===m.id).length?`<div style="margin-top:4px"><b>Задачи:</b> ${D.tasks.filter(t=>t.meetingId===m.id).map(t=>`${t.status==='done'?'☑':'☐'} ${esc(t.title)}`).join(' · ')}</div>`:''}</div>`).join(''):'<p class="muted">Встреч нет</p>')};

/* ---------- weekly review ---------- */
const monday=d=>{const x=new Date(d);x.setDate(x.getDate()-((x.getDay()+6)%7));return iso(x)};
R.review=()=>{const ws=monday(TODAY()),we=addD(ws,6);let r=D.reviews.find(x=>x.week===ws);act(`<button data-click="${on(function(e){print()})}" class="ghost">Печать/PDF</button>`);
  const done=D.tasks.filter(t=>t.doneAt>=ws&&t.doneAt<=we),over=D.tasks.filter(isOver),next=sortT(D.tasks.filter(t=>t.status!=='done'&&t.due>we&&t.due<=addD(we,7)));
  const chk=['Разобрать входящие и бэклог','Проверить waiting-for и напомнить','Обновить статусы и health проектов','Пересмотреть риски','Проверить вехи на 2 недели','Запланировать приоритеты на неделю'];r=r||{checks:[]};
  V(`<div class="card"><b>Неделя ${fd(ws)} – ${fd(we)}</b><div class="row" style="margin-top:8px">${chk.map((c,i)=>`<label class="row" style="color:var(--t)"><input type="checkbox" style="width:auto" ${r.checks?.includes(i)?'checked':''} data-change="${on(function(e){revSet('chk',i,this.checked)})}">${c}</label>`).join('')}</div></div>
  <div class="kpis" style="margin-top:12px"><div class="card kpi"><b>${done.length}</b>Закрыто за неделю</div><div class="card kpi"><b class="over">${over.length}</b>Просрочено</div><div class="card kpi"><b>${D.tasks.filter(t=>t.status==='waiting').length}</b>Ожидание</div><div class="card kpi"><b>${next.length}</b>На след. неделю</div></div>
  <div class="f2"><label>Достижения недели<textarea data-change="${on(function(e){revSet('wins',0,this.value)})}">${esc(r.wins||'')}</textarea></label><label>Проблемы / блокеры<textarea data-change="${on(function(e){revSet('issues',0,this.value)})}">${esc(r.issues||'')}</textarea></label>
  <label>Фокус следующей недели<textarea data-change="${on(function(e){revSet('focus',0,this.value)})}">${esc(r.focus||'')}</textarea></label><label>Выводы / уроки<textarea data-change="${on(function(e){revSet('lessons',0,this.value)})}">${esc(r.lessons||'')}</textarea></label></div>
  <h2>Проекты</h2><table><tr><th>Проект</th><th>Owner</th><th>Stage</th><th>Health</th><th>%</th><th>Просрочено</th></tr>${D.projects.map(p=>`<tr class="click" data-p="${p.id}"><td>${esc(p.name)}</td><td>${esc(p.owner||'')}</td><td>${esc(p.stage||'')}</td><td>${htag(pHealth(p))}</td><td>${progress(p)}%</td><td>${D.tasks.filter(t=>t.projectId===p.id&&isOver(t)).length}</td></tr>`).join('')}</table>
  <h2>Закрыто за неделю</h2>${taskRows(done,'s')}<h2>Просрочено</h2>${taskRows(over,'s')}<h2>Следующая неделя</h2>${taskRows(next,'s')}
  ${D.reviews.filter(x=>x.week!==ws).length?`<h2>Прошлые обзоры</h2>${D.reviews.filter(x=>x.week!==ws).sort((a,b)=>b.week.localeCompare(a.week)).map(x=>`<div class="card" style="margin-bottom:6px"><b>${fd(x.week)}</b> ${x.wins?'<br>✔ '+esc(x.wins):''}${x.issues?'<br>⚠ '+esc(x.issues):''}${x.focus?'<br>→ '+esc(x.focus):''}</div>`).join('')}`:''}`)};
window.revSet=(k,i,v)=>{const ws=monday(TODAY());let r=D.reviews.find(x=>x.week===ws);if(!r){r={id:uid(),week:ws,checks:[]};D.reviews.push(r)}if(k==='chk'){r.checks=(r.checks||[]).filter(x=>x!==i);if(v)r.checks.push(i)}else r[k]=v;save()};

/* ---------- отчёты ---------- */
let RP=cfg.rp||'week',RF='',RT='';
function range(){const t=new Date(),y=t.getFullYear(),m=t.getMonth();if(RP==='custom')return[RF||addD(TODAY(),-30),RT||TODAY()];
  if(RP==='week'){const s=monday(TODAY());return[s,addD(s,6)]}if(RP==='month')return[iso(new Date(y,m,1)),iso(new Date(y,m+1,0))];
  if(RP==='quarter'){const q=Math.floor(m/3)*3;return[iso(new Date(y,q,1)),iso(new Date(y,q+3,0))]}if(RP==='half'){const h=m<6?0:6;return[iso(new Date(y,h,1)),iso(new Date(y,h+6,0))]}return[iso(new Date(y,0,1)),iso(new Date(y,11,31))]}
function reportData(){const[a,b]=range(),inR=d=>d&&d>=a&&d<=b,pf=x=>!F.project||x.projectId===F.project;
  const done=D.tasks.filter(t=>pf(t)&&inR(t.doneAt)),created=D.tasks.filter(t=>pf(t)&&inR(t.created)),dueIn=D.tasks.filter(t=>pf(t)&&inR(t.due));
  const onTime=done.filter(t=>!t.due||t.doneAt<=t.due).length,late=done.filter(t=>t.due&&t.doneAt>t.due);
  return{a,b,done,created,dueIn,onTime,late,overdueNow:D.tasks.filter(t=>pf(t)&&isOver(t)),missed:dueIn.filter(t=>t.status!=='done'||t.doneAt>t.due),
    ms:D.projects.filter(p=>!F.project||p.id===F.project).flatMap(p=>(p.milestones||[]).filter(m=>inR(m.date)).map(m=>({...m,p:p.name}))),meet:D.meetings.filter(m=>pf(m)&&inR(m.date)),risks:D.risks.filter(r=>pf(r)&&r.status!=='closed')}}
R.reports=()=>{act(`<button class="ghost" data-click="${on(function(e){exportReport()})}">CSV</button><button class="ghost" data-click="${on(function(e){exportReportHTML()})}">HTML-отчёт</button><button class="ghost" data-click="${on(function(e){print()})}">Печать/PDF</button>`);const r=reportData();
  V(`<div class="row noprint" style="margin-bottom:10px"><select data-change="${on(function(e){RP=this.value;cfg.rp=RP;saveCfg();render()})}" style="width:auto">${Object.entries({week:'Неделя',month:'Месяц',quarter:'Квартал',half:'Полугодие',year:'Год',custom:'Свой диапазон'}).map(([k,v])=>`<option value="${k}" ${RP===k?'selected':''}>${v}</option>`).join('')}</select>
  ${RP==='custom'?`<input type="date" value="${r.a}" data-change="${on(function(e){RF=this.value;render()})}" style="width:auto"> — <input type="date" value="${r.b}" data-change="${on(function(e){RT=this.value;render()})}" style="width:auto">`:''}
  <select data-change="${on(function(e){F.project=this.value;render()})}" style="width:auto"><option value="">Все проекты</option>${D.projects.map(p=>`<option value="${p.id}" ${F.project===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div><div id="rep">${reportHTML(r)}</div>`)};
function reportHTML(r){const pr=D.projects.filter(p=>!F.project||p.id===F.project);
  return`<h2>Период: ${fd(r.a)} – ${fd(r.b)}</h2><div class="kpis"><div class="card kpi"><b>${r.done.length}</b>Выполнено</div><div class="card kpi"><b>${r.created.length}</b>Создано</div><div class="card kpi"><b>${r.done.length?Math.round(r.onTime/r.done.length*100):0}%</b>В срок</div><div class="card kpi"><b class="over">${r.overdueNow.length}</b>Просрочено сейчас</div><div class="card kpi"><b>${r.meet.length}</b>Встреч</div></div>
  <h2>Проекты</h2><table><tr><th>Проект</th><th>Owner</th><th>Stage</th><th>Health</th><th>%</th><th>Выполнено за период</th><th>Цель</th><th>Факт</th></tr>${pr.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.owner||'')}</td><td>${esc(p.stage||'')}</td><td>${htag(pHealth(p))}</td><td>${progress(p)}%</td><td>${r.done.filter(t=>t.projectId===p.id).length}</td><td>${esc(p.goal||'')}</td><td>${esc(p.result||'')}</td></tr>`).join('')}</table>
  <h2>Выполненные задачи</h2>${r.done.length?`<table><tr><th>Задача</th><th>Проект</th><th>Срок</th><th>Выполнено</th><th>Желаемый результат</th><th>Фактический результат</th></tr>${r.done.map(t=>`<tr><td>${esc(t.title)}</td><td>${esc(pname(t.projectId))}</td><td>${fd(t.due)}</td><td class="${t.due&&t.doneAt>t.due?'over':''}">${fd(t.doneAt)}</td><td>${esc(t.expected||'')}</td><td>${esc(t.actual||'')}</td></tr>`).join('')}</table>`:'<p class="muted">Нет</p>'}
  <h2>Сорванные сроки за период</h2>${r.missed.length?`<table><tr><th>Задача</th><th>Проект</th><th>Срок</th><th>Статус</th><th>Опоздание</th></tr>${r.missed.map(t=>`<tr><td>${esc(t.title)}</td><td>${esc(pname(t.projectId))}</td><td>${fd(t.due)}</td><td>${ST[t.status]}</td><td class="over">${days(t.due,t.doneAt||TODAY())} дн.</td></tr>`).join('')}</table>`:'<p class="muted">Нет</p>'}
  <h2>Вехи периода</h2>${r.ms.map(m=>`<div>${m.done?'☑':'◆'} ${fd(m.date)} — ${esc(m.name)} <span class="muted">(${esc(m.p)})</span></div>`).join('')||'<p class="muted">Нет</p>'}
  <h2>Открытые риски</h2>${r.risks.map(x=>`<div>• [${x.prob*x.impact}] ${esc(x.title)} <span class="muted">— ${esc(pname(x.projectId))}</span></div>`).join('')||'<p class="muted">Нет</p>'}`}
window.exportReport=()=>{const r=reportData();exportCSV([...r.done.map(t=>({Тип:'Выполнено',...rowT(t)})),...r.missed.map(t=>({Тип:'Срыв срока',...rowT(t)})),...r.overdueNow.map(t=>({Тип:'Просрочено сейчас',...rowT(t)}))],`отчёт_${r.a}_${r.b}`)};
window.exportReportHTML=()=>{const r=reportData();dl(new Blob([`<!doctype html><meta charset="utf-8"><title>Отчёт ${r.a}–${r.b}</title><style>${[...document.styleSheets[0].cssRules].map(x=>x.cssText).join('')}body{display:block;padding:24px}</style><h1>Отчёт PM</h1>${reportHTML(r)}`],{type:'text/html'}),`отчёт_${r.a}_${r.b}.html`)};
const rowT=t=>({Задача:t.title,Проект:pname(t.projectId),Исполнитель:t.assignee,Приоритет:t.priority,Статус:ST[t.status],Начало:t.start,Срок:t.due,Выполнено:t.doneAt,'Просрочка, дн':overDays(t),'Желаемый результат':t.expected,'Фактический результат':t.actual,'Ждём от':t.waitingFor,Повтор:REC[t.recur||'none'],Предшественники:(t.deps||[]).map(d=>T(d)?.title).join('; ')});

/* ---------- настройки ---------- */
R.settings=()=>{V(`<div class="card" style="max-width:640px;display:grid;gap:10px"><b>Синхронизация с Google Таблицей</b>
  <label>URL веб-приложения Apps Script<input id="cu" value="${esc(cfg.url||'')}" placeholder="https://script.google.com/macros/s/.../exec"></label><label>Токен (если задан в Code.gs)<input id="ct" value="${esc(cfg.token||'')}"></label>
  <div class="row"><button data-click="${on(function(e){cfg.url=$('#cu').value.trim();cfg.token=$('#ct').value.trim();saveCfg();syncLabel();pull()})}">Сохранить и загрузить</button><button class="ghost" data-click="${on(function(e){push()})}">Отправить локальные данные</button></div>
  <ol class="muted" style="margin:0;padding-left:18px"><li>Создайте Google Таблицу на Диске.</li><li>Расширения → Apps Script, вставьте код из Code.gs, сохраните.</li><li>Развернуть → Новое развертывание → Веб-приложение; «Запуск от имени: Я», «Доступ: Все». Скопируйте URL /exec.</li><li>Вставьте URL сюда. Данные хранятся листами projects, tasks, risks, meetings, reviews.</li></ol></div>
  <div class="card" style="max-width:640px;margin-top:12px;display:grid;gap:10px"><b>Резервная копия</b><div class="row"><button class="ghost" data-click="${on(function(e){dl(new Blob([JSON.stringify(D,null,1)],{type:'application/json'}),'pm-backup-'+TODAY()+'.json')})}">Скачать JSON</button>
  <label class="btn ghost" style="background:var(--s2);color:var(--t);display:inline-block">Заменить из JSON<input type="file" accept=".json" style="display:none" data-change="${on(function(e){impJ(this.files[0])})}"></label><label class="btn ghost" style="background:var(--s2);color:var(--t);display:inline-block">Добавить из JSON<input type="file" accept=".json" style="display:none" data-change="${on(function(e){mergeJ(this.files[0])})}"></label><button class="ghost" data-click="${on(function(e){exportCSV(D.tasks.map(rowT),'все_задачи')})}">Все задачи CSV</button><button class="ghost" data-click="${on(function(e){demo()})}">Демо-данные</button></div></div>`)};
window.impJ=f=>f.text().then(t=>{const j=JSON.parse(t);if(confirm('Заменить все данные?')){D=j;save()}});

/* ---------- экспорт ---------- */
function dl(b,n){const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=n;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}
window.exportCSV=(rows,name)=>{rows=rows.map(r=>r.title!==undefined&&r.status in ST?rowT(r):r);if(!rows.length)return alert('Нет данных');const k=[...new Set(rows.flatMap(Object.keys))];
  const c=v=>{v=v==null?'':typeof v==='object'?JSON.stringify(v):String(v);return/[;"\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
  dl(new Blob(['\ufeff'+[k.join(';'),...rows.map(r=>k.map(x=>c(r[x])).join(';'))].join('\r\n')],{type:'text/csv'}),name+'.csv')};

/* ---------- формы ---------- */
function dialog(html,onSave,onDel){const f=$('#dlgForm');f.innerHTML=html+`<div class="row" style="justify-content:space-between"><div>${onDel?'<button type="button" class="danger" id="dDel">Удалить</button>':''}</div><div class="row"><button type="button" class="ghost" id="dCan">Отмена</button><button type="submit" value="ok">Сохранить</button></div></div>`;
  const d=$('#dlg');d.showModal();$('#dCan').onclick=()=>d.close();if(onDel)$('#dDel').onclick=()=>{if(confirm('Удалить?')){onDel();d.close();save()}};
  f.onsubmit=e=>{e.preventDefault();const v=Object.fromEntries(new FormData(f));onSave(v,f);d.close();save()}}
const opt=(o,s)=>Object.entries(o).map(([k,v])=>`<option value="${k}" ${k==s?'selected':''}>${v}</option>`).join('');
const popt=s=>`<option value="">— без проекта —</option>`+D.projects.map(p=>`<option value="${p.id}" ${p.id===s?'selected':''}>${esc(p.name)}</option>`).join('');
window.editTask=(t)=>{const isNew=!t||!t.id;t={status:'todo',priority:'P3',recur:'none',deps:[],...t};
  dialog(`<h2 style="margin:0">${isNew?'Новая задача':'Задача'}</h2><label>Название<input name="title" required value="${esc(t.title||'')}"></label>
  <div class="f2"><label>Проект<select name="projectId">${popt(t.projectId)}</select></label><label>Статус<select name="status">${opt(ST,t.status)}</select></label>
  <label>Приоритет<select name="priority">${opt({P1:'P1 — критично',P2:'P2 — высокий',P3:'P3 — средний',P4:'P4 — низкий'},t.priority)}</select></label><span></span>
  <label>Начало<input type="date" name="start" value="${t.start||''}"></label><label>Срок<input type="date" name="due" value="${t.due||''}"></label>
  <label>Исполнитель<input name="assignee" list="ppl" value="${esc(t.assignee||'')}"><datalist id="ppl">${people().map(p=>`<option value="${esc(p)}">`).join('')}</datalist></label><label>Повтор<select name="recur">${opt(REC,t.recur)}</select></label><label>Ждём от (waiting-for)<input name="waitingFor" value="${esc(t.waitingFor||'')}"></label><label>Встреча-источник<select name="meetingId"><option value="">—</option>${D.meetings.map(m=>`<option value="${m.id}" ${m.id===t.meetingId?'selected':''}>${fd(m.date)} ${esc(m.title)}</option>`).join('')}</select></label></div>
  <label>Желаемый результат<textarea name="expected">${esc(t.expected||'')}</textarea></label><label>Фактический результат<textarea name="actual">${esc(t.actual||'')}</textarea></label>
  <label>Зависит от (предшественники, Ctrl/Cmd — несколько)<select name="deps" multiple size="5">${D.tasks.filter(x=>x.id!==t.id).map(x=>`<option value="${x.id}" ${(t.deps||[]).includes(x.id)?'selected':''}>${esc(x.title)} · ${esc(pname(x.projectId))}</option>`).join('')}</select></label>
  <label>Заметки<textarea name="notes">${esc(t.notes||'')}</textarea></label>`,
  (v,f)=>{v.deps=[...f.querySelector('[name=deps]').selectedOptions].map(o=>o.value);const st=v.status;delete v.status;
    if(isNew){t={...t,...v,id:uid(),created:TODAY(),status:'todo'};D.tasks.push(t)}else Object.assign(t,v);
    if(st==='waiting'&&t.status!=='waiting')t.waitingSince=TODAY();setStatus(t,st)},isNew?null:()=>{D.tasks=D.tasks.filter(x=>x.id!==t.id);D.tasks.forEach(x=>x.deps=(x.deps||[]).filter(d=>d!==t.id))})};
window.editProject=(p)=>{const isNew=!p;p=p||{stage:'Планирование',healthMode:'auto',progressMode:'auto',milestones:[]};let ms=[...(p.milestones||[])];
  const msHTML=()=>ms.map((m,i)=>`<div class="ms"><input data-mn="${i}" value="${esc(m.name)}"><input type="date" data-md="${i}" value="${m.date||''}"><input type="checkbox" data-mc="${i}" ${m.done?'checked':''} title="Достигнута"><button type="button" class="ghost" data-mx="${i}">×</button></div>`).join('');
  dialog(`<h2 style="margin:0">${isNew?'Новый проект':'Проект'}</h2><label>Название<input name="name" required value="${esc(p.name||'')}"></label>
  <div class="f2"><label>Owner<input name="owner" value="${esc(p.owner||'')}"></label><label>Stage<select name="stage">${STAGE.map(s=>`<option ${s===p.stage?'selected':''}>${s}</option>`).join('')}</select></label>
  <label>Health<select name="health"><option value="auto" ${p.healthMode==='auto'?'selected':''}>Авто (по просрочкам и рискам)</option>${opt(HEALTH,p.healthMode==='auto'?'':p.health)}</select></label>
  <label>% выполнения (пусто — авто по задачам)<input type="number" min="0" max="100" name="progress" value="${p.progressMode==='manual'?p.progress:''}"></label>
  <label>Начало<input type="date" name="start" value="${p.start||''}"></label><label>Окончание<input type="date" name="end" value="${p.end||''}"></label></div>
  <label>Цель / желаемый результат<textarea name="goal">${esc(p.goal||'')}</textarea></label><label>Фактический результат<textarea name="result">${esc(p.result||'')}</textarea></label>
  <div><b>Вехи (milestones)</b><div id="msl" style="display:grid;gap:6px;margin:6px 0">${msHTML()}</div><button type="button" class="ghost" id="msa">+ Веха</button></div>`,
  v=>{const o={name:v.name,owner:v.owner,stage:v.stage,start:v.start,end:v.end,goal:v.goal,result:v.result,milestones:ms.filter(m=>m.name)};
    if(v.health==='auto'){o.healthMode='auto';o.health=''}else{o.healthMode='manual';o.health=v.health}if(v.progress===''){o.progressMode='auto'}else{o.progressMode='manual';o.progress=+v.progress}
    if(isNew)D.projects.push({id:uid(),created:TODAY(),...o});else Object.assign(p,o)},isNew?null:()=>{D.projects=D.projects.filter(x=>x.id!==p.id);D.tasks.forEach(t=>{if(t.projectId===p.id)t.projectId=''})});
  const box=$('#msl');box.oninput=box.onchange=e=>{const d=e.target.dataset;if(d.mn)ms[d.mn].name=e.target.value;if(d.md)ms[d.md].date=e.target.value;if(d.mc)ms[d.mc].done=e.target.checked};
  box.onclick=e=>{if(e.target.dataset.mx){ms.splice(+e.target.dataset.mx,1);box.innerHTML=msHTML()}};$('#msa').onclick=()=>{ms.push({id:uid(),name:'',date:'',done:false});box.innerHTML=msHTML()}};
window.editRisk=(r)=>{const isNew=!r;r=r||{prob:3,impact:3,status:'open'};const sc=[1,2,3,4,5].map(n=>`<option ${n==r.prob?'selected':''}>${n}</option>`).join(''),si=[1,2,3,4,5].map(n=>`<option ${n==r.impact?'selected':''}>${n}</option>`).join('');
  dialog(`<h2 style="margin:0">Риск</h2><label>Описание<input name="title" required value="${esc(r.title||'')}"></label><div class="f2"><label>Проект<select name="projectId">${popt(r.projectId)}</select></label><label>Owner<input name="owner" value="${esc(r.owner||'')}"></label>
  <label>Вероятность (1–5)<select name="prob">${sc}</select></label><label>Влияние (1–5)<select name="impact">${si}</select></label><label>Статус<select name="status">${opt({open:'Открыт',watch:'Мониторинг',closed:'Закрыт'},r.status)}</select></label><label>Дата пересмотра<input type="date" name="review" value="${r.review||''}"></label></div>
  <label>Митигация / план реагирования<textarea name="mitigation">${esc(r.mitigation||'')}</textarea></label>`,v=>{v.prob=+v.prob;v.impact=+v.impact;if(isNew)D.risks.push({id:uid(),created:TODAY(),...v});else Object.assign(r,v)},isNew?null:()=>D.risks=D.risks.filter(x=>x.id!==r.id))};
window.editMeeting=(m)=>{const isNew=!m;m=m||{date:TODAY()};
  dialog(`<h2 style="margin:0">Встреча</h2><div class="f2"><label>Тема<input name="title" required value="${esc(m.title||'')}"></label><label>Дата<input type="date" name="date" required value="${m.date}"></label><label>Проект<select name="projectId">${popt(m.projectId)}</select></label><label>Участники<input name="participants" value="${esc(m.participants||'')}"></label></div>
  <label>Заметки<textarea name="notes">${esc(m.notes||'')}</textarea></label><label>Решения<textarea name="decisions">${esc(m.decisions||'')}</textarea></label>
  <label>Новые задачи (по одной на строку: «задача | исполнитель | срок ГГГГ-ММ-ДД | ждём от»)<textarea name="actions" placeholder="Подготовить ТЗ | | 2026-10-15"></textarea></label>`,
  v=>{const acts=v.actions;delete v.actions;if(isNew){m={id:uid(),...v};D.meetings.push(m)}else Object.assign(m,v);
    (acts||'').split('\n').map(s=>s.trim()).filter(Boolean).forEach(l=>{const[a,b,c,w]=l.split('|').map(x=>(x||'').trim());D.tasks.push({id:uid(),title:a,assignee:b,projectId:m.projectId,status:w?'waiting':'todo',waitingFor:w,waitingSince:w?TODAY():'',due:c,priority:'P3',recur:'none',deps:[],meetingId:m.id,created:TODAY()})})},isNew?null:()=>D.meetings=D.meetings.filter(x=>x.id!==m.id))};

window.demo=()=>{if(D.tasks.length&&!confirm('Добавить демо-данные к существующим?'))return;const t=TODAY(),p1=uid(),p2=uid(),a=uid(),b=uid(),c=uid();
  D.projects.push({id:p1,name:'Внедрение мониторинга',owner:'А. Мурашкин',stage:'Исполнение',healthMode:'auto',progressMode:'auto',start:addD(t,-20),end:addD(t,40),goal:'Покрыть 100% критичных сервисов мониторингом, MTTR −30%',milestones:[{id:uid(),name:'Пилот завершён',date:addD(t,5),done:false},{id:uid(),name:'Тиражирование',date:addD(t,35),done:false}]},
   {id:p2,name:'Настройка SLA в JSM',owner:'Команда ITSM',stage:'Планирование',healthMode:'auto',progressMode:'auto',start:addD(t,-5),end:addD(t,25),goal:'SLA по всем типам заявок',milestones:[{id:uid(),name:'Согласование матрицы SLA',date:addD(t,7),done:false}]});
  D.tasks.push({id:a,title:'Собрать требования к алертам',projectId:p1,status:'done',priority:'P1',start:addD(t,-18),due:addD(t,-12),doneAt:addD(t,-11),expected:'Список алертов по сервисам',actual:'Согласовано 42 алерта',deps:[],created:addD(t,-20)},
   {id:b,title:'Настроить дашборды пилота',projectId:p1,status:'doing',priority:'P1',start:addD(t,-10),due:addD(t,-1),expected:'Дашборды для 5 сервисов',deps:[a],created:addD(t,-10)},
   {id:c,title:'Оценка ROI пилота',projectId:p1,status:'todo',priority:'P2',start:addD(t,1),due:addD(t,6),expected:'Бизнес-кейс для тиражирования',deps:[b],created:t},
   {id:uid(),title:'Получить доступы к Zabbix',projectId:p1,status:'waiting',waitingFor:'ИБ',waitingSince:addD(t,-3),priority:'P2',start:addD(t,-3),due:t,deps:[],created:addD(t,-3)},
   {id:uid(),title:'Статус-отчёт руководству',projectId:'',status:'todo',priority:'P2',recur:'weekly',start:t,due:t,expected:'Отчёт отправлен',deps:[],created:t},
   {id:uid(),title:'Матрица SLA по приоритетам',projectId:p2,status:'todo',priority:'P1',start:t,due:addD(t,4),deps:[],created:t},
   {id:uid(),title:'Изучить плагин Time to SLA',projectId:p2,status:'backlog',priority:'P4',deps:[],created:t});
  D.risks.push({id:uid(),title:'Задержка доступов от ИБ',projectId:p1,prob:4,impact:4,status:'open',owner:'А. Мурашкин',mitigation:'Эскалация через руководителя ИБ'});
  D.meetings.push({id:uid(),title:'Статус пилота',date:addD(t,-2),projectId:p1,participants:'ИТ, ИБ',notes:'Обсудили прогресс',decisions:'Расширить пилот на 2 сервиса'});save()};

if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
syncLabel();render();if(cfg.url&&navigator.onLine&&!dirty)pull();
$('#syncBtn').addEventListener('click',()=>cfg.url?(dirty?push():pull()):go('settings'));
$('#setBtn').addEventListener('click',()=>go('settings'));

/* ---------- массовое добавление и импорт ---------- */
function findProject(n){if(!n)return'';n=String(n).trim();let p=D.projects.find(x=>x.id===n||x.name.toLowerCase()===n.toLowerCase());if(!p){p={id:uid(),name:n,stage:'Планирование',healthMode:'auto',progressMode:'auto',milestones:[],created:TODAY()};D.projects.push(p)}return p.id}
const PRI=v=>{v=String(v||'').toUpperCase().trim();return/^P[1-4]$/.test(v)?v:'P3'};
function addTasks(list){let n=0;list.forEach(o=>{if(!o||!(o.title||o.Задача))return;const st=Object.keys(ST).includes(o.status)?o.status:'todo';
  D.tasks.push({id:uid(),title:o.title||o.Задача,projectId:findProject(o.project||o.Проект||o.projectId),assignee:o.assignee||o.Исполнитель||'',priority:PRI(o.priority||o.Приоритет),status:st,start:o.start||'',due:o.due||o.Срок||'',expected:o.expected||'',waitingFor:o.waitingFor||'',waitingSince:st==='waiting'?TODAY():'',recur:REC[o.recur]?o.recur:'none',notes:o.notes||'',deps:[],created:TODAY()});n++});return n}
window.bulkAdd=()=>{dialog(`<h2 style="margin:0">Добавить задачи списком</h2><label>Проект по умолчанию<select name="projectId">${popt(F.project)}</select></label>
  <label>Одна задача на строку: «задача | исполнитель | срок ГГГГ-ММ-ДД | приоритет P1–P4 | желаемый результат»<textarea name="lines" style="min-height:200px" placeholder="Подготовить ТЗ на дашборды | Иванов | 2026-10-20 | P1 | ТЗ согласовано"></textarea></label>
  <label>…или вставьте JSON-массив задач, который подготовил ассистент<textarea name="json" placeholder='[{"title":"...","project":"...","assignee":"...","due":"2026-10-20","priority":"P2"}]'></textarea></label>`,
  v=>{let list=v.lines.split('\n').map(x=>x.trim()).filter(Boolean).map(l=>{const[a,b,c,d,e]=l.split('|').map(x=>(x||'').trim());return{title:a.replace(/^[-*•\d.)\s]+/,''),assignee:b,due:c,priority:d,expected:e,project:v.projectId}});
    if(v.json.trim()){try{list=list.concat(JSON.parse(v.json))}catch(e){alert('JSON не распознан')}}alert('Добавлено задач: '+addTasks(list))})};
window.mergeJ=f=>f.text().then(t=>{const j=JSON.parse(t);if(Array.isArray(j))return(alert('Добавлено задач: '+addTasks(j)),save());
  ['projects','tasks','risks','meetings','reviews'].forEach(k=>(j[k]||[]).forEach(x=>{const i=D[k].findIndex(y=>y.id===x.id);if(i>=0)D[k][i]=x;else D[k].push(x)}));save()});
// входящие задачи, добавленные извне в лист inbox
function takeInbox(j){j.inbox=(j.inbox||[]).filter(x=>!(cfg.taken||[]).includes(String(x.id)));if(j.inbox.length){cfg.taken=[...new Set([...(cfg.taken||[]),...j.inbox.map(x=>String(x.id))])];saveCfg();const n=addTasks(j.inbox);if(n){save();setTimeout(()=>alert('Из входящих (лист inbox) добавлено задач: '+n),50)}}}

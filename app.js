import {readSnapshot, addDays, bangkokToday, HOUSE_TYPES, teamOverview} from './data.js';
const $ = id => document.getElementById(id);
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const number = n => n.toLocaleString('th-TH');
const displayDate = s => s ? new Intl.DateTimeFormat('th-TH',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(s+'T00:00:00Z')) : 'ยังไม่ระบุ';
let config, names, state = null, lastSuccess = null, busy = false, map, layer, selectedProvince = '', selectedTeam = '', timer, initialCalendarSet = false;
const fallbackGroups = [{id:'4200',label:'สำรวจภาคสนาม',target:4200},{id:'4900',label:'ติดตามฐานเดิม',target:4900}];
function teamColors() { return new Map((state?.assignments || []).map(a => [a.team,a.color])); }
function progressCard(label, count, target, note, milestoneStep = 0) {
  const card = el('article',undefined,`kpi${milestoneStep ? ' milestone-card' : ' month-card'}`);
  const head = el('div',undefined,'progress-heading');
  const title = el('div'); title.append(el('h2',label),el('span',count === null ? 'รอข้อมูลจากชีต' : `เก็บแล้ว ${number(count)} ชุด`,'progress-caption'));
  const total = el('div',undefined,'progress-total'); total.append(el('strong',`${count === null ? '—' : number(count)} / ${number(target)}`),el('span',`เป้าหมายปลายทาง ${number(target)} ชุด`));
  head.append(title,total);card.append(head);
  const track = el('div',undefined,'survey-track');
  track.setAttribute('role','progressbar');track.setAttribute('aria-label',label);track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax',String(target));
  if(count !== null) track.setAttribute('aria-valuenow',String(Math.min(count,target)));
  track.setAttribute('aria-valuetext',count === null ? 'ยังไม่มีข้อมูลที่อ่านสำเร็จ' : `เก็บแล้ว ${number(count)} จากเป้าหมาย ${number(target)} ชุด`);
  const fill=el('div',undefined,'survey-fill');fill.style.width=`${count === null ? 0 : Math.min(100,Math.max(0,count/target*100))}%`;track.append(fill);
  if(milestoneStep){
    const scale=el('div',undefined,'milestone-scale');scale.setAttribute('aria-hidden','true');
    scale.append(el('span','0','scale-start'));
    for(let value=milestoneStep;value<target;value+=milestoneStep){
      const reached=count !== null && count>=value;
      const tick=el('span',undefined,`milestone-tick${reached?' reached':''}`);tick.style.left=`${value/target*100}%`;tick.title=`เดือน ${value/milestoneStep} · เป้าสะสม ${number(value)} ชุด${reached?' · ถึงเป้าแล้ว':''}`;track.append(tick);
      if(target-value>=milestoneStep*.45){const label=el('span',number(value),'scale-label');label.append(el('small',`เดือน ${value/milestoneStep}`));label.style.left=`${value/target*100}%`;scale.append(label);}
    }
    const end=el('span',number(target),'scale-end');end.append(el('small',`เดือน ${target/milestoneStep}`));scale.append(end);card.append(track,scale);
  }else card.append(track);
  card.append(el('p',note)); return card;
}
function renderKpis() {
  const out = $('kpis'); out.replaceChildren();
  for (const g of [...(config?.groups || fallbackGroups)].sort((a,b)=>(a.id==='4900'?-1:1)-(b.id==='4900'?-1:1))) {
    const count = state ? state.surveys.filter(s => s.group === g.id).length : null;
    const note = g.id === '4200'
      ? 'ขีดเป้ารายเดือนสะสมทุก 600 ชุด · 7 เดือน รวม 4,200 ชุด'
      : 'เป้าโทรติดตาม 700 ชุดต่อเดือน · 7 เดือน รวม 4,900 ชุด';
    const title=g.id==='4900'?'โทรติดตามฐานเดิม':g.label;
    const card=progressCard(title,count,g.target,state ? note : `${note} · รอข้อมูลจากชีต`,g.id==='4900'?700:600);card.dataset.group=g.id;out.append(card);
  }
  renderMonthlyTargets(out);
}
let selectedTargetMonth=1;
function renderMonthlyTargets(out){
  const box=el('article',undefined,'monthly-panel');const head=el('div',undefined,'monthly-heading');head.append(el('div','เป้าหมายการจัดเก็บรายเดือน','monthly-title'));const label=el('label','ดูรอบงาน '),select=el('select');select.id='targetMonth';select.setAttribute('aria-label','เดือนเป้าหมาย');for(let m=1;m<=7;m++)select.add(new Option(`เดือนที่ ${m}`,String(m)));select.value=String(selectedTargetMonth);select.addEventListener('change',e=>{selectedTargetMonth=+e.target.value;renderKpis();});label.append(select);head.append(label);box.append(head);
  const first=config?.monthOne?.startDate,start=first?addDays(first,(selectedTargetMonth-1)*30):'',end=start?addDays(start,29):'';
  box.append(el('p',start?`${displayDate(start)} – ${displayDate(end)} · รอบละ 30 วันตามแผน 210 วัน`:'รอยืนยันวันเริ่มโครงการ','monthly-period'));
  const grid=el('div',undefined,'monthly-grid');for(const [group,title,target]of [['4900','โทรติดตามฐานเดิม',700],['4200','สำรวจภาคสนาม',600]]){
    const count=state&&start?state.surveys.filter(s=>s.group===group&&s.date>=start&&s.date<=end).length:null;
    const card=progressCard(title,count,target,count===null?'รอข้อมูลรายเดือน':count>=target?'ถึงเป้าหมายรายเดือนแล้ว':`เหลืออีก ${number(target-count)} ชุดเพื่อถึงเป้ารอบนี้`);card.dataset.group=group;grid.append(card);
  }box.append(grid);out.append(box);
}
function assignmentsFor(p) { return state?.assignments.filter(a => a.province === p) || []; }
function featureStyle(feature) {
  const p = names[feature.properties.name] || feature.properties.name, rows = assignmentsFor(p), teams = [...new Set(rows.map(a => a.team))];
  const matching=rows.find(a=>a.team===selectedTeam),dimmed=selectedTeam&&!matching;
  return {color:p === selectedProvince ? '#102d4d' : '#fff',weight:p === selectedProvince ? 3 : 1,fillColor:dimmed?'#dce3ea':matching?.color||(teams.length > 1 ? '#625785' : rows[0]?.color || '#cbd5e1'),fillOpacity:dimmed ? .25 : .9};
}
async function initMap() {
  if (!window.L) { $('mapStatus').textContent = 'โหลดแผนที่ไม่ได้ กรุณาใช้รายการเลือกจังหวัด (ข้อมูลส่วนอื่นยังใช้งานได้)'; return; }
  map = L.map('map',{zoomSnap:.25,maxZoom:12,minZoom:4}).setView([13.2,101],5);
  try {
    const r = await fetch('https://raw.githubusercontent.com/apisit/thailand.json/2c698dfab258ce534cd541a846f94e08c681d1a2/thailandWithName.json',{signal:AbortSignal.timeout(20000)});
    if (!r.ok) throw new Error('โหลดขอบเขตไม่สำเร็จ');
    const geo = await r.json();
    const provinces = geo.features?.map(f => names[f.properties?.name]);
    if (provinces?.length !== 77 || provinces.some(p => !p) || new Set(provinces).size !== 77) throw new Error('ขอบเขตจังหวัดไม่ครบ 77 จังหวัด');
    layer = L.geoJSON(geo,{style:featureStyle,onEachFeature:(f,l) => {
      const p = names[f.properties.name]; l.bindTooltip(el('span',p)); l.on('click',() => selectProvince(p));
    }}).addTo(map);map.setMaxBounds(layer.getBounds().pad(.2));fitTeamMap();
    $('mapStatus').textContent = 'แสดงเฉพาะประเทศไทย · เลือกทีมทางขวาเพื่อไฮไลท์พื้นที่ · คลิกจังหวัดเพื่อดูรายละเอียด';
  } catch (e) { $('mapStatus').textContent = `${e.message} · ใช้รายการเลือกจังหวัดได้ ระบบจะไม่สร้างขอบเขตจำลอง`; }
}
function selectProvince(p) {
  if(selectedTeam&&!assignmentsFor(p).some(a=>a.team===selectedTeam))selectTeam('');
  selectedProvince = p; $('provinceSelect').value = p; layer?.setStyle(featureStyle); renderProvince();
}
function fitTeamMap(){
  if(!layer||!map)return;
  const matches=layer.getLayers().filter(l=>!selectedTeam||assignmentsFor(names[l.feature.properties.name]).some(a=>a.team===selectedTeam));
  const bounds=matches.length?L.featureGroup(matches).getBounds():layer.getBounds();map.fitBounds(bounds,{padding:[18,18],maxZoom:8});
}
function selectTeam(team){
  selectedTeam=team;$('teamFilter').value=team;
  if(selectedProvince&&team&&!assignmentsFor(selectedProvince).some(a=>a.team===team)){
    selectedProvince='';$('provinceSelect').value='';$('provinceDetails').replaceChildren(el('h2','รายละเอียดจังหวัด'),el('p','เลือกจังหวัดของทีมบนแผนที่หรือตารางด้านล่าง'));
  }
  renderLegend();renderTeamReport();renderCalendar();renderProvince();layer?.setStyle(featureStyle);fitTeamMap();
}
function renderProvince() {
  if (!selectedProvince) return;
  const out = $('provinceDetails'); out.replaceChildren(el('h2',selectedProvince));
  if (!state) { out.append(el('p','ยังไม่มีข้อมูลจากชีต จึงยังสรุปจำนวนและแผนงานไม่ได้')); return; }
  const surveys = state.surveys.filter(s => s.province === selectedProvince&&(!selectedTeam||s.team===selectedTeam));
  for (const group of config.groups) {
    out.append(el('h3',`${group.label}: ${number(surveys.filter(s => s.group === group.id).length)} ชุด`));
    const counts = new Map(); for (const s of surveys.filter(s => s.group === group.id)) counts.set(s.type,(counts.get(s.type)||0)+1);
    if (!counts.size) out.append(el('p','ยังไม่มีแบบสอบถามในชีต','muted'));
    else { const table = el('table'); const head = el('tr'); head.append(el('th','ประเภท'),el('th','จำนวน')); const thead = el('thead'); thead.append(head); table.append(thead); const body = el('tbody'); for (const [type,count] of counts) { const tr=el('tr');tr.append(el('td',type),el('td',number(count)));body.append(tr); } table.append(body);out.append(table); }
  }
  const assignments = assignmentsFor(selectedProvince).filter(a=>!selectedTeam||a.team===selectedTeam);
  if (!assignments.length) out.append(el('p','ยังไม่มีแผนลงพื้นที่ในชีต'));
  for (const a of assignments) {
    const box = el('div',undefined,'assignment');box.append(el('h3',a.team));
    const dl = el('dl');
    for (const [label,value] of [['เริ่มลงพื้นที่',a.start],['สิ้นสุดตามแผน',a.end],['เก็บเสร็จจริง',a.completed],[a.plannedDeadline ? 'กำหนดคีย์ (คาดการณ์)' : 'คีย์ภายใน (+7 วัน)',a.deadline],['คีย์เสร็จจริง',a.keyed]]) dl.append(el('dt',label),el('dd',displayDate(value)));
    box.append(dl);out.append(box);
  }
}
function renderLegend() {
  const out = $('legend'), filter = $('teamFilter'), current = filter.value; out.replaceChildren(); filter.replaceChildren(new Option('ทุกทีม',''));
  const all=el('button','แสดงทุกทีม','team-choice all-teams');all.type='button';all.setAttribute('aria-pressed',String(!selectedTeam));all.addEventListener('click',()=>selectTeam(''));out.append(all);
  for (const [name,color] of [...teamColors()].sort(([a],[b])=>a.localeCompare(b,'th'))) {
    const row = el('button',undefined,'team team-choice'), swatch = el('span',undefined,'swatch');row.type='button';row.dataset.team=name;row.setAttribute('aria-pressed',String(selectedTeam===name));swatch.style.backgroundColor=color;
    const label=el('span',name);const count=state?.surveys.filter(s=>s.team===name).length||0;row.append(swatch,label,el('span',`${number(count)} ชุด`,'team-count'));row.addEventListener('click',()=>selectTeam(name));out.append(row);filter.add(new Option(name,name));
  }
  if (!teamColors().size) out.append(el('p',state ? 'ยังไม่มีทีมในชีต' : 'รอข้อมูลทีมจาก Google Sheets','muted'));
  if ([...filter.options].some(o=>o.value===current)) filter.value=current;
  if (state?.shared.length) out.append(el('p',`จังหวัดที่มีหลายทีม: ${state.shared.join(', ')} (ดูรายละเอียดแต่ละทีมได้)`,'muted'));
}
function renderTeamReport(){
  $('teamReportTitle').textContent=selectedTeam||'ภาพรวมทุกทีม';const table=$('teamProvinceTable');table.replaceChildren();
  if(!state){$('teamReportTotal').textContent='รอข้อมูลจากชีต';return;}
  const all=teamOverview(state,selectedTeam),group=$('reportGroup').value,report=teamOverview(state,selectedTeam,group);
  $('teamReportTotal').textContent=`${number(all.rows.length)} จังหวัด · เก็บรวม ${number(all.total)} ชุด · ฐานเดิม ${number(all.existing)} · ภาคสนาม ${number(all.field)}${state.hasDemo?' · ข้อมูลทดลอง':''}`;
  const heads=['จังหวัด',...HOUSE_TYPES,'รวม (ชุด)','เริ่มเก็บ','เก็บเสร็จ','กำหนดคีย์ (+7 วัน)','คีย์เสร็จจริง'];
  const header=el('tr');for(const h of heads){const cell=el('th',h);cell.scope='col';header.append(cell);}const thead=el('thead');thead.append(header);table.append(thead);const body=el('tbody');
  for(const row of report.rows){
    const tr=el('tr'),province=el('td'),button=el('button',row.province,'province-link');button.addEventListener('click',()=>selectProvince(row.province));province.append(button);if(row.rounds>1)province.append(el('small',`${row.rounds} รอบ`));tr.append(province);
    for(const count of [...row.counts,row.total])tr.append(el('td',number(count),'number-cell'));
    tr.append(el('td',displayDate(row.start)),el('td',row.completed?displayDate(row.completed):`ยังไม่เสร็จ · แผน ${displayDate(row.end)}`),el('td',`${displayDate(row.deadline)}${row.planned?' (คาดการณ์)':''}`),el('td',row.keyed?`${displayDate(row.keyed)}${row.keyed>row.deadline?' · เกินกำหนด':''}`:'ยังไม่คีย์เสร็จ'));
    if(row.other){tr.cells[6].title=`รวมประเภทที่ยังไม่จำแนก ${row.other} ชุด`;tr.cells[6].append(el('small',`ยังไม่จำแนก ${number(row.other)}`));}body.append(tr);
  }
  table.append(body);const sums=HOUSE_TYPES.map((_,i)=>report.rows.reduce((sum,r)=>sum+r.counts[i],0));const total=el('tr');total.append(el('th','รวม'));for(const n of [...sums,report.total])total.append(el('td',number(n),'number-cell'));const rest=el('td','จำนวนแบบสอบถาม ไม่ใช่จำนวนบ้านไม่ซ้ำ');rest.colSpan=4;total.append(rest);const foot=el('tfoot');foot.append(total);table.append(foot);
}
function showPage(name) {
  $('mapPage').hidden = name !== 'map';$('timelinePage').hidden = name !== 'timeline';
  $('mapTab').setAttribute('aria-pressed',String(name==='map'));$('timelineTab').setAttribute('aria-pressed',String(name==='timeline'));
  if (name==='map') requestAnimationFrame(()=>map?.invalidateSize());
}
function eventButton(a,deadline=false) {
  const b = el('button',`${deadline ? (a.plannedDeadline?'ส่ง (คาดการณ์)':'ส่งภายใน'):'ลงพื้นที่'} · ${a.team} · ${a.province}`,`event${deadline?' deadline':''}`);
  if (!deadline) b.style.borderLeftColor=a.color;
  b.addEventListener('click',()=>{selectProvince(a.province);showPage('map');$('provinceDetails').scrollIntoView({behavior:'smooth',block:'start'});}); return b;
}
function renderCalendar() {
  const grid=$('calendar'), list=$('scheduleList');grid.replaceChildren();list.replaceChildren();
  const month=$('month').value;if(!/^\d{4}-\d{2}$/.test(month))return;
  const [y,m]=month.split('-').map(Number), days=new Date(Date.UTC(y,m,0)).getUTCDate(), offset=new Date(Date.UTC(y,m-1,1)).getUTCDay();
  const rows=state?.assignments.filter(a=>!$('teamFilter').value||a.team===$('teamFilter').value)||[];
  for(const day of ['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'])grid.append(el('div',day,'dayHead'));
  for(let i=0;i<offset;i++)grid.append(el('div',undefined,'day empty'));
  for(let d=1;d<=days;d++){
    const date=`${month}-${String(d).padStart(2,'0')}`, cell=el('div',undefined,`day${date===bangkokToday()?' today':''}`);cell.append(el('div',String(d),'dayNum'));
    for(const a of rows){if(date>=a.start&&date<=(a.completed||a.end))cell.append(eventButton(a));if(date===a.deadline)cell.append(eventButton(a,true));}grid.append(cell);
  }
  const visible=rows.filter(a=>(a.start<=`${month}-${days}`&&(a.completed||a.end)>=`${month}-01`)||a.deadline.startsWith(month)).sort((a,b)=>a.start.localeCompare(b.start));
  if(!visible.length)list.append(el('p',state?'ไม่มีแผนลงพื้นที่หรือกำหนดส่งในเดือนนี้':'รอเชื่อมต่อชีตแผนลงพื้นที่'));
  for(const a of visible){const row=el('div',undefined,'schedule');row.append(el('strong',`${a.team} · ${a.province}`),el('p',`${displayDate(a.start)} – ${displayDate(a.completed||a.end)}${a.completed?' (เสร็จจริง)':' (ตามแผน)'} · ส่งภายใน ${displayDate(a.deadline)}${a.plannedDeadline?' (คาดการณ์)':''}`));list.append(row);}
}
function render(){renderKpis();renderLegend();renderProvince();renderTeamReport();renderCalendar();layer?.setStyle(featureStyle);$('demoNotice').hidden=!state?.hasDemo;}
async function refresh(){
  if(busy)return;busy=true;$('refresh').disabled=true;$('syncStatus').textContent='กำลังอ่านข้อมูลทุกชีต…';
  try{
    // Reload configuration so connection changes are picked up without rebuilding.
    const r=await fetch('./config.json',{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('อ่าน config.json ไม่สำเร็จ');
    const nextConfig=await r.json();
    // Labels/targets are useful before the empty spreadsheet is connected.
    if(!state)config=nextConfig;
    const next=await readSnapshot(nextConfig,names);config=nextConfig;state=next;lastSuccess=new Date();
    if(selectedTeam&&!teamColors().has(selectedTeam))selectedTeam='';
    if(!initialCalendarSet&&state.assignments.length){initialCalendarSet=true;const first=state.assignments.map(a=>a.start).sort()[0].slice(0,7);if($('month').value<first)$('month').value=first;}
    $('syncStatus').parentElement.classList.remove('error');
    $('syncStatus').textContent=`อ่านชีตสำเร็จ ${new Intl.DateTimeFormat('th-TH',{dateStyle:'short',timeStyle:'medium',timeZone:'Asia/Bangkok'}).format(lastSuccess)} · ${number(state.surveys.length)} แบบสอบถาม · อ่านใหม่ทุก ${config.refreshSeconds} วินาที (อาจมีความหน่วงจาก Google / Zoho)`;
  }catch(e){
    $('syncStatus').parentElement.classList.add('error');
    $('syncStatus').textContent=`${e.message} · ${lastSuccess?`กำลังแสดงข้อมูลเดิม ณ ${new Intl.DateTimeFormat('th-TH',{timeStyle:'medium',timeZone:'Asia/Bangkok'}).format(lastSuccess)} ซึ่งอาจล้าสมัย`:'ยังไม่แสดงยอดจริง กรุณาตั้งค่าชีตตามคู่มือ'}`;
  }finally{
    if(config?.sheetEditUrl){try{const u=new URL(config.sheetEditUrl);if(u.origin==='https://docs.google.com'&&u.pathname.startsWith('/spreadsheets/d/')){$('editSheet').href=u.href;$('editSheet').hidden=false;}}catch{}}
    render();busy=false;$('refresh').disabled=false;clearTimeout(timer);timer=setTimeout(refresh,Math.max(30,Math.min(3600,Number(config?.refreshSeconds)||60))*1000);
  }
}
async function start(){
  $('month').value=bangkokToday().slice(0,7);
  $('mapTab').addEventListener('click',()=>showPage('map'));$('timelineTab').addEventListener('click',()=>showPage('timeline'));
  $('provinceSelect').addEventListener('change',e=>{if(e.target.value)selectProvince(e.target.value);});$('teamFilter').addEventListener('change',e=>selectTeam(e.target.value));$('month').addEventListener('change',renderCalendar);$('reportGroup').addEventListener('change',renderTeamReport);
  for(const [id,step] of [['prevMonth',-1],['nextMonth',1]])$(id).addEventListener('click',()=>{const [y,m]=$('month').value.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+step,1));$('month').value=d.toISOString().slice(0,7);renderCalendar();});
  $('refresh').addEventListener('click',refresh);renderKpis();renderCalendar();
  try{const r=await fetch('./provinces.json');if(!r.ok)throw new Error('อ่านรายชื่อจังหวัดไม่สำเร็จ');names=await r.json();for(const p of [...new Set(Object.values(names))].sort((a,b)=>a.localeCompare(b,'th')))$('provinceSelect').add(new Option(p,p));initMap();await refresh();}
  catch(e){$('syncStatus').textContent=e.message;}
}
start();

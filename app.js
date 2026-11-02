import {readSnapshot, monthOneCount, bangkokToday} from './data.js';
const $ = id => document.getElementById(id);
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const number = n => n.toLocaleString('th-TH');
const displayDate = s => s ? new Intl.DateTimeFormat('th-TH',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(s+'T00:00:00Z')) : 'ยังไม่ระบุ';
let config, names, state = null, lastSuccess = null, busy = false, map, layer, selectedProvince = '', timer;
const fallbackGroups = [{id:'4200',label:'สำรวจภาคสนาม',target:4200},{id:'4900',label:'ติดตามฐานเดิม',target:4900}];
function teamColors() { return new Map((state?.assignments || []).map(a => [a.team,a.color])); }
function progressCard(label, count, target, note) {
  const card = el('article',undefined,'kpi'); card.append(el('h2',label),el('strong',`${count === null ? '—' : number(count)} / ${number(target)}`));
  const p = el('progress'); p.max = target; p.value = count === null ? 0 : Math.min(count,target); p.setAttribute('aria-label',label); if (count === null) p.hidden = true;
  card.append(p,el('p',note)); return card;
}
function renderKpis() {
  const out = $('kpis'); out.replaceChildren();
  for (const g of config?.groups || fallbackGroups) {
    const count = state ? state.surveys.filter(s => s.group === g.id).length : null;
    out.append(progressCard(g.label,count,g.target,state ? 'จำนวนแบบสอบถามในชีต (ยังไม่ใช่ยอดรับรองคุณภาพ)' : 'ยังไม่มีข้อมูลที่อ่านและตรวจรูปแบบสำเร็จ'));
  }
  const m = config?.monthOne || {target:600}, count = state && m.groupIds ? monthOneCount(state.surveys,m) : null;
  out.append(progressCard('เป้าเดือนที่ 1',count,600,m.startDate && m.endDate ? `${displayDate(m.startDate)} – ${displayDate(m.endDate)} · นับตามวันที่เก็บ` : 'รอยืนยันวันเริ่มโครงการและช่วงเดือนที่ 1 · เป้าแสดงเพื่อวางแผน'));
}
function assignmentsFor(p) { return state?.assignments.filter(a => a.province === p) || []; }
function featureStyle(feature) {
  const p = names[feature.properties.name] || feature.properties.name, rows = assignmentsFor(p), teams = [...new Set(rows.map(a => a.team))];
  return {color:p === selectedProvince ? '#102d4d' : '#fff',weight:p === selectedProvince ? 3 : 1,fillColor:teams.length > 1 ? '#625785' : rows[0]?.color || '#cbd5e1',fillOpacity:0.78};
}
async function initMap() {
  if (!window.L) { $('mapStatus').textContent = 'โหลดแผนที่ไม่ได้ กรุณาใช้รายการเลือกจังหวัด (ข้อมูลส่วนอื่นยังใช้งานได้)'; return; }
  map = L.map('map').setView([13.2,101],5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:12}).addTo(map);
  try {
    const r = await fetch('https://raw.githubusercontent.com/apisit/thailand.json/2c698dfab258ce534cd541a846f94e08c681d1a2/thailandWithName.json',{signal:AbortSignal.timeout(20000)});
    if (!r.ok) throw new Error('โหลดขอบเขตไม่สำเร็จ');
    const geo = await r.json();
    const provinces = geo.features?.map(f => names[f.properties?.name]);
    if (provinces?.length !== 77 || provinces.some(p => !p) || new Set(provinces).size !== 77) throw new Error('ขอบเขตจังหวัดไม่ครบ 77 จังหวัด');
    layer = L.geoJSON(geo,{style:featureStyle,onEachFeature:(f,l) => {
      const p = names[f.properties.name]; l.bindTooltip(el('span',p)); l.on('click',() => selectProvince(p));
    }}).addTo(map); map.fitBounds(layer.getBounds(),{padding:[10,10]});
    $('mapStatus').textContent = 'คลิกจังหวัดเพื่อดูยอดและวันลงพื้นที่ · สีเทา = ยังไม่มีทีม · สีม่วง = มีมากกว่าหนึ่งทีม';
  } catch (e) { $('mapStatus').textContent = `${e.message} · ใช้รายการเลือกจังหวัดได้ ระบบจะไม่สร้างขอบเขตจำลอง`; }
}
function selectProvince(p) {
  selectedProvince = p; $('provinceSelect').value = p; layer?.setStyle(featureStyle); renderProvince();
}
function renderProvince() {
  if (!selectedProvince) return;
  const out = $('provinceDetails'); out.replaceChildren(el('h2',selectedProvince));
  if (!state) { out.append(el('p','ยังไม่มีข้อมูลจากชีต จึงยังสรุปจำนวนและแผนงานไม่ได้')); return; }
  const surveys = state.surveys.filter(s => s.province === selectedProvince);
  for (const group of config.groups) {
    out.append(el('h3',`${group.label}: ${number(surveys.filter(s => s.group === group.id).length)} ชุด`));
    const counts = new Map(); for (const s of surveys.filter(s => s.group === group.id)) counts.set(s.type,(counts.get(s.type)||0)+1);
    if (!counts.size) out.append(el('p','ยังไม่มีแบบสอบถามในชีต','muted'));
    else { const table = el('table'); const head = el('tr'); head.append(el('th','ประเภท'),el('th','จำนวน')); const thead = el('thead'); thead.append(head); table.append(thead); const body = el('tbody'); for (const [type,count] of counts) { const tr=el('tr');tr.append(el('td',type),el('td',number(count)));body.append(tr); } table.append(body);out.append(table); }
  }
  const assignments = assignmentsFor(selectedProvince);
  if (!assignments.length) out.append(el('p','ยังไม่มีแผนลงพื้นที่ในชีต'));
  for (const a of assignments) {
    const box = el('div',undefined,'assignment');box.append(el('h3',a.team));
    const dl = el('dl');
    for (const [label,value] of [['เริ่มลงพื้นที่',a.start],['สิ้นสุดตามแผน',a.end],['เสร็จจริง',a.completed],[a.plannedDeadline ? 'กำหนดส่ง (คาดการณ์)' : 'ส่งภายใน (+7 วัน)',a.deadline]]) dl.append(el('dt',label),el('dd',displayDate(value)));
    box.append(dl);out.append(box);
  }
}
function renderLegend() {
  const out = $('legend'), filter = $('teamFilter'), current = filter.value; out.replaceChildren(); filter.replaceChildren(new Option('ทุกทีม',''));
  for (const [name,color] of [...teamColors()].sort(([a],[b])=>a.localeCompare(b,'th'))) {
    const row = el('div',undefined,'team'), swatch = el('span',undefined,'swatch'); swatch.style.backgroundColor=color; row.append(swatch,el('span',name));out.append(row);filter.add(new Option(name,name));
  }
  if (!out.childNodes.length) out.append(el('p',state ? 'ยังไม่มีทีมในชีต' : 'รอข้อมูลทีมจาก Google Sheets','muted'));
  if ([...filter.options].some(o=>o.value===current)) filter.value=current;
  if (state?.shared.length) out.append(el('p',`จังหวัดที่มีหลายทีม: ${state.shared.join(', ')} (ดูรายละเอียดแต่ละทีมได้)`,'muted'));
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
function render(){renderKpis();renderLegend();renderProvince();renderCalendar();layer?.setStyle(featureStyle);}
async function refresh(){
  if(busy)return;busy=true;$('refresh').disabled=true;$('syncStatus').textContent='กำลังอ่านข้อมูลทุกชีต…';
  try{
    // Reload configuration so connection changes are picked up without rebuilding.
    const r=await fetch('./config.json',{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('อ่าน config.json ไม่สำเร็จ');
    const nextConfig=await r.json();
    // Labels/targets are useful before the empty spreadsheet is connected.
    if(!state)config=nextConfig;
    const next=await readSnapshot(nextConfig,names);config=nextConfig;state=next;lastSuccess=new Date();
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
  $('provinceSelect').addEventListener('change',e=>{if(e.target.value)selectProvince(e.target.value);});$('teamFilter').addEventListener('change',renderCalendar);$('month').addEventListener('change',renderCalendar);
  for(const [id,step] of [['prevMonth',-1],['nextMonth',1]])$(id).addEventListener('click',()=>{const [y,m]=$('month').value.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+step,1));$('month').value=d.toISOString().slice(0,7);renderCalendar();});
  $('refresh').addEventListener('click',refresh);renderKpis();renderCalendar();
  try{const r=await fetch('./provinces.json');if(!r.ok)throw new Error('อ่านรายชื่อจังหวัดไม่สำเร็จ');names=await r.json();for(const p of [...new Set(Object.values(names))].sort((a,b)=>a.localeCompare(b,'th')))$('provinceSelect').add(new Option(p,p));initMap();await refresh();}
  catch(e){$('syncStatus').textContent=e.message;}
}
start();

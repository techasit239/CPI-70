// All external values remain plain text. No evaluation, HTML templates or JSONP.
export function parseCsv(text) {
  if (/^\s*</.test(text)) throw new Error('ได้รับ HTML แทน CSV: ตรวจสิทธิ์และลิงก์ Publish to web');
  const rows = []; let row = [], field = '', quoted = false, closed = false;
  text = text.replace(/^\uFEFF/, '');
  const endField = () => { row.push(field); field = ''; closed = false; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += c;
    } else if (c === '"') {
      if (field || closed) throw new Error('CSV มีเครื่องหมายคำพูดผิดรูปแบบ');
      quoted = true;
    } else if (c === ',') endField();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endField(); if (row.some(v => v.trim())) rows.push(row); row = [];
    } else { if (closed) throw new Error('CSV มีข้อความหลังเครื่องหมายคำพูดปิด'); field += c; }
  }
  if (quoted) throw new Error('CSV มีเครื่องหมายคำพูดไม่ครบ');
  endField(); if (row.some(v => v.trim())) rows.push(row);
  if (!rows.length) throw new Error('CSV ไม่มีหัวคอลัมน์');
  const headers = rows.shift().map(v => v.trim());
  if (new Set(headers).size !== headers.length || headers.some(v => !v)) throw new Error('ชื่อคอลัมน์ว่างหรือซ้ำ');
  return { headers, rows: rows.map((values, i) => {
    if (values.length !== headers.length) throw new Error(`แถว ${i + 2}: จำนวนคอลัมน์ไม่ตรงหัวตาราง`);
    return Object.fromEntries(headers.map((h, j) => [h, values[j].trim()]));
  }) };
}
export function dateOnly(value, optional = false) {
  if (!value && optional) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`วันที่ต้องเป็น ค.ศ. YYYY-MM-DD: ${value}`);
  const d = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value || +value.slice(0, 4) < 2000 || +value.slice(0, 4) > 2100) throw new Error(`วันที่ไม่ถูกต้อง: ${value}`);
  return value;
}
export function addDays(value, days) { const d = new Date(dateOnly(value) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export function bangkokToday(now = new Date()) { return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Bangkok', year:'numeric', month:'2-digit', day:'2-digit'}).format(now); }
export function googleCsvUrl(value) {
  let u; try { u = new URL(value); } catch { throw new Error('ยังไม่ได้ตั้งค่าลิงก์ CSV ของ Google Sheets'); }
  if (u.protocol !== 'https:' || u.hostname !== 'docs.google.com' || u.username || u.password || u.port || !/^\/spreadsheets\/d\/(?:e\/)?[\w-]+\/(?:pub|export|gviz\/tq)$/.test(u.pathname)) throw new Error('ต้องใช้ลิงก์ CSV จาก docs.google.com/spreadsheets เท่านั้น');
  if (!(u.searchParams.get('output') === 'csv' || u.searchParams.get('format') === 'csv' || u.searchParams.get('tqx') === 'out:csv')) throw new Error('ลิงก์ต้องระบุ output=csv, format=csv หรือ tqx=out:csv');
  u.hash = ''; return u.href;
}
export function validateConfig(c) {
  if (!Array.isArray(c.groups) || c.groups.length !== 2 || c.groups.some(g => typeof g.id !== 'string' || !g.id || !g.label) || new Set(c.groups.map(g => g.id)).size !== 2 || c.groups[0].target !== 4200 || c.groups[1].target !== 4900) throw new Error('ตั้งค่ากลุ่มเป้าหมาย 4,200 และ 4,900 ไม่ถูกต้อง');
  googleCsvUrl(c.assignmentsCsvUrl);
  if (!Array.isArray(c.surveyCsvUrls) || !c.surveyCsvUrls.length) throw new Error('ยังไม่ได้ตั้งค่าชีตแบบสอบถาม');
  const urls = [c.assignmentsCsvUrl, ...c.surveyCsvUrls].map(googleCsvUrl);
  if (new Set(urls).size !== urls.length) throw new Error('ลิงก์ชีตซ้ำ');
  if (!Number.isFinite(c.refreshSeconds) || c.refreshSeconds < 30 || c.refreshSeconds > 3600) throw new Error('refreshSeconds ต้องอยู่ระหว่าง 30–3600');
  const m = c.monthOne;
  if (!m || m.target !== 600 || !Array.isArray(m.groupIds)) throw new Error('ตั้งค่าเป้าเดือนที่ 1 ไม่ถูกต้อง');
  const hasAny = m.startDate || m.endDate || m.groupIds.length;
  if (hasAny && (!dateOnly(m.startDate) || !dateOnly(m.endDate) || m.endDate < m.startDate || !m.groupIds.length || new Set(m.groupIds).size !== m.groupIds.length || m.groupIds.some(id => !c.groups.some(g => g.id === id)))) throw new Error('ระบุช่วงวันที่และกลุ่มที่นับ TOR เดือนที่ 1 ให้ครบ');
  return c;
}
function required(csv, columns) { for (const h of columns) if (!csv.headers.includes(h)) throw new Error(`ไม่พบคอลัมน์ ${h}`); }
function province(value, names) { const p = names[value] || value; if (!Object.values(names).includes(p)) throw new Error(`ไม่รู้จักจังหวัด: ${value}`); return p; }
export function normalizeAssignments(csv, names) {
  required(csv, ['team','province','start_date','end_date','completed_date','color']);
  const keys = new Set(), colors = new Map();
  return csv.rows.map(r => {
    if (!r.team) throw new Error('ชื่อทีมว่าง');
    const p = province(r.province, names), start = dateOnly(r.start_date), end = dateOnly(r.end_date), completed = dateOnly(r.completed_date, true);
    if (end < start || (completed && completed < start)) throw new Error(`วันเสร็จก่อนวันเริ่ม: ${r.team} / ${p}`);
    if (!/^#[0-9a-f]{6}$/i.test(r.color)) throw new Error(`สีทีมต้องเป็น #RRGGBB: ${r.team}`);
    const color = r.color.toLowerCase();
    if (colors.has(r.team) && colors.get(r.team) !== color) throw new Error(`ทีมเดียวกันต้องใช้สีเดียวกัน: ${r.team}`);
    colors.set(r.team, color);
    const key = JSON.stringify([r.team,p,start,end]); if (keys.has(key)) throw new Error(`แผนงานซ้ำ: ${r.team} / ${p}`); keys.add(key);
    return { team:r.team, province:p, start, end, completed, color, deadline:addDays(completed || end, 7), plannedDeadline:!completed };
  });
}
export function normalizeSurveys(csvs, names, groups) {
  const unique = new Map();
  for (const csv of csvs) {
    required(csv, ['response_id','team','province','group_id','type','collected_date']);
    for (const r of csv.rows) {
      if (!r.response_id || !r.team || !r.type || !groups.some(g => g.id === r.group_id)) throw new Error('แบบสอบถามต้องมี response_id, team, type และ group_id ที่ตรงการตั้งค่า');
      const item = { id:r.response_id, team:r.team, province:province(r.province, names), group:r.group_id, type:r.type, date:dateOnly(r.collected_date) };
      // Zoho response IDs may be unique only within one survey, hence group + ID.
      const key = JSON.stringify([item.group,item.id]);
      if (unique.has(key) && JSON.stringify(unique.get(key)) !== JSON.stringify(item)) throw new Error(`response_id ซ้ำแต่ข้อมูลขัดแย้ง: ${item.id}`);
      unique.set(key,item);
    }
  }
  return [...unique.values()];
}
export function snapshot(assignmentsCsv, surveyCsvs, names, config) {
  const assignments = normalizeAssignments(assignmentsCsv, names), surveys = normalizeSurveys(surveyCsvs, names, config.groups);
  for (const s of surveys) if (!assignments.some(a => a.province === s.province && a.team === s.team)) throw new Error(`แบบสอบถามไม่ตรงทีม/จังหวัดในชีตแผนงาน: ${s.team} / ${s.province}`);
  const teamsByProvince = new Map();
  for (const a of assignments) { if (!teamsByProvince.has(a.province)) teamsByProvince.set(a.province,new Set()); teamsByProvince.get(a.province).add(a.team); }
  return { assignments, surveys, shared: [...teamsByProvince].filter(([,teams]) => teams.size > 1).map(([p]) => p) };
}
export function monthOneCount(surveys, m) { if (!m.startDate || !m.endDate || !m.groupIds.length) return null; return surveys.filter(s => m.groupIds.includes(s.group) && s.date >= m.startDate && s.date <= m.endDate).length; }
export async function readSnapshot(config, names, fetcher = fetch) {
  validateConfig(config);
  const read = async url => {
    const response = await fetcher(googleCsvUrl(url), {cache:'no-store', signal:AbortSignal.timeout(20000), credentials:'omit'});
    if (!response.ok) throw new Error(`อ่านชีตไม่สำเร็จ (HTTP ${response.status})`);
    return parseCsv(await response.text());
  };
  // Publish one complete snapshot only after every source has passed validation.
  const [assignments, ...surveys] = await Promise.all([config.assignmentsCsvUrl, ...config.surveyCsvUrls].map(read));
  return snapshot(assignments, surveys, names, config);
}

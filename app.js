// ===== Queue‑Monitor Scheduler logic ===== //

/************ Helpers *************/
const toM = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fm  = m => `${String(Math.floor(m/60)).padStart(2, '0')}:${String(m%60).padStart(2, '0')}`;
const todayKey = () => new Date().toISOString().slice(0, 10);

/************ Default roster *************/
const DEFAULTS = [
  ['Anish','09:00','18:00'],['Ashish','07:30','16:30'],['Chetan','09:00','18:00'],
  ['Dany','07:30','16:30'], ['Franky','07:30','16:30'],['Kartik','07:30','16:30'],
  ['Priya','07:30','16:30'],['Rajni','09:00','18:00'], ['Sarthak','07:30','16:30'],
  ['Shalini','07:30','16:30'],['Tapaswini','13:00','21:00']
];

/************ DOM refs *************/
const formDiv   = document.getElementById('team-form');
const addBtn    = document.getElementById('add-member');
const genBtn    = document.getElementById('generate');
const copyBtn   = document.getElementById('copy-table');
const saveBtn   = document.getElementById('save-day');
const histSel   = document.getElementById('history-select');
const icsBtn    = document.getElementById('export-ics');
const xlsxBtn   = document.getElementById('export-xlsx');
const pdfBtn    = document.getElementById('export-pdf');

/************ Roster builder *************/
function makeRow([name,start,end] = ['', '09:00', '17:00']) {
  const row = document.createElement('div');
  row.className = 'member-row';
  row.innerHTML = `
    <label><input type="checkbox" class="avail" checked></label>
    <input class="pname" style="width:120px" value="${name}" placeholder="Name">
    Start: <input type="time" class="pstart"  value="${start}">
    End:   <input type="time" class="pend"    value="${end}">
  `;
  // Drag‑&‑drop
  row.draggable = true;
  row.ondragstart = e => { e.dataTransfer.effectAllowed = 'move'; window._drag = row; row.classList.add('dragging'); };
  row.ondrop      = () => { const d = window._drag; if (d && d !== row) formDiv.insertBefore(d, row.nextSibling); row.classList.remove('over'); };
  row.ondragover  = e => { e.preventDefault(); row.classList.add('over'); };
  row.ondragleave = () => row.classList.remove('over');
  row.ondragend   = () => { row.classList.remove('dragging'); document.querySelectorAll('.over').forEach(el => el.classList.remove('over')); };
  formDiv.insertBefore(row, addBtn);
}
DEFAULTS.forEach(d => makeRow(d));
addBtn.onclick = () => makeRow();

/************ Build schedule *************/
let rotateIdx = 0;
function buildSchedule() {
  const roster = [ ...document.querySelectorAll('.member-row') ]
    .filter(r => r.querySelector('.avail').checked)
    .map(r => ({
      name:  r.querySelector('.pname').value.trim() || 'Unnamed',
      start: toM(r.querySelector('.pstart').value),
      end:   toM(r.querySelector('.pend').value)
    }));
  if (!roster.length) { alert('No available members'); return null; }

  // Order
  const order = (document.getElementById('order-mode').value === 'random')
    ? roster.sort(() => Math.random() - 0.5)
    : (() => { const rot = rotateIdx++ % roster.length; return roster.slice(rot).concat(roster.slice(0, rot)); })();

  const morningLen   = +document.getElementById('morning-len' ).value || 6;
  const afternoonLen = +document.getElementById('afternoon-len').value || 15;
  const strategy     = document.getElementById('strategy-mode').value;

  const earliest = Math.min(...roster.map(r => r.start));
  const latest   = Math.max(...roster.map(r => r.end));

  const totals = Object.fromEntries(roster.map(r => [r.name, 0]));
  const sched  = [];
  let idx = 0, cur = earliest;
  while (cur < latest) {
    const slot = cur < 720 ? morningLen : afternoonLen;
    const can  = order.filter(p => p.start <= cur && p.end >= cur + slot);
    if (!can.length) { cur = Math.min(...roster.filter(p => p.start > cur).map(p => p.start).concat([latest])); continue; }

    let chosen;
    if (strategy === 'round') {
      chosen = can.find(p => p === order[idx % order.length]) || can[0];
      idx = (order.indexOf(chosen) + 1) % order.length;
    } else {
      chosen = can.sort((a,b) => totals[a.name] - totals[b.name] || order.indexOf(a) - order.indexOf(b))[0];
    }
    sched.push({ name: chosen.name, start: cur, end: cur + slot, duration: slot });
    totals[chosen.name] += slot;
    cur += slot;
  }
  return sched;
}

/************ Render *************/
let current = [];
function render(sched) {
  current = sched;
  // next/summary/per‑times
  const next = {}, summary = {}, per = {};
  sched.forEach((s,i) => {
    if (next[s.name] != null) sched[next[s.name]].next = fm(s.start);
    next[s.name] = i; s.next = '-';
    summary[s.name] = summary[s.name] || { c:0, m:0 }; summary[s.name].c++; summary[s.name].m += s.duration;
    (per[s.name] ||= []).push(fm(s.start));
  });
  // table body
  const tbody = document.querySelector('#schedule-table tbody'); tbody.innerHTML = '';
  sched.forEach((s,i) => {
    if (i && s.start > sched[i-1].end) {
      const g = document.createElement('tr'); g.className='gap-row'; g.innerHTML=`<td colspan=5>*** GAP ${fm(sched[i-1].end)}‑${fm(s.start)} ***</td>`; tbody.appendChild(g);
    }
    const tr = document.createElement('tr'); tr.innerHTML = `<td>${s.name}</td><td>${fm(s.start)}</td><td>${fm(s.end)}</td><td>${s.duration}</td><td>${s.next}</td>`; tbody.appendChild(tr);
  });
  // summary
  const sb = document.querySelector('#summary-table tbody'); sb.innerHTML = '';
  Object.keys(summary).sort().forEach(n => { const tr = document.createElement('tr'); tr.innerHTML = `<td>${n}</td><td>${summary[n].c}</td><td>${summary[n].m}</td>`; sb.appendChild(tr); });
  // shift list
  const st = document.getElementById('shift-times'); st.innerHTML = '';
  const ul = document.createElement('ul'); Object.keys(per).sort().forEach(n => { const li = document.createElement('li'); li.textContent = `${n}: ${per[n].join(', ')}`; ul.appendChild(li); }); st.appendChild(ul);
  // pipe/text toggle
  const pipe = document.getElementById('pipe-output');
  if (document.getElementById('output-mode').value === 'table') {
    document.getElementById('schedule-table').style.display=''; pipe.style.display='none'; copyBtn.style.display='inline-block';
  } else {
    document.getElementById('schedule-table').style.display='none'; copyBtn.style.display='none'; pipe.style.display='block';
    pipe.textContent = sched.map(s => `${s.name}|${fm(s.start)}|${fm(s.end)}|${s.duration}|${s.next}`).join('\n');
  }
  // enable extras
  [saveBtn, icsBtn, xlsxBtn, pdfBtn].forEach(b => b.disabled = false);
}

genBtn.onclick = () => { const s = buildSchedule(); if (s) render(s); };
copyBtn.onclick = () => {
  const txt = [...document.querySelectorAll('#schedule-table tr')].map(r => [...r.children].map(c => c.textContent).join('\t')).join('\n');
  navigator.clipboard.writeText(txt).then(() => alert('Copied'));
};

/************ Persistence *************/
function refreshHistory() {
  histSel.innerHTML='<option value="">Load previous…</option>';
  Object.keys(localStorage).filter(k=>k.startsWith('sched-')).sort().forEach(k=>{
    const opt=document.createElement('option'); opt.value=k; opt.textContent=k.slice(6); histSel.appendChild(opt);
  });
}
refreshHistory();

saveBtn.onclick = () => { localStorage.setItem(`sched-${todayKey()}`, JSON.stringify(current)); refreshHistory(); alert('Saved'); };
histSel.onchange = e => {
  const data = JSON.parse(localStorage.getItem(e.target.value)||'[]'); if (!data.length) return;
  render(data);
};

/************ Exports *************/
icsBtn.onclick = () => {
  const cal = new ics();
  current.forEach((s,i) => {
    const d = new Date(); d.setHours(Math.floor(s.start/60), s.start%60, 0, 0);
    const e = new Date(); e.setHours(Math.floor(s.end/60),   s.end%60,   0, 0);
    cal.addEvent(`${s.name} queue`, `Shift ${i+1}`, '', d, e);
  });
  cal.download(`queue-${todayKey()}`);
};

xlsxBtn.onclick = () => {
  const ws = XLSX.utils.json_to_sheet(current.map(s => ({Person:s.name,Start:fm(s.start),End:fm(s.end),Minutes:s.duration})));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Schedule'); XLSX.writeFile(wb, `queue-${todayKey()}.xlsx`);
};

pdfBtn.onclick = async () => {
  const { jsPDF } = window.jspdf; const doc = new jsPDF(); doc.text(`Queue Schedule ${todayKey()}`, 14, 14);
  let y = 24; current.forEach(s => { doc.text(`${s.name}  ${fm(s.start)}-${fm

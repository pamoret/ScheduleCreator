// ===== multi-team Queue Monitor (non-overlap exports) =====

// ---------- helpers ----------
const toM = t => { const [h,m]=t.split(':').map(Number); return h*60+m };
const fm  = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
const todayKey = () => new Date().toISOString().slice(0,10);

// ---------- DOM refs ----------
const $ = id => document.getElementById(id);
const mgrSel=$('manager-select'), addBtn=$('add-member'), formDiv=$('team-form');
const genBtn=$('generate'), copyBtn=$('copy-table');
const saveBtn=$('save-day'), icsBtn=$('export-ics'), xlsxBtn=$('export-xlsx'), pdfBtn=$('export-pdf');
const loadInp=$('load-day');

// ---------- team data fetch ----------
let TEAM_DATA={};
fetch('teams.json')
  .then(r=>r.json())
  .then(json=>{
    TEAM_DATA=json;
    Object.keys(TEAM_DATA).sort().forEach(m=>{
      const opt=document.createElement('option'); opt.value=m; opt.textContent=m; mgrSel.appendChild(opt);
    });
  });

// ---------- row helpers ----------
function clearRows(){document.querySelectorAll('.member-row').forEach(r=>r.remove());}
function makeRow([name,s,e]=['','09:00','17:00']){
  const row=document.createElement('div'); row.className='member-row';
  row.innerHTML=`<label><input type="checkbox" class="avail" checked></label>
    <input class="pname" style="width:120px" value="${name}" placeholder="Name">
    Start:<input type="time" class="pstart" value="${s}">
    End:<input type="time"   class="pend"  value="${e}">`;
  row.draggable=true;
  row.ondragstart=ev=>{window._drag=row;row.classList.add('dragging');ev.dataTransfer.effectAllowed='move';};
  row.ondrop=()=>{const d=window._drag;if(d&&d!==row)formDiv.insertBefore(d,row.nextSibling);row.classList.remove('over');};
  row.ondragover=e=>{e.preventDefault();row.classList.add('over')};
  row.ondragleave=()=>row.classList.remove('over');
  row.ondragend=()=>{row.classList.remove('dragging');document.querySelectorAll('.over').forEach(el=>el.classList.remove('over'))};
  formDiv.insertBefore(row,addBtn);
}
addBtn.onclick=()=>makeRow();

// ---------- load selected team ----------
mgrSel.onchange=e=>{
  clearRows();
  const team=TEAM_DATA[e.target.value]||[];
  team.forEach(makeRow);
};

// ---------- scheduler with exclusivity-aware fairness + safe hand-off ----------

// ---------------- editable knobs ---------------------
const WINDOWS = [
  { label: 'Early',         start: toM('07:30'), end: toM('09:00') },
  { label: 'Core (Early)',  start: toM('09:00'), end: toM('12:00') },
  { label: 'Core (Mid)',    start: toM('12:00'), end: toM('14:00') },
  { label: 'Core (Late)',   start: toM('14:00'), end: toM('16:30') },
  { label: 'Wrap-up',       start: toM('16:30'), end: toM('18:00') },
  { label: 'Evening',       start: toM('18:00'), end: toM('21:00') },
];
const END_BUFFER      = 15;          // keep last 15 min free
const FAIR_TOLERANCE  = 0.10;        // ±10 %
const IDEAL_MIN = 5, IDEAL_MAX = 15; // 5-10 ideal, 15 hard cap
const AFTERNOON_LIMIT_WINDOWS = ['Core (Mid)','Core (Late)','Wrap-up']; // where we throttle the evening person

// ------------- choose slot length per window --------
function suggestSlotLengths(roster, windows = WINDOWS) {
  return windows.map(w => {
    const people   = roster.filter(p => p.end > w.start && p.start < w.end).length;
    const duration = w.end - w.start;
    if (!people) return { ...w, people: 0, ideal: null };

    if (people === 1) {
      const len = Math.max(IDEAL_MIN, Math.min(IDEAL_MAX, duration));
      return { ...w, people, ideal: len };
    }

    const target = duration / people;
    for (let L = IDEAL_MIN; L <= IDEAL_MAX; L++) {
      if ((L / target) <= FAIR_TOLERANCE) return { ...w, people, ideal: L };
    }
    let L = IDEAL_MIN;
    while ((L / target) > FAIR_TOLERANCE && L < IDEAL_MAX) L++;
    return { ...w, people, ideal: L };
  });
}

// ------------- slice generator ----------------------
function buildSlices(windowsWithLen){
  const out=[];
  windowsWithLen.forEach(w=>{
    if(!w.ideal) return;
    for(let t=w.start;t<w.end;){
      const len=Math.min(w.ideal,w.end-t);
      out.push({start:t,len,window:w.label});
      t+=len;
    }
  });
  return out;
}

// ------------- main builder -------------------------
let rotateIdx=0;
function buildSchedule(){
  // roster
  const roster=[...document.querySelectorAll('.member-row')]
    .filter(r=>r.querySelector('.avail').checked)
    .map(r=>({name:r.querySelector('.pname').value.trim()||'Unnamed',
              start:toM(r.querySelector('.pstart').value),
              end:toM(r.querySelector('.pend').value)}));
  if(!roster.length){alert('No members');return null;}

  // slot lengths
  const hints=suggestSlotLengths(roster);
  const slices=buildSlices(hints);
  if(!slices.length){alert('No schedulable time');return null;}

  // rotation
  let order=[...roster];
  if($('order-mode').value==='random')order.sort(()=>Math.random()-0.5);
  else{const rot=rotateIdx++%order.length;order=order.slice(rot).concat(order.slice(0,rot));}
  const strat=$('strategy-mode').value;

  // helpers
  const prefAvail=(p,s)=>p.start<=s.start && (s.start+s.len)<=p.end-END_BUFFER;
  const allAvail =(p,s)=>p.start<=s.start && p.end>=s.start+s.len;

  // -------- evening-person detection + counts --------
  let eveningPerson=null;
  const windowCount={}; // person -> window -> #
  const inc=(n,w)=>{(windowCount[n]??={})[w]=(windowCount[n][w]??0)+1;};

  // pre-assign mandatory solo slices
  const totals=Object.fromEntries(roster.map(r=>[r.name,0]));
  const sched=[],rem=[];
  slices.forEach(s=>{
    const pref=roster.filter(p=>prefAvail(p,s));
    const all =pref.length?pref:roster.filter(p=>allAvail(p,s));
    if(all.length===1){
      const ch=all[0];
      sched.push({...s,name:ch.name,end:s.start+s.len,duration:s.len});
      totals[ch.name]+=s.len; inc(ch.name,s.window);
      if(s.window==='Evening') eveningPerson=ch.name;
    }else{
      rem.push({...s,pref,all});
    }
  });

  // fair targets
  const targets=Object.fromEntries(roster.map(r=>[r.name,0]));
  slices.forEach(s=>{
    const avail=roster.filter(p=>allAvail(p,s));
    const share=s.len/avail.length;
    avail.forEach(p=>targets[p.name]+=share);
  });

  // schedule remaining
  let idx=0;
  rem.sort((a,b)=>a.start-b.start).forEach(s=>{
    let cand=s.pref.length?s.pref:s.all;
    // throttle evening person in afternoon windows
    if(eveningPerson && AFTERNOON_LIMIT_WINDOWS.includes(s.window)){
      const caps=windowCount[eveningPerson]?.[s.window]||0;
      if(caps>=1 && cand.length>1) cand=cand.filter(p=>p.name!==eveningPerson);
    }
    if(!cand.length)return;

    let chosen;
    if(strat==='round'){
      chosen=cand.find(p=>p===order[idx%order.length])||cand[0];
      idx=(order.indexOf(chosen)+1)%order.length;
    }else{
      chosen=cand.sort((a,b)=>{
        const as=(totals[a.name]/targets[a.name])||0;
        const bs=(totals[b.name]/targets[b.name])||0;
        return as-bs || order.indexOf(a)-order.indexOf(b);
      })[0];
    }

    sched.push({...s,name:chosen.name,end:s.start+s.len,duration:s.len});
    totals[chosen.name]+=s.len; inc(chosen.name,s.window);
  });

  sched.sort((a,b)=>a.start-b.start);
  sched.suggestions=hints;
  return sched;
}

// ------------------- UI patch (unchanged) ------------------------
if(!window._patchedRender && typeof render==='function'){
  const orig=render;
  window.render=function(sched){
    orig(sched);
    if(!sched||!sched.suggestions)return;
    const cont=$('shift-times');
    cont.querySelectorAll('.slot-hints').forEach(e=>e.remove());
    const box=document.createElement('div');box.className='slot-hints';
    box.innerHTML='<h3>Auto slot lengths</h3>';
    const ul=document.createElement('ul');
    sched.suggestions.forEach(h=>{
      const li=document.createElement('li');
      li.textContent=`${h.label}: ${fm(h.start)}–${fm(h.end)} → `+
                     (h.people?`${h.people} ppl × ${h.ideal} min`:'no coverage');
      ul.appendChild(li);
    });
    box.appendChild(ul);cont.prepend(box);
  };
  window._patchedRender=true;
}

// ---------- render … (unchanged below this line) ----------
/* … keep the rest of the file exactly as before … */

// ---------- render (same as previous but End uses fm(s.end-1)) ----------
function render(sched){
  current=sched;
  const tbody=$('schedule-table').querySelector('tbody');tbody.innerHTML='';
  const next={},summary={},per={};
  sched.forEach((s,i)=>{
    if(next[s.name]!=null)sched[next[s.name]].next=fm(s.start);
    next[s.name]=i;s.next='-';
    (summary[s.name]??={c:0,m:0});summary[s.name].c++;summary[s.name].m+=s.duration;
    (per[s.name]??=[]).push(fm(s.start));
  });
  sched.forEach((s,i)=>{
    if(i&&s.start>sched[i-1].end){
      const g=document.createElement('tr');g.className='gap-row';
      g.innerHTML=`<td colspan=5>*** GAP ${fm(sched[i-1].end)}-${fm(s.start)} ***</td>`;tbody.appendChild(g);}
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${s.name}</td><td>${fm(s.start)}</td><td>${fm(s.end-1)}</td><td>${s.duration}</td><td>${s.next}</td>`;
    tbody.appendChild(tr);
  });

  const sb=$('summary-table').querySelector('tbody');sb.innerHTML='';
  Object.keys(summary).sort().forEach(n=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${n}</td><td>${summary[n].c}</td><td>${summary[n].m}</td>`;
    sb.appendChild(tr);
  });

  const st=$('shift-times');st.innerHTML='';
  const ul=document.createElement('ul');
  Object.keys(per).sort().forEach(n=>{
    const li=document.createElement('li'); li.textContent=`${n}: ${per[n].join(', ')}`; ul.appendChild(li);
  });
  st.appendChild(ul);

  const pipe=$('pipe-output');
  if($('output-mode').value==='table'){
    $('schedule-table').style.display='';pipe.style.display='none';copyBtn.style.display='inline-block';
  }else{
    $('schedule-table').style.display='none';copyBtn.style.display='none';pipe.style.display='block';
    pipe.textContent=sched.map(s=>`${s.name}|${fm(s.start)}|${fm(s.end-1)}|${s.duration}|${s.next}`).join('\\n');
  }
  [saveBtn,icsBtn,xlsxBtn,pdfBtn].forEach(b=>b.disabled=false);
}

// ---------- actions ----------
genBtn.onclick=()=>{const s=buildSchedule();if(s)render(s)};
copyBtn.onclick=()=>navigator.clipboard.writeText([...$('schedule-table').querySelectorAll('tr')]
      .map(r=>[...r.children].map(c=>c.textContent).join('\\t')).join('\\n'));

saveBtn.onclick=()=>{const blob=new Blob([JSON.stringify(current)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`sched-${todayKey()}.json`;a.click();};

loadInp.onchange=e=>{
  const f=e.target.files[0];if(!f)return;
  const rd=new FileReader();rd.onload=ev=>{try{render(JSON.parse(ev.target.result));}catch{alert('Bad JSON');}};
  rd.readAsText(f);
};

// ---------- exports ----------
icsBtn.onclick=()=>{
  const cal=new ics();
  current.forEach((s,i)=>{
    const d=new Date(),e=new Date();
    d.setHours(Math.floor(s.start/60),s.start%60);
    e.setHours(Math.floor(s.end/60),s.end%60);
    cal.addEvent(`${s.name} queue`,`Shift ${i+1}`,'',d,e);
  });
  cal.download(`queue-${todayKey()}`);
};

xlsxBtn.onclick=()=>{
  const ws=XLSX.utils.json_to_sheet(
    current.map(s=>({Person:s.name,Start:fm(s.start),End:fm(s.end-1),Minutes:s.duration}))
  );
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Schedule');
  XLSX.writeFile(wb,`queue-${todayKey()}.xlsx`);
};

pdfBtn.onclick=()=>{
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF();doc.text(`Queue Schedule ${todayKey()}`,14,14);
  doc.autoTable({startY:20,head:[['Person','Start','End','Min']],
    body:current.map(s=>[s.name,fm(s.start),fm(s.end-1),s.duration])});
  doc.save(`queue-${todayKey()}.pdf`);
};

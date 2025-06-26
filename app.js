// ===== Queue-Monitor Scheduler – 2025-06-26 =====

// ---------- helpers ----------
const toM = t => { const [h,m] = t.split(':').map(Number); return h*60+m };
const fm  = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
const todayKey = () => new Date().toISOString().slice(0,10);

// ---------- default roster ----------
const DEFAULTS = [
  ['Anish','09:00','18:00'],['Ashish','07:30','16:30'],['Chetan','09:00','18:00'],
  ['Dany','07:30','16:30'], ['Franky','07:30','16:30'],['Kartik','07:30','16:30'],
  ['Priya','07:30','16:30'],['Rajni','09:00','18:00'], ['Sarthak','07:30','16:30'],
  ['Shalini','07:30','16:30'],['Tapaswini','13:00','21:00']
];

// ---------- DOM refs ----------
const $ = id => document.getElementById(id);
const addBtn=$('add-member'), genBtn=$('generate'), copyBtn=$('copy-table');
const saveBtn=$('save-day'), icsBtn=$('export-ics'), xlsxBtn=$('export-xlsx'), pdfBtn=$('export-pdf');
const loadInp=$('load-day'), formDiv=$('team-form');

// ---------- row builder ----------
function makeRow([n,s,e]=['','09:00','17:00']){
  const row=document.createElement('div'); row.className='member-row';
  row.innerHTML=`<label><input type="checkbox" class="avail" checked></label>
    <input class="pname" style="width:120px" value="${n}" placeholder="Name">
    Start:<input type="time" class="pstart" value="${s}">
    End:<input type="time" class="pend" value="${e}">`;
  // drag
  row.draggable=true;
  row.ondragstart=ev=>{window._drag=row;row.classList.add('dragging');ev.dataTransfer.effectAllowed='move'};
  row.ondrop=()=>{const d=window._drag;if(d&&d!==row)formDiv.insertBefore(d,row.nextSibling);row.classList.remove('over');};
  row.ondragover=e=>{e.preventDefault();row.classList.add('over')};
  row.ondragleave=()=>row.classList.remove('over');
  row.ondragend=()=>{row.classList.remove('dragging');document.querySelectorAll('.over').forEach(el=>el.classList.remove('over'))};
  formDiv.insertBefore(row,addBtn);
}
DEFAULTS.forEach(makeRow);
addBtn.onclick=()=>makeRow();

// ---------- schedule builder ----------
let rotateIdx=0,current=[];
function buildSchedule(){
  const roster=[...document.querySelectorAll('.member-row')]
     .filter(r=>r.querySelector('.avail').checked)
     .map(r=>({name:r.querySelector('.pname').value.trim()||'Unnamed',
               start:toM(r.querySelector('.pstart').value),
               end:toM(r.querySelector('.pend').value)}));
  if(!roster.length){alert('No members');return null;}

  // order
  let order=[...roster];
  if($('order-mode').value==='random') order.sort(()=>Math.random()-0.5);
  else { const rot=rotateIdx++%order.length; order=order.slice(rot).concat(order.slice(0,rot)); }

  const mLen= +$('morning-len').value||6, aLen= +$('afternoon-len').value||15;
  const strat=$('strategy-mode').value;
  const earliest=Math.min(...roster.map(r=>r.start)), latest=Math.max(...roster.map(r=>r.end));
  const totals=Object.fromEntries(roster.map(r=>[r.name,0])), sched=[]; let idx=0,cur=earliest;

  while(cur<latest){
    const slot=cur<720?mLen:aLen;
    const can=order.filter(p=>p.start<=cur&&p.end>=cur+slot);
    if(!can.length){cur=Math.min(...roster.filter(p=>p.start>cur).map(p=>p.start).concat([latest]));continue;}

    let chosen;
    if(strat==='round'){chosen=can.find(p=>p===order[idx%order.length])||can[0];idx=(order.indexOf(chosen)+1)%order.length;}
    else{chosen=can.sort((a,b)=>totals[a.name]-totals[b.name]||order.indexOf(a)-order.indexOf(b))[0];}

    sched.push({name:chosen.name,start:cur,end:cur+slot,duration:slot});
    totals[chosen.name]+=slot; cur+=slot;
  }
  return sched;
}

// ---------- render ----------
function render(sched){
  current=sched;
  const tbody=$('schedule-table').querySelector('tbody');tbody.innerHTML='';
  const next={},summary={},per={};

  sched.forEach((s,i)=>{
    if(next[s.name]!=null)sched[next[s.name]].next=fm(s.start);
    next[s.name]=i; s.next='-';
    (summary[s.name]??={c:0,m:0}); summary[s.name].c++; summary[s.name].m+=s.duration;
    (per[s.name]??=[]).push(fm(s.start));
  });

  sched.forEach((s,i)=>{
    if(i&&s.start>sched[i-1].end){
      const g=document.createElement('tr');g.className='gap-row';
      g.innerHTML=`<td colspan=5>*** GAP ${fm(sched[i-1].end)}-${fm(s.start)} ***</td>`;tbody.appendChild(g);}
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${s.name}</td><td>${fm(s.start)}</td><td>${fm(s.end)}</td><td>${s.duration}</td><td>${s.next}</td>`;
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
    pipe.textContent=sched.map(s=>`${s.name}|${fm(s.start)}|${fm(s.end)}|${s.duration}|${s.next}`).join('\\n');
  }
  [saveBtn,icsBtn,xlsxBtn,pdfBtn].forEach(b=>b.disabled=false);
}

// ---------- events ----------
genBtn.onclick=()=>{const s=buildSchedule();if(s)render(s)};
copyBtn.onclick=()=>navigator.clipboard.writeText([...$('schedule-table').querySelectorAll('tr')]
  .map(r=>[...r.children].map(c=>c.textContent).join('\\t')).join('\\n'));

saveBtn.onclick=()=>{
  const blob=new Blob([JSON.stringify(current)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`sched-${todayKey()}.json`;a.click();
};
loadInp.onchange=e=>{
  const f=e.target.files[0]; if(!f)return;
  const r=new FileReader(); r.onload=ev=>{try{render(JSON.parse(ev.target.result));}catch{alert('Bad JSON');}};
  r.readAsText(f);
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
    current.map(s=>({Person:s.name,Start:fm(s.start),End:fm(s.end),Minutes:s.duration}))
  );
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Schedule');
  XLSX.writeFile(wb,`queue-${todayKey()}.xlsx`);
};

pdfBtn.onclick=()=>{
  const {jsPDF}=window.jspdf;
  const doc=new jsPDF();
  doc.text(`Queue Schedule ${todayKey()}`,14,14);
  doc.autoTable({startY:20,
     head:[['Person','Start','End','Min']],
     body:current.map(s=>[s.name,fm(s.start),fm(s.end),s.duration])
  });
  doc.save(`queue-${todayKey()}.pdf`);
};

// ================= App logic ================= //
/* helpers */
const toM = t => { const [h,m]=t.split(':').map(Number); return h*60+m; };
const fm  = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
const todayKey = () => new Date().toISOString().slice(0,10);

/* default roster */
const DEFAULTS=[['Anish','09:00','18:00'],['Ashish','07:30','16:30'],['Chetan','09:00','18:00'],['Dany','07:30','16:30'],['Franky','07:30','16:30'],['Kartik','07:30','16:30'],['Priya','07:30','16:30'],['Rajni','09:00','18:00'],['Sarthak','07:30','16:30'],['Shalini','07:30','16:30'],['Tapaswini','13:00','21:00']];

/* DOM refs */
const formDiv=document.getElementById('team-form');
const addBtn=document.getElementById('add-member');
const genBtn=document.getElementById('generate');
const copyBtn=document.getElementById('copy-table');

/* build row */
function makeRow([name,s,e]=['','09:00','17:00']){
  const row=document.createElement('div');row.className='member-row';
  row.innerHTML=`<label><input type="checkbox" class="avail" checked></label>
    <input class="pname" style="width:120px" value="${name}" placeholder="Name">
    Start:<input type="time" class="pstart" value="${s}"> End:<input type="time" class="pend" value="${e}">`;
  row.draggable=true;
  row.ondragstart=ev=>{window._drag=row;row.classList.add('dragging');ev.dataTransfer.effectAllowed='move';};
  row.ondrop=()=>{const d=window._drag;if(d&&d!==row)formDiv.insertBefore(d,row.nextSibling);row.classList.remove('over');};
  row.ondragover=e=>{e.preventDefault();row.classList.add('over');};
  row.ondragleave=()=>row.classList.remove('over');
  row.ondragend=()=>{row.classList.remove('dragging');document.querySelectorAll('.over').forEach(el=>el.classList.remove('over'));};
  formDiv.insertBefore(row,addBtn);
}
DEFAULTS.forEach(d=>makeRow(d));
addBtn.onclick=()=>makeRow();

/* schedule generation */
let rotateIdx=0,current=[];
function buildSchedule(){
  const roster=[...document.querySelectorAll('.member-row')].filter(r=>r.querySelector('.avail').checked).map(r=>({
    name:r.querySelector('.pname').value.trim()||'Unnamed',
    start:toM(r.querySelector('.pstart').value),
    end:toM(r.querySelector('.pend').value)}));
  if(!roster.length){alert('No members');return null;}
  // order
  let order=[...roster];
  if(document.getElementById('order-mode').value==='random')order.sort(()=>Math.random()-0.5);
  else{const rot=rotateIdx++%order.length;order=order.slice(rot).concat(order.slice(0,rot));}
  const mLen=+document.getElementById('morning-len').value||6;
  const aLen=+document.getElementById('afternoon-len').value||15;
  const strat=document.getElementById('strategy-mode').value;
  const earliest=Math.min(...roster.map(r=>r.start));
  const latest=Math.max(...roster.map(r=>r.end));
  const totals=Object.fromEntries(roster.map(r=>[r.name,0]));
  const sched=[];let idx=0,cur=earliest;
  while(cur<latest){
    const slot=cur<720?mLen:aLen;
    const cands=order.filter(p=>p.start<=cur&&p.end>=cur+slot);
    if(!cands.length){cur=Math.min(...roster.filter(p=>p.start>cur).map(p=>p.start).concat([latest]));continue;}
    let chosen;
    if(strat==='round'){chosen=cands.find(p=>p===order[idx%order.length])||cands[0];idx=(order.indexOf(chosen)+1)%order.length;}
    else{chosen=cands.sort((a,b)=>totals[a.name]-totals[b.name]||order.indexOf(a)-order.indexOf(b))[0];}
    sched.push({name:chosen.name,start:cur,end:cur+slot,duration:slot});totals[chosen.name]+=slot;cur+=slot;
  }
  return sched;
}

function render(sched){
  current=sched;
  const tbody=document.querySelector('#schedule-table tbody');tbody.innerHTML='';
  const next={},per={},summary={};
  sched.forEach((s,i)=>{if(next[s.name]!=null)sched[next[s.name]].next=fm(s.start);next[s.name]=i;s.next='-';(per[s.name]??=[]).push(fm(s.start));(summary[s.name]??={c:0,m:0});summary[s.name].c++;summary[s.name].m+=s.duration;});
  sched.forEach((s,i)=>{if(i&&s.start>sched[i-1].end){const g=document.createElement('tr');g.className='gap-row';g.innerHTML=`<td colspan=5>*** GAP ${fm(sched[i-1].end)}-${fm(s.start)} ***</td>`;tbody.appendChild(g);}const tr=document.createElement('tr');tr.innerHTML=`<td>${s.name}</td><td>${fm(s.start)}</td><td>${fm(s.end)}</td><td>${s.duration}</td><td>${s.next}</td>`;tbody.appendChild(tr);});
  const sb=document.querySelector('#summary-table tbody');sb.innerHTML='';Object.keys(summary).sort().forEach(n=>{const tr=document.createElement('tr');tr.innerHTML=`<td>${n}</td><td>${summary[n].c}</td><td>${summary[n].m}</td>`;sb.appendChild(tr);});
  const st=document.getElementById('shift-times');st.innerHTML='';const ul=document.createElement('ul');Object.keys(per).sort().forEach(n=>{const li=document.createElement('li');li.textContent=`${n}: ${per[n].join(', ')}`;ul.appendChild(li);});st.appendChild(ul);
  const pipe=document.getElementById('pipe-output');if(document.getElementById('output-mode').value==='table'){document.getElementById('schedule-table').style.display='';pipe.style.display='none';copyBtn.style.display='inline-block';}
  else{document.getElementById('schedule-table').style.display='none';copyBtn.style.display='none';pipe.style.display='block';pipe.textContent=sched.map(s=>`${s.name}|${fm(s.start)}|${fm(s.end)}|${s.duration}|${s.next}`).join('\n');}
}

genBtn.onclick=()=>{const s=buildSchedule();if(s)render(s);};// basic copy
copyBtn.onclick=()=>navigator.clipboard.writeText([...document.querySelectorAll('#schedule-table tr')].map(r=>[...r.children].map(c=>c.textContent).join('\t')).join('\n')).then(()=>alert('Copied'));

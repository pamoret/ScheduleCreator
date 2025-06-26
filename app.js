/* helpers */
const toM = t => { const [h,m] = t.split(':').map(Number); return h*60+m; };
const fm  = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;

/* default team */
const DEFAULTS = [
  ['Anish','09:00','18:00'],['Ashish','07:30','16:30'],['Chetan','09:00','18:00'],
  ['Dany','07:30','16:30'], ['Franky','07:30','16:30'],['Kartik','07:30','16:30'],
  ['Priya','07:30','16:30'],['Rajni','09:00','18:00'], ['Sarthak','07:30','16:30'],
  ['Shalini','07:30','16:30'],['Tapaswini','13:00','21:00']
];

/* DOM refs */
const formDiv   = document.getElementById('team-form');
const addBtn    = document.getElementById('add-member');
const genBtn    = document.getElementById('generate');
/* … all the other refs … */

/* build roster rows */
function makeRow([name,start,end]=['','09:00','17:00']) {
  // create elements, wire drag-n-drop identical to earlier snippet
}

/* fill defaults once on load */
DEFAULTS.forEach(d => makeRow(d));

/* add-member click */
addBtn.onclick = () => makeRow();

/* generate click => buildSchedule() => render() */
/* ★ paste the same buildSchedule/render logic from the previous version ★ */

/* persistence / export helper functions (same as before) */

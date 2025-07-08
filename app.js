// ---------- scheduler with exclusivity‑aware fairness + safe hand‑off ----------
// Goals
//   • Keep everyone within ±10 % of each other *per window* **and** across the whole day.
//   • People who must solo‑cover a window (e.g. 18:00‑21:00) are *pre‑credited* with
//     those minutes so they aren’t over‑used earlier.
//   • Avoid assigning anyone during the final 15 min of their shift unless no one
//     else can take it.

// ---------------- editable knobs ---------------------
const WINDOWS = [
  { label: 'Early',    start: toM('07:30'), end: toM('09:00') },
  { label: 'Core',     start: toM('09:00'), end: toM('16:30') },
  { label: 'Wrap‑up',  start: toM('16:30'), end: toM('18:00') },
  { label: 'Evening',  start: toM('18:00'), end: toM('21:00') },
];
const END_BUFFER = 15;           // “keep last 15 min free”
const FAIR_TOLERANCE = 0.10;     // ±10 %
const IDEAL_MIN = 5, IDEAL_MAX = 15; // slot length bias (hard‑cap 15 min)

// ------------- choose slot length per window --------
function suggestSlotLengths(roster, windows = WINDOWS) {
  return windows.map(w => {
    const people = roster.filter(p => p.end > w.start && p.start < w.end).length;
    const duration = w.end - w.start;
    if (!people) return { ...w, people: 0, ideal: null };

    // 1‑person window → whatever neat value fits bias
    if (people === 1) {
      const len = Math.max(IDEAL_MIN, Math.min(IDEAL_MAX, duration));
      return { ...w, people, ideal: len };
    }

    const target = duration / people; // minutes each should cover
    for (let L = IDEAL_MIN; L <= IDEAL_MAX; L++) {
      const ratio = L / target;           // worst‑case diff if someone gets one extra slot
      if (ratio <= FAIR_TOLERANCE && L <= IDEAL_MAX) return { ...w, people, ideal: L };
    }
    // Fallback: pick shortest that meets tolerance or clamp to 60
    let L = IDEAL_MIN;
    while (L / target > FAIR_TOLERANCE && L < IDEAL_MAX) L++;
    return { ...w, people, ideal: L };
  });
}

// ------------- slice generator ----------------------
function buildSlices(windowsWithLen) {
  const slices = [];
  windowsWithLen.forEach(w => {
    if (!w.ideal) return;
    for (let t = w.start; t < w.end;) {
      const len = Math.min(w.ideal, w.end - t);
      slices.push({ start: t, len, window: w.label });
      t += len;
    }
  });
  return slices;
}

// ------------- main builder -------------------------
let rotateIdx = 0;
function buildSchedule() {
  // --- roster ---------------------------------------
  const roster = [...document.querySelectorAll('.member-row')]
    .filter(r => r.querySelector('.avail').checked)
    .map(r => ({
      name:  r.querySelector('.pname').value.trim() || 'Unnamed',
      start: toM(r.querySelector('.pstart').value),
      end:   toM(r.querySelector('.pend').value)
    }));
  if (!roster.length) { alert('No members'); return null; }

  // --- slot lengths ---------------------------------
  const hints  = suggestSlotLengths(roster);
  const slices = buildSlices(hints);
  if (!slices.length) { alert('No schedulable time inside WINDOWS'); return null; }

  // --- rotational order -----------------------------
  let order = [...roster];
  if ($('order-mode').value === 'random') order.sort(() => Math.random() - 0.5);
  else { const rot = rotateIdx++ % order.length; order = order.slice(rot).concat(order.slice(0, rot)); }
  const strat = $('strategy-mode').value;

  // --- helper: availability predicates --------------
  const prefAvail = (p, s) => p.start <= s.start && (s.start + s.len) <= (p.end - END_BUFFER);
  const allAvail  = (p, s) => p.start <= s.start && p.end >= s.start + s.len;

  // --- pre‑assign mandatory solo slices -------------
  const totals  = Object.fromEntries(roster.map(r => [r.name, 0]));
  const sched   = [];
  const rem     = [];
  slices.forEach(s => {
    const pref = roster.filter(p => prefAvail(p, s));
    const all  = pref.length ? pref : roster.filter(p => allAvail(p, s));
    if (all.length === 1) {
      const chosen = all[0];
      sched.push({ ...s, name: chosen.name, end: s.start + s.len, duration: s.len });
      totals[chosen.name] += s.len;
    } else {
      rem.push({ ...s, pref, all });
    }
  });

  // --- compute global fair targets ------------------
  const targets = Object.fromEntries(roster.map(r => [r.name, 0]));
  slices.forEach(s => {
    const avail = roster.filter(p => allAvail(p, s));
    if (!avail.length) return;
    const share = s.len / avail.length;
    avail.forEach(p => targets[p.name] += share);
  });

  // --- schedule remaining slices --------------------
  let idx = 0;
  rem.sort((a, b) => a.start - b.start).forEach(s => {
    const cand = s.pref.length ? s.pref : s.all;
    if (!cand.length) return; // unschedulable

    let chosen;
    if (strat === 'round') {
      chosen = cand.find(p => p === order[idx % order.length]) || cand[0];
      idx = (order.indexOf(chosen) + 1) % order.length;
    } else {
      // score by *global* fairness only — window fairness already implicit in targets
      chosen = cand.sort((a, b) => {
        const aScore = (totals[a.name] / targets[a.name]) || 0;
        const bScore = (totals[b.name] / targets[b.name]) || 0;
        return aScore - bScore || order.indexOf(a) - order.indexOf(b);
      })[0];
    }

    sched.push({ ...s, name: chosen.name, end: s.start + s.len, duration: s.len });
    totals[chosen.name] += s.len;
  });

  // --- tidy chronology --------------------------------
  sched.sort((a, b) => a.start - b.start);
  sched.suggestions = hints;
  return sched;
}

// ------------------- UI patch ------------------------
if (!window._patchedRender && typeof render === 'function') {
  const origR = render;
  window.render = function (sched) {
    origR(sched);
    if (!sched.suggestions) return;
    const cont = document.getElementById('shift-times');
    cont.querySelectorAll('.slot-hints').forEach(e => e.remove());
    const box = document.createElement('div'); box.className = 'slot-hints';
    const h3 = document.createElement('h3'); h3.textContent = 'Auto slot lengths'; box.appendChild(h3);
    const ul = document.createElement('ul');
    sched.suggestions.forEach(h => {
      const li = document.createElement('li');
      li.textContent = `${h.label}: ${fm(h.start)}–${fm(h.end)} → ` +
                       (h.people ? `${h.people} ppl × ${h.ideal} min` : 'no coverage');
      ul.appendChild(li);
    });
    box.appendChild(ul); cont.prepend(box);
  };
  window._patchedRender = true;
}

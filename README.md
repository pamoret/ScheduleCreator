# Queue-Monitor Scheduler

A browser-based scheduler for creating fair, exclusive, and efficient shift schedules for teams, especially suited for queue monitoring. Users can define teams, set availability, and generate balanced daily schedules with export options.

## 🧩 Project Structure

* `index.html` – The front-end UI with form inputs, controls, and tables for displaying results.
* `app.js` – The scheduling logic, DOM interaction, and export functionalities.

---

## 🚀 How It Works

### 1. **Team Selection & Member Input**

* **Teams are loaded** from `teams.json` into the **Manager Select** dropdown.
* Selecting a manager auto-loads their team's member list and populates time availability inputs (`Start`, `End`).
* You can also manually add members using the “+ Add Member” button.

### 2. **Availability Configuration**

* Each member has:

  * A checkbox to mark availability.
  * A name field.
  * Start/End time inputs for their workday.

### 3. **Schedule Configuration**

Users can configure:

* **Order**: `list` (original order) or `random`.
* **Strategy**:

  * `fair`: Proportional distribution.
  * `round`: Rotating assignments.
* **Slot durations** for morning/afternoon.
* **Output format**: `table` or `pipe` (text format).

### 4. **Generating a Schedule**

Click “Generate” to:

* Analyze all availability.
* Divide the day into **time windows** (e.g. Early, Core, Wrap-up).
* Assign fair time slices to available team members, ensuring:

  * Even distribution (based on availability and slot length).
  * Avoiding overlaps.
  * Smart handling of evening shifts to avoid burnout.

### 5. **Schedule Output**

The generated schedule shows:

* **Main table**: Start/End times, person name, duration, and next assignment.
* **Summary**: Count and total minutes per person.
* **Shift times**: Time slots each person is assigned.

You can toggle between a visual table or a plaintext “pipe” output (`name|start|end|duration|next`).

---

## 📤 Export Options

After generating a schedule, you can:

* 💾 **Save JSON** – Download the schedule as `.json` for reuse.
* 📅 **Export ICS** – Download as a calendar `.ics` file.
* 📄 **Export XLSX** – Save as Excel file.
* 🖨️ **Export PDF** – Generate a printable PDF version.
* 📋 **Copy table** – Copy the schedule table to clipboard (if in table mode).

---

## 🔧 Customization

### Time Windows (Defined in `app.js`)

You can customize the time windows used to split the day:

```js
const WINDOWS = [
  { label: 'Early',         start: toM('07:30'), end: toM('09:00') },
  { label: 'Core (Early)',  start: toM('09:00'), end: toM('12:00') },
  ...
];
```

### Ideal Slot Lengths

* `IDEAL_MIN` and `IDEAL_MAX` control the desired range of time slices (default: 5–15 minutes).
* `FAIR_TOLERANCE` allows small imbalance in assignment for flexibility.

---

## 🖱️ UI Details

HTML uses simple `<div>`, `<select>`, and `<table>` elements styled via CSS. Drag-and-drop allows rearranging members. JavaScript (in `app.js`) controls all DOM interactions and state.

Libraries used:

* [`ics`](https://www.npmjs.com/package/ics) for calendar export
* [`xlsx`](https://github.com/SheetJS/sheetjs) for Excel export
* [`jsPDF`](https://github.com/parallax/jsPDF) + `autotable` plugin for PDF generation

---

## 📁 File Load/Save Format

* `.json` files are simple arrays of scheduled slices with metadata.
* Compatible with `load-day` input field for re-importing saved schedules.

---

## 🧠 Key Scheduling Logic (from `app.js`)

* `suggestSlotLengths()` – calculates fair slot lengths per window.
* `buildSlices()` – breaks day into discrete, schedulable slices.
* `buildSchedule()` – assigns each slice to the best-fit member based on fairness and constraints.
* `render()` – visualizes results in HTML tables.

---

## ✅ Usage Instructions

1. Open `index.html` in a modern browser.
2. Choose or add a team.
3. Adjust availability as needed.
4. Click **Generate**.
5. View or export your schedule!


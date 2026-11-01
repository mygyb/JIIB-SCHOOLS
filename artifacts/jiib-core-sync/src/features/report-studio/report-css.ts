// Report card styles, ported from the Report Studio design file. Every rule is scoped under .rc.
export const REPORT_CARD_CSS = String.raw`
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Playfair+Display:wght@600;700;800&family=Lora:ital,wght@0,400;0,600;1,400&family=Space+Grotesk:wght@500;600;700&display=swap');
/* The design was drawn without the app's base styles, so undo them inside the card. */
.rc, .rc *, .rc-slip-page, .rc-slip-page * { line-height:normal; letter-spacing:inherit; }
.rc img, .rc-slip-page img { display:inline-block; max-width:none; height:auto; }
.rc table, .rc-slip-page table { text-indent:0; }
/* REPORT CARD STYLES */
.rc {
  color-scheme:light;
  width:794px; min-height:1123px;
  box-sizing: border-box;
  isolation: isolate;
  background:#ffffff;
  font-family:Arial, Helvetica, sans-serif;
  font-size:8.5pt; color:#000;
  padding:12px 6px 10px;
  box-shadow:0 8px 40px rgba(0,0,0,0.5);
  position:relative;
  page-break-after:always;
  overflow:hidden;
}
/* Watermark badge */
.rc-watermark {
  position:absolute;
  top:50%; left:50%;
  transform:translate(-50%,-50%);
  width:280px; height:280px;
  opacity:0.12;
  pointer-events:none;
  z-index:1;
  object-fit:contain;
}
.rc-watermark-placeholder {
  position:absolute;
  top:30%; left:50%;
  transform:translate(-50%,-50%);
  width:250px; height:250px;
  opacity:0.12;
  pointer-events:none;
  z-index:1;
  display:flex; align-items:center; justify-content:center;
  font-size:180px;
}
.rc-serial-code {
  position:absolute; top:8px; right:14px;
  font-size:9.5pt; font-weight:900; color:#c0392b;
  letter-spacing:1px; z-index:6;
  font-family:'Courier New',monospace;
  background:#fff; padding:1px 4px;
}
.rc-verify-note {
  font-size:6.2pt; color:#1a3a6b; text-align:center;
  margin-top:2px; font-weight:600; line-height:1.3;
}
/* Ensure content sits above watermark */
.rc > *:not(.rc-watermark):not(.rc-watermark-placeholder) { position:relative; z-index:1; }

.rc-header { display:flex; align-items:center; gap:12px; margin-bottom:6px; border-bottom:3px solid #1a3a6b; padding-bottom:8px; }
.rc-logo { width:72px; height:72px; object-fit:contain; flex-shrink:0; }
.rc-logo-placeholder { width:72px; height:72px; border:2px solid #1a3a6b; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:1.6rem; flex-shrink:0; background:#f0f4ff; }
.rc-school-info { flex:1; text-align:center; }
.rc-school-name { font-size:17pt; font-weight:900; color:#1a3a6b; text-transform:uppercase; letter-spacing:.5px; line-height:1.1; margin-bottom:3px; }
.rc-school-address { font-size:7.5pt; color:#333; margin-bottom:3px; font-weight:600; }
.rc-school-motto { font-size:9pt; font-weight:800; color:#c0392b; text-transform:uppercase; letter-spacing:.5px; }

/* Passport area — supports badge overlay */
.rc-passport-wrap { position:relative; width:68px; height:80px; flex-shrink:0; }
.rc-passport { width:68px; height:80px; border:2px solid #1a3a6b; display:flex; align-items:center; justify-content:center; font-size:1.6rem; background:#f8f9ff; color:#aaa; }
.rc-rank-badge { position:absolute; top:-12px; right:-12px; font-size:44px; line-height:1; z-index:10; filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3)); }

.rc-title-banner { background:#1a3a6b; color:white; text-align:center; font-size:9pt; font-weight:800; padding:4px 0; letter-spacing:2px; text-transform:uppercase; margin-bottom:5px; border:1.5px solid #1a3a6b; }
.rc-title-banner.midterm { background:#c0392b; border-color:#c0392b; }

.rc-info-grid { border:1.5px solid #1a3a6b; margin-bottom:5px; }
.rc-info-row { display:flex; border-bottom:1px solid #c8d4e8; min-height:19px; }
.rc-info-row:last-child { border-bottom:none; }
.rc-info-cell { padding:2px 6px; display:flex; align-items:center; gap:4px; border-right:1px solid #c8d4e8; flex:1; min-width:0; }
.rc-info-cell:last-child { border-right:none; }
.rc-info-lbl { font-weight:700; color:#1a3a6b; font-size:7pt; white-space:nowrap; flex-shrink:0; }
.rc-info-val { font-size:7.5pt; border-bottom:1px solid #999; flex:1; min-width:0; padding-bottom:1px; font-weight:600; }

.rc-overall-row { display:flex; align-items:center; border:1.5px solid #1a3a6b; margin-bottom:5px; min-height:24px; }
.rc-overall-cell { display:flex; align-items:center; gap:5px; padding:3px 8px; border-right:1px solid #c8d4e8; flex:1; }
.rc-overall-cell:last-child { border-right:none; }
.rc-overall-lbl { font-weight:800; color:#1a3a6b; font-size:7.5pt; white-space:nowrap; }
.rc-overall-val { background:#c0392b; color:white; font-weight:800; font-size:8pt; padding:1px 8px; min-width:36px; text-align:center; }

.rc-perf-header { background:#1a3a6b; color:white; text-align:center; font-size:7.5pt; font-weight:800; padding:3px 0; letter-spacing:1px; text-transform:uppercase; border:1.5px solid #1a3a6b; border-bottom:none; }
.rc-table { width:100%; border-collapse:collapse; border:1.5px solid #1a3a6b; margin-bottom:5px; font-size:7.5pt; }
.rc-table th { background:#2e6da4; color:white; padding:3px 4px; border:1px solid #1a3a6b; font-weight:700; font-size:6.5pt; text-align:center; }
.rc-table th.subject-col { text-align:left; }
.rc-table td { padding:4px 4px; border:1px solid #c8d4e8; text-align:center; font-size:7pt; font-weight:700; }
.rc-table td.subject-cell { text-align:left; font-weight:800; color:#1a1a1a; padding-left:6px; }
.rc-table tr:nth-child(even) td { background:#f0f4fb; }

.rc-grade-A { color:#155724; font-weight:800; }
.rc-grade-B { color:#1a5276; font-weight:800; }
.rc-grade-C { color:#7d6608; font-weight:800; }
.rc-grade-D { color:#c0392b; font-weight:800; }
.rc-grade-E { color:#922b21; font-weight:800; background:#fdecea; }
.rc-descriptor-outstanding { color:#155724; font-weight:700; font-size:6.5pt; }
.rc-descriptor-moderate { color:#1a5276; font-weight:700; font-size:6.5pt; }
.rc-descriptor-basic { color:#922b21; font-weight:700; font-size:6.5pt; }

/* Summary row below marks table */
.rc-summary-row-table { width:100%; border-collapse:collapse; border:1.5px solid #1a3a6b; margin-bottom:5px; font-size:7pt; }
.rc-summary-row-table th { background:#1a3a6b; color:white; padding:3px 5px; border:1px solid rgba(255,255,255,0.3); font-weight:800; font-size:6.5pt; text-align:center; }
.rc-summary-row-table td { padding:3px 6px; border:1px solid #c8d4e8; text-align:center; font-weight:700; }

/* Descriptor / grading system table (image format) */
.rc-descriptor-system-table { width:100%; border-collapse:collapse; border:1.5px solid #1a3a6b; margin-bottom:5px; font-size:7pt; }
.rc-descriptor-system-table th { background:#2e6da4; color:white; padding:3px 6px; border:1px solid #1a3a6b; font-weight:800; font-size:6.5pt; text-align:center; }
.rc-descriptor-system-table th:nth-child(3) { text-align:left; }
.rc-descriptor-system-table td { padding:2px 6px; border:1px solid #c8d4e8; text-align:center; font-size:6.5pt; }
.rc-descriptor-system-table td:nth-child(3) { text-align:left; font-weight:700; }
.rc-descriptor-system-table tr:nth-child(even) td { background:#f0f4fb; }

/* Stamp box in sig area */
.rc-stamp-img { max-width:600px; max-height:160px; object-fit:contain; opacity: 100; }

.rc-bottom { display:flex; gap:4px; margin-bottom:5px; }
.rc-bottom-col { flex:1; min-width:0; }
.rc-bottom-title { background:#2e6da4; color:white; font-size:6.5pt; font-weight:800; padding:2px 4px; text-align:center; border:1px solid #1a3a6b; border-bottom:none; text-transform:uppercase; letter-spacing:.5px; }
.rc-bottom-table { width:100%; border-collapse:collapse; border:1px solid #1a3a6b; font-size:6.5pt; }
.rc-bottom-table td { padding:2px 4px; border:1px solid #c8d4e8; }
.rc-bottom-table tr:nth-child(even) td { background:#f0f4fb; }
.rc-trait-lbl { font-weight:700; color:#1a3a6b; }
.rc-trait-rating { text-align:center; width:36px; font-weight:800; }
.rc-grading-key { background:#1a3a6b; color:white; }
.rc-grading-key td { border-color:rgba(255,255,255,0.2)!important; font-size:6pt; }
.rc-bills-lbl { font-weight:700; color:#1a3a6b; }
.rc-bills-curr { text-align:center; width:16px; font-weight:700; }
.rc-bills-amt { text-align:right; font-weight:700; font-size:6.5pt; }
.rc-bills-total td { background:#1a3a6b!important; color:white!important; font-weight:800!important; }

.rc-comments { display:flex; gap:4px; margin-bottom:0; }
.rc-comment-box { flex:1; border:1.5px solid #1a3a6b; }
.rc-comment-title { background:#1a3a6b; color:white; font-size:6.5pt; font-weight:800; padding:2px 6px; text-transform:uppercase; }
.rc-comment-body { min-height:37px; padding:4px 6px; font-size:9pt; font-style:italic; font-weight: bolder; color:black; border-bottom:1px dotted #999; letter-spacing: 0.1em; }
.rc-sig-box { width:120px; border:1.5px solid #1a3a6b; flex-shrink:0; }
.rc-sig-title { background:#1a3a6b; color:white; font-size:6.5pt; font-weight:800; padding:2px 4px; text-align:center; text-transform:uppercase; }
.rc-sig-body { height:56px; display:flex; align-items:center; justify-content:center; font-size:6pt; color:#999; flex-direction:column; gap:4px; }

.rc-qr-wrap { width:72px; height:80px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; flex-shrink:0; border:2px solid #1a3a6b; background:#fff; padding:3px; }
.rc-qr-wrap canvas, .rc-qr-wrap img { width:60px!important; height:60px!important; }
.rc-qr-label { font-size:5pt; color:#1a3a6b; font-weight:700; text-align:center; font-family:Arial,sans-serif; }

/* ════════════════════════════════════
   TEMPLATE 2 — MODERN MINIMAL
   Clean, light, indigo/teal, generous whitespace
   ════════════════════════════════════ */
.rc.rc-tpl-modern { font-family:'DM Sans',sans-serif; }
.rc.rc-tpl-modern .rc-header { border-bottom:1px solid #e2e8f0; padding-bottom:10px; }
.rc.rc-tpl-modern .rc-school-name { color:#3730a3; letter-spacing:1px; font-weight:800; }
.rc.rc-tpl-modern .rc-school-motto { color:#0d9488; }
.rc.rc-tpl-modern .rc-logo-placeholder, .rc.rc-tpl-modern .rc-passport { border-color:#3730a3; background:#eef2ff; }
.rc.rc-tpl-modern .rc-title-banner { background:transparent; color:#3730a3; border:none; border-bottom:2px solid #3730a3; text-align:left; padding:4px 2px; letter-spacing:3px; }
.rc.rc-tpl-modern .rc-title-banner.midterm { color:#0d9488; border-bottom-color:#0d9488; }
.rc.rc-tpl-modern .rc-info-grid, .rc.rc-tpl-modern .rc-overall-row, .rc.rc-tpl-modern .rc-table, .rc.rc-tpl-modern .rc-summary-row-table, .rc.rc-tpl-modern .rc-descriptor-system-table { border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; }
.rc.rc-tpl-modern .rc-info-cell, .rc.rc-tpl-modern .rc-overall-cell { border-color:#e2e8f0; }
.rc.rc-tpl-modern .rc-info-lbl, .rc.rc-tpl-modern .rc-overall-lbl { color:#3730a3; }
.rc.rc-tpl-modern .rc-overall-val { background:#3730a3; border-radius:5px; }
.rc.rc-tpl-modern .rc-perf-header { background:#3730a3; border-radius:6px 6px 0 0; border:none; }
.rc.rc-tpl-modern .rc-table th { background:#f1f5f9; color:#334155; border-color:#e2e8f0; }
.rc.rc-tpl-modern .rc-table td { border-color:#e2e8f0; }
.rc.rc-tpl-modern .rc-table tr:nth-child(even) td { background:#f8fafc; }
.rc.rc-tpl-modern .rc-grade-A { color:#0d9488; } .rc.rc-tpl-modern .rc-grade-B { color:#3730a3; }
.rc.rc-tpl-modern .rc-grade-C { color:#a16207; } .rc.rc-tpl-modern .rc-grade-D { color:#ea580c; }
.rc.rc-tpl-modern .rc-grade-E { color:#dc2626; background:#fef2f2; }
.rc.rc-tpl-modern .rc-summary-row-table th, .rc.rc-tpl-modern .rc-descriptor-system-table th,
.rc.rc-tpl-modern .rc-bottom-title, .rc.rc-tpl-modern .rc-comment-title,
.rc.rc-tpl-modern .rc-sig-title, .rc.rc-tpl-modern .rc-grading-key { background:#3730a3; }
.rc.rc-tpl-modern .rc-bills-total td { background:#3730a3!important; }
.rc.rc-tpl-modern .rc-serial-code { color:#0d9488; }
.rc.rc-tpl-modern .rc-watermark, .rc.rc-tpl-modern .rc-watermark-placeholder { opacity:0.06; }

/* ════════════════════════════════════
   TEMPLATE 3 — ELEGANT LEDGER
   Serif, ivory, burgundy + gold, certificate feel
   ════════════════════════════════════ */
.rc.rc-tpl-elegant { font-family:'Lora',serif; background:#fffdf7; }
.rc.rc-tpl-elegant .rc-header { border-bottom:3px double #7a1f2b; padding-bottom:10px; }
.rc.rc-tpl-elegant .rc-school-name { font-family:'Playfair Display',serif; color:#7a1f2b; letter-spacing:.5px; }
.rc.rc-tpl-elegant .rc-school-motto { color:#b8860b; font-style:italic; }
.rc.rc-tpl-elegant .rc-logo-placeholder, .rc.rc-tpl-elegant .rc-passport { border-color:#7a1f2b; background:#fbf6e9; }
.rc.rc-tpl-elegant .rc-title-banner { background:#7a1f2b; font-family:'Playfair Display',serif; letter-spacing:3px; border-color:#7a1f2b; }
.rc.rc-tpl-elegant .rc-title-banner.midterm { background:#b8860b; border-color:#b8860b; }
.rc.rc-tpl-elegant .rc-info-grid, .rc.rc-tpl-elegant .rc-overall-row, .rc.rc-tpl-elegant .rc-table,
.rc.rc-tpl-elegant .rc-summary-row-table, .rc.rc-tpl-elegant .rc-descriptor-system-table { border:1.5px solid #7a1f2b; }
.rc.rc-tpl-elegant .rc-info-cell, .rc.rc-tpl-elegant .rc-overall-cell { border-color:#e5d9b8; }
.rc.rc-tpl-elegant .rc-info-lbl, .rc.rc-tpl-elegant .rc-overall-lbl { color:#7a1f2b; font-family:'Playfair Display',serif; }
.rc.rc-tpl-elegant .rc-overall-val { background:#7a1f2b; }
.rc.rc-tpl-elegant .rc-perf-header { background:#7a1f2b; font-family:'Playfair Display',serif; letter-spacing:1.5px; border-color:#7a1f2b; }
.rc.rc-tpl-elegant .rc-table th { background:#b8860b; border-color:#7a1f2b; }
.rc.rc-tpl-elegant .rc-table td { border-color:#e5d9b8; }
.rc.rc-tpl-elegant .rc-table td.subject-cell { font-style:italic; }
.rc.rc-tpl-elegant .rc-table tr:nth-child(even) td { background:#fbf6e9; }
.rc.rc-tpl-elegant .rc-summary-row-table th, .rc.rc-tpl-elegant .rc-descriptor-system-table th,
.rc.rc-tpl-elegant .rc-bottom-title, .rc.rc-tpl-elegant .rc-comment-title,
.rc.rc-tpl-elegant .rc-sig-title, .rc.rc-tpl-elegant .rc-grading-key { background:#7a1f2b; font-family:'Playfair Display',serif; letter-spacing:1px; }
.rc.rc-tpl-elegant .rc-bills-total td { background:#7a1f2b!important; }
.rc.rc-tpl-elegant .rc-serial-code { color:#7a1f2b; }
.rc.rc-tpl-elegant .rc-comment-body { font-family:'Lora',serif; font-style:italic; }
.rc.rc-tpl-elegant .rc-watermark, .rc.rc-tpl-elegant .rc-watermark-placeholder { opacity:0.08; }

/* ════════════════════════════════════
   TEMPLATE 4 — BOLD CONTEMPORARY
   Charcoal + electric blue, high-contrast, pill grades
   ════════════════════════════════════ */
.rc.rc-tpl-bold { font-family:'DM Sans',sans-serif; }
.rc.rc-tpl-bold .rc-header { background:#0f172a; margin:-12px -6px 8px; padding:12px 6px 10px; border-bottom:4px solid #2563eb; }
.rc.rc-tpl-bold .rc-school-name { font-family:'Space Grotesk',sans-serif; color:#fff; letter-spacing:1px; }
.rc.rc-tpl-bold .rc-school-address { color:#94a3b8; }
.rc.rc-tpl-bold .rc-school-motto { color:#38bdf8; }
.rc.rc-tpl-bold .rc-verify-note { color:#94a3b8; }
.rc.rc-tpl-bold .rc-logo-placeholder, .rc.rc-tpl-bold .rc-passport { border-color:#2563eb; background:#1e293b; color:#fff; }
.rc.rc-tpl-bold .rc-title-banner { background:#2563eb; font-family:'Space Grotesk',sans-serif; letter-spacing:2px; border-color:#2563eb; }
.rc.rc-tpl-bold .rc-title-banner.midterm { background:#f97316; border-color:#f97316; }
.rc.rc-tpl-bold .rc-info-grid, .rc.rc-tpl-bold .rc-overall-row, .rc.rc-tpl-bold .rc-table,
.rc.rc-tpl-bold .rc-summary-row-table, .rc.rc-tpl-bold .rc-descriptor-system-table { border:1.5px solid #0f172a; border-radius:6px; overflow:hidden; }
.rc.rc-tpl-bold .rc-info-lbl, .rc.rc-tpl-bold .rc-overall-lbl { color:#0f172a; font-family:'Space Grotesk',sans-serif; }
.rc.rc-tpl-bold .rc-overall-val { background:#2563eb; border-radius:4px; }
.rc.rc-tpl-bold .rc-perf-header { background:#0f172a; font-family:'Space Grotesk',sans-serif; letter-spacing:1.5px; border-color:#0f172a; }
.rc.rc-tpl-bold .rc-table th { background:#0f172a; color:#fff; border-color:#0f172a; }
.rc.rc-tpl-bold .rc-table td.subject-cell { font-family:'Space Grotesk',sans-serif; font-weight:700; }
.rc.rc-tpl-bold .rc-table tr:nth-child(even) td { background:#f1f5f9; }
.rc.rc-tpl-bold .rc-grade-A, .rc.rc-tpl-bold .rc-grade-B, .rc.rc-tpl-bold .rc-grade-C,
.rc.rc-tpl-bold .rc-grade-D, .rc.rc-tpl-bold .rc-grade-E { display:inline-block; min-width:16px; padding:1px 6px; border-radius:20px; color:#fff!important; background:#64748b; }
.rc.rc-tpl-bold .rc-grade-A { background:#16a34a; } .rc.rc-tpl-bold .rc-grade-B { background:#2563eb; }
.rc.rc-tpl-bold .rc-grade-C { background:#f59e0b; } .rc.rc-tpl-bold .rc-grade-D { background:#f97316; }
.rc.rc-tpl-bold .rc-grade-E { background:#dc2626; }
.rc.rc-tpl-bold .rc-summary-row-table th, .rc.rc-tpl-bold .rc-descriptor-system-table th,
.rc.rc-tpl-bold .rc-bottom-title, .rc.rc-tpl-bold .rc-comment-title,
.rc.rc-tpl-bold .rc-sig-title, .rc.rc-tpl-bold .rc-grading-key { background:#0f172a; font-family:'Space Grotesk',sans-serif; letter-spacing:1px; }
.rc.rc-tpl-bold .rc-bills-total td { background:#0f172a!important; }
.rc.rc-tpl-bold .rc-serial-code { color:#2563eb; }
.rc.rc-tpl-bold .rc-watermark, .rc.rc-tpl-bold .rc-watermark-placeholder { opacity:0.05; }
`;

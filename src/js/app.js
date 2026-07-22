"use strict";

const PARTS = ["root", "ch1", "ch2", "ch3", "ch4", "ch5", "combined"];
const PARTLABEL = {root: "launcher", ch1: "chapter 1", ch2: "chapter 2", ch3: "chapter 3", ch4: "chapter 4", ch5: "chapter 5", combined: "chapters 1&2"};
const PARTICON = {ch1: "ch1.png", ch2: "ch2.png", ch3: "ch3tv.png", ch4: "ch4.png", ch5: "ch5.png"};
const ERALABEL = {demo: "ch1&2", release: "ch3&4", ch5: "ch5"};
const EXCLUDE = new Set();
const S = "/assets/static";

let manifest = null;
let notes = {};
let changelogSet = new Set();   // versions with a twitter changelog .md
let steamSet = new Set();       // versions with a steam changelog .md
let doodles = {};
const diffcache = {};
const clcache = {};             // parsed twitter changelog markdown, by version
const clraw = {};               // raw markdown text (twitter + steam) by "src/version"
const sel = {version: null, chapter: null, file: null, mode: "changelog", clshow: {twitter: true, steam: false}};

/*//////////////////////////////////////////////////////////////////////*/
/* boot */

async function boot() {
  try {
    manifest = await fetchjson(S + "/manifest.json");
    let clindex, stindex;
    [notes, clindex, doodles, stindex] = await Promise.all([
      fetchjson(S + "/notes.json").catch(() => ({})),
      fetchjson(S + "/changelogs/index.json").catch(() => []),
      fetchjson(S + "/doodles.json").catch(() => ({})),
      fetchjson(S + "/steamchangelogs/index.json").catch(() => []),
    ]);
    changelogSet = new Set(clindex);
    steamSet = new Set(stindex);
  } catch (e) {
    document.querySelector(".content").innerHTML = "<div class=\"hint\">no data. run build_site.py.</div>";
    return;
  }
  manifest.versions = manifest.versions.filter(v => !EXCLUDE.has(v.label));
  buildrail();
  for (const b of document.querySelectorAll(".cswbtn")) {
    b.addEventListener("click", () => {
      sel.clshow[b.dataset.src] = !sel.clshow[b.dataset.src];
      sel.mode = (sel.clshow.twitter || sel.clshow.steam) ? "changelog" : "diff";
      rendercontent();
    });
  }
  const hash = decodeURIComponent(location.hash.slice(1));
  const start = manifest.versions.find(v => v.label === hash) || manifest.versions[manifest.versions.length - 1];
  await selectversion(start.label);
  const q = new URLSearchParams(location.search);
  const cl = q.get("cl") || (q.has("changelog") ? "twitter" : "");
  if (cl) {
    sel.clshow = {twitter: cl === "twitter" || cl === "diff", steam: cl === "steam" || cl === "diff"};
    sel.mode = "changelog";
    rendercontent();
  }
  const selp = q.get("sel");
  if (selp) {
    const i = selp.indexOf("/");
    sel.chapter = selp.slice(0, i);
    sel.file = selp.slice(i + 1);
    sel.mode = "diff";
    rendercontent();
    markchaptertab();
  }
}

async function fetchjson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + " " + r.status);
  return r.json();
}

async function fetchtext(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + " " + r.status);
  return r.text();
}

// render fnt_small (deltarune bitmap font) via the glyph atlas in font.js.
// the module bridge sets window.pixelize; queue until it's ready.
let pixpending = [];
function pixify(el) {
  if (!el) return;
  if (window.pixelize) window.pixelize(el);
  else pixpending.push(el);
}
window.addEventListener("fontready", () => {
  for (const el of pixpending) window.pixelize(el);
  pixpending = [];
});

// parse the compact .drdiff text into the per-part shape, merged with the
// manifest transition summary (which carries the counts + collapsed flag)
const DIFF_RX = /^FILE (root|ch\d|combined)\/(\S+) ([MAD]) (\d+) (\d+)$/;
function parsediff(text, t) {
  const parsed = {};
  let cur = null, body = [];
  const flush = () => {
    if (!cur) return;
    const p = parsed[cur.part] || (parsed[cur.part] = {modified: [], added: [], removed: []});
    while (body.length && body[body.length - 1] === "") body.pop();
    const content = body.join("\n");
    if (cur.kind === "M") p.modified.push({file: cur.file, plus: cur.plus, minus: cur.minus, diff: content});
    else if (cur.kind === "A") p.added.push({file: cur.file, lines: cur.plus, content: content});
    else p.removed.push({file: cur.file, lines: cur.minus, content: content});
  };
  for (const l of text.split("\n")) {
    const m = DIFF_RX.exec(l);
    if (m) {flush(); cur = {part: m[1], file: m[2], kind: m[3], plus: +m[4], minus: +m[5]}; body = [];}
    else if (cur) body.push(l);
  }
  flush();
  const parts = {};
  for (const part in t.parts) {
    const s = t.parts[part];
    const pp = parsed[part] || {modified: [], added: [], removed: []};
    parts[part] = {
      modified: pp.modified, added: pp.added, removed: pp.removed,
      added_count: s.a, removed_count: s.r, modified_count: s.m,
      plus: s.p, minus: s.mi, collapsed: !!s.collapsed,
    };
  }
  return {parts};
}

/*//////////////////////////////////////////////////////////////////////*/
/* top version rail */

function buildrail() {
  const rail = document.querySelector(".versionrail");
  rail.innerHTML = "";
  const eras = [];
  for (const v of manifest.versions) {
    let g = eras.find(e => e.era === v.era);
    if (!g) {g = {era: v.era, items: []}; eras.push(g);}
    g.items.push(v);
  }
  for (const g of eras) {
    const row = el("div", "erarow");
    const lab = el("div", "eralabel");
    lab.textContent = ERALABEL[g.era] || g.era;
    row.appendChild(lab);
    for (const v of g.items) {
      const chip = el("button", "vchip");
      chip.dataset.v = v.label;
      chip.innerHTML = esc(v.label) + "<span class=\"vdate\" fnt_small>" + esc(v.date || "") + "</span>";
      chip.addEventListener("click", () => selectversion(v.label));
      row.appendChild(chip);
    }
    rail.appendChild(row);
  }
  pixify(rail);
}

function transitionTo(label) {
  return manifest.transitions.find(t => t.to === label) || null;
}

async function selectversion(label) {
  const wasChangelog = sel.mode === "changelog";
  sel.version = label;
  location.hash = encodeURIComponent(label);
  for (const c of document.querySelectorAll(".vchip")) c.classList.toggle("active", c.dataset.v === label);
  const active = document.querySelector(".vchip.active");
  if (active) active.scrollIntoView({block: "nearest", inline: "center"});

  const t = transitionTo(label);
  let diff = null;
  if (t) {
    try {
      if (!diffcache[t.id]) {
        const txt = await fetchtext(S + "/diffs/" + t.id + ".diff");
        diffcache[t.id] = parsediff(txt, t);
      }
      diff = diffcache[t.id];
    } catch (e) { diff = null; }
  }
  sel.diff = diff;
  sel.trans = t;
  buildchapters(diff);
  // always focus the first chapter that actually changed
  // default to the LATEST (highest) chapter that actually has a diff to show
  const changed = diff ? PARTS.filter(p => diff.parts[p] && changedCount(diff.parts[p])) : [];
  const diffable = changed.filter(p => !diff.parts[p].collapsed);
  sel.chapter = (diffable.length ? diffable : changed).slice(-1)[0] || null;
  sel.file = null;
  // keep the changelog open across version switches, clamped to sources this version has
  sel.clshow.twitter = sel.clshow.twitter && changelogSet.has(label);
  sel.clshow.steam = sel.clshow.steam && steamSet.has(label);
  if (wasChangelog && !sel.clshow.twitter && !sel.clshow.steam && changelogSet.has(label))
    sel.clshow.twitter = true;
  sel.mode = (sel.clshow.twitter || sel.clshow.steam) ? "changelog" : "diff";
  updatechangelogbtn();
  rendercontent();
  markchaptertab();
}

/*//////////////////////////////////////////////////////////////////////*/
/* chapter subbar */

function changedCount(p) {
  return (p.added_count || 0) + (p.removed_count || 0) + (p.modified_count || 0);
}

function buildchapters(diff) {
  const bar = document.querySelector(".chapterbar");
  bar.innerHTML = "";
  if (!diff) return;
  for (const p of PARTS) {
    const d = diff.parts[p];
    if (!d) continue;
    const n = changedCount(d);
    if (!n && !d.collapsed) continue;             // hide unchanged chapters
    const locked = !!d.collapsed;                  // a freshly-added chapter isn't diffable
    const tab = el("button", "ctab" + (locked ? " locked" : ""));
    tab.dataset.part = p;
    let badge;
    if (d.collapsed) {
      const cb = [];
      if (d.added_count) cb.push("<span class=\"ba\" green>+" + d.added_count + "</span>");
      if (d.removed_count) cb.push("<span class=\"bd\" red>-" + d.removed_count + "</span>");
      badge = "<span class=\"cbadge\" fnt_small>" + cb.join("") + "</span>";
    } else {
      const bits = [];
      if (d.added_count) bits.push("<span class=\"ba\" green>+" + d.added_count + "</span>");
      if (d.modified_count) bits.push("<span class=\"bm\" azure>~" + d.modified_count + "</span>");
      if (d.removed_count) bits.push("<span class=\"bd\" red>-" + d.removed_count + "</span>");
      badge = "<span class=\"cbadge\" fnt_small>" + bits.join("") + "</span>";
    }
    const iurl = PARTICON[p] ? "/assets/images/chapters/" + PARTICON[p] : "";
    const icon = iurl ? "<span class=\"cicon\"><img src=\"" + iurl + "\" alt=\"\"></span>" : "";
    tab.innerHTML = icon + "<span class=\"ctext\"><span class=\"cname\">" + esc(PARTLABEL[p]) + "</span>" + badge + "</span>";
    if (!locked) tab.addEventListener("click", () => {sel.chapter = p; sel.file = null; sel.mode = "diff"; rendercontent(); markchaptertab();});
    bar.appendChild(tab);
  }
  pixify(bar);
}

function markchaptertab() {
  for (const t of document.querySelectorAll(".ctab"))
    t.classList.toggle("active", sel.mode === "diff" && t.dataset.part === sel.chapter);
  for (const b of document.querySelectorAll(".cswbtn"))
    b.classList.toggle("on", sel.mode === "changelog" && !!sel.clshow[b.dataset.src]);
}

/*//////////////////////////////////////////////////////////////////////*/
/* content dispatch */

function rendercontent() {
  markchaptertab();
  if (!sel.trans) return renderbaseline();
  renderfilelist();                       // keep the sidebar populated in either mode
  if (sel.mode === "changelog") renderchangelog();
  else renderdiffpane();
}

function renderbaseline() {
  document.querySelector(".filelist").innerHTML = "<div class=\"fempty\">baseline build - nothing prior to diff against.</div>";
  document.querySelector(".content").innerHTML = "<div class=\"notecode\">" + esc(sel.version) +
    " is the earliest tracked build (chapters 3 &amp; 4 launch). there's no earlier version here to diff against - pick a later version above.</div>";
}

function updatechangelogbtn() {
  const sw = document.querySelector(".changelogswitch");
  const hasTw = changelogSet.has(sel.version), hasSt = steamSet.has(sel.version);
  sw.style.display = (hasTw || hasSt) ? "" : "none";
  sw.querySelector("[data-src=twitter]").style.display = hasTw ? "" : "none";
  sw.querySelector("[data-src=steam]").style.display = hasSt ? "" : "none";
}

/*//////////////////////////////////////////////////////////////////////*/
/* sidebar file list */

function shortname(n) {
  return n.replace(/\.gml$/, "").replace(/^gml_/, "");
}

function renderfilelist() {
  const list = document.querySelector(".filelist");
  list.innerHTML = "";
  const d = sel.diff && sel.chapter ? sel.diff.parts[sel.chapter] : null;
  if (!d) {list.innerHTML = "<div class=\"fempty\">no chapter selected.</div>"; return;}
  if (d.collapsed) {
    list.innerHTML = "<div class=\"fempty\">chapter 5 was added here.<br>" + d.added_count +
      " new code entries.<br>excluded from the line diff.</div>";
    return;
  }
  const rows = [];
  for (const m of d.modified) rows.push({kind: "mod", file: m.file, mod: m});
  for (const o of d.added) rows.push({kind: "add", file: o.file, lines: o.lines});
  for (const o of d.removed) rows.push({kind: "del", file: o.file, lines: o.lines});
  if (!rows.length) {list.innerHTML = "<div class=\"fempty\">no changes in this chapter.</div>"; return;}

  for (const r of rows) {
    const row = el("div", "frow " + r.kind);
    row.dataset.file = r.file;
    let stat;
    if (r.kind === "add") stat = "<span class=\"fstat\" fnt_small><span class=\"p\" green>+" + r.lines + "</span></span>";
    else if (r.kind === "del") stat = "<span class=\"fstat\" fnt_small><span class=\"m\" red>-" + r.lines + "</span></span>";
    else stat = "<span class=\"fstat\" fnt_small><span class=\"p\" green>+" + r.mod.plus + "</span> <span class=\"m\" red>-" + r.mod.minus + "</span></span>";
    row.innerHTML = "<span class=\"fname\" title=\"" + esc(r.file) + "\">" + esc(shortname(r.file)) + "</span>" + stat;
    row.addEventListener("click", () => {sel.file = r.file; sel.mode = "diff"; sel.clshow.twitter = sel.clshow.steam = false; renderdiffpane(); highlightrow(); markchaptertab();});
    list.appendChild(row);
  }
  if (!sel.file || !rows.some(r => r.file === sel.file)) sel.file = rows[0].file;
  highlightrow();
  pixify(list);
}

function highlightrow() {
  for (const r of document.querySelectorAll(".frow")) r.classList.toggle("active", r.dataset.file === sel.file);
}

/*//////////////////////////////////////////////////////////////////////*/
/* diff pane */

function renderdiffpane() {
  const c = document.querySelector(".content");
  const d = sel.diff && sel.chapter ? sel.diff.parts[sel.chapter] : null;
  if (!d) {c.innerHTML = "<div class=\"hint\">nothing to show.</div>"; return;}
  if (d.collapsed) {
    const msg = d.added_count
      ? esc(PARTLABEL[sel.chapter]) + " debuted in this version - " + d.added_count + " code entries added at once."
      : esc(PARTLABEL[sel.chapter]) + " was restructured here - " + d.removed_count + " entries removed (split into separate chapters).";
    c.innerHTML = "<div class=\"notecode\">" + msg + " excluded from the line diff.</div>";
    return;
  }
  const mod = (d.modified || []).find(m => m.file === sel.file);
  if (mod) {
    c.innerHTML = "<div class=\"code\">" + renderdiff(mod.diff) + "</div>";
    c.scrollTop = 0;
    return;
  }
  const add = (d.added || []).find(a => a.file === sel.file);
  const del = (d.removed || []).find(r => r.file === sel.file);
  const whole = add || del;
  if (whole) {
    c.innerHTML = "<div class=\"code\">" + renderfull(whole.content, add ? "add" : "del") + "</div>";
    c.scrollTop = 0;
    return;
  }
  c.innerHTML = "<div class=\"notecode\">pick an entry.</div>";
}

function renderfull(content, kind) {
  let out = "";
  for (const l of content.split("\n"))
    out += "<span class=\"cline " + kind + "\">" + highlightGml(l) + "</span>";
  return out;
}

function renderdiff(txt) {
  let out = "";
  for (const l of txt.split("\n")) {
    if (l.startsWith("+++") || l.startsWith("---")) continue;
    if (l.startsWith("@@")) {out += "<span class=\"cline hunk\">" + esc(l) + "</span>"; continue;}
    let cls = "ctx", body = l;
    if (l.startsWith("+")) {cls = "add"; body = l.slice(1);}
    else if (l.startsWith("-")) {cls = "del"; body = l.slice(1);}
    else body = l.startsWith(" ") ? l.slice(1) : l;
    out += "<span class=\"cline " + cls + "\">" + highlightGml(body) + "</span>";
  }
  return out;
}

/*//////////////////////////////////////////////////////////////////////*/
/* changelog recreation (verdana) */

function doodlehtml(version, side) {
  const p = doodles[version] && doodles[version][side];
  if (!p) return "<span class=\"cl-dood-spacer\"></span>";
  return "<img class=\"cl-dood " + side + (p.flip ? " flip" : "") + "\" src=\"/assets/images/" + esc(p.src) + "\" alt=\"\">";
}

// changelogs are per-version markdown files (assets/static/changelogs/<v>.md),
// hand-editable to fix ocr. parse into the render structure.
async function getcl(version) {
  if (clcache[version]) return clcache[version];
  const md = await fetchtext(S + "/changelogs/" + version + ".md").catch(() => null);
  const parsed = md == null ? null : parsemd(md);
  clcache[version] = parsed;
  return parsed;
}

function parsemd(text) {
  const out = {title: "", subtitle: "", intro: "", table: null, sections: [], footer: ""};
  let cur = null;
  const introLines = [];
  for (const raw of text.split("\n")) {
    const l = raw.replace(/\s+$/, "");
    if (l.startsWith("# ")) {out.title = l.slice(2).trim(); continue;}
    if (l.startsWith("## ")) {out.subtitle = l.slice(3).trim(); continue;}
    if (l.startsWith("### ")) {
      const name = l.slice(4).trim();
      if (name === "Version Numbers") {out.table = {cols: [], rows: []}; cur = "table"; continue;}
      cur = {header: name, items: []};
      out.sections.push(cur);
      continue;
    }
    if (l.trim().startsWith("|") && cur === "table") {
      const cells = l.split("|").slice(1, -1).map(x => x.trim());
      if (cells.every(x => /^-*$/.test(x))) continue;          // separator row
      if (!out.table.cols.length && cells[0] === "") out.table.cols = cells.slice(1);
      else out.table.rows.push(cells);
      continue;
    }
    if (l.startsWith("- ")) {
      let txt = l.slice(2).trim();
      let tag = null;
      const m = txt.match(/^\[([^\]]+)\]\s*/);
      if (m) {tag = m[1]; txt = txt.slice(m[0].length);}
      if (!cur || !cur.items) {cur = {header: "", items: []}; out.sections.push(cur);}
      cur.items.push({text: txt, tag});
      continue;
    }
    if (l.startsWith("> ")) {out.footer = (out.footer + " " + l.slice(2).trim()).trim(); continue;}
    if (l.trim()) {
      if (cur === "table" || cur === null && !out.sections.length) introLines.push(l.trim());
      else if (cur && cur.items && cur.items.length) cur.items[cur.items.length - 1].text += " " + l.trim();
      else if (!out.sections.length) introLines.push(l.trim());
      else out.footer = (out.footer + " " + l.trim()).trim();
    }
  }
  out.intro = introLines.join(" ");
  return out;
}

async function renderchangelog() {
  const c = document.querySelector(".content");
  const version = sel.version;
  let body;
  if (sel.clshow.twitter && sel.clshow.steam) {
    body = await renderwordingdiff(version);                 // both toggled -> wording diff
  } else if (sel.clshow.steam) {
    const st = await getsteamcl(version);
    body = st ? recreationhtml(st, version) : nochangeloghtml(version);
  } else {
    const cl = await getcl(version);
    body = cl ? recreationhtml(cl, version) : nochangeloghtml(version);
  }
  if (version !== sel.version || sel.mode !== "changelog") return;   // user moved on
  c.innerHTML = body;
  c.scrollTop = 0;
}

function nochangeloghtml(version) {
  return "<div class=\"changelog\"><div class=\"cl-title\">no changelog</div>" +
    "<div class=\"cl-intro\">no official patch notes were posted for " + esc(version) + ".</div></div>";
}

async function getsteamcl(version) {
  const key = "st:" + version;
  if (clcache[key]) return clcache[key];
  const md = await fetchtext(S + "/steamchangelogs/" + version + ".md").catch(() => null);
  clcache[key] = md == null ? null : parsemd(md);
  return clcache[key];
}

function recreationhtml(cl, version) {
  let h = "<div class=\"changelog\">";
  h += "<div class=\"cl-head\">" + doodlehtml(version, "left") + "<div class=\"cl-headtext\">";
  h += "<div class=\"cl-title\">" + esc(cl.title) + "</div>";
  if (cl.subtitle) h += "<div class=\"cl-sub\">" + esc(cl.subtitle) + "</div>";
  if (cl.intro) h += "<div class=\"cl-intro\">" + esc(cl.intro) + "</div>";
  h += "</div>" + doodlehtml(version, "right") + "</div>";
  if (cl.table && cl.table.rows.length) {
    h += "<div class=\"cl-h\">Version Numbers</div><table class=\"cl-table\"><tr><th></th>";
    for (const col of cl.table.cols) h += "<th>" + esc(col) + "</th>";
    h += "</tr>";
    for (const row of cl.table.rows) {
      h += "<tr><td class=\"rowh\">" + esc(row[0]) + "</td>";
      for (let i = 1; i < row.length; i++) h += "<td>" + esc(row[i]) + "</td>";
      h += "</tr>";
    }
    h += "</table>";
  }
  if (cl.sections.length) h += "<div class=\"cl-h\">Changelist</div>";
  for (const sec of cl.sections) {
    h += "<div class=\"cl-section\">";
    if (sec.header) h += "<div class=\"cl-sech\">" + esc(sec.header) + "</div>";
    for (const it of sec.items) {
      const tag = it.tag ? "<span class=\"cl-tag\">[" + esc(it.tag) + "] </span>" : "";
      h += "<div class=\"cl-item\"><span class=\"bullet\">&middot;</span><span>" + tag + esc(it.text) + "</span></div>";
    }
    h += "</div>";
  }
  if (cl.footer) h += "<div class=\"cl-footer\">" + esc(cl.footer) + "</div>";
  h += "</div>";
  return h;
}

async function getrawmd(src, version) {
  const key = src + "/" + version;
  if (clraw[key] != null) return clraw[key];
  clraw[key] = await fetchtext(S + "/" + src + "/" + version + ".md").catch(() => "");
  return clraw[key];
}

function mdplain(md) {
  return md.split("\n").map(l =>
    l.replace(/^#{1,6}\s*/, "").replace(/^\s*[-*]\s*/, "").replace(/^>\s*/, "")
     .replace(/^\[[^\]]+\]\s*/, "").replace(/\|/g, " ").replace(/\*\*/g, "").trim())
    .filter(x => x && !/^-+$/.test(x)).join("\n");
}

async function renderwordingdiff(version) {
  const [tw, st, cl] = await Promise.all([
    getrawmd("changelogs", version), getrawmd("steamchangelogs", version), getcl(version)]);
  let h = "<div class=\"changelog worddiff\">";
  h += "<div class=\"cl-head\">" + doodlehtml(version, "left") + "<div class=\"cl-headtext\">";
  h += "<div class=\"cl-title\">" + esc(cl ? cl.title : version) + "</div>";
  h += "</div>" + doodlehtml(version, "right") + "</div>";
  h += "<div class=\"wdbody\">" + worddiff(mdplain(tw), mdplain(st)) + "</div></div>";
  return h;
}

// word-level LCS diff of the two wordings
function worddiff(a, b) {
  const A = a.split(/(\s+)/).filter(t => t.length);
  const B = b.split(/(\s+)/).filter(t => t.length);
  const n = A.length, m = B.length;
  const dp = [];
  for (let i = 0; i <= n; i++) dp.push(new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ws = t => /^\s+$/.test(t);
  const emit = (cls, t) => ws(t) ? t.replace(/\n/g, "<br>") : "<span class=\"" + cls + "\">" + esc(t) + "</span>";
  let i = 0, j = 0, out = "";
  while (i < n && j < m) {
    if (A[i] === B[j]) {out += ws(A[i]) ? A[i].replace(/\n/g, "<br>") : esc(A[i]); i++; j++;}
    else if (dp[i + 1][j] >= dp[i][j + 1]) {out += emit("wdel", A[i]); i++;}
    else {out += emit("wadd", B[j]); j++;}
  }
  while (i < n) out += emit("wdel", A[i++]);
  while (j < m) out += emit("wadd", B[j++]);
  return out;
}

/*//////////////////////////////////////////////////////////////////////*/
/* helpers */

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"}[c]));
}

boot();

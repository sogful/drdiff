"use strict";

const PARTS = ["root", "ch1", "ch2", "ch3", "ch4", "ch5"];
const PARTLABEL = {root: "launcher", ch1: "chapter 1", ch2: "chapter 2", ch3: "chapter 3", ch4: "chapter 4", ch5: "chapter 5"};
const S = "/assets/static";

let manifest = null;
let notes = {};
let changelogs = {};
const diffcache = {};
const sel = {version: null, chapter: null, file: null, mode: "diff"};

/*//////////////////////////////////////////////////////////////////////*/
/* boot */

async function boot() {
  try {
    manifest = await fetchjson(S + "/manifest.json");
    [notes, changelogs] = await Promise.all([
      fetchjson(S + "/notes.json").catch(() => ({})),
      fetchjson(S + "/changelogs.json").catch(() => ({})),
    ]);
  } catch (e) {
    document.querySelector(".content").innerHTML = "<div class=\"hint\">no data. run build_site.py.</div>";
    return;
  }
  buildrail();
  document.querySelector(".changelogtoggle").addEventListener("click", () => {
    sel.mode = sel.mode === "changelog" ? "diff" : "changelog";
    rendercontent();
  });
  const hash = decodeURIComponent(location.hash.slice(1));
  const start = manifest.versions.find(v => v.label === hash) || manifest.versions[manifest.versions.length - 1];
  await selectversion(start.label);
  const q = new URLSearchParams(location.search);
  if (q.has("changelog")) {sel.mode = "changelog"; rendercontent();}
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

/*//////////////////////////////////////////////////////////////////////*/
/* top version rail */

function buildrail() {
  const rail = document.querySelector(".versionrail");
  rail.innerHTML = "";
  let era = null;
  for (const v of manifest.versions) {
    if (v.era !== era) {
      era = v.era;
      const lab = el("div", "eralabel");
      lab.textContent = era === "ch5" ? "ch5" : "ch3&4";
      rail.appendChild(lab);
    }
    const chip = el("button", "vchip");
    chip.dataset.v = v.label;
    chip.innerHTML = esc(v.label) + "<span class=\"vdate\">" + esc(v.date || "") + "</span>";
    chip.addEventListener("click", () => selectversion(v.label));
    rail.appendChild(chip);
  }
}

function transitionTo(label) {
  return manifest.transitions.find(t => t.to === label) || null;
}

async function selectversion(label) {
  sel.version = label;
  location.hash = encodeURIComponent(label);
  for (const c of document.querySelectorAll(".vchip")) c.classList.toggle("active", c.dataset.v === label);
  const active = document.querySelector(".vchip.active");
  if (active) active.scrollIntoView({block: "nearest", inline: "center"});

  const t = transitionTo(label);
  let diff = null;
  if (t) {
    try {
      diff = diffcache[t.id] || (diffcache[t.id] = await fetchjson(S + "/diffs/" + t.id + ".json"));
    } catch (e) { diff = null; }
  }
  sel.diff = diff;
  sel.trans = t;
  buildchapters(diff);
  // default: changelog if this version has one and no diff, else first changed chapter
  const firstChanged = diff ? PARTS.find(p => diff.parts[p] && changedCount(diff.parts[p])) : null;
  sel.chapter = firstChanged || (diff ? PARTS.find(p => diff.parts[p]) : null);
  sel.file = null;
  if (!t) sel.mode = "changelog";
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
    const tab = el("button", "ctab");
    tab.dataset.part = p;
    let badge = "";
    if (d.collapsed) badge = "<span class=\"cbadge newc\">+" + d.added_count + " new</span>";
    else badge = "<span class=\"cbadge\">" + n + "</span>";
    tab.innerHTML = esc(PARTLABEL[p]) + badge;
    tab.addEventListener("click", () => {sel.chapter = p; sel.file = null; sel.mode = "diff"; rendercontent(); markchaptertab();});
    bar.appendChild(tab);
  }
}

function markchaptertab() {
  for (const t of document.querySelectorAll(".ctab"))
    t.classList.toggle("active", sel.mode === "diff" && t.dataset.part === sel.chapter);
  document.querySelector(".changelogtoggle").classList.toggle("active", sel.mode === "changelog");
}

/*//////////////////////////////////////////////////////////////////////*/
/* content dispatch */

function rendercontent() {
  markchaptertab();
  if (sel.mode === "changelog") return renderchangelog();
  renderfilelist();
  renderdiffpane();
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
    if (r.kind === "add") stat = "<span class=\"fstat\"><span class=\"p\">+" + r.lines + "</span></span>";
    else if (r.kind === "del") stat = "<span class=\"fstat\"><span class=\"m\">-" + r.lines + "</span></span>";
    else stat = "<span class=\"fstat\"><span class=\"p\">+" + r.mod.plus + "</span> <span class=\"m\">-" + r.mod.minus + "</span></span>";
    row.innerHTML = "<span class=\"fname\" title=\"" + esc(r.file) + "\">" + esc(shortname(r.file)) + "</span>" + stat;
    row.addEventListener("click", () => {sel.file = r.file; renderdiffpane(); highlightrow();});
    list.appendChild(row);
  }
  if (!sel.file || !rows.some(r => r.file === sel.file)) sel.file = rows[0].file;
  highlightrow();
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
    c.innerHTML = "<div class=\"notecode\">chapter 5 debuted in this version - " + d.added_count +
      " code entries added at once. that bulk addition is excluded from the line diff; browse the later chapter-5 steps to see it change.</div>";
    return;
  }
  const mod = (d.modified || []).find(m => m.file === sel.file);
  if (mod) {
    c.innerHTML = "<div class=\"difftop\"><span class=\"dfile\">" + esc(shortname(mod.file)) +
      "</span><span class=\"dstat\"><span class=\"p\">+" + mod.plus + "</span> <span class=\"m\">-" + mod.minus + "</span></span></div>" +
      "<div class=\"code\">" + renderdiff(mod.diff) + "</div>";
    c.scrollTop = 0;
    return;
  }
  const add = (d.added || []).find(a => a.file === sel.file);
  const del = (d.removed || []).find(r => r.file === sel.file);
  const whole = add || del;
  if (whole) {
    const kind = add ? "add" : "del";
    const label = add ? "<span class=\"p\">+" + whole.lines + " new file</span>" : "<span class=\"m\">-" + whole.lines + " deleted file</span>";
    c.innerHTML = "<div class=\"difftop\"><span class=\"dfile " + kind + "\">" + esc(shortname(whole.file)) +
      "</span><span class=\"dstat\">" + label + "</span></div>" +
      "<div class=\"code\">" + renderfull(whole.content, kind) + "</div>";
    c.scrollTop = 0;
    return;
  }
  c.innerHTML = "<div class=\"notecode\">pick an entry.</div>";
}

function renderfull(content, kind) {
  let out = "";
  const sign = kind === "add" ? "+" : "-";
  for (const l of content.split("\n"))
    out += "<span class=\"cline " + kind + "\"><span class=\"sign\">" + sign + "</span>" + highlightGml(l) + "</span>";
  return out;
}

function renderdiff(txt) {
  let out = "";
  for (const l of txt.split("\n")) {
    if (l.startsWith("+++") || l.startsWith("---")) continue;
    if (l.startsWith("@@")) {out += "<span class=\"cline hunk\">" + esc(l) + "</span>"; continue;}
    let cls = "ctx", sign = " ", body = l;
    if (l.startsWith("+")) {cls = "add"; sign = "+"; body = l.slice(1);}
    else if (l.startsWith("-")) {cls = "del"; sign = "-"; body = l.slice(1);}
    else body = l.startsWith(" ") ? l.slice(1) : l;
    out += "<span class=\"cline " + cls + "\"><span class=\"sign\">" + sign + "</span>" + highlightGml(body) + "</span>";
  }
  return out;
}

/*//////////////////////////////////////////////////////////////////////*/
/* changelog recreation (verdana) */

function renderchangelog() {
  const c = document.querySelector(".content");
  const cl = changelogs[sel.version];
  if (!cl) {
    c.innerHTML = "<div class=\"changelog\"><div class=\"cl-title\">no changelog</div>" +
      "<div class=\"cl-intro\">no official patch notes were posted for " + esc(sel.version) + ".</div></div>";
    return;
  }
  let h = "<div class=\"changelog\">";
  h += "<div class=\"cl-title\">" + esc(cl.title) + "</div>";
  if (cl.subtitle) h += "<div class=\"cl-sub\">" + esc(cl.subtitle) + "</div>";
  if (cl.intro) h += "<div class=\"cl-intro\">" + esc(cl.intro) + "</div>";
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
  h += "<div class=\"cl-note\">recreated in verdana from the official patch-note image, illustrations omitted.</div>";
  h += "</div>";
  c.innerHTML = h;
  c.scrollTop = 0;
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

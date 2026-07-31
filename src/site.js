"use strict";

const partkeys = ["root", "combined", "ch1", "ch2", "ch3", "ch4", "ch5"];
const partlabel = {root: "launcher", ch1: "chapter 1", ch2: "chapter 2", ch3: "chapter 3", ch4: "chapter 4", ch5: "chapter 5", combined: "chapter 1&2"};
const particon = {ch1: "ch1.png", ch2: "ch2.png", ch3: "ch3tv.png", ch4: "ch4.png", ch5: "ch5.png"};
const eralabels = {demo: "ch1&2", release: "ch3&4", ch5: "ch5"};
const exclude = new Set();
const staticbase = "/assets/static";

let manifest = null;
let changelogset = new Set();
let steamset = new Set();
let doodles = {};
const diffcache = {};
const clcache = {};
const clraw = {};
const sel = {version: null, chapter: null, file: null, mode: "changelog", clview: "twitter", hideids: false};
const idkey = "drdiff-hideids";

/*//////////////////////////////////////////////////////////////////////*/

// 👢 <-
async function boot() {
  try {
    manifest = await fetchjson(staticbase + "/manifest.json");
    let clindex, stindex;
    [clindex, doodles, stindex] = await Promise.all([
      fetchjson(staticbase + "/changelogs/index.json").catch(() => []),
      fetchjson(staticbase + "/doodles.json").catch(() => ({})),
      fetchjson(staticbase + "/steamchangelogs/index.json").catch(() => []),
    ]);
    changelogset = new Set(clindex);
    steamset = new Set(stindex);
  } catch (e) {
    document.querySelector(".content").innerHTML = "<div class=\"hint\">no data. run buildsite.py.</div>";
    return;
  }
  manifest.versions = manifest.versions.filter(v => !exclude.has(v.label));
  buildrail();
  initidfilter();
  for (const b of document.querySelectorAll(".cswbtn")) {
    b.addEventListener("click", () => {
      const v = b.dataset.view;
      sel.clview = (sel.mode === "changelog" && sel.clview === v) ? null : v;
      sel.mode = sel.clview ? "changelog" : "diff";
      rendercontent();
    });
  }
  const hash = decodeURIComponent(location.hash.slice(1));
  const start = manifest.versions.find(v => v.label === hash) || manifest.versions[manifest.versions.length - 1];
  await selectversion(start.label);
  const q = new URLSearchParams(location.search);
  const cl = q.get("cl") || (q.has("changelog") ? "twitter" : "");
  if (cl) {
    sel.clview = cl;
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

const diffrx = /^FILE (root|ch\d|combined)\/(\S+) ([MAD]) (\d+) (\d+)$/;
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
    const m = diffrx.exec(l);
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
      addedcount: s.a, removedcount: s.r, modifiedcount: s.m,
      plus: s.p, minus: s.mi, collapsed: !!s.collapsed,
    };
  }
  return {parts};
}

/*//////////////////////////////////////////////////////////////////////*/

const numrx = /(?<![\w.])\d+(?![\w.])/g;
const strrx = /"(?:[^"\\]|\\.)*"/g;

function isidswap(a, b) {
  const ma = a.replace(strrx, m => " ".repeat(m.length));
  const mb = b.replace(strrx, m => " ".repeat(m.length));
  const na = ma.match(numrx), nb = mb.match(numrx);
  if (!na || !nb || na.length !== nb.length) return false;
  if (ma.replace(numrx, "#") !== mb.replace(numrx, "#")) return false;
  let moved = false;
  for (let i = 0; i < na.length; i++) {
    if (na[i] === nb[i]) continue;
    moved = true;
    const x = +na[i], y = +nb[i];
    if (Math.min(x, y) < 100 || Math.abs(x - y) / Math.max(x, y) >= 0.02) return false;
  }
  return moved;
}
function dropemptyhunks(lines) {
  const out = [];
  let buf = null, live = false;
  const flush = () => {if (buf && live) out.push(...buf); buf = null; live = false;};
  for (const l of lines) {
    if (l.startsWith("@@")) {flush(); buf = [l]; continue;}
    if (!buf) {out.push(l); continue;}
    buf.push(l);
    if (l[0] === "+" || l[0] === "-") live = true;
  }
  flush();
  return out;
}
function filterdiff(txt) {
  const lines = txt.split("\n"), out = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].startsWith("-")) {out.push(lines[i]); i++; continue;}
    let j = i;
    while (j < lines.length && lines[j].startsWith("-")) j++;
    let k = j;
    while (k < lines.length && lines[k].startsWith("+")) k++;
    const n = j - i;
    let swapped = k - j === n;
    for (let t = 0; swapped && t < n; t++)
      swapped = isidswap(lines[i + t].slice(1), lines[j + t].slice(1));
    if (swapped) for (let t = 0; t < n; t++) out.push(" " + lines[j + t].slice(1));
    else for (let t = i; t < k; t++) out.push(lines[t]);
    i = k;
  }
  return dropemptyhunks(out);
}

function filtered(mod) {
  if (!mod.flines) {
    mod.flines = filterdiff(mod.diff);
    mod.fplus = mod.flines.filter(l => l.startsWith("+")).length;
    mod.fminus = mod.flines.filter(l => l.startsWith("-")).length;
  }
  return mod;
}

function realmods(d) {
  if (!sel.hideids || !d.modified) return d.modified || [];
  return d.modified.filter(m => filtered(m).fplus || m.fminus);
}

function partcounts(d) {
  if (!sel.hideids || d.collapsed || !d.modified || !d.modified.length)
    return {a: d.addedcount, m: d.modifiedcount, r: d.removedcount};
  return {a: d.addedcount, m: realmods(d).length, r: d.removedcount};
}

function initidfilter() {
  const box = document.querySelector(".idfilter");
  sel.hideids = localStorage.getItem(idkey) === "1";
  const paint = () => {
    box.classList.toggle("on", sel.hideids);
    box.querySelector(".ifcheck").src = "/assets/images/check" + (sel.hideids ? "on" : "off") + ".png";
  };
  box.addEventListener("click", () => {
    sel.hideids = !sel.hideids;
    localStorage.setItem(idkey, sel.hideids ? "1" : "0");
    paint();
    buildchapters(sel.diff);
    rendercontent();
  });
  paint();
  pixify(box);
}

/*//////////////////////////////////////////////////////////////////////*/

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
    lab.textContent = eralabels[g.era] || g.era;
    row.appendChild(lab);

    const chips = el("div", "erachips");
    for (const v of g.items) {
      const baseline = !transitionto(v.label); // nothing before it to diff against
      const chip = el("button", "vchip" + (baseline ? " baseline" : ""));
      chip.dataset.v = v.label;
      chip.innerHTML = esc(v.label) + "<span class=\"vdate\" fnt_small>" + esc(v.date || "") + "</span>" +
        (v.branch ? "<span class=\"vbranch\" fnt_small azure>" + esc(v.branch) + "</span>" : "");
      if (!baseline) chip.addEventListener("click", () => selectversion(v.label));
      chips.appendChild(chip);
    }
    row.appendChild(chips);
    rail.appendChild(row);
  }
  pixify(rail);
}

function transitionto(label) {
  return manifest.transitions.find(t => t.to === label) || null;
}

async function selectversion(label) {
  const waschangelog = sel.mode === "changelog";
  sel.version = label;
  location.hash = encodeURIComponent(label);
  for (const c of document.querySelectorAll(".vchip")) c.classList.toggle("active", c.dataset.v === label);
  const active = document.querySelector(".vchip.active");
  if (active) active.scrollIntoView({block: "nearest", inline: "center"});

  const t = transitionto(label);
  let diff = null;
  if (t) {
    try {
      if (!diffcache[t.id]) {
        const txt = await fetchtext(staticbase + "/diffs/" + t.id + ".diff");
        diffcache[t.id] = parsediff(txt, t);
      }
      diff = diffcache[t.id];
    } catch (e) { diff = null; }
  }
  sel.diff = diff;
  sel.trans = t;
  buildchapters(diff);
  // always focus the first chapter that actually changed
  const changed = diff ? partkeys.filter(p => diff.parts[p] && changedcount(diff.parts[p])) : [];
  const diffable = changed.filter(p => !diff.parts[p].collapsed);
  sel.chapter = (diffable.length ? diffable : changed).slice(-1)[0] || null;
  sel.file = null;
  const hastwitter = changelogset.has(label), hassteam = steamset.has(label);
  const ok = {twitter: hastwitter, steam: hassteam, diff: hastwitter && hassteam};
  if (waschangelog) {
    if (!sel.clview || !ok[sel.clview]) sel.clview = hastwitter ? "twitter" : (hassteam ? "steam" : null);
  } else {
    sel.clview = null;
  }
  sel.mode = sel.clview ? "changelog" : "diff";
  updatechangelogbtn();
  rendercontent();
  markchaptertab();
}

/*//////////////////////////////////////////////////////////////////////*/

function changedcount(p) {
  const c = partcounts(p);
  return (c.a || 0) + (c.r || 0) + (c.m || 0);
}

function buildchapters(diff) {
  const bar = document.querySelector(".chaptertabs");
  bar.innerHTML = "";
  document.querySelector(".idfilter").style.display = diff ? "" : "none";
  if (!diff) return;
  for (const p of partkeys) {
    const d = diff.parts[p];
    if (!d) continue;
    const c = partcounts(d);
    if (!changedcount(d) && !d.collapsed) continue; // hide unchanged chapters

    const locked = !!d.collapsed;
    const muted = !locked && !c.a && !c.m && c.r;
    const tab = el("button", "ctab" + (locked ? " locked" : "") + (muted ? " muted" : ""));
    tab.dataset.part = p;
    const bits = [];
    if (c.a) bits.push("<span class=\"ba\" green>+" + c.a + "</span>");
    if (!locked && c.m) bits.push("<span class=\"bm\" azure>~" + c.m + "</span>");
    if (c.r) bits.push("<span class=\"bd\" red>-" + c.r + "</span>");
    const badge = "<span class=\"cbadge\" fnt_small>" + bits.join("") + "</span>";
    const iurl = particon[p] ? "/assets/images/chapters/" + particon[p] : "";
    const icon = iurl ? "<span class=\"cicon\"><img src=\"" + iurl + "\" alt=\"\"></span>" : "";
    tab.innerHTML = icon + "<span class=\"ctext\"><span class=\"cname\">" + esc(partlabel[p]) + "</span>" + badge + "</span>";
   
    if (!locked) tab.addEventListener("click", () => {sel.chapter = p; sel.file = null; sel.mode = "diff"; rendercontent(); markchaptertab();});
    bar.appendChild(tab);
  }
  pixify(bar);
}

function markchaptertab() {
  for (const t of document.querySelectorAll(".ctab"))
    t.classList.toggle("active", t.dataset.part === sel.chapter);
  for (const b of document.querySelectorAll(".cswbtn"))
    b.classList.toggle("on", sel.mode === "changelog" && sel.clview === b.dataset.view);
}

/*//////////////////////////////////////////////////////////////////////*/

function rendercontent() {
  markchaptertab();
  marksidebar();
  if (!sel.trans) return renderbaseline();
  renderfilelist();
  if (sel.mode === "changelog") renderchangelog();
  else renderdiffpane();
}

function marksidebar() {
  const parts = sel.diff ? sel.diff.parts : null;
  const code = !!parts && partkeys.some(p => parts[p] && !parts[p].collapsed && changedcount(parts[p]));
  const cl = changelogset.has(sel.version) || steamset.has(sel.version);
  const bar = document.querySelector(".sidebar");
  bar.classList.toggle("nocode", !code && cl);
  bar.classList.toggle("empty", !code && !cl);
}

function renderbaseline() {
  document.querySelector(".filelist").innerHTML = "<div class=\"fempty\">baseline build - nothing prior to diff against.</div>";
  document.querySelector(".content").innerHTML = "<div class=\"notecode\">" + esc(sel.version) +
    " is the earliest tracked build. there's no earlier version here to diff against - pick a later version above.</div>";
}

function updatechangelogbtn() {
  const sw = document.querySelector(".changelogswitch");
  const hastwitter = changelogset.has(sel.version), hassteam = steamset.has(sel.version);
  sw.style.display = (hastwitter || hassteam) ? "" : "none";
  sw.querySelector("[data-view=twitter]").style.display = hastwitter ? "" : "none";
  sw.querySelector("[data-view=steam]").style.display = hassteam ? "" : "none";
  sw.querySelector("[data-view=diff]").style.display = (hastwitter && hassteam) ? "" : "none";
  const pad = (hastwitter || hassteam) ? sw.offsetHeight + 10 : 8;
  document.querySelector(".filelist").style.paddingBottom = pad + "px";
}

/*//////////////////////////////////////////////////////////////////////*/

function shortname(n) {
  return n.replace(/\.gml$/, "").replace(/^gml_/, "");
}

function renderfilelist() {
  const list = document.querySelector(".filelist");
  list.innerHTML = "";
  const d = sel.diff && sel.chapter ? sel.diff.parts[sel.chapter] : null;
  if (!d) {list.innerHTML = "<div class=\"fempty\">no chapter selected.</div>"; return;}
  if (d.collapsed) {
    list.innerHTML = "<div class=\"fempty\">" + (d.addedcount
      ? esc(partlabel[sel.chapter]) + " was added here.<br>" + d.addedcount + " new code entries."
      : esc(partlabel[sel.chapter]) + " was restructured here.<br>" + d.removedcount + " entries removed.") +
      "<br>excluded from the line diff.</div>";
    return;
  }
  const rows = [];
  for (const m of realmods(d)) rows.push({kind: "mod", file: m.file, mod: m});
  for (const o of d.added) rows.push({kind: "add", file: o.file, lines: o.lines});
  for (const o of d.removed) rows.push({kind: "del", file: o.file, lines: o.lines});
  if (!rows.length) {
    list.innerHTML = "<div class=\"fempty\">" + (sel.hideids && d.modifiedcount
      ? "every change in this chapter is an id swap."
      : "no changes in this chapter.") + "</div>";
    return;
  }

  for (const r of rows) {
    const row = el("div", "frow " + r.kind);
    row.dataset.file = r.file;
    let stat;
    const plus = sel.hideids && r.mod ? r.mod.fplus : (r.mod && r.mod.plus);
    const minus = sel.hideids && r.mod ? r.mod.fminus : (r.mod && r.mod.minus);
    if (r.kind === "add") stat = "<span class=\"fstat\" fnt_small><span class=\"p\" green>+" + r.lines + "</span></span>";
    else if (r.kind === "del") stat = "<span class=\"fstat\" fnt_small><span class=\"m\" red>-" + r.lines + "</span></span>";
    else stat = "<span class=\"fstat\" fnt_small><span class=\"p\" green>+" + plus + "</span> <span class=\"m\" red>-" + minus + "</span></span>";
    row.innerHTML = "<span class=\"fname\" title=\"" + esc(r.file) + "\">" + esc(shortname(r.file)) + "</span>" + stat;
    row.addEventListener("click", () => {sel.file = r.file; sel.mode = "diff"; sel.clview = null; renderdiffpane(); highlightrow(); markchaptertab();});
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

function renderdiffpane() {
  const c = document.querySelector(".content");
  const d = sel.diff && sel.chapter ? sel.diff.parts[sel.chapter] : null;
  if (!d) {c.innerHTML = "<div class=\"hint\">nothing to show.</div>"; return;}
  if (d.collapsed) {
    const msg = d.addedcount
      ? esc(partlabel[sel.chapter]) + " debuted in this version - " + d.addedcount + " code entries added at once."
      : esc(partlabel[sel.chapter]) + " was restructured here - " + d.removedcount + " entries removed (split into separate chapters).";
    c.innerHTML = "<div class=\"notecode\">" + msg + " excluded from the line diff.</div>";
    return;
  }
  const mod = realmods(d).find(m => m.file === sel.file);
  if (mod) {
    const body = sel.hideids ? filtered(mod).flines.join("\n") : mod.diff;
    c.innerHTML = "<div class=\"code\">" + renderdiff(body) + "</div>";
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
    out += "<span class=\"cline " + kind + "\">" + highlightgml(l) + "</span>";
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
    out += "<span class=\"cline " + cls + "\">" + highlightgml(body) + "</span>";
  }
  return out;
}

/*//////////////////////////////////////////////////////////////////////*/

function doodlehtml(version, side) {
  const p = doodles[version] && doodles[version][side];
  if (!p) return "<span class=\"cl-dood-spacer\"></span>";
  return "<img class=\"cl-dood " + side + (p.flip ? " flip" : "") + "\" src=\"/assets/images/" + esc(p.src) + "\" alt=\"\">";
}

async function getcl(version) {
  if (clcache[version]) return clcache[version];
  const md = await fetchtext(staticbase + "/changelogs/" + version + ".md").catch(() => null);
  const parsed = md == null ? null : parsemd(md);
  clcache[version] = parsed;
  return parsed;
}

function parsemd(text) {
  if (text.startsWith("::raw")) return {raw: text.slice(text.indexOf("\n") + 1)};
  const out = {title: "", subtitle: "", intro: "", table: null, sections: [], outro: [], footer: ""};
  let cur = null, prevblank = true;
  const introlines = [];
  for (const raw of text.split("\n")) {
    const l = raw.replace(/\s+$/, "");
    if (!l.trim()) {prevblank = true; continue;}
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) {cur = null; prevblank = true; continue;} // horizontal rule
    if (l.startsWith("# ")) {out.title = l.slice(2).trim(); prevblank = false; continue;}
    if (l.startsWith("## ")) {out.subtitle = l.slice(3).trim(); prevblank = false; continue;}
    if (l.startsWith("### ")) {
      const name = l.slice(4).trim();
      prevblank = false;
      if (name === "Version Numbers") {out.table = {cols: [], rows: []}; cur = "table"; continue;}
      cur = {header: name, items: []};
      out.sections.push(cur);
      continue;
    }
    if (l.startsWith("#### ")) {
      cur = {header: l.slice(5).trim(), items: [], sub: true};
      out.sections.push(cur);
      prevblank = false;
      continue;
    }
    if (l.trim().startsWith("|") && cur === "table") {
      const cells = l.split("|").slice(1, -1).map(x => x.trim());
      prevblank = false;
      if (cells.every(x => /^-*$/.test(x))) continue;
      if (!out.table.cols.length && cells[0] === "") out.table.cols = cells.slice(1);
      else out.table.rows.push(cells);
      continue;
    }

    if (cur === "table" && /^\s*\S[^:]{0,23}:\s*\S/.test(l)) {
      const i = l.indexOf(":");
      out.table.rows.push([l.slice(0, i).trim(), l.slice(i + 1).trim()]);
      prevblank = false;
      continue;
    }
    if (/^!\[[^\]]*\]\([^)]+\)$/.test(l.trim())) { // standalone image
      const m = l.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      out.outro.push({img: m[2], alt: m[1]});
      cur = null;
      prevblank = true;
      continue;
    }
    if (/^_[^_].*_$/.test(l.trim())) {
      const note = l.trim().slice(1, -1);
      if (cur && cur.items) cur.items.push({note});
      else out.outro.push({note});
      prevblank = false;
      continue;
    }
    if (l.startsWith("- ")) {
      let txt = l.slice(2).trim();
      let tag = null;
      const m = txt.match(/^\[([^\]]+)\]\s*(?!\()/); // platform tag
      if (m) {tag = m[1]; txt = txt.slice(m[0].length);}
      if (!cur || !cur.items) {cur = {header: "", items: []}; out.sections.push(cur);}
      cur.items.push({text: txt, tag});
      prevblank = false;
      continue;
    }
    if (l.startsWith("> ")) {out.footer = (out.footer + " " + l.slice(2).trim()).trim(); prevblank = false; continue;}
    if (cur === "table" || (!out.sections.length && !out.table)) introlines.push(l.trim());
    else if (!prevblank && cur && cur.items && cur.items.length) cur.items[cur.items.length - 1].text += " " + l.trim();
    else if (!out.sections.length) introlines.push(l.trim());
    else out.outro.push(l.trim());
    prevblank = false;
  }
  out.intro = introlines.join(" ");
  return out;
}

async function renderchangelog() {
  const c = document.querySelector(".content");
  const version = sel.version;
  let body;
  if (sel.clview === "diff") {
    body = await renderwordingdiff(version);
  } else if (sel.clview === "steam") {
    const st = await getsteamcl(version);
    body = st ? recreationhtml(st, version) : nochangeloghtml(version);
  } else {
    const cl = await getcl(version);
    body = cl ? recreationhtml(cl, version) : nochangeloghtml(version);
  }
  if (version !== sel.version || sel.mode !== "changelog") return;
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
  const md = await fetchtext(staticbase + "/steamchangelogs/" + version + ".md").catch(() => null);
  clcache[key] = md == null ? null : parsemd(md);
  return clcache[key];
}

function recreationhtml(cl, version) {
  if (cl.raw) return "<div class=\"changelog clraw\">" + cl.raw + "</div>";
  let h = "<div class=\"changelog\">";
  h += "<div class=\"cl-head\">" + doodlehtml(version, "left") + "<div class=\"cl-headtext\">";
  h += "<div class=\"cl-title\">" + esc(cl.title) + "</div>";
  if (cl.subtitle) h += "<div class=\"cl-sub\">" + esc(cl.subtitle) + "</div>";
  if (cl.intro) h += "<div class=\"cl-intro\">" + inline(cl.intro) + "</div>";
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

  if (cl.sections.some(s => s.items.length)) h += "<div class=\"cl-h\">Changelist</div>";
  for (const sec of cl.sections) {
    h += "<div class=\"cl-section" + (sec.sub ? " sub" : "") + "\">";
    if (sec.header) h += "<div class=\"cl-sech" + (sec.sub ? " sub" : "") + "\">" + esc(sec.header) + "</div>";
    for (const it of sec.items) {
      if (it.note) {h += "<div class=\"cl-inote\">" + inline(it.note) + "</div>"; continue;}
      const tag = it.tag ? "<span class=\"cl-tag\">[" + esc(it.tag) + "] </span>" : "";
      h += "<div class=\"cl-item\"><span class=\"bullet\">&bull;</span><span>" + tag + inline(it.text) + "</span></div>";
    }
    h += "</div>";
  }
  for (const p of (cl.outro || [])) {
    if (p.img) h += "<div class=\"cl-media\"><img src=\"" + esc(p.img) + "\" alt=\"" + esc(p.alt) + "\"></div>";
    else if (p.note) h += "<div class=\"cl-outro\"><em>" + inline(p.note) + "</em></div>";
    else h += "<div class=\"cl-outro\">" + inline(p) + "</div>";
  }
  if (cl.footer) h += "<div class=\"cl-footer\">" + inline(cl.footer) + "</div>";
  h += "</div>";
  return h;
}

async function getrawmd(src, version) {
  const key = src + "/" + version;
  if (clraw[key] != null) return clraw[key];
  clraw[key] = await fetchtext(staticbase + "/" + src + "/" + version + ".md").catch(() => "");
  return clraw[key];
}

function mdplain(md) {
  return md.replace(/^::raw\n/, "").replace(/<[^>]+>/g, "").split("\n").map(l =>
    l.replace(/^#{1,6}\s*/, "").replace(/^\s*[-*]\s*/, "").replace(/^>\s*/, "")
     .replace(/^\[[^\]]+\]\s*/, "").replace(/\|/g, " ").replace(/\*\*/g, "")
     .replace(/^_(.+)_$/, "$1").trim())
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

function worddiff(a, b) {
  const awords = a.split(/(\s+)/).filter(t => t.length);
  const bwords = b.split(/(\s+)/).filter(t => t.length);
  const n = awords.length, m = bwords.length;
  const dp = [];
  for (let i = 0; i <= n; i++) dp.push(new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = awords[i] === bwords[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ws = t => /^\s+$/.test(t);
  const emit = (cls, t) => ws(t) ? t.replace(/\n/g, "<br>") : "<span class=\"" + cls + "\">" + esc(t) + "</span>";
  let i = 0, j = 0, out = "";
  while (i < n && j < m) {
    if (awords[i] === bwords[j]) {out += ws(awords[i]) ? awords[i].replace(/\n/g, "<br>") : esc(awords[i]); i++; j++;}
    else if (dp[i + 1][j] >= dp[i][j + 1]) {out += emit("wdel", awords[i]); i++;}
    else {out += emit("wadd", bwords[j]); j++;}
  }
  while (i < n) out += emit("wdel", awords[i++]);
  while (j < m) out += emit("wadd", bwords[j++]);
  return out;
}

/*//////////////////////////////////////////////////////////////////////*/

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"}[c]));
}
function inline(s) {
  return esc(s).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
    (m, t, u) => "<a href=\"" + u + "\" target=\"_blank\" rel=\"noopener\">" + t + "</a>");
}
boot();

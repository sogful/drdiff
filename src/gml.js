"use strict";

const gmlcf = new Set(["if", "else", "while", "for", "do", "until", "repeat", "with",
  "switch", "case", "default", "break", "continue", "return", "exit", "then"]);
const gmlkw = new Set(["var", "globalvar", "enum", "function", "constructor", "new", "delete",
  "static", "and", "or", "not", "xor", "mod", "div", "begin", "end"]);
const gmlconst = new Set(["true", "false", "undefined", "noone", "all", "self", "other",
  "global", "pi", "NaN", "infinity", "pointer_null", "pointer_invalid"]);

function gmlesc(s) {
  return s.replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"}[c]));
}

function gmlspan(cls, txt) {
  return "<span class=\"t-" + cls + "\">" + gmlesc(txt) + "</span>";
}

const gmlre = /(\/\/[^\n]*)|(\/\*[\s\S]*?(?:\*\/|$))|(@?"(?:[^"\\]|\\.)*(?:"|$))|(0x[0-9a-fA-F]+|\$[0-9a-fA-F]+|#[0-9a-fA-F]{6}|\d+\.?\d*)|([A-Za-z_]\w*)|(\s+)|([+\-*/%=<>!&|^~?:.]+)|([(){}\[\],;])/g;

function highlightgml(code) {
  let out = "", m, last = 0;
  gmlre.lastIndex = 0;
  while ((m = gmlre.exec(code))) {
    if (m.index > last) out += gmlesc(code.slice(last, m.index));
    last = gmlre.lastIndex;
    if (m[1] || m[2]) out += gmlspan("com", m[0]);
    else if (m[3]) out += gmlspan("str", m[0]);
    else if (m[4]) out += gmlspan("num", m[0]);
    else if (m[5]) {
      const w = m[5];
      let k = gmlre.lastIndex;
      while (code[k] === " ") k++;
      const isfn = code[k] === "(";
      if (gmlcf.has(w)) out += gmlspan("cf", w);
      else if (gmlkw.has(w)) out += gmlspan("kw", w);
      else if (gmlconst.has(w)) out += gmlspan("const", w);
      else if (isfn) out += gmlspan("fn", w);
      else out += gmlspan("var", w);
    }
    else if (m[6]) out += gmlesc(m[0]);
    else if (m[7]) out += gmlspan("op", m[0]);
    else if (m[8]) out += gmlspan("punc", m[0]);
    else out += gmlesc(m[0]);
  }
  if (last < code.length) out += gmlesc(code.slice(last));
  return out;
}

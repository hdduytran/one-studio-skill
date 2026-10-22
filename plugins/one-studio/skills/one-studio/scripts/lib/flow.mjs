// Screen flows: flows/<id>.json (schema flow.schema.json) and the capture outputs next to the project.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileHash, readJson, sha256, validateKind } from "./project.mjs";

export const FLOW_ID_RE = /^[a-z0-9][a-z0-9_-]*$/;
export const DEFAULT_VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 1 };
// Bump when the capture output format or recording behaviour changes: old captures are then stale.
export const CAPTURE_VERSION = 1;

export const flowFile = (project, id) => join(project.root, "flows", `${id}.json`);
export const captureDir = (project, id) => join(project.root, "capture", id);
export const captureFiles = (project, id) => ({ video: join(captureDir(project, id), "video.mp4"), events: join(captureDir(project, id), "events.json"), meta: join(captureDir(project, id), "capture.json") });

// Step kind = its single action key.
export const STEP_KINDS = ["goto", "click", "type", "press", "scroll", "hover", "wait", "mark"];
export const stepKind = (step) => STEP_KINDS.find((k) => k in step);

// Statically visible reasons to refuse a step; the recorder repeats the check against the live element.
export function passwordSelector(selector) {
  return /type\s*=\s*["']?password/i.test(selector) || /autocomplete\s*=\s*["']?(?:current|new)-password/i.test(selector);
}

export function flowErrors(flow) {
  const errors = validateKind("flow", flow);
  if (errors.length) return errors;
  const marks = new Set();
  flow.steps.forEach((s, i) => {
    const at = `$.steps[${i}]`;
    if (s.type !== undefined && typeof s.type === "string" && passwordSelector(s.type)) errors.push(`${at}: typing into a password field is never allowed`);
    if (s.scroll && s.scroll.to === undefined && s.scroll.by === undefined) errors.push(`${at}.scroll: needs "to" or "by"`);
    if (s.scroll && s.scroll.to !== undefined && s.scroll.by !== undefined) errors.push(`${at}.scroll: use "to" or "by", not both`);
    if (s.mark) {
      if (marks.has(s.mark)) errors.push(`${at}: duplicate mark "${s.mark}"`);
      marks.add(s.mark);
    }
  });
  return errors;
}

export function loadFlow(project, id) {
  if (!FLOW_ID_RE.test(id)) throw new Error(`flow id "${id}" must be lowercase letters, digits, - or _`);
  const file = flowFile(project, id);
  if (!existsSync(file)) throw new Error(`No flow at ${file}`);
  const flow = readJson(file);
  const errors = flowErrors(flow);
  if (errors.length) throw new Error(`flows/${id}.json is invalid:\n  ${errors.join("\n  ")}`);
  return { ...flow, viewport: { ...DEFAULT_VIEWPORT, ...flow.viewport } };
}

// Changes when the flow, the storage state it names, or the recorder version changes.
export function flowHash(project, id) {
  const flow = readJson(flowFile(project, id));
  const state = flow.storage_state ? fileHash(resolve(project.root, flow.storage_state)) : null;
  return sha256(JSON.stringify({ v: CAPTURE_VERSION, flow: readFileSync(flowFile(project, id), "utf8"), state })).slice(0, 16);
}

export function readEvents(project, id) {
  const { events } = captureFiles(project, id);
  if (!existsSync(events)) throw new Error(`No capture for flow "${id}" (${events}). Run capture-screen.mjs <project> ${id} (needs services.capture).`);
  return readJson(events);
}

// Seconds [from, to] of the capture a scene plays: marks name them, default whole recording.
export function markSpan(events, from, to) {
  const at = (name) => {
    const m = events.marks.find((x) => x.name === name);
    if (!m) throw new Error(`flow "${events.flow}" has no mark "${name}" (marks: ${events.marks.map((x) => x.name).join(", ") || "none"})`);
    return m.t;
  };
  const a = from ? at(from) : 0;
  const b = to ? at(to) : events.duration;
  if (!(b > a)) throw new Error(`flow "${events.flow}": mark "${to}" must come after "${from}"`);
  return { from: a, to: b };
}

// Problems with flows and screen scenes that only show up against the files: invalid flow JSON, unknown marks,
// and a scene that outlasts the part of the recording it plays (it would end on an empty frame).
export function screenErrors(project) {
  const errors = [];
  const dir = join(project.root, "flows");
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
      try {
        flowErrors(readJson(join(dir, f))).forEach((e) => errors.push(`flows/${f}: ${e}`));
      } catch (err) {
        errors.push(`flows/${f}: ${err.message}`);
      }
    }
  }
  for (const s of project.storyboard?.scenes ?? []) {
    if (s.type !== "screen" || !s.screen?.flow || !existsSync(captureFiles(project, s.screen.flow).events)) continue;
    try {
      const span = markSpan(readEvents(project, s.screen.flow), s.screen.from_mark, s.screen.to_mark);
      if (s.duration > span.to - span.from + 0.25) errors.push(`storyboard ${s.id}: lasts ${s.duration}s but the recording between the marks is ${(span.to - span.from).toFixed(1)}s; shorten the scene, change the marks or add steps to the flow`);
    } catch (err) {
      errors.push(`storyboard ${s.id}: ${err.message}`);
    }
  }
  return errors;
}

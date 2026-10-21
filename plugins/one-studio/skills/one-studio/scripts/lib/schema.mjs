// Minimal JSON Schema (draft 2020-12 subset) validator, zero dependencies.
// Supports: type, const, enum, properties, required, additionalProperties,
// items, minItems, maxItems, uniqueItems, minLength, pattern, minimum,
// maximum, exclusiveMinimum, $ref (local "#/$defs/..."), anyOf, oneOf.

const typeOf = (v) =>
  v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v;

const matchesType = (v, t) => {
  const actual = typeOf(v);
  return actual === t || (t === "number" && actual === "integer");
};

function resolveRef(root, ref) {
  if (!ref.startsWith("#/")) throw new Error(`Only local $ref supported: ${ref}`);
  return ref
    .slice(2)
    .split("/")
    .reduce((node, key) => {
      if (node == null || !(key in node)) throw new Error(`Unresolved $ref: ${ref}`);
      return node[key];
    }, root);
}

export function validate(schema, data) {
  const errors = [];
  walk(schema, data, "$", schema, errors);
  return errors;
}

function walk(node, value, path, root, errors) {
  if (node === true || node === undefined) return;
  if (node === false) return void errors.push(`${path}: not allowed`);
  if (node.$ref) return walk(resolveRef(root, node.$ref), value, path, root, errors);

  if (node.type) {
    const types = Array.isArray(node.type) ? node.type : [node.type];
    if (!types.some((t) => matchesType(value, t))) {
      return void errors.push(`${path}: expected ${types.join("|")}, got ${typeOf(value)}`);
    }
  }
  if ("const" in node && value !== node.const) errors.push(`${path}: must be ${JSON.stringify(node.const)}`);
  if (node.enum && !node.enum.includes(value)) {
    errors.push(`${path}: must be one of ${node.enum.map((e) => JSON.stringify(e)).join(", ")}`);
  }

  for (const key of ["anyOf", "oneOf"]) {
    if (!node[key]) continue;
    const passing = node[key].filter((sub) => {
      const subErrors = [];
      walk(sub, value, path, root, subErrors);
      return subErrors.length === 0;
    }).length;
    if (key === "anyOf" && passing === 0) errors.push(`${path}: matches none of anyOf`);
    if (key === "oneOf" && passing !== 1) errors.push(`${path}: must match exactly one of oneOf (matched ${passing})`);
  }

  const t = typeOf(value);
  if (t === "string") {
    if (node.minLength != null && value.length < node.minLength) errors.push(`${path}: shorter than ${node.minLength}`);
    if (node.pattern && !new RegExp(node.pattern).test(value)) errors.push(`${path}: "${value}" does not match ${node.pattern}`);
  }
  if (t === "number" || t === "integer") {
    if (node.minimum != null && value < node.minimum) errors.push(`${path}: must be >= ${node.minimum}`);
    if (node.maximum != null && value > node.maximum) errors.push(`${path}: must be <= ${node.maximum}`);
    if (node.exclusiveMinimum != null && value <= node.exclusiveMinimum) errors.push(`${path}: must be > ${node.exclusiveMinimum}`);
  }
  if (t === "array") {
    if (node.minItems != null && value.length < node.minItems) errors.push(`${path}: needs at least ${node.minItems} items`);
    if (node.maxItems != null && value.length > node.maxItems) errors.push(`${path}: at most ${node.maxItems} items`);
    if (node.uniqueItems) {
      const seen = new Set(value.map((v) => JSON.stringify(v)));
      if (seen.size !== value.length) errors.push(`${path}: items must be unique`);
    }
    if (node.items) value.forEach((item, i) => walk(node.items, item, `${path}[${i}]`, root, errors));
  }
  if (t === "object") {
    for (const key of node.required ?? []) {
      if (!(key in value)) errors.push(`${path}: missing required "${key}"`);
    }
    const props = node.properties ?? {};
    for (const [key, v] of Object.entries(value)) {
      const child = `${path}.${key}`;
      if (key in props) walk(props[key], v, child, root, errors);
      else if (node.additionalProperties === false) errors.push(`${child}: unknown property`);
      else if (typeof node.additionalProperties === "object") walk(node.additionalProperties, v, child, root, errors);
    }
  }
}

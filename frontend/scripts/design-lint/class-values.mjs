const MERGE_FUNCTIONS = /^(?:cn|cx|clsx|twMerge|twJoin|classNames)$/;
const MAX_HOPS = 3;

function calleeName(callee) {
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression' && !callee.computed) return callee.property.name;
  return '';
}

const WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'ParenthesizedExpression',
]);

function unwrap(node) {
  return node && WRAPPERS.has(node.type) ? unwrap(node.expression) : node;
}

function visitProperty(property, { result, visit }, hops) {
  if (property.type !== 'Property') return result.unreadable.push('spread');
  if (property.key.type === 'Literal') return visit(property.key, hops);
  if (property.key.type === 'Identifier' && !property.computed)
    return result.strings.push(property.key.name);
  return result.unreadable.push('computed key');
}

function visitMember(current, { result, constants, visit }, hops) {
  const object = unwrap(current.object.type === 'Identifier' && constants.get(current.object.name));
  if (object?.type === 'ObjectExpression' && hops < MAX_HOPS) {
    const key = current.computed ? null : current.property.name;
    const match = object.properties.find(
      (property) =>
        property.type === 'Property' && (property.key.name === key || property.key.value === key),
    );
    if (match) return visit(match.value, hops + 1);
    if (current.computed)
      return object.properties.forEach((property) => visit(property.value, hops + 1));
  }
  return result.unreadable.push(
    current.object.type === 'Identifier' ? `${current.object.name}.…` : 'member',
  );
}

const VISITORS = new Map(
  Object.entries({
    Literal(current, { result }) {
      if (typeof current.value === 'string') result.strings.push(current.value);
    },
    JSXExpressionContainer: (current, { visit }, hops) => visit(current.expression, hops),
    TemplateLiteral(current, { result, visit }, hops) {
      current.quasis.forEach((quasi) => result.strings.push(quasi.value.cooked ?? ''));
      current.expressions.forEach((expression) => visit(expression, hops));
    },
    ConditionalExpression(current, { visit }, hops) {
      visit(current.consequent, hops);
      visit(current.alternate, hops);
    },
    LogicalExpression(current, { visit }, hops) {
      if (current.operator !== '&&') visit(current.left, hops);
      visit(current.right, hops);
    },
    ArrayExpression: (current, { visit }, hops) =>
      current.elements.forEach((element) => visit(element, hops)),
    ObjectExpression: (current, context, hops) =>
      current.properties.forEach((property) => visitProperty(property, context, hops)),
    CallExpression(current, { result, visit }, hops) {
      const name = calleeName(current.callee);
      if (MERGE_FUNCTIONS.test(name)) return current.arguments.forEach((arg) => visit(arg, hops));
      if (name.endsWith('Classes')) return result.helpers.push(`${name}()`);
      return result.unreadable.push(`${name || 'call'}()`);
    },
    Identifier(current, { result, constants, visit }, hops) {
      if (current.name === 'undefined') return;
      const init = constants.get(current.name);
      if (init && hops < MAX_HOPS) return visit(init, hops + 1);
      return result.unreadable.push(current.name);
    },
    MemberExpression: visitMember,
  }),
);

export function classValues(node, constants) {
  const result = { strings: [], helpers: [], unreadable: [] };
  const visit = (current, hops) => {
    if (!current) return;
    if (WRAPPERS.has(current.type)) return visit(current.expression, hops);
    const visitor = VISITORS.get(current.type);
    if (visitor) return visitor(current, { result, constants, visit }, hops);
    return result.unreadable.push(current.type);
  };
  visit(node, 0);
  return result;
}

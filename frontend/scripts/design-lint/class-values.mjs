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

export function classValues(node, constants) {
  const result = { strings: [], helpers: [], unreadable: [] };
  const visit = (current, hops) => {
    if (!current) return;
    switch (current.type) {
      case 'Literal':
        if (typeof current.value === 'string') result.strings.push(current.value);
        return;
      case 'JSXExpressionContainer':
        return visit(current.expression, hops);
      case 'TemplateLiteral':
        current.quasis.forEach((quasi) => result.strings.push(quasi.value.cooked ?? ''));
        return current.expressions.forEach((expression) => visit(expression, hops));
      case 'ConditionalExpression':
        visit(current.consequent, hops);
        return visit(current.alternate, hops);
      case 'LogicalExpression':
        if (current.operator !== '&&') visit(current.left, hops);
        return visit(current.right, hops);
      case 'ArrayExpression':
        return current.elements.forEach((element) => visit(element, hops));
      case 'ObjectExpression':
        return current.properties.forEach((property) => {
          if (property.type !== 'Property') return result.unreadable.push('spread');
          if (property.key.type === 'Literal') visit(property.key, hops);
          else if (property.key.type === 'Identifier' && !property.computed)
            result.strings.push(property.key.name);
          else result.unreadable.push('computed key');
        });
      case 'CallExpression': {
        const name = calleeName(current.callee);
        if (MERGE_FUNCTIONS.test(name)) return current.arguments.forEach((arg) => visit(arg, hops));
        if (/Classes$/.test(name)) return result.helpers.push(`${name}()`);
        return result.unreadable.push(`${name || 'call'}()`);
      }
      case 'Identifier': {
        const init = constants.get(current.name);
        if (current.name === 'undefined') return;
        if (init && hops < MAX_HOPS) return visit(init, hops + 1);
        return result.unreadable.push(current.name);
      }
      case 'MemberExpression': {
        const object = unwrap(
          current.object.type === 'Identifier' && constants.get(current.object.name),
        );
        if (object?.type === 'ObjectExpression' && hops < MAX_HOPS) {
          const key = current.computed ? null : current.property.name;
          const match = object.properties.find(
            (property) =>
              property.type === 'Property' &&
              (property.key.name === key || property.key.value === key),
          );
          if (match) return visit(match.value, hops + 1);
          if (current.computed)
            return object.properties.forEach((property) => visit(property.value, hops + 1));
        }
        return result.unreadable.push(
          current.object.type === 'Identifier' ? `${current.object.name}.…` : 'member',
        );
      }
      case 'TSAsExpression':
      case 'TSSatisfiesExpression':
      case 'TSNonNullExpression':
      case 'ParenthesizedExpression':
        return visit(current.expression, hops);
      default:
        return result.unreadable.push(current.type);
    }
  };
  visit(node, 0);
  return result;
}

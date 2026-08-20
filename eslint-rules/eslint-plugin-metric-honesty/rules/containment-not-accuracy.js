/**
 * containment-not-accuracy
 *
 * `answers.some(a => a.verb === gold.verb)` asks whether the gold head appears
 * in ANY reading the parser produced. That is containment. Head accuracy asks
 * whether it is the reading the parser RANKED FIRST — `answers[0]`. The two
 * differ by every sentence the parser got right only by also getting it wrong,
 * and on the treebank gate the gap is 127 versus 113.
 *
 * A counter fed by an existence check may not call itself a head or an accuracy.
 */

const CLAIMS_HEAD = /head|accuracy/i;
const CLAIMS_CONTAINMENT = /contain/i;

function claimsHead(name) {
  return (
    typeof name === 'string' &&
    CLAIMS_HEAD.test(name) &&
    !CLAIMS_CONTAINMENT.test(name)
  );
}

function isExistenceCheck(node) {
  return (
    node != null &&
    node.type === 'CallExpression' &&
    node.callee != null &&
    node.callee.type === 'MemberExpression' &&
    node.callee.property != null &&
    node.callee.property.name === 'some'
  );
}

/**
 * The dotted name a node counts into, or null if it is not a plain target.
 * Counters live on objects as often as in locals — `statsBlind.goldHead += 1` is the
 * shape that carried this defect through three scripts undetected.
 */
function targetName(node) {
  if (node == null) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && !node.computed) {
    const object = targetName(node.object);
    const property = targetName(node.property);
    return object != null && property != null ? `${object}.${property}` : null;
  }
  return null;
}

/** The node a single statement counts into, or null. */
function countedInto(statement) {
  if (statement == null) return null;

  if (statement.type === 'BlockStatement') {
    if (statement.body.length !== 1) return null;
    return countedInto(statement.body[0]);
  }

  if (statement.type !== 'ExpressionStatement') return null;
  const expression = statement.expression;

  if (expression.type === 'AssignmentExpression') return expression.left;
  if (expression.type === 'UpdateExpression') return expression.argument;
  return null;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'An existence check (.some) may not be counted as a head match or an accuracy.',
    },
    schema: [],
    messages: {
      existenceCountedAsHead:
        "'{{name}}' is fed by .some(), which measures containment, not head accuracy. " +
        'Rename it to containment, or test the top-1 reading with [0].',
    },
  },

  create(context) {
    function reportIfClaimsHead(targetNode) {
      const name = targetName(targetNode);
      if (name == null || !claimsHead(name)) return;
      context.report({
        node: targetNode,
        messageId: 'existenceCountedAsHead',
        data: { name },
      });
    }

    return {
      IfStatement(node) {
        if (!isExistenceCheck(node.test)) return;
        reportIfClaimsHead(countedInto(node.consequent));
      },

      VariableDeclarator(node) {
        if (!isExistenceCheck(node.init)) return;
        reportIfClaimsHead(node.id);
      },

      AssignmentExpression(node) {
        if (!isExistenceCheck(node.right)) return;
        reportIfClaimsHead(node.left);
      },
    };
  },
};

/**
 * no-constant-baseline
 *
 * A loss is a comparison between two measurements. `100 - rate` is not: it
 * compares a measurement against a perfect score nothing achieved, so the arm
 * is charged for every answer the baseline never had either. The three-control
 * ladder reported Control 3 at "25.5% gold loss" this way; measured against the
 * baseline that actually ran, the degradation was 6.7%.
 *
 * A hardcoded baseline (`127 - arm`) is the same defect wearing the right
 * number: it freezes into the reporting line a value that must come from the
 * run, and it goes stale silently the next time the run changes.
 *
 * If a subtraction is reported as a loss, both of its sides must be measured.
 */

const REPORTS_LOSS = /loss|lost|drop|degrad/i;

/** The text a template literal prints around its interpolations. */
function templateText(node) {
  return node.quasis.map((quasi) => quasi.value.raw).join(' ');
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A reported loss must be measured against a measured baseline, not a numeric literal.',
    },
    schema: [],
    messages: {
      constantBaseline:
        'This loss is computed against the literal {{literal}}. A loss is the distance ' +
        'between two measurements — subtract the baseline this run actually produced.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      BinaryExpression(node) {
        if (node.operator !== '-') return;
        if (node.left.type !== 'Literal' || typeof node.left.value !== 'number') return;

        const reportingTemplate = sourceCode
          .getAncestors(node)
          .find(
            (ancestor) =>
              ancestor.type === 'TemplateLiteral' && REPORTS_LOSS.test(templateText(ancestor)),
          );
        if (reportingTemplate == null) return;

        context.report({
          node,
          messageId: 'constantBaseline',
          data: { literal: String(node.left.value) },
        });
      },
    };
  },
};

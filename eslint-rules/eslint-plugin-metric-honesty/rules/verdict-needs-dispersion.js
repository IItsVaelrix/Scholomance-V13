/**
 * verdict-needs-dispersion
 *
 * A verdict earned from repeated sampling is a claim about a distribution. The
 * three-control ladder drew ten Monte Carlo seeds per arm, printed the means,
 * and concluded `=> PROOF`. The spread was computed and discarded: nothing in
 * that output distinguishes a −3.65pp effect that held on ten seeds out of ten
 * from one that held on six.
 *
 * If a script samples more than once and then declares a verdict, it must also
 * print a standard deviation, a confidence interval, or a p-value.
 *
 * A single deterministic run is exempt. There is no dispersion in an n of one,
 * and demanding one would be a check that cannot pass.
 */

const VERDICT = /\b(PROOF|CONFIRMED|SIGNIFICANT|PASS)\b/;
/**
 * Plural, deliberately. A `seed` parameter names one draw — `deterministicShuffle(array,
 * seed)` shuffles once — while `SEEDS`, `trials` or `numSamples` names the collection a
 * script iterates. Matching the singular flagged every single-shuffle falsifier in the
 * repository for failing to report a spread it could not have.
 */
const SAMPLES_REPEATEDLY = /(seeds|trials|samples|iterations|replicates|montecarlo)$/i;
const REPORTS_DISPERSION =
  /^(sd|stdev|stddev|sigma)$|deviation|variance|confidence|interval|^ci\d*$|p_?value/i;

/** The text a node prints, or null if it prints nothing constant. */
function printedText(node) {
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral') return node.quasis.map((q) => q.value.raw).join(' ');
  return null;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A verdict printed by a script that samples repeatedly must report dispersion.',
    },
    schema: [],
    messages: {
      verdictWithoutDispersion:
        "This script samples repeatedly and then prints '{{verdict}}', but never reports a " +
        'standard deviation, confidence interval, or p-value. A verdict over many samples is ' +
        'a claim about their spread.',
    },
  },

  create(context) {
    let samplesRepeatedly = false;
    let reportsDispersion = false;
    const verdicts = [];

    return {
      Identifier(node) {
        if (SAMPLES_REPEATEDLY.test(node.name)) samplesRepeatedly = true;
        if (REPORTS_DISPERSION.test(node.name)) reportsDispersion = true;
      },

      Literal(node) {
        const text = printedText(node);
        const match = text != null ? VERDICT.exec(text) : null;
        if (match != null) verdicts.push({ node, verdict: match[1] });
      },

      TemplateLiteral(node) {
        const match = VERDICT.exec(printedText(node));
        if (match != null) verdicts.push({ node, verdict: match[1] });
      },

      'Program:exit'() {
        if (!samplesRepeatedly || reportsDispersion) return;
        for (const { node, verdict } of verdicts) {
          context.report({ node, messageId: 'verdictWithoutDispersion', data: { verdict } });
        }
      },
    };
  },
};

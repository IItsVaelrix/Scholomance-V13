'use strict';

module.exports = {
  rules: {
    'containment-not-accuracy': require('./rules/containment-not-accuracy.js'),
    'no-constant-baseline': require('./rules/no-constant-baseline.js'),
    'verdict-needs-dispersion': require('./rules/verdict-needs-dispersion.js'),
  },
};

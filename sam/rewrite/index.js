'use strict';

const RuleSet = require('./api/rules.js');

let ruleSet = new RuleSet();

module.exports.handler = (e, ctx, cb) => {
  var request = e.Records[0].cf.request;
  return ruleSet
    .loadRules(request)
    .then(() => {
      cb(null,ruleSet.applyRules(e).res);
    });
};
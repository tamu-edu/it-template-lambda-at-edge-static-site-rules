const rp = require('request-promise-native');
const fsp = require('fs').promises;

const noCaseSyntax = /NC/;
const lastSyntax = /L/;
const redirectSyntax = /R=?(\d+)?/;
const forbiddenSyntax = /F/;
const goneSyntax = /G/;
const hostSyntax =  /H=([^,]+)/;
const flagSyntax = /\[([^\]]+)]$/;
const partsSyntax = /\s+|\t+/g;
const DEFAULT_CACHE_TIMEOUT = 600 * 1000; // (600 seconds in milliseconds)

class RuleSet {
  constructor() {
    this.cacheTime = new Date().getTime();
    this.now = undefined;
    this.rewriteRules = undefined;
    this.staticRuleSet = undefined;
    this.rawRuleSet = undefined;
  }

  checkCacheTimer(cache_timeout) {
    if (this.staticRuleSet) {
      return;
    }
    this.now = new Date().getTime();
    if (this.now - this.cacheTime > cache_timeout) {
      this.cacheTime = this.now;
      this.rewriteRules = undefined;
    }
  }

  getRawRules(request) {
    if (request !== undefined && 'rules-url' in request.origin.custom.customHeaders) {
      return request.origin.custom.customHeaders['rules-url'][0].value;
    }

    return require('../rules.json');
  }

  loadRules(request) {
    if (this.staticRuleSet === true) { // If we already know we've got static rules and have loaded them...
      return Promise.resolve(true);
    }
    if (this.rawRuleSet === undefined) { // Need to figure out if static or dynamic
      this.rawRuleSet = this.getRawRules(request);
      if (Array.isArray(this.rawRuleSet)) { // Static
        this.staticRuleSet = true;
        this.rewriteRules = this.parseRules(this.rawRuleSet);
        return Promise.resolve(true);
      } else {
        this.staticRuleSet = false;
      }
    }
    // Dynamic
    var cache_timeout = 'rules-cache-timeout' in request.origin.custom.customHeaders ? parseInt(request.origin.custom.customHeaders['rules-cache-timeout'][0].value) * 1000 : DEFAULT_CACHE_TIMEOUT;
    this.checkCacheTimer(cache_timeout);
    if (this.rewriteRules === undefined) {
      if (!this.rawRuleSet.startsWith('http://') && !this.rawRuleSet.startsWith('https://')) {
        // This is used for local rule testing
        return fsp.readFile(`${__dirname}/${this.rawRuleSet}`).then((res) => {
          this.rewriteRules = this.parseRules(JSON.parse(res));
          return true;
        }).catch(err => {
          this.rewriteRules = []; // No rules if can't load rules
          return true;
        });
      }
      return rp.get(this.rawRuleSet).then((res) => {
        this.rewriteRules = this.parseRules(JSON.parse(res));
        return true;
      }).catch(err => {
        this.rewriteRules = []; // No rules if can't load rules
        return true;
      });
    } else {
      return Promise.resolve(true);  
    }
  }

  /**
   * Get flags from rule rules
   *
   * @param {Array.<rules>} rules
   * @return {Object}
   * @api private
   */
  parseRules(unparsedRules) {
    return (unparsedRules || []).map(function (rule) {
      // Reset all regular expression indexes
      lastSyntax.lastIndex = 0;
      redirectSyntax.lastIndex = 0;
      forbiddenSyntax.lastIndex = 0;
      goneSyntax.lastIndex = 0;
      hostSyntax.lastIndex = 0;

      var parts = rule.replace(partsSyntax, ' ').split(' '), flags = '';

      if (flagSyntax.test(rule)) {
        flags = flagSyntax.exec(rule)[1];
      }

      // Check inverted urls
      var inverted = parts[0].substr(0, 1) === '!';
      if (inverted) {
        parts[0] = parts[0].substr(1);
      }

      var redirectValue = redirectSyntax.exec(flags);
      var hostValue = hostSyntax.exec(flags);

      return {
        regexp: typeof parts[2] !== 'undefined' && noCaseSyntax.test(flags) ? new RegExp(parts[0], 'i') : new RegExp(parts[0]),
        replace: parts[1],
        inverted: inverted,
        last: lastSyntax.test(flags),
        redirect: redirectValue ? (typeof redirectValue[1] !== 'undefined' ? redirectValue[1] : 301) : false,
        forbidden: forbiddenSyntax.test(flags),
        gone: goneSyntax.test(flags),
        host: hostValue ? new RegExp(hostValue[1]) : false
      };
    });
  }

  applyRules(e) {
    const req = e.Records[0].cf.request;    
    const uri = req.uri;
    return this.rewriteRules.reduce((acc, rule) => {
     
      if (acc.skip == true) {
        return acc;
      }
  
      if (rule.host) {
        if (!rule.host.test(req.headers.host[0].value)) {
          return acc;
        }
      }
  
      if (rule.hostRW) {
        acc.res.headers.host[0].value = rule.hostRW;
      }
  
      var match = rule.regexp.test(req.uri);
      // If not match
      if (!match) {
        // Inverted rewrite
        if (rule.inverted) {
          acc.res.uri = rule.replace;
          acc.skip = rule.last;
          return acc;
        }
        return acc;
      }
      // Gone
      if (rule.gone) {
        return {'res': {status: '410',statusDescription: 'Gone'},'skip': rule.last};
      }
  
      // Forbidden
      if (rule.forbidden) {
        return { 'res': { status: '403', statusDescription: 'Forbidden' }, 'skip': rule.last};
      }
  
      // Redirect
      if (rule.redirect) {
        return {
          'res': {
            status: rule.redirect || 301,
            statusDescription: 'Found',
            headers: {
              location: [{
                key: 'Location',
                value: uri.replace(rule.regexp, rule.replace),
              }],
            },
          }, 'skip': rule.last
        };
      }
  
      // Rewrite
      if (!rule.inverted) {
        if (rule.replace !== '-') {
          acc.res.uri = uri.replace(rule.regexp, rule.replace);
        }
        acc.skip = rule.last;
        return acc;
      }
  
    }, { 'res': Object.assign({},e.Records[0].cf.request)});
  }
}

module.exports = RuleSet;
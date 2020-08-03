'use strict';

var util  = require('../util');
var Maybe = require('./maybe');

var Action = function(expression, actionName) {
  if (expression instanceof Maybe)
    return new Maybe(new Action(expression._expression, actionName));

  this._expression = expression;
  this._actionName = actionName;
};

util.assign(Action.prototype, {
  toSexp: function() {
    return ['action', this._actionName, this._expression.toSexp()];
  },

  forEach: function(callback, context) {
    callback.call(context, this._expression);
  },

  compile: function(builder, address) {
    this._expression.compile(builder, address, this._actionName);
  }
});

module.exports = Action;

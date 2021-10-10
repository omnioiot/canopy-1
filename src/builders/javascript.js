'use strict'

const util = require('../util')

class Builder {
  static create (filename) {
    let builder = new Builder()
    builder.filename = filename
    return builder
  }

  constructor (parent, name, parentName) {
    if (parent) {
      this._parent = parent
      this._indentLevel = parent._indentLevel
    } else {
      this._buffer = ''
      this._indentLevel = 0
    }
    this._name = name
    this._parentName = parentName
    this._methodSeparator = ''
    this._varIndex = {}
  }

  comment (lines) {
    lines = lines.map((line) => ' * ' + line)
    return ['/**'].concat(lines).concat([' */'])
  }

  serialize () {
    let files = {}
    files[this._outputPathname()] = this._buffer
    return files
  }

  _outputPathname () {
    return this.filename.replace(/\.peg$/, '.js')
  }

  _write (string) {
    if (this._parent) return this._parent._write(string)
    this._buffer += string
  }

  _indent (block, context) {
    this._indentLevel += 1
    block.call(context, this)
    this._indentLevel -= 1
  }

  _newline () {
    this._write('\n')
  }

  _line (source, semicolon) {
    let i = this._indentLevel
    while (i--) this._write('  ')
    this._write(source)
    if (semicolon !== false) this._write(';')
    this._newline()
  }

  _quote (string) {
    string = string.replace(/\\/g, '\\\\')
                   .replace(/'/g, "\\'")
                   .replace(/\x08/g, '\\b')
                   .replace(/\t/g, '\\t')
                   .replace(/\n/g, '\\n')
                   .replace(/\v/g, '\\v')
                   .replace(/\f/g, '\\f')
                   .replace(/\r/g, '\\r')

    return "'" + string + "'"
  }

  package_ (name, block, context) {
    this._line('(function() {', false)
    this._indent((builder) => {
      builder._line("'use strict'")

      builder._newline()
      builder._line('var formatError = ' + util.formatError.toString())
      builder._newline()
      builder._line('var inherit = ' + util.inherit.toString())

      this._grammarName = name
      block.call(context, this)
    }, this)
    this._line('})()')
  }

  syntaxNodeClass_ () {
    let name = 'TreeNode'
    this.function_('var ' + name, ['text', 'offset', 'elements'], (builder) => {
      builder._line('this.text = text')
      builder._line('this.offset = offset')
      builder._line('this.elements = elements')
    })
    this.function_(name + '.prototype.forEach', ['block', 'context'], (builder) => {
      builder._line('for (var el = this.elements, i = 0, n = el.length; i < n; i++) {', false)
      builder._indent((builder) => {
        builder._line('block.call(context, el[i], i, el)')
      })
      builder._line('}', false)
    })
    return name
  }

  grammarModule_ (actions, block, context) {
    this._newline()
    this.assign_('var ' + this.nullNode_(), '{}')
    this._newline()
    this._line('var Grammar = {', false)
    new Builder(this)._indent(block, context)
    this._newline()
    this._line('}')
  }

  compileRegex_ () {}

  parserClass_ (root) {
    this.function_('var Parser', ['input', 'actions', 'types'], (builder) => {
      builder.assign_('this._input', 'input')
      builder.assign_('this._inputSize', 'input.length')
      builder.assign_('this._actions', 'actions')
      builder.assign_('this._types', 'types')
      builder.assign_('this._offset', '0')
      builder.assign_('this._cache', '{}')
      builder.assign_('this._failure', '0')
      builder.assign_('this._expected', '[]')
    })

    this.function_('Parser.prototype.parse', [], (builder) => {
      builder.jump_('var tree', root)

      builder.if_('tree !== ' + builder.nullNode_() + ' && this._offset === this._inputSize', (builder) => {
        builder.return_('tree')
      })
      builder.if_('this._expected.length === 0', (builder) => {
        builder.assign_('this._failure', 'this._offset')
        builder.append_('this._expected', "'<EOF>'")
      })
      builder.assign_('this.constructor.lastError', '{offset: this._offset, expected: this._expected}')
      builder._line('throw new SyntaxError(formatError(this._input, this._failure, this._expected))')
    })

    this.function_('var parse', ['input', 'options'], (builder) => {
      builder.assign_('options', 'options || {}')
      builder.assign_('var parser', 'new Parser(input, options.actions, options.types)')
      builder.return_('parser.parse()')
    })

    this._line('Object.assign(Parser.prototype, Grammar)')
    this._newline()
  }

  exports_ () {
    let grammar   = this._grammarName,
        namespace = grammar.split('.'),
        last      = namespace.pop(),
        n         = namespace.length,
        condition = []

    for (let i = 0; i < n; i++)
      condition.push('typeof ' + namespace.slice(0, i + 1).join('.') + " !== 'undefined'")

    this.assign_('var exported', '{Grammar: Grammar, Parser: Parser, parse: parse}')
    this._newline()

    this.if_("typeof require === 'function' && typeof exports === 'object'", (builder) => {
      builder._line('Object.assign(exports, exported)')
      if (condition.length > 0) builder.if_(condition.join(' &&' ), (builder) => {
        builder.assign_(grammar, 'exported')
      })
    }, (builder) => {
      builder.assign_('var namespace', "typeof this !== 'undefined' ? this : window")
      for (let ns of namespace) {
        builder.assign_('namespace', 'namespace.' + ns + ' = namespace.' + ns + ' || {}')
      }
      builder.assign_('namespace.' + last, 'exported')
    })
  }

  class_ (name, parent, block, context) {
    let builder = new Builder(this, name, parent)
    block.call(context, builder)
  }

  constructor_ (args, block, context) {
    this.function_('var ' + this._name, args, (builder) => {
      builder._line(this._parentName + '.apply(this, arguments)')
      block.call(context, builder)
    }, this)
    this._line('inherit(' + this._name + ', ' + this._parentName + ')')
  }

  function_ (name, args, block, context) {
    this._newline()
    this._line(name + ' = function(' + args.join(', ') + ') {', false)
    new Builder(this, this._name, this._parentName)._indent(block, context)
    this._line('}')
  }

  method_ (name, args, block, context) {
    this._write(this._methodSeparator)
    this._methodSeparator = ',\n\n'
    this._line(name + ' (' + args.join(', ') + ') {', false)
    new Builder(this)._indent(block, context)
    let n = this._indentLevel
    while (n--) this._write('  ')
    this._write('}')
  }

  cache_ (name, block, context) {
    let temp      = this.localVars_({address: this.nullNode_(), index: 'this._offset'}),
        address   = temp.address,
        offset    = temp.index,
        cacheMap  = 'this._cache._' + name,
        cacheAddr = cacheMap + '[' + offset + ']'

    this.assign_(cacheMap, cacheMap + ' || {}')
    this.assign_('var cached', cacheAddr)

    this.if_('cached', (builder) => {
      builder.assign_('this._offset', 'cached[1]')
      builder.return_('cached[0]')
    })

    block.call(context, this, address)
    this.assign_(cacheAddr,  '[' + address + ', this._offset]')
    this.return_(address)
  }

  attributes_ () {}

  attribute_ (name, value) {
    this.assign_("this['" + name + "']", value)
  }

  localVars_ (vars) {
    let names = {}, code = [], varName
    for (let name in vars) {
      this._varIndex[name] = this._varIndex[name] || 0
      varName = name + this._varIndex[name]
      this._varIndex[name] += 1
      code.push(varName + ' = ' + vars[name])
      names[name] = varName
    }
    this._line('var ' + code.join(', '))
    return names
  }

  localVar_ (name, value) {
    this._varIndex[name] = this._varIndex[name] || 0
    let varName = name + this._varIndex[name]
    this._varIndex[name] += 1

    if (value == undefined) value = this.nullNode_()
    this.assign_('var ' + varName, value)

    return varName
  }

  chunk_ (length) {
    let input = 'this._input',
        ofs   = 'this._offset',
        temp  = this.localVars_({chunk: this.null_(), max: ofs + ' + ' + length})

    this.if_(temp.max + ' <= this._inputSize', (builder) => {
      builder._line(temp.chunk + ' = ' + input + '.substring(' + ofs + ', ' + temp.max + ')')
    })
    return temp.chunk
  }

  syntaxNode_ (address, start, end, elements, action, nodeClass) {
    let args

    if (action) {
      action = 'this._actions.' + action
      args   = ['this._input', start, end]
    } else {
      action = 'new ' + (nodeClass || 'TreeNode')
      args   = ['this._input.substring(' + start + ', ' + end + ')', start]
    }
    args.push(elements || this.emptyList_())

    this.assign_(address, action + '(' + args.join(', ') + ')')
    this.assign_('this._offset', end)
  }

  ifNode_ (address, block, else_, context) {
    this.if_(address + ' !== ' + this.nullNode_(), block, else_, context)
  }

  unlessNode_ (address, block, else_, context) {
    this.if_(address + ' === ' + this.nullNode_(), block, else_, context)
  }

  ifNull_ (elements, block, else_, context) {
    this.if_(elements + ' === null', block, else_, context)
  }

  extendNode_ (address, nodeType) {
    this._line('Object.assign(' + address + ', this._types.' + nodeType + ')')
  }

  failure_ (address, expected) {
    expected = this._quote(expected)
    this.assign_(address, this.nullNode_())

    this.if_('this._offset > this._failure', (builder) => {
      builder.assign_('this._failure', 'this._offset')
      builder.assign_('this._expected', '[]')
    })
    this.if_('this._offset === this._failure', (builder) => {
      builder.append_('this._expected', expected)
    })
  }

  assign_ (name, value) {
    this._line(name + ' = ' + value)
  }

  jump_ (address, rule) {
    this.assign_(address, 'this._read_' + rule + '()')
  }

  conditional_ (kwd, condition, block, else_, context) {
    if (typeof else_ !== 'function') {
      context = else_
      else_   = null
    }
    this._line(kwd + ' (' + condition + ') {', false)
    this._indent(block, context)
    if (else_) {
      this._line('} else {', false)
      this._indent(else_, context)
    }
    this._line('}', false)
  }

  if_ (condition, block, else_, context) {
    this.conditional_('if', condition, block, else_, context)
  }

  whileNotNull_ (expression, block, context) {
    this.conditional_('while', expression + ' !== ' + this.nullNode_(), block, context)
  }

  stringMatch_ (expression, string) {
    return expression + ' === ' + this._quote(string)
  }

  stringMatchCI_ (expression, string) {
    return expression + ' !== null && ' +
      expression + '.toLowerCase() === ' + this._quote(string) + '.toLowerCase()'
  }

  regexMatch_ (regex, string) {
    return string + ' !== null && /' + regex.source + '/.test(' + string + ')'
  }

  return_ (expression) {
    this._line('return ' + expression)
  }

  arrayLookup_ (expression, offset) {
    return expression + '[' + offset + ']'
  }

  append_ (list, value, index) {
    if (index === undefined)
      this._line(list + '.push(' + value + ')')
    else
      this._line(list + '[' + index + '] = ' + value)
  }

  decrement_ (variable) {
    this._line('--' + variable)
  }

  isZero_ (expression) {
    return expression + ' <= 0'
  }

  hasChars_ () {
    return 'this._offset < this._inputSize'
  }

  nullNode_ () {
    return 'FAILURE'
  }

  offset_ () {
    return 'this._offset'
  }

  emptyList_ (size) {
    return size ? 'new Array(' + size + ')' : '[]'
  }

  emptyString_ () {
    return "''"
  }

  true_ () {
    return 'true'
  }

  null_ () {
    return 'null'
  }
}

module.exports = Builder

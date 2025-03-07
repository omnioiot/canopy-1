SHELL := /bin/bash

.PHONY: bootstrap compile test examples clean clean-test clean-examples


src_files := $(shell find src -type f)
lib_files := $(src_files:src/%=lib/%) node_modules

bootstrap: test $(lib_files)

compile:
	./bin/canopy src/meta_grammar.peg

test: node_modules
	npm test

clean: clean-examples clean-test


lib/%: src/%
	@mkdir -p $(@D)
	cp $< $@

node_modules:
	npm install --no-save

examples/%.js: examples/%.peg $(lib_files)
	./bin/canopy --lang js $<

test/%.js: test/%.peg $(lib_files)
	./bin/canopy --lang js $<

%/Grammar.java: %.peg $(lib_files)
	./bin/canopy --lang java $<

%.py: %.peg $(lib_files)
	./bin/canopy --lang python $<

%.rb: %.peg $(lib_files)
	./bin/canopy --lang ruby $<


test_grammars := $(wildcard test/grammars/*.peg)

test/javascript/node_modules:
	cd test/javascript && npm install --no-save

test-js: test/javascript/node_modules $(test_grammars:%.peg=%.js)
	cd test/javascript && npm test

test-java: $(test_grammars:%.peg=%/Grammar.java)
	cd test/java && mvn clean test

test-python: $(test_grammars:%.peg=%.py)
	cd test && python -m unittest discover --pattern '*_test.py'

test-ruby: $(test_grammars:%.peg=%.rb)
	cd test/ruby && rake

clean-test:
	find test/grammars -type f -a ! -name '*.peg' -a ! -name __init__.py -exec rm {} \;


example_grammars        := $(wildcard examples/canopy/*.peg)
example_grammars_js     := $(example_grammars:%.peg=%.js)
example_grammars_java   := $(example_grammars:%.peg=%/Grammar.java)
example_grammars_python := $(example_grammars:%.peg=%.py)
example_grammars_ruby   := $(example_grammars:%.peg=%.rb)

examples: $(example_grammars_js) \
	$(example_grammars_java) \
	$(example_grammars_python) \
	$(example_grammars_ruby) \
	examples/pegjs

examples/pegjs:
	find examples/pegjs -name '*.peg' -exec pegjs --cache {} \;

clean-examples:
	find examples -name '*.class' -o -name '*.pyc' -exec rm {} \;

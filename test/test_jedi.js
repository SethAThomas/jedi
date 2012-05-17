/*global QUnit, sinon*/
(function ($) {
    $(function () {
        var tests = {};
        var jqVersions = {
            '$jq15': '1.5',
            '$jq16': '1.6',
            '$jq17': '1.7'
        };
        var jqEnvironments = {};

        var Decorators = {
            lookup: [],
            add: function (fn, decor) {
                this.lookup.push([fn, decor]);
            },
            get: function (fn, numOccur) {
                // it's possible that "fn" will be used several times
                // numOccur indicates which occurence to use
                numOccur = numOccur || 1;
                var seen = 0;
                for (var i = 0, len = this.lookup.length; i < len; ++i) {
                    if (this.lookup[i][0] === fn) {
                        if (++seen >= numOccur) {
                            // there may be multiple decorators wrapped around
                            // the original function; recursively search until
                            // we've found the outer decorator
                            return this.get(this.lookup[i][1]);
                        }
                    }
                }
                return fn;
            },
            reset: function () {
                this.lookup = [];
            }
        };

        function slice(arr) {
            var context = arguments[0];
            var args = Array.prototype.slice.call(arguments, 1);
            return Array.prototype.slice.apply(context, args);
        }

        function extractMsg(args) {
            // extracts an optional message from the last index position in the list
            var last = args[args.length - 1];
            var msg;

            if ($.type(last) === 'string' || last === undefined || last === null) {
                args.splice(-1, 1);
                msg = last;
            }
            return msg;
        }

        function getMsg(msg, args) {
            var msgArg = extractMsg(args);

            if (msgArg) {
                return msg + ' (' + msgArg + '): ';
            } else {
                return msg + ': ';
            }
        }

        function getEvenItems(arr) {
            // returns a list of only the even indexed items from 'arr'
            var out = [];
            for (var i = 0, len = arr.length; i < len; i += 2) {
                out[out.length] = arr[i];
            }
            return out;
        }

        function getOddItems(arr) {
            // returns a list of only the odd indexed items from 'arr'
            return getEvenItems(arr.slice(1));
        }

        function AutoNamer(language) {
            this.language = language || 'abcdefghijklmnopqrstuvwxyz';
            this.known = {};
            this.current = this.language[0];
            this.multi = 1;
        }

        AutoNamer.prototype.set = function (name, obj) {
            if (!this.known.hasOwnProperty(name)) {
                this.known[name] = obj;
            }
        };

        AutoNamer.prototype.next = function () {
            // returns the next auto name

            var name = new Array(this.multi + 1).join(this.current);
            var pos = $.inArray(this.current, this.language);
            ++pos;

            if (pos >= this.language.length) {
                this.current = this.language[0];
                ++multi;
            } else {
                this.current = this.language[pos];
            }

            return name;
        };

        AutoNamer.prototype.gets = function () {
            // returns a list of auto-generated names, one for each argument
            var me = this;
            return $.map(arguments, function (v) {
                return me.get(v);
            });
        };

        AutoNamer.prototype.get = function (obj) {
            var name;

            $.each(this.known, function (k, v) {
                if (obj === v) {
                    name = k;
                    return false;
                }
            });

            if (!name) {
                while (1) {
                    name = this.next();
                    if (!this.known.hasOwnProperty(name)) {
                        break;
                    }
                }
                this.known[name] = obj;
            }

            return name;
        };

        AutoNamer.prototype.reset = function () {
            this.current = this.language[0];
            this.multi = 1;
            this.known = {};
        };

        function module(name, $, jqVersion) {
            QUnit.module(jqVersion + ' ' + name, {
                setup: function () {
                    $.extend(window, jqEnvironments[jqVersion]);
                    setup.call(this);

                    this.decor = createSpy('decor');
                    this.decorator = createDecorator(this.decor);
                },
                teardown: function () {
                    teardown();
                }
            });
        }

        var setupEnvironment = function ($) {
            // control which version of jQuery owns $

            var o = {};

            o.autonames = new AutoNamer();

            o.jediify = function () {
                var args = Array.prototype.slice.apply(arguments);
                var events = args.slice(0, -1);
                var spies = args[args.length - 1];

                if (events.length !== spies.length) {
                    throw new Error('[jediify] event type / decorator mismatch;\n' + events.length + ' !== ' + spies.length);
                }

                var decorators = createDecorators(spies);

                $.each(events, function (i, type) {
                    $.jedi(type, decorators[i]);
                });
            };

            o.createDecorator = function (spy) {
                return function (fn) {
                    var wrapped = function () {
                        spy();
                        return fn.apply(this, arguments);
                    };

                    Decorators.add(fn, wrapped);

                    return wrapped;
                };
            };

            o.createDecorators = function (spies) {
                return $.map(spies, function (spy) {
                    return createDecorator(spy);
                });
            };

            o.createSpy = function (name) {
                var spy;
                var fn = function () {
                    // the first argument passed to a jQuery event handler
                    // is an instance of jQuery.Event; deep copying using
                    // $.extend() only works on complex key-values of 
                    // arrays and plain objects; jQuery.Event is not a plain
                    // object, so the deep copy won't step into the jQuery.Event
                    // instance; however, you can explicitly tell jQuery to
                    // copy one of these instances, which is what we're doing here

                    // copying [jQuery.Event, ..., ...] doesn't work, so explicitly copy
                    // each item in arguments
                    var args = $.map(arguments, function (arg) {
                        switch ($.type(arg)) {
                        case 'object':
                            return $.extend(true, {}, arg);
                        case 'array':
                            return $.extend(true, [], arg);
                        default:
                            return arg;
                        }
                    });
                    spy.args[spy.args.length - 1] = args;
                };
                spy = sinon.spy(fn);

                if (name) {
                    autonames.set(name, spy);
                }

                return spy;
            };

            o.createSpies = function (num, prefix) {
                prefix = prefix || 'spy';
                var spies = [];
                for (var i = 0; i < num; ++i) {
                    spies[spies.length] = createSpy(prefix + i);
                }
                return spies;
            };

            o.verifyCallCountPairs = function () {
                // similar to verifyCallCount, except that there should be
                // pairs of arguments: an expected count and a spy

                var args = Array.prototype.slice.call(arguments);
                // last argument can optionally be a msg description
                var msg = args[args.length === 0 ? 0 : args.length - 1];

                if ($.type(msg) === 'string') {
                    args.splice(-1, 1);
                    msg = 'call counts (' + msg + '): ';
                } else {
                    msg = 'call count: ';
                }

                var counts = getEvenItems(args);
                var spies = getOddItems(args);
                var names = autonames.gets.apply(autonames, spies);

                msg += '[' + names.join(', ') + ']; ';

                for (var i = 0, len = spies.length; i < len; ++i) {
                    QUnit.strictEqual(
                        counts[i],
                        spies[i].callCount,
                        msg + names[i] + '(' + i + ') should be called ' + counts[i] + ' times'
                    );
                }
            };

            o.verifyCallCount = function (count) {
                var args = slice(arguments, 1);
                // last argument can optionally be a msg description
                var msg = getMsg('call count', args);
                
                var names = autonames.gets.apply(autonames, args);

                msg += '[' + names.join(', ') + ']; ';

                $.each(args, function (i, spy) {
                    var name = names[i] + '(' + i + ')';
                    QUnit.strictEqual(spy.callCount, count, msg + name + ' should be called ' + count + ' times');
                });
            };

            o.verifyCallCounts = function (count) {
                // accepts lists of spies
                var args = slice(arguments, 1);
                var msg = extractMsg(args);

                var spies = [];
                $.each(args, function (_, arr) {
                    spies = spies.concat(arr);
                });

                verifyCallCount.apply({}, [count].concat(spies).concat([msg]));
            };

            o.verifyCallOrder = function () {
                // verifies that a list of spies were called in order
                // ex:
                // verifyCallOrder(evt1, evt2, evt1, decor, evt3)
                //   -- verifies that:
                //     - evt1 called before evt2
                //     - evt2 called before evt1 (2nd call)
                //     - evt1 (2nd) called before decor
                //     - decor called before evt3
                
                var args = Array.prototype.slice.apply(arguments);
                // last argument can optionally be a msg description
                var msg = args[args.length === 0 ? 0 : args.length - 1];
                
                if ($.type(msg) === 'string') {
                    args.splice(-1, 1);
                    msg = 'call order (' + msg + '): ';
                } else {
                    msg = 'call order: ';
                }
                
                // assign some designator names to the spies
                var names = autonames.gets.apply(autonames, args);
                
                msg += '[' + names.join(', ') + ']; ';

                $.each(args, function (i, spy) {
                    if (i > 0) {
                        var a = names[i - 1] + '(' + (i - 1) + ')';
                        var b = names[i] + '(' + i + ')';
                        QUnit.ok(args[i - 1].calledBefore(spy), msg + a + ' should be before ' + b);
                    }
                });
            };

            o.verifyThis = function (theThis) {
                // verifies that each spy was called with theThis as the "this"

                var args = Array.prototype.slice.call(arguments, 1);
                // last argument can optionally be a msg description
                var msg = args[args.length === 0 ? 0 : args.length - 1];

                if ($.type(msg) === 'string') {
                    args.splice(-1, 1);
                    msg = 'verifying "this" (' + msg + '): ';
                } else {
                    msg = 'verifying "this": ';
                }

                // assign some designator names to the spies
                var names = autonames.gets.apply(autonames, args);

                msg += '[' + names.join(', ') + ']; ';

                $.each(args, function (i, spyObj) {
                    var name = names[i] + '(' + i + ')';
                    if (spyObj.thisValues) {
                        // sinon.spy instance
                        QUnit.ok(spyObj.alwaysCalledOn(theThis), msg + name);
                    } else {
                        // sinon.spyCall instance
                        QUnit.ok(spyObj.calledOn(theThis), msg + name);
                    }
                });
            };

            o.verifyDatas = function (callIndex) {
                var args = slice(arguments, 1);
                var msg = getMsg('verifying data', args);

                var datas = getEvenItems(args);
                var spies = getOddItems(args);

                var names = autonames.gets.apply(autonames, spies);
                msg += '[' + names.join(', ') + ']; ';

                $.each(datas, function (i, data) {
                    var name = names[i] + '(' + i + ')';
                    QUnit.deepEqual(data, spies[i].args[callIndex][0].data, msg + name);
                });
            };

            o.setup = function () {
                var $sandbox = $('#qunit-fixture');
                var content = [
                    '<ul>',
                    '    <li>first</li>',
                    '    <li>second</li>',
                    '    <li>third</li>',
                    '</ul>'
                ].join('');

                $sandbox.append(content);

                Decorators.reset();
                autonames.reset();

                this.$ul = $('ul', $sandbox);
                this.$lis = $('li', $sandbox);
                this.$li0 = this.$lis.eq(0);
                this.$li1 = this.$lis.eq(1);
                this.$li2 = this.$lis.eq(2);
            };

            o.teardown = function () {
                $.unjedi();
            };

            return o;
        }

        // ################ tests ######################

        tests.jQueryVersion = function ($, jqVersion) {
            QUnit.test('jQuery version', function () {
                // sanity check to ensure we are really testing with the right version of jQuery

                QUnit.strictEqual($().jquery, jqVersion, $().jquery + ' === ' + jqVersion);
            });
        };

        /*tests.shortcutEvents = function ($, jqVersion) {
            QUnit.module(jqVersion + ' bind decoration', {
                setup: function () {
                    var $sandbox = $('#qunit-fixture');
                    var content = [
                        '<ul>',
                        '    <li>first</li>',
                        '    <li>second</li>',
                        '    <li>third</li>',
                        '</ul>'
                    ].join('');

                    $sandbox.append(content);

                    this.$lis = $('li', $sandbox);
                    this.$li0 = this.$lis.eq(0);
                    this.$li1 = this.$lis.eq(1);
                    this.$li2 = this.$lis.eq(2);
                }
            });

            QUnit.test('no decorators', function () {
                var evt1 = sinon.stub(),
                    evt2 = sinon.stub(),
                    evt3 = sinon.stub();

                QUnit.ok(!evt1.called);
                QUnit.ok(!evt2.called);
                QUnit.ok(!evt3.called);

                // verify that two different types of shortcut events
                // still operate properly with no decorators
                this.$lis.click(evt1).click(evt2).dblclick(evt3);
                this.$li0.click();

                QUnit.ok(evt1.calledOnce);
                QUnit.ok(evt2.calledOnce);
                QUnit.ok(!evt3.called); // not called
                QUnit.ok(evt1.calledBefore(evt2));
                QUnit.deepEqual(evt1.thisValues, [this.$li0[0]]);
                QUnit.deepEqual(evt2.thisValues, [this.$li0[0]]);

                this.$li1.dblclick();

                QUnit.ok(evt1.calledOnce);
                QUnit.ok(evt2.calledOnce);
                QUnit.ok(evt3.calledOnce);
                QUnit.deepEqual(evt3.thisValues, [this.$li1[0]]);
            });

            QUnit.test('shortcut events', function () {
                var evt1 = sinon.stub(), // undecorated click handler
                    evt2 = sinon.stub(), // decorated click handler
                    evt3 = sinon.stub(), // decorated click handler, undecorated dblclick handler
                    evt4 = sinon.stub(), // undecorated dblclick handler
                    decor = sinon.stub(); // special decorator task
                
                function decorator(fn) {
                    return function () {
                        decor();
                        return fn.apply(this, arguments);
                    };
                }

                // add an event handler before any decorators are added
                this.$lis.click(evt1);
                this.$lis.dblclick(evt4);

                // add decorators
                $.jedi('click', decorator);
                $.jedi('dblclick', decorator);

                // add some events that will be decorated
                // this also proves that the shortcut is returning "this", so
                // chaining works
                this.$lis.click(evt2).click(evt3);

                // add a different type of event that won't be decorated
                // add a handler that is also being decorated, to prove that
                // the handler is not affected
                this.$lis.dblclick(evt3);

                // verify nothing has been called yet
                QUnit.ok(!evt1.called, 'evt1 not called yet');
                QUnit.ok(!evt2.called, 'evt2 not called yet');
                QUnit.ok(!evt3.called, 'evt3 not called yet');
                QUnit.ok(!evt4.called, 'evt4 not called yet');
                QUnit.ok(!decor.called, 'decor not called yet');

                this.$li0.click();

                // verify the click handlers were triggered, plus the decorator
                // task
                QUnit.ok(evt1.calledOnce, 'evt1 was called');
                QUnit.ok(evt2.calledOnce, 'evt2 was called');
                QUnit.ok(evt3.calledOnce, 'evt3 was called');
                QUnit.ok(!evt4.called, 'evt4 not called');
                QUnit.ok(decor.calledTwice, 'decor called twice');

                // verify call order
                QUnit.ok(evt1.calledBefore(evt2), 'evt1 called before evt2');
                QUnit.ok(evt2.calledBefore(evt3), 'evt2 called before evt3');
                QUnit.ok(decor.getCall(0).calledBefore(evt2.getCall(0)), 'decor called before evt2');
                QUnit.ok(decor.getCall(1).calledBefore(evt3.getCall(0)), 'decor called before evt3');

                // verify "this" is correctly preserved
                QUnit.ok(evt1.calledOn(this.$li0[0]), 'evt1 "this" preserved');
                QUnit.ok(evt2.calledOn(this.$li0[0]), 'evt2 "this" preserved');
                QUnit.ok(evt3.calledOn(this.$li0[0]), 'evt3 "this" preserved');

                this.$li1.dblclick();

                // verify the double click handlers were triggered, plus the
                // decorator task
                QUnit.ok(evt1.calledOnce, 'evt1 was not called');
                QUnit.ok(evt2.calledOnce, 'evt2 was not called');
                QUnit.ok(evt3.calledTwice, 'evt3 was called');
                QUnit.ok(evt4.calledOnce, 'evt4 was called');
                QUnit.ok(decor.calledThrice, 'decor was called');

                // verify call order
                QUnit.ok(evt4.getCall(0).calledBefore(evt3.getCall(1)), 'evt4 called before evt3');
                QUnit.ok(decor.getCall(2).calledBefore(evt3.getCall(1)), 'decor called before evt3');

                // verify "this" is correctly preserved
                QUnit.ok(evt3.getCall(1).calledOn(this.$li1[0]), 'evt3 "this" preserved');
                QUnit.ok(evt4.calledOn(this.$li1[0]), 'evt4 "this" preserved');
            });

            QUnit.test('bind and trigger', function () {
                var evt1 = sinon.stub(), // undecorated click handler
                    evt2 = sinon.stub(), // decorated click handler
                    evt3 = sinon.stub(), // decorated click handler, undecorated dblclick handler
                    evt4 = sinon.stub(), // undecorated dblclick handler
                    decor = sinon.stub(); // special decorator task
                
                function decorator(fn) {
                    return function () {
                        decor();
                        return fn.apply(this, arguments);
                    };
                }

                // add an event handler before any decorators are added
                this.$lis.bind('click', evt1);
                this.$lis.bind('dblclick', evt4);

                // add decorators
                $.jedi('click', decorator);
                $.jedi('dblclick', decorator);

                // add some events that will be decorated
                // this also proves that the shortcut is returning "this", so
                // chaining works
                this.$lis.bind('click', evt2).bind('click', evt3);

                // add a different type of event that won't be decorated
                // add a handler that is also being decorated, to prove that
                // the handler is not affected
                this.$lis.bind('dblclick', evt3);

                // verify nothing has been called yet
                QUnit.ok(!evt1.called, 'evt1 not called yet');
                QUnit.ok(!evt2.called, 'evt2 not called yet');
                QUnit.ok(!evt3.called, 'evt3 not called yet');
                QUnit.ok(!evt4.called, 'evt4 not called yet');
                QUnit.ok(!decor.called, 'decor not called yet');

                this.$li0.trigger('click');

                // verify the click handlers were triggered, plus the decorator
                // task
                QUnit.ok(evt1.calledOnce, 'evt1 was called');
                QUnit.ok(evt2.calledOnce, 'evt2 was called');
                QUnit.ok(evt3.calledOnce, 'evt3 was called');
                QUnit.ok(!evt4.called, 'evt4 not called');
                QUnit.ok(decor.calledTwice, 'decor called twice');

                // verify call order
                QUnit.ok(evt1.calledBefore(evt2), 'evt1 called before evt2');
                QUnit.ok(evt2.calledBefore(evt3), 'evt2 called before evt3');
                QUnit.ok(decor.getCall(0).calledBefore(evt2.getCall(0)), 'decor called before evt2');
                QUnit.ok(decor.getCall(1).calledBefore(evt3.getCall(0)), 'decor called before evt3');

                // verify "this" is correctly preserved
                QUnit.ok(evt1.calledOn(this.$li0[0]), 'evt1 "this" preserved');
                QUnit.ok(evt2.calledOn(this.$li0[0]), 'evt2 "this" preserved');
                QUnit.ok(evt3.calledOn(this.$li0[0]), 'evt3 "this" preserved');

                this.$li1.trigger('dblclick');

                // verify the double click handlers were triggered, plus the
                // decorator task
                QUnit.ok(evt1.calledOnce, 'evt1 was not called');
                QUnit.ok(evt2.calledOnce, 'evt2 was not called');
                QUnit.ok(evt3.calledTwice, 'evt3 was called');
                QUnit.ok(evt4.calledOnce, 'evt4 was called');
                QUnit.ok(decor.calledThrice, 'decor was called');

                // verify call order
                QUnit.ok(evt4.getCall(0).calledBefore(evt3.getCall(1)), 'evt4 called before evt3');
                QUnit.ok(decor.getCall(2).calledBefore(evt3.getCall(1)), 'decor called before evt3');

                // verify "this" is correctly preserved
                QUnit.ok(evt3.getCall(1).calledOn(this.$li1[0]), 'evt3 "this" preserved');
                QUnit.ok(evt4.calledOn(this.$li1[0]), 'evt4 "this" preserved');
            });

            QUnit.test('custom events', function () {
                var evt1 = sinon.stub(), // undecorated foo handler
                    evt2 = sinon.stub(), // decorated foo handler
                    evt3 = sinon.stub(), // decorated foo handler, undecorated bar handler
                    evt4 = sinon.stub(), // undecorated bar handler
                    decor = sinon.stub(); // special decorator task
                
                function decorator(fn) {
                    return function () {
                        decor();
                        return fn.apply(this, arguments);
                    };
                }

                // add an event handler before any decorators are added
                this.$lis.bind('foo', evt1);
                this.$lis.bind('bar', evt4);

                // add decorators
                $.jedi('foo', decorator);
                $.jedi('bar', decorator);

                // add some events that will be decorated
                // this also proves that the shortcut is returning "this", so
                // chaining works
                this.$lis.bind('foo', evt2).bind('foo', evt3);

                // add a different type of event that won't be decorated
                // add a handler that is also being decorated, to prove that
                // the handler is not affected
                this.$lis.bind('bar', evt3);

                // verify nothing has been called yet
                QUnit.ok(!evt1.called, 'evt1 not called yet');
                QUnit.ok(!evt2.called, 'evt2 not called yet');
                QUnit.ok(!evt3.called, 'evt3 not called yet');
                QUnit.ok(!evt4.called, 'evt4 not called yet');
                QUnit.ok(!decor.called, 'decor not called yet');

                this.$li0.trigger('foo');

                // verify the foo handlers were triggered, plus the decorator
                // task
                QUnit.ok(evt1.calledOnce, 'evt1 was called');
                QUnit.ok(evt2.calledOnce, 'evt2 was called');
                QUnit.ok(evt3.calledOnce, 'evt3 was called');
                QUnit.ok(!evt4.called, 'evt4 not called');
                QUnit.ok(decor.calledTwice, 'decor called twice');

                // verify call order
                QUnit.ok(evt1.calledBefore(evt2), 'evt1 called before evt2');
                QUnit.ok(evt2.calledBefore(evt3), 'evt2 called before evt3');
                QUnit.ok(decor.getCall(0).calledBefore(evt2.getCall(0)), 'decor called before evt2');
                QUnit.ok(decor.getCall(1).calledBefore(evt3.getCall(0)), 'decor called before evt3');

                // verify "this" is correctly preserved
                QUnit.ok(evt1.calledOn(this.$li0[0]), 'evt1 "this" preserved');
                QUnit.ok(evt2.calledOn(this.$li0[0]), 'evt2 "this" preserved');
                QUnit.ok(evt3.calledOn(this.$li0[0]), 'evt3 "this" preserved');

                this.$li1.trigger('bar');

                // verify the bar handlers were triggered, plus the
                // decorator task
                QUnit.ok(evt1.calledOnce, 'evt1 was not called');
                QUnit.ok(evt2.calledOnce, 'evt2 was not called');
                QUnit.ok(evt3.calledTwice, 'evt3 was called');
                QUnit.ok(evt4.calledOnce, 'evt4 was called');
                QUnit.ok(decor.calledThrice, 'decor was called');

                // verify call order
                QUnit.ok(evt4.getCall(0).calledBefore(evt3.getCall(1)), 'evt4 called before evt3');
                QUnit.ok(decor.getCall(2).calledBefore(evt3.getCall(1)), 'decor called before evt3');

                // verify "this" is correctly preserved
                QUnit.ok(evt3.getCall(1).calledOn(this.$li1[0]), 'evt3 "this" preserved');
                QUnit.ok(evt4.calledOn(this.$li1[0]), 'evt4 "this" preserved');
            });

            QUnit.test('namespaced events', function () {
                var evt1 = sinon.stub(), // undecorated click handler
                    evt2 = sinon.stub(), // decorated click handler
                    evt3 = sinon.stub(), // decorated click handler, undecorated custom handler
                    evt4 = sinon.stub(), // undecorated custom handler
                    decor = sinon.stub(); // special decorator task
                
                function decorator(fn) {
                    return function () {
                        decor();
                        return fn.apply(this, arguments);
                    };
                }

                // add an event handler before any decorators are added
                this.$lis.bind('click.a', evt1);
                this.$lis.bind('custom.a', evt4);

                // add decorators
                $.jedi('click', decorator);
                $.jedi('custom', decorator);

                // add some events that will be decorated
                // this also proves that the shortcut is returning "this", so
                // chaining works
                this.$lis.bind('click', evt2);

                // add a different type of event that won't be decorated
                // add a handler that is also being decorated, to prove that
                // the handler is not affected
                // prove that binding multiple events at a time works
                this.$lis.bind('click custom.b', evt3);

                // verify nothing has been called yet
                QUnit.ok(!evt1.called, 'evt1 not called yet');
                QUnit.ok(!evt2.called, 'evt2 not called yet');
                QUnit.ok(!evt3.called, 'evt3 not called yet');
                QUnit.ok(!evt4.called, 'evt4 not called yet');
                QUnit.ok(!decor.called, 'decor not called yet');

                this.$li0.click();

                // verify the click handlers were triggered, plus the decorator
                // task
                QUnit.ok(evt1.calledOnce, 'evt1 was called');
                QUnit.ok(evt2.calledOnce, 'evt2 was called');
                QUnit.ok(evt3.calledOnce, 'evt3 was called');
                QUnit.ok(!evt4.called, 'evt4 not called');
                QUnit.ok(decor.calledTwice, 'decor called twice');

                // verify call order
                QUnit.ok(evt1.calledBefore(evt2), 'evt1 called before evt2');
                QUnit.ok(evt2.calledBefore(evt3), 'evt2 called before evt3');
                QUnit.ok(decor.getCall(0).calledBefore(evt2.getCall(0)), 'decor called before evt2');
                QUnit.ok(decor.getCall(1).calledBefore(evt3.getCall(0)), 'decor called before evt3');

                // verify "this" is correctly preserved
                QUnit.ok(evt1.calledOn(this.$li0[0]), 'evt1 "this" preserved');
                QUnit.ok(evt2.calledOn(this.$li0[0]), 'evt2 "this" preserved');
                QUnit.ok(evt3.calledOn(this.$li0[0]), 'evt3 "this" preserved');

                this.$li1.trigger('custom');

                // verify the custom handlers were triggered, plus the
                // decorator task
                QUnit.ok(evt1.calledOnce, 'evt1 was not called');
                QUnit.ok(evt2.calledOnce, 'evt2 was not called');
                QUnit.ok(evt3.calledTwice, 'evt3 was called');
                QUnit.ok(evt4.calledOnce, 'evt4 was called');
                QUnit.ok(decor.calledThrice, 'decor was called');

                // verify call order
                QUnit.ok(evt4.getCall(0).calledBefore(evt3.getCall(1)), 'evt4 called before evt3');
                QUnit.ok(decor.getCall(2).calledBefore(evt3.getCall(1)), 'decor called before evt3');

                // verify "this" is correctly preserved
                QUnit.ok(evt3.getCall(1).calledOn(this.$li1[0]), 'evt3 "this" preserved');
                QUnit.ok(evt4.calledOn(this.$li1[0]), 'evt4 "this" preserved');

                this.$li2.trigger('custom.b');

                // verify the custom handlers were triggered, plus the
                // decorator task
                QUnit.ok(evt1.calledOnce, 'evt1 was not called');
                QUnit.ok(evt2.calledOnce, 'evt2 was not called');
                QUnit.ok(evt3.calledThrice, 'evt3 was called');
                QUnit.ok(evt4.calledOnce, 'evt4 was not called');
                QUnit.strictEqual(decor.callCount, 4, 'decor was called');
            });
        };*/

        tests.bind = function ($, jqVersion) {
            module('bind', $, jqVersion);
 
            QUnit.test('.bind(eventType, handler(eventObject))', function () {
                /*
                test checklist ([+] done, [-] not needed, [] not done):
                [+] undecorated - non-namespace
                [+] undecorated - namespace
                [+] undecorated - multiple event types
                [+] undecorated - chaining
                [+] decorated - non-namespace
                [+] decorated - namespace
                [+] decorated - multiple event types
                [+] decorated - chaining
                [+] trigger - non-namespace
                [+] trigger - namespace
                [+] trigger - non-bound event type
                [+] call order
                [+] "this"
                */

                var sp = createSpies(7);
                var dsp = createSpies(2, 'decor');

                // undecorated
                this.$lis // chaining
                    .bind('click', sp[0]) // non-namespace
                    .bind('click.a', sp[1]) // namespace
                    .bind('click change foo.a bar.b', sp[2]) // multiple event types
                ;

                jediify('click', 'change', dsp);

                // decorated
                this.$lis // chaining
                    .bind('click', sp[3]) // non-namespace
                    .bind('click.a', sp[4]) // namespace
                    .bind('click change foo.a bar.b', sp[5]) // multiple event types
                    .bind('foo', sp[6])
                ;

                // pre trigger sanity checks
                verifyCallCounts(0, sp, dsp);

                // trigger non-namespace
                this.$li0.trigger('click');

                verifyCallCounts(1, sp[0], sp[1], sp[2], sp[3], sp[4], sp[5]);
                verifyCallCounts(3, dsp[0]);
                verifyCallCount(0, sp[6], dsp[1]);

                verifyCallOrder(sp[0], sp[1], sp[2], dsp[0], sp[3], dsp[0], sp[4], dsp[0], sp[5]); // order
                verifyThis(this.$li0[0], sp[0], sp[1], sp[2], sp[3], sp[4], sp[5]); // "this"

                // trigger namespace
                this.$li0.trigger('foo.a');

                verifyCallCount(1, sp[0], sp[1], sp[3], sp[4]);
                verifyCallCount(2, sp[2], sp[5]);
                verifyCallCount(3, dsp[0]);
                verifyCallCount(0, sp[6], dsp[1]);

                // trigger non-bound event type
                this.$li0.trigger('wizz');

                verifyCallCount(1, sp[0], sp[1], sp[3], sp[4]);
                verifyCallCount(2, sp[2], sp[5]);
                verifyCallCount(3, dsp[0]);
                verifyCallCount(0, sp[6], dsp[1]);
            });

            QUnit.test('.bind(eventType, eventData, handler(eventObject))', function () {
                /*
                test checklist ([+] done, [-] not needed, [] not done):
                [+] undecorated - non-namespace
                [+] undecorated - namespace
                [+] undecorated - multiple event types
                [+] undecorated - chaining
                [+] decorated - non-namespace
                [+] decorated - namespace
                [+] decorated - multiple event types
                [+] decorated - chaining
                [+] trigger - non-namespace
                [+] trigger - namespace
                [+] trigger - non-bound event type
                [+] call order
                [+] "this"
                [+] event.data
                */

                var sp = createSpies(7);
                var dsp = createSpies(2, 'decor');
                var datas = [
                    {msg: 'data 0'},
                    {msg: 'data 1'},
                    {msg: 'data 2'},
                    {msg: 'data 3'},
                    {msg: 'data 4'},
                    {msg: 'data 5'},
                    {msg: 'data 6'}
                ];

                // undecorated
                this.$lis // chaining
                    .bind('click', datas[0], sp[0]) // non-namespace
                    .bind('click.a', datas[1], sp[1]) // namespace
                    .bind('click change foo.a bar.b', datas[2], sp[2]) // multiple event types
                ;

                jediify('click', 'change', dsp);

                // decorated
                this.$lis // chaining
                    .bind('click', datas[3], sp[3]) // non-namespace
                    .bind('click.a', datas[4], sp[4]) // namespace
                    .bind('click change foo.a bar.b', datas[5], sp[5]) // multiple event types
                    .bind('foo', datas[6], sp[6])
                ;

                // pre trigger sanity checks
                verifyCallCounts(0, sp, dsp);

                // trigger non-namespace
                this.$li0.trigger('click');

                verifyCallCounts(1, sp[0], sp[1], sp[2], sp[3], sp[4], sp[5]);
                verifyCallCounts(3, dsp[0]);
                verifyCallCount(0, sp[6], dsp[1]);

                verifyCallOrder(sp[0], sp[1], sp[2], dsp[0], sp[3], dsp[0], sp[4], dsp[0], sp[5]); // order
                verifyThis(this.$li0[0], sp[0], sp[1], sp[2], sp[3], sp[4], sp[5]); // "this"
                // event.data
                verifyDatas(
                    0, // compare the first call
                    datas[0], sp[0],
                    datas[1], sp[1],
                    datas[2], sp[2],
                    datas[3], sp[3],
                    datas[4], sp[4],
                    datas[5], sp[5]
                );

                // trigger namespace
                this.$li0.trigger('foo.a');

                verifyCallCount(1, sp[0], sp[1], sp[3], sp[4]);
                verifyCallCount(2, sp[2], sp[5]);
                verifyCallCount(3, dsp[0]);
                verifyCallCount(0, sp[6], dsp[1]);

                // trigger non-bound event type
                this.$li0.trigger('wizz');

                verifyCallCount(1, sp[0], sp[1], sp[3], sp[4]);
                verifyCallCount(2, sp[2], sp[5]);
                verifyCallCount(3, dsp[0]);
                verifyCallCount(0, sp[6], dsp[1]);
            });

            QUnit.test('.bind(eventType, preventBubble)', function () {
                var evt1 = createSpy('evt1');
                var evt2 = createSpy('evt2');
                var evt3 = createSpy('evt3');
                var decor = this.decor;

                $.jedi('click', this.decorator);

                this.$ul.bind('click change wizz', evt1);

                this.$li0.click(); // event should bubble to $ul

                verifyCallCount(1, evt1, decor);
                verifyCallCount(0, evt2, evt3);
                
                this.$li0
                    .bind('click', false) // should prevent the event from bubbling
                    .bind('click', evt2);

                this.$li1
                    .bind('click.a wizz', false) // prove namespaces work
                    .bind('change', evt3); // prove chaining works

                this.$li0.click(); // event should not bubble to $ul

                verifyCallCountPairs(
                    1, evt1,
                    1, evt2,
                    0, evt3,
                    2, decor
                );

                this.$li1.trigger('click.a');

                verifyCallCountPairs(
                    1, evt1,
                    1, evt2,
                    0, evt3,
                    2, decor
                );

                this.$li1.change();

                verifyCallCountPairs(
                    2, evt1,
                    1, evt2,
                    1, evt3,
                    2, decor
                );

                this.$li1.trigger('wizz');
                
                verifyCallCountPairs(
                    2, evt1,
                    1, evt2,
                    1, evt3,
                    2, decor
                );
            });

            QUnit.test('.bind(eventType, eventData, preventBubble)', function () {
                var evt1 = createSpy('evt1');

                $.jedi('click', this.decorator);

                this.$lis.bind('click', {msg: 'hello'}, false); // should prevent the event from bubbling
                this.$ul.bind('click', evt1);

                this.$li0.click();

                verifyCallCount(0, evt1, 'event should not be called');
            });

            QUnit.test('.bind(events)', function () {
                var evt1 = createSpy('evt1');
                var evt2 = createSpy('evt2');
                var evt3 = createSpy('evt3');
                var evt4 = createSpy('evt4');
                var decor = this.decor;
                var decor2 = createSpy('decor2');
                var decorator2 = createDecorator(decor2);

                $.jedi('click change', this.decorator);
                $.jedi('click', decorator2);

                this.$lis.bind({
                    click: evt1,
                    change: evt2,
                    'focus.b': evt3
                }).bind('click.a.b change.b focus.a', evt4);

                this.$li0.click();
                this.$li0.change();
                this.$li0.trigger('focus.b');

                verifyCallCount(1, evt1, evt2, evt3);
                verifyCallCount(2, evt4);
                verifyCallCount(4, decor);
                verifyCallCount(2, decor2);

                verifyCallOrder(decor, decor2, evt1, decor, evt2, evt3);

                this.$li0.trigger('click.a');

                verifyCallCount(1, evt1, evt2, evt3);
                verifyCallCount(3, evt4);
                verifyCallCount(5, decor);
                verifyCallCount(3, decor2);
            });

            QUnit.test('.bind using multiple space delimited event types', function () {
                var evt1 = createSpy('evt1');

                $.jedi('click dblclick', this.decorator);

                this.$lis.bind('click dblclick focus', evt1);

                this.$li0.click();
                this.$li0.dblclick();
                this.$li0.focus();

                verifyCallCount(3, evt1);
                verifyCallCount(2, this.decor);
            });

            QUnit.test('.<eventType>(handler(eventObject))', function () {
                var evt1 = createSpy('evt1');

                $.jedi('click', this.decorator);

                this.$lis.click(evt1);

                this.$li0.click();

                verifyCallCount(1, this.decor, evt1);
                verifyCallOrder(this.decor, evt1);
            });

            
            QUnit.test('.<eventType>(eventData, handler(eventObject))', function () {
                var evt1 = createSpy('evt1');
                var data = {msg: 'hello'};

                $.jedi('click', this.decorator);

                this.$lis.click(data, evt1);

                this.$li0.click();

                verifyCallCount(1, this.decor, evt1);
                verifyCallOrder(this.decor, evt1);

                QUnit.deepEqual(data, evt1.args[0][0].data);
            });

            QUnit.test('.bind using namespaces', function () {
                var evt1 = createSpy('evt1');
                var evt2 = createSpy('evt2');
                var evt3 = createSpy('evt3');
                var evt4 = createSpy('evt4');
                var evt5 = createSpy('evt5');
                var decor = this.decor;

                $.jedi('click foo wizz', this.decorator);

                this.$lis
                    .bind('click.a.b', evt1)
                    .bind('dblclick.a', evt2)
                    .bind('click.b', evt3)
                    .bind('click', evt4)
                    .bind('wizz.a', evt5);

                this.$li0.trigger('click'); // evt1, evt3, evt4
                this.$li0.trigger('click.a'); // evt1
                this.$li1.trigger('click.b'); // evt1, evt3
                this.$li2.trigger('dblclick.a'); // evt2
                this.$li2.trigger('dblclick.b'); // nothing
                this.$li2.trigger('wizz'); // evt5
                this.$li2.trigger('wizz.a'); // evt5

                verifyCallCountPairs(
                    3, evt1,
                    1, evt2,
                    2, evt3,
                    1, evt4,
                    2, evt5,
                    8, decor
                );

                verifyCallOrder(
                    decor, evt1, decor, evt3, decor, evt4, decor, evt1, decor, evt3, evt2, decor, evt5, decor, evt5
                );
            });

            QUnit.test('.bind sets the js-jedi data', function () {
                var sp = createSpies(6, 'evt');
                var dsp = createSpies(3, 'decor');
                var decorators = createDecorators(dsp);

                this.$lis
                    .bind('click', sp[0])
                    .bind('change.a.b', sp[1])
                    .bind('foo bar.b', sp[2]);

                $.jedi('click', decorators[0]);
                $.jedi('change', decorators[1]);
                $.jedi('foo bar', decorators[2]);

                this.$lis
                    .bind('click', sp[3])
                    .bind('change.a.b', sp[4])
                    .bind('foo bar.b', sp[5]);

                var data = [
                    {
                        eventType: 'click',
                        namespaces: [],
                        type: 'click',
                        selector: null,
                        original: sp[3],
                        decorated: Decorators.get(sp[3])
                    },
                    {
                        eventType: 'change.a.b',
                        namespaces: ['a', 'b'],
                        type: 'change',
                        selector: null,
                        original: sp[4],
                        decorated: Decorators.get(sp[4])
                    },
                    {
                        eventType: 'foo',
                        namespaces: [],
                        type: 'foo',
                        selector: null,
                        original: sp[5],
                        decorated: Decorators.get(sp[5])
                    },
                    {
                        eventType: 'bar.b',
                        namespaces: ['b'],
                        type: 'bar',
                        selector: null,
                        original: sp[5],
                        decorated: Decorators.get(sp[5], 2)
                    }
                ];

                QUnit.deepEqual(this.$li0.data('js-jedi'), data);
                QUnit.deepEqual(this.$li1.data('js-jedi'), data);
                QUnit.deepEqual(this.$li2.data('js-jedi'), data);
            });
        };

        tests.unbind = function ($, jqVersion) {
            module('unbind', $, jqVersion);
            
            QUnit.test('.unbind()', function () {
                var evt1 = createSpy('evt1');
                var decor = createSpy('decor1');
                var decorator = createDecorator(decor);

                $.jedi('click', decorator);

                this.$lis.bind('click', evt1);

                this.$li0.click();

                verifyCallCount(1, evt1, decor);

                // remove the click handler from only $li0
                this.$li0.unbind();

                // prove that the handler is gone
                this.$li0.click();

                verifyCallCount(1, evt1, decor);

                // $li1 should still have a click handler
                this.$li1.click();

                verifyCallCount(2, evt1, decor);
            });

            QUnit.test('.unbind(eventType)', function () {
                var evt1 = createSpy('evt1');
                var evt2 = createSpy('evt2');
                var decor = createSpy('decor1');
                var decorator = createDecorator(decor);

                $.jedi('click', decorator);

                this.$lis.bind('click', evt1);
                this.$lis.bind('change', evt2);

                this.$li0.click();

                verifyCallCount(1, evt1, decor);

                // remove the click handler from only $li0
                this.$li0.unbind('click');

                // prove that the handler is gone
                this.$li0.click();

                verifyCallCount(1, evt1, decor);

                // $li1 should still have a click handler
                this.$li1.click();

                verifyCallCount(2, evt1, decor);

                // prove that the change handler is still there
                this.$li0.change();
                verifyCallCount(1, evt2);

                verifyCallOrder(decor, evt1, decor, evt1, evt2);
            });

            QUnit.test('.unbind(eventType, handler(eventObject))', function () {
                var evt1 = createSpy('evt1');
                var evt2 = createSpy('evt2');
                var evt3 = createSpy('evt3');
                var evt4 = createSpy('evt4');
                var evt5 = createSpy('evt5');
                var evt6 = createSpy('evt6');
                var decor = createSpy('decor1');
                var decorator = createDecorator(decor);

                $.jedi('click', decorator);

                this.$lis
                    .bind('click', evt1)
                    .bind('click.a', evt2)
                    .bind('click.b', evt3)
                    .bind('click.b', evt4)
                    .bind('change', evt5)
                    .bind('change.a', evt6);

                this.$li0.click();

                verifyCallCountPairs(
                    1, evt1,
                    1, evt2,
                    1, evt3,
                    1, evt4,
                    0, evt5,
                    0, evt6,
                    4, decor
                );

                // remove using a function reference 
                this.$li0.unbind('click', evt1);

                // prove that the 1st handler is gone
                this.$li0.click();

                verifyCallCountPairs(
                    1, evt1,
                    2, evt2,
                    2, evt3,
                    2, evt4,
                    0, evt5,
                    0, evt6,
                    7, decor,
                    "unbind('click', evt1)"
                );

                // remove using an event type, namespace and function reference
                this.$li0.unbind('click.b', evt3);

                // prove that the 2nd namespaced handler is still there
                this.$li0.trigger('click.b');

                verifyCallCountPairs(
                    1, evt1,
                    2, evt2,
                    2, evt3,
                    3, evt4,
                    0, evt5,
                    0, evt6,
                    8, decor,
                    "unbind('click.b', evt3)"
                );

                // remove using only a namespace and function reference
                this.$li0.unbind('.b', evt4);

                // all of the click.b events should be gone now
                this.$li0.trigger('click.b');

                verifyCallCountPairs(
                    1, evt1,
                    2, evt2,
                    2, evt3,
                    3, evt4,
                    0, evt5,
                    0, evt6,
                    8, decor,
                    "unbind('.b', evt4)"
                );

                // $li1 should still have all of the click handlers
                this.$li1.click();

                verifyCallCountPairs(
                    2, evt1,
                    3, evt2,
                    3, evt3,
                    4, evt4,
                    0, evt5,
                    0, evt6,
                    12, decor,
                    "$li1 should have all handlers"
                );

                // prove that the change handler is still there
                this.$li0.change();
                
                verifyCallCountPairs(
                    2, evt1,
                    3, evt2,
                    3, evt3,
                    4, evt4,
                    1, evt5,
                    1, evt6,
                    12, decor,
                    "$li0.change()"
                );
            });

            QUnit.test('.unbind(eventType, false)', function () {
                var evt1 = createSpy('evt1');
                var evt2 = createSpy('evt2');
                var decor = createSpy('decor1');
                var decorator = createDecorator(decor);

                $.jedi('click', decorator);

                this.$ul.bind('click', evt2);
                this.$lis.bind('click', evt1);

                this.$li0.click();

                verifyCallCount(1, evt1, evt2);
                verifyCallCount(2, decor);

                this.$lis.bind('click', false); // prevent the event from bubbling

                this.$li0.click();

                verifyCallCountPairs(
                    1, evt2,
                    2, evt1,
                    3, decor
                );
                
                // remove the click handler from only $li0
                this.$li0.unbind('click', false);

                // prove that the handler preventing bubbling is gone
                this.$li0.click();

                verifyCallCountPairs(
                    2, evt2,
                    3, evt1,
                    5, decor
                );

                // $li1 should still have a handler preventing bubbling
                this.$li1.click();

                verifyCallCountPairs(
                    2, evt2,
                    4, evt1,
                    6, decor
                );
            });

            QUnit.test('.unbind(event)', function () {
                var evt1 = createSpy('evt1');
                var decor = createSpy('decor1');
                var decorator = createDecorator(decor);

                $.jedi('click', decorator);

                this.$lis.bind('click', evt1);

                this.$li0.click();

                verifyCallCount(1, evt1, decor);

                // use the event object from the first call to remove the click handler
                this.$li0.unbind(evt1.args[0][0]);

                // prove that the handler is gone
                this.$li0.click();

                verifyCallCount(1, evt1, decor);

                // $li1 should still have a click handler
                this.$li1.click();

                verifyCallCount(2, evt1, decor);
            });

            QUnit.test('.unbind(eventType) namespaced eventType', function () {
                // verify that an eventType.namespace and .namespace unbind
                var evt1 = createSpy('evt1');
                var evt2 = createSpy('evt2');
                var evt3 = createSpy('evt3');
                var evt4 = createSpy('evt4');
                var evt5 = createSpy('evt5');
                var decor = createSpy('decor1');
                var decorator = createDecorator(decor);

                $.jedi('click', decorator);

                this.$lis
                    .bind('click', evt1)
                    .bind('click.a', evt2)
                    .bind('click.b', evt3)
                    .bind('change', evt4)
                    .bind('change.a', evt5);

                this.$li0.unbind('click.a');

                this.$li0.click().change();

                verifyCallCountPairs(
                    1, evt1,
                    0, evt2,
                    1, evt3,
                    1, evt4,
                    1, evt5,
                    2, decor
                );

                this.$li0.unbind('.a');

                this.$li0.click().change();

                verifyCallCountPairs(
                    2, evt1,
                    0, evt2,
                    2, evt3,
                    2, evt4,
                    1, evt5,
                    4, decor
                );
            });

            QUnit.test('.unbind removes jedi data from nodes', function () {
                var sp = createSpies(9, 'evt');
                var dsp = createSpies(3, 'decor');
                var decorators = createDecorators(dsp);

                this.$lis
                    .bind('click', sp[0])
                    .bind('change', sp[1])
                    .bind('wizz.a.b', sp[2])
                    .bind('foo.a bar.b', sp[3]);

                $.jedi('click change', decorators[0]);
                $.jedi('wizz', decorators[1]);
                $.jedi('click foo bar', decorators[2]);

                this.$lis
                    .bind('click', sp[4])
                    .bind('change', sp[5])
                    .bind('wizz.a.b', sp[6])
                    .bind('foo.a bar.b', sp[7])
                    .bind('click.a', sp[8]);

                var actual = this.$li0.data('js-jedi');
                var expected = $.extend(true, [], this.$li0.data('js-jedi'));
                var originalCopy = $.extend(true, [], this.$li0.data('js-jedi'));

                // sanity check
                QUnit.deepEqual(actual, expected);

                this.$li0.unbind('wizz.a', sp[6]);

                expected.splice(2, 1);

                QUnit.deepEqual(actual, expected);

                this.$li0.unbind('click');

                expected.splice(0, 1);
                expected.splice(3, 1);

                QUnit.deepEqual(actual, expected);

                this.$li0.unbind();

                QUnit.deepEqual(actual, []);

                // li1 should be untouched; should have the same lookup data
                // as li0 initially did
                QUnit.deepEqual(this.$li1.data('js-jedi'), originalCopy);
            });

            /*
            QUnit.test('multiple events', function () {});

            QUnit.test('"this" preserved', function () {});

            QUnit.test('call order', function () {});

            QUnit.test('.one(events, handler(eventObject))', function () {});

            QUnit.test('.one(events, data, handler(eventObject))', function () {});
            */

            if (jqVersion === '1.7') {
                /*
                QUnit.test('.on(events, selector, handler(eventObject))', function () {});

                QUnit.test('.on(events, data, handler(eventObject))', function () {});

                QUnit.test('.on(events, selector, data, handler(eventObject))', function () {});

                QUnit.test('.on(event-maps)', function () {});

                QUnit.test('.on(event-maps, selector)', function () {});

                QUnit.test('.on(event-maps, data)', function () {});

                QUnit.test('.on(event-maps, selector, data)', function () {});*/
            }
        };
        
        tests.delegate = function ($, jqVersion) {
            module('delegate', $, jqVersion);

            QUnit.test('(selector, eventType, handler)', function () {
                var sp = createSpies(3);
                var dsp = createSpies(1, 'decor');
                var decorators = createDecorators(dsp);

                this.$lis
                    .delegate('li', 'click', sp[0])
                    .delegate('li', 'change', sp[1]);

                $.jedi('click', decorators[0]);

                this.$lis.delegate('li', 'click', sp[2]);

                this.$li0.click();

                verifyCallCountPairs(
                    1, sp[0],
                    0, sp[1],
                    1, sp[2],
                    1, dsp[0]
                );

                verifyCallOrder(sp[0], dsp[0], sp[2]);
            });
        };

        tests.live = function ($, jqVersion) {
            module('live', $, jqVersion);

            QUnit.test('(events, handler)', function () {
                var sp = createSpies(3);
                var dsp = createSpies(1, 'decor');
                var decorators = createDecorators(dsp);

                this.$lis.find('li')
                    .live('click', sp[0])
                    .live('change', sp[1]);

                $.jedi('click', decorators[0]);

                this.$lis.find('li').live('click', sp[2]);

                this.$li0.click();

                verifyCallCountPairs(
                    1, sp[0],
                    0, sp[1],
                    1, sp[2],
                    1, dsp[0]
                );

                verifyCallOrder(sp[0], dsp[0], sp[2]);
            });
        };

        /*tests.delegateEvents = function () {
        };

        tests.liveEvents = function () {
        };

        tests.onEvents = function () {
        };*/

        $.each(jqVersions, function (jqVar, jqVersion) {
            var jq = window[jqVar];

            jqEnvironments[jqVersion] = setupEnvironment(jq, jqVersion);
            
            $.each(tests, function (name, test) {
                test(jq, jqVersion);
            });
        });
    });
})(jQuery);

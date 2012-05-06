/*global QUnit, sinon*/
(function ($) {
    $(function () {
        var tests = {},
            jqVersions = {
                '$jq15': '1.5',
                '$jq16': '1.6',
                '$jq17': '1.7'
            };

        tests.jQueryVersion = function ($, jqVersion) {
            QUnit.test('jQuery version', function () {
                // sanity check to ensure we are really testing with the right version of jQuery

                QUnit.strictEqual($().jquery, jqVersion);
            });
        };

        tests.shortcutEvents = function ($, jqVersion) {
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
        };

        tests.bind = function ($, jqVersion) {
            QUnit.module(jqVersion + ' bind', {
                setup: function () {
                    var $sandbox = $('#qunit-fixture');
                    var content = [
                            '<ul>',
                            '    <li>first</li>',
                            '    <li>second</li>',
                            '    <li>third</li>',
                            '</ul>'
                        ].join(''),
                        me = this;

                    $sandbox.append(content);

                    this.$ul = $('ul', $sandbox);
                    this.$lis = $('li', $sandbox);
                    this.$li0 = this.$lis.eq(0);
                    this.$li1 = this.$lis.eq(1);
                    this.$li2 = this.$lis.eq(2);

                    this.decor = sinon.stub();
                    this.decorator = function (fn) {
                        return function () {
                            me.decor();
                            return fn.apply(this, arguments);
                        };
                    };
                }
            });

            function verifyCallCount(count) {
                var args = Array.prototype.slice.call(arguments, 1),
                    msg = args[args.length === 0 ? 0 : args.length - 1]; // last argument can optionally be a msg description

                if ($.type(msg) === 'string') {
                    args.splice(-1, 1);
                    msg = 'call count = ' + msg + ': ';
                } else {
                    msg = 'call count: ';
                }

                $.each(args, function (i, spy) {
                    QUnit.ok(spy.callCount === count, msg + i + ' should be called ' + count + ' times');
                });
            }

            function verifyCallOrder() {
                // verifies that a list of spies were called in order
                // ex:
                // verifyCallOrder(evt1, evt2, evt1, decor, evt3)
                //   -- verifies that:
                //     - evt1 called before evt2
                //     - evt2 called before evt1 (2nd call)
                //     - evt1 (2nd) called before decor
                //     - decor called before evt3
                
                var args = Array.prototype.slice.apply(arguments),
                    msg = args[args.length === 0 ? 0 : args.length - 1]; // last argument can optionally be a msg description

                if ($.type(msg) === 'string') {
                    args.splice(-1, 1);
                    msg = 'call order = ' + msg + ': ';
                } else {
                    msg = 'call order: ';
                }

                $.each(args, function (i, spy) {
                    if (i > 0) {
                        QUnit.ok(args[i - 1].calledBefore(spy), msg + (i - 1) + ' should be before ' + i);
                    }
                });
            }

            function verifyThis(theThis) {
                // verifies that each spy was called with theThis as the "this"

                var args = Array.prototype.slice.call(arguments, 1),
                    msg = args[args.length === 0 ? 0 : args.length - 1]; // last argument can optionally be a msg description

                if ($.type(msg) === 'string') {
                    args.splice(-1, 1);
                    msg = 'verifying "this" = ' + msg + ': ';
                } else {
                    msg = 'verifying "this": ';
                }

                $.each(args, function (i, spyObj) {
                    if (spyObj.thisValues) {
                        // sinon.spy instance
                        QUnit.ok(spyObj.alwaysCalledOn(theThis), msg + i);
                    } else {
                        // sinon.spyCall instance
                        QUnit.ok(spyObj.calledOn(theThis), msg + i);
                    }
                });
            }

            QUnit.test('.bind(eventType, handler(eventObject))', function () {
                var evt1 = sinon.stub(),
                    evt2 = sinon.stub();

                // bind an event w/o decoration
                this.$lis.bind('click', evt1);

                // add decorator
                $.jedi('click', this.decorator);
                
                // bind an event w/ decorator
                this.$lis.bind('click', evt2);

                // pre-call sanity checks
                verifyCallCount(0, evt1, evt2, this.decor, 'evt1, evt2, decor');

                // trigger event
                this.$li0.click();

                // verify call count
                verifyCallCount(1, evt1, evt2, this.decor, 'evt1, evt2, decor');

                // verify call order
                verifyCallOrder(evt1, this.decor, evt2, 'evt1, decor, evt2');

                // verify "this"
                verifyThis(this.$li0[0], evt1, evt2, 'evt1, evt2');
            });

            QUnit.test('.bind(eventType, eventData, handler(eventObject))', function () {
                var data1,
                    data2,
                    evt1 = sinon.spy(function (evt) {
                        data1 = $.extend(true, {}, evt.data);
                    }),
                    evt2 = sinon.spy(function (evt) {
                        data2 = $.extend(true, {}, evt.data);
                    });

                // bind an event w/o decoration
                this.$lis.bind('click', {msg: 'undecorated event data'}, evt1);

                // add decorator
                $.jedi('click', this.decorator);
                
                // bind an event w/ decorator
                this.$lis.bind('click', {msg: 'decorated event data'}, evt2);

                // pre-call sanity checks
                verifyCallCount(0, evt1, evt2, this.decor, 'evt1, evt2, decor');

                // trigger event
                this.$li0.click();

                // verify call count
                verifyCallCount(1, evt1, evt2, this.decor, 'evt1, evt2, decor');

                // verify call order
                verifyCallOrder(evt1, this.decor, evt2, 'evt1, decor, evt2');

                // verify "this"
                verifyThis(this.$li0[0], evt1, evt2, 'evt1, evt2');

                // verify the event data
                QUnit.ok(data1.msg === 'undecorated event data', 'evt1 event data');
                QUnit.ok(data2.msg === 'decorated event data', 'evt2 event data');
            });

            QUnit.test('.bind(eventType, preventBubble)', function () {
                var evt = sinon.stub();

                $.jedi('click', this.decorator);

                this.$lis.bind('click', false); // should prevent the event from bubbling
                this.$ul.bind('click', evt);

                this.$li0.click();

                verifyCallCount(0, evt, 'evt should not be called');
            });

            QUnit.test('.bind(eventType, eventData, preventBubble)', function () {
                var evt = sinon.stub();

                $.jedi('click', this.decorator);

                this.$lis.bind('click', {msg: 'hello'}, false); // should prevent the event from bubbling
                this.$ul.bind('click', evt);

                this.$li0.click();

                verifyCallCount(0, evt, 'evt should not be called');
            });

            QUnit.test('.bind(events)', function () {
                var evt1 = sinon.stub();
                var evt2 = sinon.stub();
                var evt3 = sinon.stub();
                var decor = this.decor;

                $.jedi('click change', this.decorator);

                this.$lis.bind({
                    click: evt1,
                    change: evt2,
                    focus: evt3
                });

                this.$li0.click();
                this.$li0.change();
                this.$li0.focus();

                verifyCallCount(1, evt1, evt2, evt3, 'evt1, evt2, evt3');
                verifyCallCount(2, decor, 'decor');

                verifyCallOrder(decor, evt1, decor, evt2, evt3, 'decor, evt1, decor, evt2, evt3');
            });

            QUnit.test('.bind using multiple space delimited event types', function () {
                var evt1 = sinon.spy();

                $.jedi('click dblclick', this.decorator);

                this.$lis.bind('click dblclick focus', evt1);

                this.$li0.click();
                this.$li0.dblclick();
                this.$li0.focus();

                verifyCallCount(3, evt1, 'evt1');
                verifyCallCount(2, this.decor, 'decor');
            });

            QUnit.test('.<eventType>(handler(eventObject))', function () {
                var evt1 = sinon.stub();

                $.jedi('click', this.decorator);

                this.$lis.click(evt1);

                this.$li0.click();

                verifyCallCount(1, this.decor, evt1, 'decor, evt1');
                verifyCallOrder(this.decor, evt1, 'decor, evt1');
            });

            
            QUnit.test('.<eventType>(eventData, handler(eventObject))', function () {
                function copier(fn) {
                    return function () {
                        var args = $.extend(true, [], arguments);
                        return fn.apply(this, args);
                    };
                }

                function createSpy() {
                    return sinon.spy(copier(function () {}));
                }

                var evt1 = createSpy();
                var data = {msg: 'hello'};

                $.jedi('click', this.decorator);

                this.$lis.click(data, evt1);

                this.$li0.click();

                verifyCallCount(1, this.decor, evt1, 'decor, evt1');
                verifyCallOrder(this.decor, evt1, 'decor, evt1');

                QUnit.deepEqual(data, evt1.args[0][0].data);
            });

            /*QUnit.test('.bind using namespaces', function () {});

            QUnit.test('multiple events', function () {});

            QUnit.test('"this" preserved', function () {});

            QUnit.test('call order', function () {});

            QUnit.test('.one(events, handler(eventObject))', function () {});

            QUnit.test('.one(events, data, handler(eventObject))', function () {});*/

            if (jqVersion === '1.7') {
                /*
                QUnit.test('.one(events, selector, handler(eventObject))', function () {});

                QUnit.test('.one(events, data, handler(eventObject))', function () {});

                QUnit.test('.one(events, selector, data, handler(eventObject))', function () {});

                QUnit.test('.one(event-maps)', function () {});

                QUnit.test('.one(event-maps, selector)', function () {});

                QUnit.test('.one(event-maps, data)', function () {});

                QUnit.test('.one(event-maps, selector, data)', function () {});*/
            }
        };
        
        tests.delegateEvents = function () {
        };

        tests.liveEvents = function () {
        };

        tests.onEvents = function () {
        };

        $.each(jqVersions, function (jqVar, jqVersion) {
            var jq = window[jqVar];
            $.each(tests, function (name, test) {
                test(jq, jqVersion);
            });
        });
    });
})(jQuery);

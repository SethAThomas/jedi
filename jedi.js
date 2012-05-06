(function ($) {
    'use strict';

    var decorators = {};
    var originals = {};
    var namespaceRx = /\..*/;

    function getEventTypes(s) {
        // returns a list of event types from a space delimited string
        return $.trim(s).replace(/\s+/, ' ').split(' ');
    }

    function getBasicEventType(eventType) {
        // returns the basic event type; removes event namespaces
        return eventType.replace(namespaceRx, '');
    }

    /*function getEventTypes(events) {
        // returns a list of sub-lists
        // each sub-list consists of the event type and the event type
        // including namespace, if it exists
        //
        // ex:
        // [['click', 'click.foo', ['dblclick', 'dblclick']]
        //
        // events can be declared in several ways
        // 1) single event: 'click'
        // 2) multiple events: 'click change'
        // 3) namespaced events: 'click.foo change.bar'
        // 4) custom events: 'fireMissiles'

        // clean up the whitespace
        events = $.trim(events).replace(/\s+/, ' ');

        var arr = events.split(' '),
            out = [];

        for (var i = 0, len = arr.length; i < len; ++i) {
            out[i] = [arr[i].replace(namespaceRx, ''), arr[i]];
        }

        return out;
    }*/

    function decorate(eventType, fn) {
        // wrap the fn with all of the decorators for this type
        // FILO wrapping - oldest decorator is the outer most wrapper
        // { decorator: 0
        //     { decorator: 1
        //         ....
        //             { decorator: N - 1
        //                 actual_function();

        var decors = decorators[eventType] || [],
            len = decors.length,
            out = fn;

        for (var i = len; i > 0; --i) {
            out = decors[i - 1](out);
        }

        if (len) {
            out.__unjedi__ = function () {
                // allows access to the original function
                // necessary for unbinding based on a function reference
                return fn;
            };
        }

        return out;
    }

    // TODO: add a .__unjedi__ method to each wrapped handler, so that during
    // unbinding we can get to the original method; necessary when unbinding
    // based on a function reference

    var bindGuard = false;

    originals.bind = $.fn.bind;
    $.fn.bind = (function () {
        // jQuery 1.5 and 1.6 internally convert .bind(events) into a series of
        // .bind(eventType [, eventData], handler(eventObject)) calls
        // we need to avoid decorating things more than once
        var running = false;

        return function () {
            /*
            decorates $.fn.bind
            .bind(eventType [, eventData], handler(eventObject))
            .bind(eventType [, eventData], preventBubble)
            .bind(events)
            */
 
            // the jQuery collection that the .bind is being applied against
            var me = this;
            var args = arguments;
            var handler;

            if (running) {
                originals.bind.apply(this, args);
                return this;
            }

            running = true;

            if ($.type(args[0]) === 'object') {
                // .bind(events)
                $.each(args[0], function (eventType, handler) {
                    args[0][eventType] = decorate(getBasicEventType(eventType), handler);
                });
                originals.bind.apply(me, args);
            } else if ($.isFunction(args[1])) {
                // .bind(eventType, handler(eventObject))
                handler = args[1];
                $.each(getEventTypes(args[0]), function (_, eventType) {
                    args[0] = eventType;
                    args[1] = decorate(getBasicEventType(eventType), handler);
                    originals.bind.apply(me, args);
                });
            } else if ($.isFunction(args[2])) {
                // .bind(eventType, eventData, handler(eventObject))
                handler = args[2];
                $.each(getEventTypes(args[0]), function (_, eventType) {
                    args[0] = eventType;
                    args[2] = decorate(getBasicEventType(eventType), handler);
                    originals.bind.apply(me, args);
                });
            } else {
                // just use the original functionality
                // do not decorate .bind(eventType, [, eventData], preventBubble)
                originals.bind.apply(me, args);
            }

            running = false;

            // must return the jQuery set so chaining is not disrupted
            return me;
        };
    })();

    function unbind() {}

    //originals.unbind = $.fn.unbind;
    //$.fn.unbind = unbind;

    /*originals.delegate = $.fn.delegate;
    originals.undelegate = $.fn.undelegate;
    $.fn.delegate = function () {};
    $.fn.undelegate = function () {};

    if ($.fn.live) {
        originals.live = $.fn.live;
        originals.die = $.fn.die;
        $.fn.live = function () {};
        $.fn.die = function () {};
    }

    if ($.fn.on) {
        originals.on = $.fn.on;
        originals.off = $.fn.off;
        $.fn.on = function () {};
        $.fn.off = function () {};
    }*/

    /* example usage:
    $.jedi('click dblclick', function (fn) {
        return function () {
            try {
                return fn.apply(this, arguments);
            } catch (err) {
                console.log(err);
                throw err;
            }
        };
    });
    */

    $.extend({
        jedi: function (eventTypes, decorator) {
            eventTypes = $.trim(eventTypes).replace(/\s+/, ' ').split(' ');

            $.each(eventTypes, function (_, eventType) {
                if (!decorators[eventType]) {
                    decorators[eventType] = [];
                }
                decorators[eventType].push(decorator);
            });
        }
    });
})(jQuery);

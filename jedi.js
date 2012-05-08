(function ($) {
    'use strict';

    var NAME = 'js-jedi';
    var namespaceRx = /\..*/;
    var decorators = {};
    var originals = {
        bind: $.fn.bind,
        unbind: $.fn.unbind,
        delegate: $.fn.delegate,
        undelegate: $.fn.undelegate
    };
    if ($.fn.live) {
        originals.live = $.fn.live;
        originals.die = $.fn.die;
    }
    if ($.fn.on) {
        originals.on = $.fn.on;
        originals.off = $.fn.off;
    }

    function getEventTypes(s) {
        // returns a list of event types from a space delimited string
        return $.trim(s).replace(/\s+/, ' ').split(' ');
    }

    function getBasicEventType(eventType) {
        // returns the basic event type; removes event namespaces
        return eventType.replace(namespaceRx, '');
    }

    function expandEventType(s) {
        // splits an event type into it's components
        var pieces = s.split('.');
        return {
            type: pieces[0],
            namespaces: pieces.slice(1)
        };
    }

    function isEventTypeMatch(src, target) {
        // compare two expanded event type objects and return true if
        // src corresponds to target using the following rules:
        //
        // if no namespace, then type must match
        // if a namespace and no type, then a namespace must match
        // if a namespace and type, then type and namespace must match

        if ($.type(src) === 'string') {
            src = expandEventType(src);
        }

        if (src.type && src.type !== target.type) {
            return false;
        }

        if (src.namespaces.length === 0) {
            return true;
        }

        for (var i = 0, len = src.namespaces.length; i < len; ++i) {
            if ($.inArray(src.namespaces[i], target.namespaces) !== -1) {
                return true;
            }
        }
        return false;
    }
/*
    $('.foo').
        delegate('li', 'click', fn).
        delegate('span', 'click', fn2).
        delegate('div', 'click', fn3);

    .... time passes .....

    $('.foo').delegate('a', 'click', fn4);

    $('.foo').data('js-jedi-delegate', {
        'click': {
            type: 'click',
            namespaces: [],
            handlers: [
                {original: fn4, decorated: dfn4, selector: 'a'},
                {original: fn, decorated: dfn, selector: 'li'},
                {original: fn2, decorated: dfn2, selector: 'span'},
                {original: fn3, decorated: dfn3, selector: 'div'}
            ]
        }
    });
    
    $('.foo').undelegate('li', 'click', fn);
*/



    function setData($elems, type, selector, origFn, decorFn) {
        if (origFn === decorFn) {
            // nothing changed, so no need to worry about
            // storing a orig / decor lookup
            return;
        }

        var expanded = expandEventType(type);
        var key = NAME;

        $elems.each(function () {
            // {
            //     'click.a': {
            //         type: 'click',
            //         namespaces: ['a'],
            //         handlers: [
            //             {original: fn1, decorated: fn2, selector: 'div li'}, // .delegates use selectors
            //             {original: fn3, decorated: fn4},
            //             ...
            //         ]
            //     },
            //     'click': {
            //         ...
            //     },
            //     ...
            // }

            var $el = $(this);
            var boundData = $el.data(key) || {};
            var eventData = boundData[type] || {};
            var handlers = eventData.handlers || [];
            var o = {
                original: origFn,
                decorated: decorFn
            };

            if (selector) {
                o.selector = selector;
            }

            $.extend(eventData, expanded);

            handlers[handlers.length] = o;
            eventData.handlers = handlers;
            boundData[type] = eventData;
            $el.data(key, boundData);
        });
    }

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

        return out;
    }

    $.fn.bind = (function () {
        var running = false;

        function decorateHandler($elems, args, hi) {
            var handler = args[hi];
            var basicEventType;

            $.each(getEventTypes(args[0]), function (_, eventType) {
                basicEventType = getBasicEventType(eventType);
                args[0] = eventType;
                args[hi] = decorate(basicEventType, handler);

                setData($elems, eventType, null, handler, args[hi]);
                originals.bind.apply($elems, args);
            });
        }

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
                // jQuery 1.5 and 1.6 internally convert .bind(events) into a series of
                // .bind(eventType [, eventData], handler(eventObject)) calls
                // we want to avoid decorating things more than once
                originals.bind.apply(me, args);
                return me;
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
                decorateHandler(me, args, 1);
            } else if ($.isFunction(args[2])) {
                // .bind(eventType, eventData, handler(eventObject))
                decorateHandler(me, args, 2);
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

    // .unbind() can be supported by using .data() to store a lookup between
    // the original and final decorated handlers during .bind(); during
    // .unbind(), we can get the decorated handler by looking it up using the
    // original passed to .unbind()

    function unbind() {
        /*
        .unbind()
        .unbind(eventType)
        .unbind(eventType, handler)
        .unbind(eventType, false)
        .unbind(event)
        */

        // we only care about .unbind(eventType, handler)
        // all of the others can just use the original functionality
        if (!$.isFunction(arguments[1])) {
            return originals.unbind.apply(this, arguments);
        }

        var $elems = this;
        var eventType = arguments[0];
        var handler = arguments[1];
        var key = NAME;
        var expanded = expandEventType(eventType); // expanded event type
        
        // do any of the elements have a decorated handler for this event
        // type or namespace?
        $elems.each(function () {
            var $el = $(this);
            var boundData = $el.data(key) || {};

            if (boundData) {
                $.each(boundData, function (k, v) {
                    if (isEventTypeMatch(expanded, v)) {
                        $.each(v.handlers, function (_, o) {
                            // there could be multiple instances of the same
                            // original handler, but if there were different
                            // decorators then the eventual decorated handler
                            // would be different; must search over all
                            if (o.original === handler) {
                                originals.unbind.call($el, eventType, o.decorated);
                            }
                        });
                    }
                });
            }
        });

        return originals.unbind.apply($elems, arguments);
    }

    $.fn.unbind = unbind;

    $.fn.delegate = function () {
        // .delegate(selector, eventType, handler(eventObject))
        // .delegate(selector, eventType, eventData, handler(eventObject))
        // .delegate(selector, events)

        if ($.type(arguments[1]) === 'object') {
            // .delegate(selector, events)
        } else if ($.isFunction(arguments[2])) {
            // .delegate(selector, eventType, handler(eventObject))

        } else if ($.isFunction(arguments[3])) {
            // .delegate(selector, eventType, eventData, handler(eventObject))
        } else {
            // who knows what this is...just kick it to jQuery to deal with
            return originals.delegate.apply(this, arguments);
        }
    };

    $.fn.undelegate = function () {
        // .undelegate() // 1.4.2
        // .undelegate(selector, eventType) // 1.4.2
        // .undelegate(selector, eventType, handler(eventObject)) // 1.4.2
        // .undelegate(selector, events) // 1.4.3
        // .undelegate(namespace) // 1.6


    };

    /*if ($.fn.live) {
        $.fn.live = function () {};
        $.fn.die = function () {};
    }

    if ($.fn.on) {
        $.fn.on = function () {};
        $.fn.off = function () {};
    }*/

    $.extend({
        jedi: function (eventTypes, decorator) {
            eventTypes = $.trim(eventTypes).replace(/\s+/, ' ').split(' ');

            $.each(eventTypes, function (_, eventType) {
                if (!decorators[eventType]) {
                    decorators[eventType] = [];
                }
                decorators[eventType].push(decorator);
            });
        },
        unjedi: function () {
            // removes all decorators
            decorators = {};
        }
    });
})(jQuery);

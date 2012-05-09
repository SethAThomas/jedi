(function ($) {
    'use strict';

    var NAME = 'js-jedi';
    var decorators = {};

    function EventType(eventType, type, namespaces, selector) {
        this.eventType = eventType;
        this.type = type;
        this.namespaces = namespaces;
        this.selector = selector;
    }

    EventType.get = function (eventType, selector) {
        var pieces = eventType.split('.');

        return new EventType(eventType, pieces[0], pieces.slice(1), selector);
    };

    EventType.gets = function (s, selector) {
        // returns a list of EventType objects

        // clean up the whitespace
        s = $.trim(s).replace(/\s+/, ' ');

        return $.map(s.split(' '), function (v) {
            return EventType.get(v, selector);
        });
    };

    EventType.isHit = function (src, target) {
        // does src "hit" target
        //
        // "hit" determined by type, selector and namespace
        // comparisions

        if (src.type && src.type !== target.type) {
            // ex: 'change' !== 'click'
            return false;
        }

        if (src.selector && src.selector !== target.selector) {
            // ex: 'a, span' !== 'span'
            return false;
        }

        if (src.namespaces.length === 0) {
            return true;
        }

        // just need one namespace intersection
        for (var i = 0, len = src.namespaces.length; i < len; ++i) {
            if ($.inArray(src.namespaces[i], target.namespaces) !== -1) {
                return true;
            }
        }

        return false;
    };

    EventType.prototype.isHit = function (target) {
        return EventType.isHit(this, target);
    };

    function storeDecoratorLookup($elems, evtType, origFn, decorFn) {
        // create a lookup between the original function and the decorated
        // function; this is necessary to facilitate event handler removal
        // using a function reference; a decorated function won't match
        // the original function, so we need to enable a way to get the
        // decorated function from the original function

        if (origFn === decorFn) {
            // nothing changed, so no need to worry about
            // storing a orig / decor lookup
            return;
        }

        var key = NAME;

        $elems.each(function () {
            var o = {
                eventType: evtType.eventType,
                namespaces: evtType.namespaces,
                type: evtType.type,
                selector: evtType.selector,
                original: origFn,
                decorated: decorFn
            };
            var $el = $(this);
            var data = $el.data(key) || [];
            data[data.length] = o;
            $el.data(key, data);
        });
    }

    function removeHandler($el, evtType, handler, remover) {
        var data = $el.data(NAME);

        $.each(data, function (_, o) {
            if (evtType.isHit(o)) {
                if (handler === o.original) {
                    if (evtType.selector) {
                        remover.call($el, evtType.selector, evtType.eventType, o.decorated);
                    } else {
                        remover.call($el, evtType.eventType, o.decorated);
                    }
                }
            }
        });

        if (evtType.selector) {
            remover.call($el, evtType.selector, evtType.eventType, handler);
        } else {
            remover.call($el, evtType.eventType, handler);
        }
    }

    function decorate(type, fn) {
        // wrap the fn with all of the decorators for this type
        // FILO wrapping - oldest decorator is the outer most wrapper
        // { decorator: 0
        //     { decorator: 1
        //         ....
        //             { decorator: N - 1
        //                 actual_function();

        var decors = decorators[type] || [],
            len = decors.length,
            out = fn;

        for (var i = len; i > 0; --i) {
            out = decors[i - 1](out);
        }

        return out;
    }

    function decorateMappedHandlers($elems, selector, mapping, fn) {
        $.each(mapping, function (type, handler) {
            var evtType = EventType.get(type, selector);
            var decor = decorate(evtType.type, handler);

            storeDecoratorLookup($elems, evtType, handler, decor);
            mapping[type] = decor;
        });
        if (selector) {
            fn.call($elems, selector, mapping);
        } else {
            fn.call($elems, mapping);
        }
    }

    function decorateSingleHandler($elems, args, selector, typeIndex, handlerIndex, fn) {
        var handler = args[handlerIndex];
        var types = EventType.gets(args[typeIndex], selector);
        var decor;
        var type;

        for (var i = 0, len = types.length; i < len; ++i) {
            type = types[i];

            args[typeIndex] = type.eventType;
            decor = decorate(type.type, handler);
            args[handlerIndex] = decor;

            storeDecoratorLookup($elems, type, handler, decor);
            fn.apply($elems, args);
        }
    }

    $.fn.bind = (function () {
        var running = false;
        var bind = $.fn.bind;

        function binder() {
            // handle the actual binding
            var $elems = this;
            var args = arguments;

            if ($.type(args[0]) === 'object') {
                // .bind(events)

                decorateMappedHandlers($elems, null, args[0], bind);
            } else if ($.isFunction(args[1])) {
                // .bind(eventType, handler(eventObject))
                
                decorateSingleHandler($elems, args, null, 0, 1, bind);
            } else if ($.isFunction(args[2])) {
                // .bind(eventType, eventData, handler(eventObject))
                
                decorateSingleHandler($elems, args, null, 0, 2, bind);
            } else {
                // just use the original functionality
                // do not decorate .bind(eventType, [, eventData], preventBubble)
                
                bind.apply($elems, args);
            }
        };

        return function () {
            /*
            .bind(eventType [, eventData], handler(eventObject))
            .bind(eventType [, eventData], preventBubble)
            .bind(events)
            */
 
            // the jQuery collection that the .bind is being applied against
            var $elems = this;
            var args = arguments;
            var handler;

            if (running) {
                // jQuery 1.5 and 1.6 internally convert .bind(events) into a series of
                // .bind(eventType [, eventData], handler(eventObject)) calls
                // we want to avoid decorating things more than once
                
                bind.apply($elems, args);
                return $elems;
            }

            running = true;

            try {
                binder.apply($elems, args);
            } finally {
                running = false;
            }

            // must return the jQuery set so chaining is not disrupted
            return $elems;
        };
    })();

    $.fn.unbind = (function () {
        var unbind = $.fn.unbind;

        return function () {
            /*
            .unbind()
            .unbind(eventType)
            .unbind(eventType, handler)
            .unbind(eventType, false)
            .unbind(event)
            */

            var $elems = this;
            var args = arguments;

            // we only care about .unbind(eventType, handler)
            // all of the others can just use the original functionality
            if (!$.isFunction(args[1])) {
                return unbind.apply($elems, args);
            }

            var handler = args[1];
            var evtType = EventType.get(args[0]);
            
            // do any of the elements have a decorated handler for this event
            // type or namespace?
            $elems.each(function () {
                removeHandler($(this), evtType, handler, unbind);
            });

            return $elems;
        };
    })();

    $.fn.delegate = (function () {
        var delegate = $.fn.delegate;

        return function () {
            // .delegate(selector, eventType, handler(eventObject))
            // .delegate(selector, eventType, eventData, handler(eventObject))
            // .delegate(selector, events)

            var $elems = this;
            var args = arguments;

            if ($.type(args[1]) === 'object') {
                // .delegate(selector, events)
                
                decorateMappedHandlers($elems, args[0], args[1], delegate);
            } else if ($.isFunction(args[2])) {
                // .delegate(selector, eventType, handler(eventObject))
                
                decorateSingleHandler($elems, args, args[0], 1, 2, delegate);
            } else if ($.isFunction(args[3])) {
                // .delegate(selector, eventType, eventData, handler(eventObject))

                decorateSingleHandler($elems, args, args[0], 1, 3, delegate);
            } else {
                // who knows what this is...just kick it to jQuery to deal with
                delegate.apply(this, arguments);
            }

            return $elems;
        };
    })();

    $.fn.undelegate = (function () {
        var undelegate = $.fn.undelegate;

        return function () {
            // .undelegate() // 1.4.2
            // .undelegate(selector, eventType) // 1.4.2
            // .undelegate(selector, eventType, handler(eventObject)) // 1.4.2
            // .undelegate(selector, events) // 1.4.3
            // .undelegate(namespace) // 1.6

            /*
            jQuery requires the .undelegate() selector to be an exact match with the
            .delegate() selector, including when there are multiple selectors in a comma
            separated list (weird); this means that if you have:
            
            $foo.delegate  ('a, li', 'click', fn);
            $foo.undelegate('a',     'click', fn); // this won't work
            $foo.undelegate('li, a', 'click', fn); // this also won't work
            $foo.undelegate('a, li', 'click', fn); // have to use the exact same selector
            */

            var $elems = this;
            var args = arguments;

            // anything that isn't .undelegate(selector, eventType, handler(eventObject))
            if (!$.isFunction(args[2])) {
                return undelegate.apply($elems, args);
            }

            // .undelegate(selector, eventType, handler(eventObject))
            var data = $elems.data(NAME);
            var evtType = EventType.get(args[1], args[0]);
            
            removeHandler($elems, evtType, args[2], undelegate);

            return $elems;
        };
    })();

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

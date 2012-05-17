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
        // returns a single EventType instance
        
        eventType = $.trim(eventType);
        var pieces = eventType.split('.');

        return new EventType(eventType, pieces[0], pieces.slice(1), selector);
    };

    EventType.gets = function (s, selector) {
        // returns a list of EventType instances

        // clean up the whitespace
        s = $.trim(s).replace(/\s+/, ' ');

        return $.map(s.split(' '), function (v) {
            return EventType.get(v, selector);
        });
    };

    EventType.isHit = function (src, target) {
        // does src "hit" target?
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
            // no namespaces, so don't need to look for intersection
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
        var data = $el.data(NAME) || [];
        var o;

        // go backwards so that removing items does not affect the next
        // iteration
        for (var i = data.length - 1; i >= 0; --i) {
            o = data[i];
            if (evtType.isHit(o)) {
                if (!handler || handler === o.original) {
                    // remove the lookup from the element data
                    data.splice(i, 1);
                }
                if (handler && handler === o.original) {
                    // remove a jQuery handler by function reference
                    // used the lookup to get the decorated function
                    //if (evtType.selector) {
                    //    remover.call($el, evtType.selector, evtType.eventType, o.decorated);
                    //} else {
                    remover.call($el, evtType.eventType, o.decorated);
                    //}
                }
            }
        }
    }

    /*forEachHit($el, evtType, function (i, data) {
        if (!handler || handler === data[i].original) {
            data.splice(i, 1);
        }
        if (handler && handler === data[i].original) {
            unbind.call($el, evtType.eventType, o.decorated);
        }
    });

    forEachHit($el, evtType, function (i, data) {
        if (!handler || handler === data[i].original) {
            data.splice(i, 1);
        }
        if (handler && handler === data[i].original) {
            die.call($el, evtType.eventType, o.decorated);
        }
    });

    function forEachHit($el, evtType, fn) {
        var data = $el.data(NAME) || [];
        var o;

        // go backwards so that removing items does not affect the next
        // iteration
        for (var i = data.length - 1; i >= 0; --i) {
            o = data[i];
            if (evtType.isHit(o)) {
                fn(i, data);
            }
        }
    }*/

    function removeHandlers($elems, evtType, handler, remover) {
        $elems.each(function () {
            removeHandler($(this), evtType, handler, remover);
        });
    }

    function removeAllStored($elems) {
        $elems.each(function () {
            $(this).data(NAME).splice(0);
        });
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
        var bind = $.fn.bind;

        return function (eventType, eventData, handler) {
            //.bind(eventType [, eventData], handler(eventObject))
            //.bind(eventType [, eventData], preventBubble)
            //.bind(events)

            var $elems = this;

            if (typeof eventType === 'object') {
                // (events)
                $.each(eventType, function (type, fn) {
                    $elems.bind(type, fn);
                });

                return $elems;
            }

            if (typeof eventData === 'function') {
                // (eventType, handler)
                handler = eventData;
                eventData = undefined;
            }

            if (eventData === false) {
                // (eventType, preventBubble)
                handler = false;
                eventData = undefined;
            }

            // all of the arguments should be properly set now, even
            // if that means that they are set to undefined (ex: eventData)

            if (handler === false) {
                // (eventType, eventData, preventBubble)
                // just pass it along unchanged to jQuery
                return bind.call($elems, eventType, eventData, handler);
            }

            // (eventType, eventData, handler)
            // decorate the handler for each type of event
            
            $.each(EventType.gets(eventType, null), function (i, evtType) {
                var decor = decorate(evtType.type, handler);

                storeDecoratorLookup($elems, evtType, handler, decor);
                bind.call($elems, evtType.eventType, eventData, decor);
            });

            return $elems;
        };
    })();

    /*$.fn.bind = (function () {
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
        }

        return function () {
            //.bind(eventType [, eventData], handler(eventObject))
            //.bind(eventType [, eventData], preventBubble)
            //.bind(events)
 
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
                // TODO: convert to
                // binder($elems, args);
                binder.apply($elems, args);
            } finally {
                running = false;
            }

            // must return the jQuery set so chaining is not disrupted
            return $elems;
        };
    })();*/

    $.fn.unbind = (function () {
        var unbind = $.fn.unbind;

        function getSignatureType(args) {
            // returns an integer key indicating the signature type
            // keys:
            //   1: .unbind()
            //   2: .unbind(eventType)
            //   3: .unbind(eventType, handler)
            //   4: .unbind(eventType, false)
            //   5: .unbind(event)
            //   -1: unknown

            var len = args.length;

            if (len === 0) {
                return 1;
            }

            if ($.type(args[0]) === 'string') {
                if ($.isFunction(args[1])) {
                    return 3;
                }

                if (args[1] === false) {
                    return 4;
                }

                return 2;
            }

            if (args[0] instanceof $.Event) {
                return 5;
            }

            return -1;
        }

        return function () {
            var $elems = this;
            var args = arguments;
            var evtType;
            var handler;

            var signature = getSignatureType(args);

            switch (signature) {
            case 1:
                removeAllStored($elems);
                //$elems.each(function () {
                    // remove all lookup data; keep the same array (nice for testing, debugging)
                    //$(this).data(NAME).splice(0);
                //});
                break;
            case 3:
                handler = args[1];
            case 2:
                evtType = EventType.get(args[0]);
                break;
            case 5:
                evtType = EventType.get(args[0].type + (args[0].namespace ? '.' + args[0].namespace : ''));
                break;
            }

            if (evtType) {
                removeHandlers($elems, evtType, handler, unbind);
            }

            unbind.apply($elems, args);

            return $elems;
        };
    })();

    /*$.fn.delegate = (function () {
        var delegate = $.fn.delegate;

        return function () {
            // .delegate(selector, eventType, handler(eventObject))
            // .delegate(selector, eventType, eventData, handler(eventObject))
            // .delegate(selector, events)

            var $el = this;
            var args = arguments;

            if ($.type(args[1]) === 'object') {
                // .delegate(selector, events)
                
                decorateMappedHandlers($el, args[0], args[1], delegate);
            } else if ($.isFunction(args[2])) {
                // .delegate(selector, eventType, handler(eventObject))
                
                decorateSingleHandler($el, args, args[0], 1, 2, delegate);
            } else if ($.isFunction(args[3])) {
                // .delegate(selector, eventType, eventData, handler(eventObject))

                decorateSingleHandler($el, args, args[0], 1, 3, delegate);
            } else {
                // who knows what this is...just kick it to jQuery to deal with
                delegate.apply($el, arguments);
            }

            return $el;
        };
    })();*/

    /*$.fn.undelegate = (function () {
        var undelegate = $.fn.undelegate;

        return function () {
            // .undelegate() // 1.4.2
            // .undelegate(selector, eventType) // 1.4.2
            // .undelegate(selector, eventType, handler(eventObject)) // 1.4.2
            // .undelegate(selector, events) // 1.4.3
            // .undelegate(namespace) // 1.6

            //jQuery requires the .undelegate() selector to be an exact match with the
            //.delegate() selector, including when there are multiple selectors in a comma
            //separated list (weird); this means that if you have:
            
            //$foo.delegate  ('a, li', 'click', fn);
            //$foo.undelegate('a',     'click', fn); // this won't work
            //$foo.undelegate('li, a', 'click', fn); // this also won't work
            //$foo.undelegate('a, li', 'click', fn); // have to use the exact same selector

            var $el = this;
            var args = arguments;

            // anything that isn't .undelegate(selector, eventType, handler(eventObject))
            if (!$.isFunction(args[2])) {
                return undelegate.apply($el, args);
            }

            // .undelegate(selector, eventType, handler(eventObject))
            var data = $el.data(NAME);
            var evtType = EventType.get(args[1], args[0]);
            
            removeHandler($el, evtType, args[2], undelegate);

            return $el;
        };
    })();*/

    $.fn.live = (function () {
        var live = $.fn.live;
        var running = false;

        return function (events, data, handler, origSelector) {
            // .live(events, handler)
            // .live(events, data, handler)
            // .live(events-map)

            if (typeof events === 'object') {
                // (events-map)

                $.each(events, function (name, fn) {
                    $.fn.live(name, fn);
                });
            }

            if (running) {
                return this;
            }
            running = true;

            if (typeof data === 'function') {
                // (events, handler)
                handler = data;
                data = undefined;
            }

            var $el = this;
            var selector = origSelector || this.selector;
            var evtTypes = EventType.gets(events, selector);

            $.each(evtTypes, function (_, evtType) {
                var decor = decorate(evtType.type, handler);

                storeDecoratorLookup($el, evtType, handler, decor);
                live.call($el, evtType.eventType, data, decor);
            });

            running = false;

            return this;
        };
    })();

    $.fn.die = (function () {
        var die = $.fn.die;

        return function (eventType, handler) {
            // .die()
            // .die(eventType)
            // .die(eventType, handler)

            var $el = this;
            var args = arguments;

            if (args.length === 0) {
                removeAllStored($el);
                return $el;
            }

            removeHandlers($el, EventType.get(eventType), handler, die);

            return $el;
        };
    })();

    $.extend({
        jedi: function (eventTypes, decorator) {
            // TODO: add support for namespaces: $.jedi(event.namespace, fn) or $.jedi(.namespace, fn)
            // TODO: add support for wildcard: $.jedi(fn)

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
            // TODO: add support to remove by event type: $.unjedi(event)
            // TODO: add support to remove by namespace: $.unjedi(event.namespace) or $.unjedi(.namespace)
            // TODO: add support to remove by function: $.unjedi(event, fn) or $.unjedi(fn)
            decorators = {};
        }
    });
})(jQuery);

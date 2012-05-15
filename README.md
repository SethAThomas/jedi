$.jedi
======

$.jedi (jQuery Event Decorator Injection) provides the ability to decorate your jQuery event handlers w/o modifying
your existing handlers.

Purpose
-------

Have an application with lots of event handlers and you would like to add some new global functionality to
those handlers? Normally, you would need to chase down each handler and decorate it individual. You would also
need to remember to decorate any new handlers. Not a very appealing prospect.

$.jedi can handle the global decorating for you. Just register a decorator and whenever a new jQuery event handler
is bound, it will be wrapped by all applicable decorators.

Some decorator usage examples
-----------------------------

Exception handling - generally, the event handler is the top of the call stack, so it makes sense to catch exceptions
at this level and do something with them.

Performance measuring - same reason as exception handling; nice place to measure how long things take.

Usage frequency tracking - measure which parts of the application are being used the most.

Logging/debugging - it's easy to add a decorator, so why not throw one in when you are trying to track down what is
happening for a particular type of event.

How to use it
-------------

$.jedi('click', decoratorFn);

Example decorator:

<pre><code>
$.jedi('click dblclick', function (fn) {
    // this decorator catches all js exceptions and
    // prints them to the console
    // fn - the original event handler
    return function () {
        try {
            // you will probably want to execute the original event handler
            // and return the event handler's results
            return fn.apply(this, arguments);
        } catch (err) {
            console.log(err);
            throw err;
        }
    };
});
</pre></code>

<pre><code>
$.jedi('click', function (fn) {
    // measure how long it takes to handler this event
    // fn - the original event handler
    return function () {
        var start = $.now();
        var out = fn.apply(this, arguments);
        console.log('took ' + $.now() - start + ' ms');
        return out;
    };
});
</pre></code>
jedi
====

jQuery event decorator injection (jedi) allows decorators to be attached to any new jQuery events that are created

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

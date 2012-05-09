// measures how much time a handler takes
var measureHandlerTime = function (fn) {
    return function () {
        var start = $.now();
        var result = fn.apply(this, arguments);
        console.log('took ' + ($.now() - start) + ' ms');
        return result;
    };
};

$.jedi('click', measureHandlerTime);

// catches exceptions so that you can do something with them
// much nicer then getting them in .onerror()
var exceptionCatcher = function (fn) {
    return function () {
        try {
            return fn.apply(this, arguments);
        } catch (err) {
            console.error(err);
            throw err;
        }
    };
};

$.jedi('click', exceptionCatcher);

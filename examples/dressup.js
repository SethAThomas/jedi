// add class(es) whenever an event is handled
var dressup = function (fn) {
    return function () {
        $(this).addClass('beenClicked');
        return fn.apply(this, arguments);
    };
};

$.jedi('click', dressup);

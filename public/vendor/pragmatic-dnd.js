var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/bind-event-listener/dist/bind.js
var require_bind = __commonJS({
  "node_modules/bind-event-listener/dist/bind.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.bind = void 0;
    function bind3(target, _a) {
      var type = _a.type, listener = _a.listener, options = _a.options;
      target.addEventListener(type, listener, options);
      return function unbind() {
        target.removeEventListener(type, listener, options);
      };
    }
    exports.bind = bind3;
  }
});

// node_modules/bind-event-listener/dist/bind-all.js
var require_bind_all = __commonJS({
  "node_modules/bind-event-listener/dist/bind-all.js"(exports) {
    "use strict";
    var __assign = exports && exports.__assign || function() {
      __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
          s = arguments[i];
          for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
            t[p] = s[p];
        }
        return t;
      };
      return __assign.apply(this, arguments);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.bindAll = void 0;
    var bind_1 = require_bind();
    function toOptions(value) {
      if (typeof value === "undefined") {
        return void 0;
      }
      if (typeof value === "boolean") {
        return {
          capture: value
        };
      }
      return value;
    }
    function getBinding(original, sharedOptions) {
      if (sharedOptions == null) {
        return original;
      }
      var binding = __assign(__assign({}, original), { options: __assign(__assign({}, toOptions(sharedOptions)), toOptions(original.options)) });
      return binding;
    }
    function bindAll4(target, bindings, sharedOptions) {
      var unbinds = bindings.map(function(original) {
        var binding = getBinding(original, sharedOptions);
        return (0, bind_1.bind)(target, binding);
      });
      return function unbindAll() {
        unbinds.forEach(function(unbind) {
          return unbind();
        });
      };
    }
    exports.bindAll = bindAll4;
  }
});

// node_modules/bind-event-listener/dist/index.js
var require_dist = __commonJS({
  "node_modules/bind-event-listener/dist/index.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.bindAll = exports.bind = void 0;
    var bind_1 = require_bind();
    Object.defineProperty(exports, "bind", { enumerable: true, get: function() {
      return bind_1.bind;
    } });
    var bind_all_1 = require_bind_all();
    Object.defineProperty(exports, "bindAll", { enumerable: true, get: function() {
      return bind_all_1.bindAll;
    } });
  }
});

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/public-utils/combine.js
function combine() {
  for (var _len = arguments.length, fns = new Array(_len), _key = 0; _key < _len; _key++) {
    fns[_key] = arguments[_key];
  }
  return function cleanup() {
    fns.forEach(function(fn) {
      return fn();
    });
  };
}

// node_modules/@babel/runtime/helpers/esm/arrayWithHoles.js
function _arrayWithHoles(r) {
  if (Array.isArray(r)) return r;
}

// node_modules/@babel/runtime/helpers/esm/iterableToArrayLimit.js
function _iterableToArrayLimit(r, l) {
  var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"];
  if (null != t) {
    var e, n, i, u, a = [], f = true, o = false;
    try {
      if (i = (t = t.call(r)).next, 0 === l) {
        if (Object(t) !== t) return;
        f = false;
      } else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = true) ;
    } catch (r2) {
      o = true, n = r2;
    } finally {
      try {
        if (!f && null != t["return"] && (u = t["return"](), Object(u) !== u)) return;
      } finally {
        if (o) throw n;
      }
    }
    return a;
  }
}

// node_modules/@babel/runtime/helpers/esm/arrayLikeToArray.js
function _arrayLikeToArray(r, a) {
  (null == a || a > r.length) && (a = r.length);
  for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e];
  return n;
}

// node_modules/@babel/runtime/helpers/esm/unsupportedIterableToArray.js
function _unsupportedIterableToArray(r, a) {
  if (r) {
    if ("string" == typeof r) return _arrayLikeToArray(r, a);
    var t = {}.toString.call(r).slice(8, -1);
    return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0;
  }
}

// node_modules/@babel/runtime/helpers/esm/nonIterableRest.js
function _nonIterableRest() {
  throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}

// node_modules/@babel/runtime/helpers/esm/slicedToArray.js
function _slicedToArray(r, e) {
  return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest();
}

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/adapter/element-adapter.js
var import_bind_event_listener4 = __toESM(require_dist());

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/honey-pot-fix/honey-pot-data-attribute.js
var honeyPotDataAttribute = "data-pdnd-honey-pot";

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/honey-pot-fix/is-honey-pot-element.js
function isHoneyPotElement(target) {
  return target instanceof Element && target.hasAttribute(honeyPotDataAttribute);
}

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/honey-pot-fix/get-element-from-point-without-honey-pot.js
function getElementFromPointWithoutHoneypot(client) {
  var _document$elementsFro = document.elementsFromPoint(client.x, client.y), _document$elementsFro2 = _slicedToArray(_document$elementsFro, 2), top2 = _document$elementsFro2[0], second = _document$elementsFro2[1];
  if (!top2) {
    return null;
  }
  if (isHoneyPotElement(top2)) {
    return second !== null && second !== void 0 ? second : null;
  }
  return top2;
}

// node_modules/@babel/runtime/helpers/esm/typeof.js
function _typeof(o) {
  "@babel/helpers - typeof";
  return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o2) {
    return typeof o2;
  } : function(o2) {
    return o2 && "function" == typeof Symbol && o2.constructor === Symbol && o2 !== Symbol.prototype ? "symbol" : typeof o2;
  }, _typeof(o);
}

// node_modules/@babel/runtime/helpers/esm/toPrimitive.js
function toPrimitive(t, r) {
  if ("object" != _typeof(t) || !t) return t;
  var e = t[Symbol.toPrimitive];
  if (void 0 !== e) {
    var i = e.call(t, r || "default");
    if ("object" != _typeof(i)) return i;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return ("string" === r ? String : Number)(t);
}

// node_modules/@babel/runtime/helpers/esm/toPropertyKey.js
function toPropertyKey(t) {
  var i = toPrimitive(t, "string");
  return "symbol" == _typeof(i) ? i : i + "";
}

// node_modules/@babel/runtime/helpers/esm/defineProperty.js
function _defineProperty(e, r, t) {
  return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
    value: t,
    enumerable: true,
    configurable: true,
    writable: true
  }) : e[r] = t, e;
}

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/honey-pot-fix/make-honey-pot-fix.js
var import_bind_event_listener = __toESM(require_dist());

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/util/max-z-index.js
var maxZIndex = 2147483647;

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/honey-pot-fix/make-honey-pot-fix.js
function ownKeys(e, r) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r && (o = o.filter(function(r2) {
      return Object.getOwnPropertyDescriptor(e, r2).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread(e) {
  for (var r = 1; r < arguments.length; r++) {
    var t = null != arguments[r] ? arguments[r] : {};
    r % 2 ? ownKeys(Object(t), true).forEach(function(r2) {
      _defineProperty(e, r2, t[r2]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function(r2) {
      Object.defineProperty(e, r2, Object.getOwnPropertyDescriptor(t, r2));
    });
  }
  return e;
}
var honeyPotSize = 2;
var halfHoneyPotSize = honeyPotSize / 2;
function floorToClosestPixel(point) {
  return {
    x: Math.floor(point.x),
    y: Math.floor(point.y)
  };
}
function pullBackByHalfHoneyPotSize(point) {
  return {
    x: point.x - halfHoneyPotSize,
    y: point.y - halfHoneyPotSize
  };
}
function preventGoingBackwardsOffScreen(point) {
  return {
    x: Math.max(point.x, 0),
    y: Math.max(point.y, 0)
  };
}
function preventGoingForwardsOffScreen(point) {
  return {
    x: Math.min(point.x, window.innerWidth - honeyPotSize),
    y: Math.min(point.y, window.innerHeight - honeyPotSize)
  };
}
function getHoneyPotRectFor(_ref) {
  var client = _ref.client;
  var point = preventGoingForwardsOffScreen(preventGoingBackwardsOffScreen(pullBackByHalfHoneyPotSize(floorToClosestPixel(client))));
  return DOMRect.fromRect({
    x: point.x,
    y: point.y,
    width: honeyPotSize,
    height: honeyPotSize
  });
}
function getRectStyles(_ref2) {
  var clientRect = _ref2.clientRect;
  return {
    left: "".concat(clientRect.left, "px"),
    top: "".concat(clientRect.top, "px"),
    width: "".concat(clientRect.width, "px"),
    height: "".concat(clientRect.height, "px")
  };
}
function isWithin(_ref3) {
  var client = _ref3.client, clientRect = _ref3.clientRect;
  return (
    // is within horizontal bounds
    client.x >= clientRect.x && client.x <= clientRect.x + clientRect.width && // is within vertical bounds
    client.y >= clientRect.y && client.y <= clientRect.y + clientRect.height
  );
}
function mountHoneyPot(_ref4) {
  var initial = _ref4.initial;
  var element = document.createElement("div");
  element.setAttribute(honeyPotDataAttribute, "true");
  var clientRect = getHoneyPotRectFor({
    client: initial
  });
  Object.assign(element.style, _objectSpread(_objectSpread({
    // Setting a background color explicitly to avoid any inherited styles.
    // Looks like this could be `opacity: 0`, but worried that _might_
    // cause the element to be ignored on some platforms.
    // When debugging, set backgroundColor to something like "red".
    backgroundColor: "transparent",
    position: "fixed",
    // Being explicit to avoid inheriting styles
    padding: 0,
    margin: 0,
    boxSizing: "border-box"
  }, getRectStyles({
    clientRect
  })), {}, {
    // We want this element to absorb pointer events,
    // it's kind of the whole point 😉
    pointerEvents: "auto",
    // Want to make sure the honey pot is top of everything else.
    // Don't need to worry about native drag previews, as they will
    // have been rendered (and removed) before the honey pot is rendered
    zIndex: maxZIndex
  }));
  document.body.appendChild(element);
  var unbindPointerMove = (0, import_bind_event_listener.bind)(window, {
    type: "pointermove",
    listener: function listener(event) {
      var client = {
        x: event.clientX,
        y: event.clientY
      };
      clientRect = getHoneyPotRectFor({
        client
      });
      Object.assign(element.style, getRectStyles({
        clientRect
      }));
    },
    // using capture so we are less likely to be impacted by event stopping
    options: {
      capture: true
    }
  });
  return function finish(_ref5) {
    var current = _ref5.current;
    unbindPointerMove();
    if (isWithin({
      client: current,
      clientRect
    })) {
      element.remove();
      return;
    }
    function cleanup() {
      unbindPostDragEvents();
      element.remove();
    }
    var unbindPostDragEvents = (0, import_bind_event_listener.bindAll)(window, [
      {
        type: "pointerdown",
        listener: cleanup
      },
      {
        type: "pointermove",
        listener: cleanup
      },
      {
        type: "focusin",
        listener: cleanup
      },
      {
        type: "focusout",
        listener: cleanup
      },
      // a 'pointerdown' should happen before 'dragstart', but just being super safe
      {
        type: "dragstart",
        listener: cleanup
      },
      // if the user has dragged something out of the window
      // and then is dragging something back into the window
      // the first events we will see are "dragenter" (and then "dragover").
      // So if we see any of these we need to clear the post drag fix.
      {
        type: "dragenter",
        listener: cleanup
      },
      {
        type: "dragover",
        listener: cleanup
      }
      // Not adding a "wheel" event listener, as "wheel" by itself does not
      // resolve the bug.
    ], {
      // Using `capture` so less likely to be impacted by other code stopping events
      capture: true
    });
  };
}
function makeHoneyPotFix() {
  var latestPointerMove = null;
  function bindEvents() {
    latestPointerMove = null;
    return (0, import_bind_event_listener.bind)(window, {
      type: "pointermove",
      listener: function listener(event) {
        latestPointerMove = {
          x: event.clientX,
          y: event.clientY
        };
      },
      // listening for pointer move in capture phase
      // so we are less likely to be impacted by events being stopped.
      options: {
        capture: true
      }
    });
  }
  function getOnPostDispatch() {
    var finish = null;
    return function onPostEvent(_ref6) {
      var eventName = _ref6.eventName, payload = _ref6.payload;
      if (eventName === "onDragStart") {
        var input = payload.location.initial.input;
        var initial = latestPointerMove !== null && latestPointerMove !== void 0 ? latestPointerMove : {
          x: input.clientX,
          y: input.clientY
        };
        finish = mountHoneyPot({
          initial
        });
      }
      if (eventName === "onDrop") {
        var _finish;
        var _input = payload.location.current.input;
        (_finish = finish) === null || _finish === void 0 || _finish({
          current: {
            x: _input.clientX,
            y: _input.clientY
          }
        });
        finish = null;
        latestPointerMove = null;
      }
    };
  }
  return {
    bindEvents,
    getOnPostDispatch
  };
}

// node_modules/@babel/runtime/helpers/esm/arrayWithoutHoles.js
function _arrayWithoutHoles(r) {
  if (Array.isArray(r)) return _arrayLikeToArray(r);
}

// node_modules/@babel/runtime/helpers/esm/iterableToArray.js
function _iterableToArray(r) {
  if ("undefined" != typeof Symbol && null != r[Symbol.iterator] || null != r["@@iterator"]) return Array.from(r);
}

// node_modules/@babel/runtime/helpers/esm/nonIterableSpread.js
function _nonIterableSpread() {
  throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}

// node_modules/@babel/runtime/helpers/esm/toConsumableArray.js
function _toConsumableArray(r) {
  return _arrayWithoutHoles(r) || _iterableToArray(r) || _unsupportedIterableToArray(r) || _nonIterableSpread();
}

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/ledger/lifecycle-manager.js
var import_bind_event_listener3 = __toESM(require_dist());

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/public-utils/once.js
function once(fn) {
  var cache = null;
  return function wrapped() {
    if (!cache) {
      for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }
      var result = fn.apply(this, args);
      cache = {
        result
      };
    }
    return cache.result;
  };
}

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/util/is-firefox.js
var isFirefox = once(function isFirefox2() {
  if (false) {
    return false;
  }
  return navigator.userAgent.includes("Firefox");
});

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/util/is-safari.js
var isSafari = once(function isSafari2() {
  if (false) {
    return false;
  }
  var _navigator = navigator, userAgent = _navigator.userAgent;
  return userAgent.includes("AppleWebKit") && !userAgent.includes("Chrome");
});

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/util/changing-window/count-events-for-safari.js
var import_bind_event_listener2 = __toESM(require_dist());
var symbols = {
  isLeavingWindow: Symbol("leaving"),
  isEnteringWindow: Symbol("entering")
};
function isLeavingWindowInSafari(_ref2) {
  var dragLeave = _ref2.dragLeave;
  if (!isSafari()) {
    return false;
  }
  return dragLeave.hasOwnProperty(symbols.isLeavingWindow);
}
(function fixSafari() {
  if (typeof window === "undefined") {
    return;
  }
  if (false) {
    return;
  }
  if (!isSafari()) {
    return;
  }
  function getInitialState() {
    return {
      enterCount: 0,
      isOverWindow: false
    };
  }
  var state = getInitialState();
  function resetState() {
    state = getInitialState();
  }
  (0, import_bind_event_listener2.bindAll)(
    window,
    [{
      type: "dragstart",
      listener: function listener() {
        state.enterCount = 0;
        state.isOverWindow = true;
      }
    }, {
      type: "drop",
      listener: resetState
    }, {
      type: "dragend",
      listener: resetState
    }, {
      type: "dragenter",
      listener: function listener(event) {
        if (!state.isOverWindow && state.enterCount === 0) {
          event[symbols.isEnteringWindow] = true;
        }
        state.isOverWindow = true;
        state.enterCount++;
      }
    }, {
      type: "dragleave",
      listener: function listener(event) {
        state.enterCount--;
        if (state.isOverWindow && state.enterCount === 0) {
          event[symbols.isLeavingWindow] = true;
          state.isOverWindow = false;
        }
      }
    }],
    // using `capture: true` so that adding event listeners
    // in bubble phase will have the correct symbols
    {
      capture: true
    }
  );
})();

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/util/changing-window/is-from-another-window.js
function isNodeLike(target) {
  return "nodeName" in target;
}
function isFromAnotherWindow(eventTarget) {
  return isNodeLike(eventTarget) && eventTarget.ownerDocument !== document;
}

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/util/changing-window/is-leaving-window.js
function isLeavingWindow(_ref) {
  var dragLeave = _ref.dragLeave;
  var type = dragLeave.type, relatedTarget = dragLeave.relatedTarget;
  if (type !== "dragleave") {
    return false;
  }
  if (isSafari()) {
    return isLeavingWindowInSafari({
      dragLeave
    });
  }
  if (relatedTarget == null) {
    return true;
  }
  if (isFirefox()) {
    return isFromAnotherWindow(relatedTarget);
  }
  return relatedTarget instanceof HTMLIFrameElement;
}

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/util/detect-broken-drag.js
function getBindingsForBrokenDrags(_ref) {
  var onDragEnd = _ref.onDragEnd;
  return [
    // ## Detecting drag ending for removed draggables
    //
    // If a draggable element is removed during a drag and the user drops:
    // 1. if over a valid drop target: we get a "drop" event to know the drag is finished
    // 2. if not over a valid drop target (or cancelled): we get nothing
    // The "dragend" event will not fire on the source draggable if it has been
    // removed from the DOM.
    // So we need to figure out if a drag operation has finished by looking at other events
    // We can do this by looking at other events
    // ### First detection: "pointermove" events
    // 1. "pointermove" events cannot fire during a drag and drop operation
    // according to the spec. So if we get a "pointermove" it means that
    // the drag and drop operations has finished. So if we get a "pointermove"
    // we know that the drag is over
    // 2. 🦊😤 Drag and drop operations are _supposed_ to suppress
    // other pointer events. However, firefox will allow a few
    // pointer event to get through after a drag starts.
    // The most I've seen is 3
    {
      type: "pointermove",
      listener: /* @__PURE__ */ (function() {
        var callCount = 0;
        return function listener() {
          if (callCount < 20) {
            callCount++;
            return;
          }
          onDragEnd();
        };
      })()
    },
    // ### Second detection: "pointerdown" events
    // If we receive this event then we know that a drag operation has finished
    // and potentially another one is about to start.
    // Note: `pointerdown` fires on all browsers / platforms before "dragstart"
    {
      type: "pointerdown",
      listener: onDragEnd
    }
  ];
}

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/util/get-input.js
function getInput(event) {
  return {
    altKey: event.altKey,
    button: event.button,
    buttons: event.buttons,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    clientX: event.clientX,
    clientY: event.clientY,
    pageX: event.pageX,
    pageY: event.pageY
  };
}

// node_modules/raf-schd/dist/raf-schd.esm.js
var rafSchd = function rafSchd2(fn) {
  var lastArgs = [];
  var frameId = null;
  var wrapperFn = function wrapperFn2() {
    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }
    lastArgs = args;
    if (frameId) {
      return;
    }
    frameId = requestAnimationFrame(function() {
      frameId = null;
      fn.apply(void 0, lastArgs);
    });
  };
  wrapperFn.cancel = function() {
    if (!frameId) {
      return;
    }
    cancelAnimationFrame(frameId);
    frameId = null;
  };
  return wrapperFn;
};
var raf_schd_esm_default = rafSchd;

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/ledger/dispatch-consumer-event.js
var scheduleOnDrag = raf_schd_esm_default(function(fn) {
  return fn();
});
var dragStart = /* @__PURE__ */ (function() {
  var scheduled = null;
  function schedule(fn) {
    var frameId = requestAnimationFrame(function() {
      scheduled = null;
      fn();
    });
    scheduled = {
      frameId,
      fn
    };
  }
  function flush() {
    if (scheduled) {
      cancelAnimationFrame(scheduled.frameId);
      scheduled.fn();
      scheduled = null;
    }
  }
  return {
    schedule,
    flush
  };
})();
function makeDispatch(_ref) {
  var source = _ref.source, initial = _ref.initial, dispatchEvent = _ref.dispatchEvent;
  var previous = {
    dropTargets: []
  };
  function safeDispatch(args) {
    dispatchEvent(args);
    previous = {
      dropTargets: args.payload.location.current.dropTargets
    };
  }
  var dispatch = {
    start: function start2(_ref2) {
      var nativeSetDragImage = _ref2.nativeSetDragImage;
      var location = {
        current: initial,
        previous,
        initial
      };
      safeDispatch({
        eventName: "onGenerateDragPreview",
        payload: {
          source,
          location,
          nativeSetDragImage
        }
      });
      dragStart.schedule(function() {
        safeDispatch({
          eventName: "onDragStart",
          payload: {
            source,
            location
          }
        });
      });
    },
    dragUpdate: function dragUpdate(_ref3) {
      var current = _ref3.current;
      dragStart.flush();
      scheduleOnDrag.cancel();
      safeDispatch({
        eventName: "onDropTargetChange",
        payload: {
          source,
          location: {
            initial,
            previous,
            current
          }
        }
      });
    },
    drag: function drag(_ref4) {
      var current = _ref4.current;
      scheduleOnDrag(function() {
        dragStart.flush();
        var location = {
          initial,
          previous,
          current
        };
        safeDispatch({
          eventName: "onDrag",
          payload: {
            source,
            location
          }
        });
      });
    },
    drop: function drop(_ref5) {
      var current = _ref5.current, updatedSourcePayload = _ref5.updatedSourcePayload;
      dragStart.flush();
      scheduleOnDrag.cancel();
      safeDispatch({
        eventName: "onDrop",
        payload: {
          source: updatedSourcePayload !== null && updatedSourcePayload !== void 0 ? updatedSourcePayload : source,
          location: {
            current,
            previous,
            initial
          }
        }
      });
    }
  };
  return dispatch;
}

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/ledger/lifecycle-manager.js
var globalState = {
  isActive: false
};
function canStart() {
  return !globalState.isActive;
}
function getNativeSetDragImage(event) {
  if (event.dataTransfer) {
    return event.dataTransfer.setDragImage.bind(event.dataTransfer);
  }
  return null;
}
function hasHierarchyChanged(_ref) {
  var current = _ref.current, next = _ref.next;
  if (current.length !== next.length) {
    return true;
  }
  for (var i = 0; i < current.length; i++) {
    if (current[i].element !== next[i].element) {
      return true;
    }
  }
  return false;
}
function start(_ref2) {
  var event = _ref2.event, dragType = _ref2.dragType, getDropTargetsOver = _ref2.getDropTargetsOver, dispatchEvent = _ref2.dispatchEvent;
  if (!canStart()) {
    return;
  }
  var initial = getStartLocation({
    event,
    dragType,
    getDropTargetsOver
  });
  globalState.isActive = true;
  var state = {
    current: initial
  };
  setDropEffectOnEvent({
    event,
    current: initial.dropTargets
  });
  var dispatch = makeDispatch({
    source: dragType.payload,
    dispatchEvent,
    initial
  });
  function updateState(next) {
    var hasChanged = hasHierarchyChanged({
      current: state.current.dropTargets,
      next: next.dropTargets
    });
    state.current = next;
    if (hasChanged) {
      dispatch.dragUpdate({
        current: state.current
      });
    }
  }
  function onUpdateEvent(event2) {
    var input = getInput(event2);
    var target = isHoneyPotElement(event2.target) ? getElementFromPointWithoutHoneypot({
      x: input.clientX,
      y: input.clientY
    }) : event2.target;
    var nextDropTargets = getDropTargetsOver({
      target,
      input,
      source: dragType.payload,
      current: state.current.dropTargets
    });
    if (nextDropTargets.length) {
      event2.preventDefault();
      setDropEffectOnEvent({
        event: event2,
        current: nextDropTargets
      });
    }
    updateState({
      dropTargets: nextDropTargets,
      input
    });
  }
  function cancel() {
    if (state.current.dropTargets.length) {
      updateState({
        dropTargets: [],
        input: state.current.input
      });
    }
    dispatch.drop({
      current: state.current,
      updatedSourcePayload: null
    });
    finish();
  }
  function finish() {
    globalState.isActive = false;
    unbindEvents();
  }
  var unbindEvents = (0, import_bind_event_listener3.bindAll)(
    window,
    [{
      // 👋 Note: we are repurposing the `dragover` event as our `drag` event
      // this is because firefox does not publish pointer coordinates during
      // a `drag` event, but does for every other type of drag event
      // `dragover` fires on all elements that are being dragged over
      // Because we are binding to `window` - our `dragover` is effectively the same as a `drag`
      // 🦊😤
      type: "dragover",
      listener: function listener(event2) {
        onUpdateEvent(event2);
        dispatch.drag({
          current: state.current
        });
      }
    }, {
      type: "dragenter",
      listener: onUpdateEvent
    }, {
      type: "dragleave",
      listener: function listener(event2) {
        if (!isLeavingWindow({
          dragLeave: event2
        })) {
          return;
        }
        updateState({
          input: state.current.input,
          dropTargets: []
        });
        if (dragType.startedFrom === "external") {
          cancel();
        }
      }
    }, {
      // A "drop" can only happen if the browser allowed the drop
      type: "drop",
      listener: function listener(event2) {
        state.current = {
          dropTargets: state.current.dropTargets,
          input: getInput(event2)
        };
        if (!state.current.dropTargets.length) {
          cancel();
          return;
        }
        event2.preventDefault();
        setDropEffectOnEvent({
          event: event2,
          current: state.current.dropTargets
        });
        dispatch.drop({
          current: state.current,
          // When dropping something native, we need to extract the latest
          // `.items` from the "drop" event as it is now accessible
          updatedSourcePayload: dragType.type === "external" ? dragType.getDropPayload(event2) : null
        });
        finish();
      }
    }, {
      // "dragend" fires when on the drag source (eg a draggable element)
      // when the drag is finished.
      // "dragend" will fire after "drop" (if there was a successful drop)
      // "dragend" does not fire if the draggable source has been removed during the drag
      // or for external drag sources (eg files)
      // This "dragend" listener will not fire if there was a successful drop
      // as we will have already removed the event listener
      type: "dragend",
      listener: function listener(event2) {
        state.current = {
          dropTargets: state.current.dropTargets,
          input: getInput(event2)
        };
        cancel();
      }
    }].concat(_toConsumableArray(getBindingsForBrokenDrags({
      onDragEnd: cancel
    }))),
    // Once we have started a managed drag operation it is important that we see / own all drag events
    // We got one adoption bug pop up where some code was stopping (`event.stopPropagation()`)
    // all "drop" events in the bubble phase on the `document.body`.
    // This meant that we never saw the "drop" event.
    {
      capture: true
    }
  );
  dispatch.start({
    nativeSetDragImage: getNativeSetDragImage(event)
  });
}
function setDropEffectOnEvent(_ref3) {
  var _current$;
  var event = _ref3.event, current = _ref3.current;
  var innerMost = (_current$ = current[0]) === null || _current$ === void 0 ? void 0 : _current$.dropEffect;
  if (innerMost != null && event.dataTransfer) {
    event.dataTransfer.dropEffect = innerMost;
  }
}
function getStartLocation(_ref4) {
  var event = _ref4.event, dragType = _ref4.dragType, getDropTargetsOver = _ref4.getDropTargetsOver;
  var input = getInput(event);
  if (dragType.startedFrom === "external") {
    return {
      input,
      dropTargets: []
    };
  }
  var dropTargets = getDropTargetsOver({
    input,
    source: dragType.payload,
    target: event.target,
    current: []
  });
  return {
    input,
    dropTargets
  };
}
var lifecycle = {
  canStart,
  start
};

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/ledger/usage-ledger.js
var ledger = /* @__PURE__ */ new Map();
function registerUsage(_ref) {
  var typeKey = _ref.typeKey, mount2 = _ref.mount;
  var entry = ledger.get(typeKey);
  if (entry) {
    entry.usageCount++;
    return entry;
  }
  var initial = {
    typeKey,
    unmount: mount2(),
    usageCount: 1
  };
  ledger.set(typeKey, initial);
  return initial;
}
function register(args) {
  var entry = registerUsage(args);
  return function unregister() {
    entry.usageCount--;
    if (entry.usageCount > 0) {
      return;
    }
    entry.unmount();
    ledger.delete(args.typeKey);
  };
}

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/util/add-attribute.js
function addAttribute(element, _ref) {
  var attribute = _ref.attribute, value = _ref.value;
  element.setAttribute(attribute, value);
  return function() {
    return element.removeAttribute(attribute);
  };
}

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/make-adapter/make-drop-target.js
function ownKeys2(e, r) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r && (o = o.filter(function(r2) {
      return Object.getOwnPropertyDescriptor(e, r2).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread2(e) {
  for (var r = 1; r < arguments.length; r++) {
    var t = null != arguments[r] ? arguments[r] : {};
    r % 2 ? ownKeys2(Object(t), true).forEach(function(r2) {
      _defineProperty(e, r2, t[r2]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys2(Object(t)).forEach(function(r2) {
      Object.defineProperty(e, r2, Object.getOwnPropertyDescriptor(t, r2));
    });
  }
  return e;
}
function _createForOfIteratorHelper(r, e) {
  var t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"];
  if (!t) {
    if (Array.isArray(r) || (t = _unsupportedIterableToArray2(r)) || e && r && "number" == typeof r.length) {
      t && (r = t);
      var _n = 0, F = function F2() {
      };
      return { s: F, n: function n() {
        return _n >= r.length ? { done: true } : { done: false, value: r[_n++] };
      }, e: function e2(r2) {
        throw r2;
      }, f: F };
    }
    throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
  }
  var o, a = true, u = false;
  return { s: function s() {
    t = t.call(r);
  }, n: function n() {
    var r2 = t.next();
    return a = r2.done, r2;
  }, e: function e2(r2) {
    u = true, o = r2;
  }, f: function f() {
    try {
      a || null == t.return || t.return();
    } finally {
      if (u) throw o;
    }
  } };
}
function _unsupportedIterableToArray2(r, a) {
  if (r) {
    if ("string" == typeof r) return _arrayLikeToArray2(r, a);
    var t = {}.toString.call(r).slice(8, -1);
    return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray2(r, a) : void 0;
  }
}
function _arrayLikeToArray2(r, a) {
  (null == a || a > r.length) && (a = r.length);
  for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e];
  return n;
}
function copyReverse(array) {
  return array.slice(0).reverse();
}
function makeDropTarget(_ref) {
  var typeKey = _ref.typeKey, defaultDropEffect = _ref.defaultDropEffect;
  var registry = /* @__PURE__ */ new WeakMap();
  var dropTargetDataAtt = "data-drop-target-for-".concat(typeKey);
  var dropTargetSelector = "[".concat(dropTargetDataAtt, "]");
  function addToRegistry2(args) {
    registry.set(args.element, args);
    return function() {
      return registry.delete(args.element);
    };
  }
  function dropTargetForConsumers(args) {
    if (true) {
      var existing = registry.get(args.element);
      if (existing) {
        console.warn("You have already registered a [".concat(typeKey, "] dropTarget on the same element"), {
          existing,
          proposed: args
        });
      }
      if (args.element instanceof HTMLIFrameElement) {
        console.warn("\n            We recommend not registering <iframe> elements as drop targets\n            as it can result in some strange browser event ordering.\n          ".replace(/\s{2,}/g, " ").trim());
      }
    }
    var cleanup = combine(addAttribute(args.element, {
      attribute: dropTargetDataAtt,
      value: "true"
    }), addToRegistry2(args));
    return once(cleanup);
  }
  function getActualDropTargets(_ref2) {
    var _args$getData, _args$getData2, _args$getDropEffect, _args$getDropEffect2;
    var source = _ref2.source, target = _ref2.target, input = _ref2.input, _ref2$result = _ref2.result, result = _ref2$result === void 0 ? [] : _ref2$result;
    if (target == null) {
      return result;
    }
    if (!(target instanceof Element)) {
      if (target instanceof Node) {
        return getActualDropTargets({
          source,
          target: target.parentElement,
          input,
          result
        });
      }
      return result;
    }
    var closest = target.closest(dropTargetSelector);
    if (closest == null) {
      return result;
    }
    var args = registry.get(closest);
    if (args == null) {
      return result;
    }
    var feedback = {
      input,
      source,
      element: args.element
    };
    if (args.canDrop && !args.canDrop(feedback)) {
      return getActualDropTargets({
        source,
        target: args.element.parentElement,
        input,
        result
      });
    }
    var data = (_args$getData = (_args$getData2 = args.getData) === null || _args$getData2 === void 0 ? void 0 : _args$getData2.call(args, feedback)) !== null && _args$getData !== void 0 ? _args$getData : {};
    var dropEffect = (_args$getDropEffect = (_args$getDropEffect2 = args.getDropEffect) === null || _args$getDropEffect2 === void 0 ? void 0 : _args$getDropEffect2.call(args, feedback)) !== null && _args$getDropEffect !== void 0 ? _args$getDropEffect : defaultDropEffect;
    var record = {
      data,
      element: args.element,
      dropEffect,
      // we are collecting _actual_ drop targets, so these are
      // being applied _not_ due to stickiness
      isActiveDueToStickiness: false
    };
    return getActualDropTargets({
      source,
      target: args.element.parentElement,
      input,
      // Using bubble ordering. Same ordering as `event.getPath()`
      result: [].concat(_toConsumableArray(result), [record])
    });
  }
  function notifyCurrent(_ref3) {
    var eventName = _ref3.eventName, payload = _ref3.payload;
    var _iterator = _createForOfIteratorHelper(payload.location.current.dropTargets), _step;
    try {
      for (_iterator.s(); !(_step = _iterator.n()).done; ) {
        var _entry$eventName;
        var record = _step.value;
        var entry = registry.get(record.element);
        var args = _objectSpread2(_objectSpread2({}, payload), {}, {
          self: record
        });
        entry === null || entry === void 0 || (_entry$eventName = entry[eventName]) === null || _entry$eventName === void 0 || _entry$eventName.call(
          entry,
          // I cannot seem to get the types right here.
          // TS doesn't seem to like that one event can need `nativeSetDragImage`
          // @ts-expect-error
          args
        );
      }
    } catch (err) {
      _iterator.e(err);
    } finally {
      _iterator.f();
    }
  }
  var actions = {
    onGenerateDragPreview: notifyCurrent,
    onDrag: notifyCurrent,
    onDragStart: notifyCurrent,
    onDrop: notifyCurrent,
    onDropTargetChange: function onDropTargetChange(_ref4) {
      var payload = _ref4.payload;
      var isCurrent = new Set(payload.location.current.dropTargets.map(function(record2) {
        return record2.element;
      }));
      var visited = /* @__PURE__ */ new Set();
      var _iterator2 = _createForOfIteratorHelper(payload.location.previous.dropTargets), _step2;
      try {
        for (_iterator2.s(); !(_step2 = _iterator2.n()).done; ) {
          var _entry$onDropTargetCh;
          var record = _step2.value;
          visited.add(record.element);
          var entry = registry.get(record.element);
          var isOver = isCurrent.has(record.element);
          var args = _objectSpread2(_objectSpread2({}, payload), {}, {
            self: record
          });
          entry === null || entry === void 0 || (_entry$onDropTargetCh = entry.onDropTargetChange) === null || _entry$onDropTargetCh === void 0 || _entry$onDropTargetCh.call(entry, args);
          if (!isOver) {
            var _entry$onDragLeave;
            entry === null || entry === void 0 || (_entry$onDragLeave = entry.onDragLeave) === null || _entry$onDragLeave === void 0 || _entry$onDragLeave.call(entry, args);
          }
        }
      } catch (err) {
        _iterator2.e(err);
      } finally {
        _iterator2.f();
      }
      var _iterator3 = _createForOfIteratorHelper(payload.location.current.dropTargets), _step3;
      try {
        for (_iterator3.s(); !(_step3 = _iterator3.n()).done; ) {
          var _entry$onDropTargetCh2, _entry$onDragEnter;
          var _record = _step3.value;
          if (visited.has(_record.element)) {
            continue;
          }
          var _args = _objectSpread2(_objectSpread2({}, payload), {}, {
            self: _record
          });
          var _entry = registry.get(_record.element);
          _entry === null || _entry === void 0 || (_entry$onDropTargetCh2 = _entry.onDropTargetChange) === null || _entry$onDropTargetCh2 === void 0 || _entry$onDropTargetCh2.call(_entry, _args);
          _entry === null || _entry === void 0 || (_entry$onDragEnter = _entry.onDragEnter) === null || _entry$onDragEnter === void 0 || _entry$onDragEnter.call(_entry, _args);
        }
      } catch (err) {
        _iterator3.e(err);
      } finally {
        _iterator3.f();
      }
    }
  };
  function dispatchEvent(args) {
    actions[args.eventName](args);
  }
  function getIsOver(_ref5) {
    var source = _ref5.source, target = _ref5.target, input = _ref5.input, current = _ref5.current;
    var actual = getActualDropTargets({
      source,
      target,
      input
    });
    if (actual.length >= current.length) {
      return actual;
    }
    var lastCaptureOrdered = copyReverse(current);
    var actualCaptureOrdered = copyReverse(actual);
    var resultCaptureOrdered = [];
    for (var index = 0; index < lastCaptureOrdered.length; index++) {
      var _argsForLast$getIsSti;
      var last = lastCaptureOrdered[index];
      var fresh = actualCaptureOrdered[index];
      if (fresh != null) {
        resultCaptureOrdered.push(fresh);
        continue;
      }
      var parent = resultCaptureOrdered[index - 1];
      var lastParent = lastCaptureOrdered[index - 1];
      if ((parent === null || parent === void 0 ? void 0 : parent.element) !== (lastParent === null || lastParent === void 0 ? void 0 : lastParent.element)) {
        break;
      }
      var argsForLast = registry.get(last.element);
      if (!argsForLast) {
        break;
      }
      var feedback = {
        input,
        source,
        element: argsForLast.element
      };
      if (argsForLast.canDrop && !argsForLast.canDrop(feedback)) {
        break;
      }
      if (!((_argsForLast$getIsSti = argsForLast.getIsSticky) !== null && _argsForLast$getIsSti !== void 0 && _argsForLast$getIsSti.call(argsForLast, feedback))) {
        break;
      }
      resultCaptureOrdered.push(_objectSpread2(_objectSpread2({}, last), {}, {
        // making it clear to consumers this drop target is active due to stickiness
        isActiveDueToStickiness: true
      }));
    }
    return copyReverse(resultCaptureOrdered);
  }
  return {
    dropTargetForConsumers,
    getIsOver,
    dispatchEvent
  };
}

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/make-adapter/make-monitor.js
function _createForOfIteratorHelper2(r, e) {
  var t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"];
  if (!t) {
    if (Array.isArray(r) || (t = _unsupportedIterableToArray3(r)) || e && r && "number" == typeof r.length) {
      t && (r = t);
      var _n = 0, F = function F2() {
      };
      return { s: F, n: function n() {
        return _n >= r.length ? { done: true } : { done: false, value: r[_n++] };
      }, e: function e2(r2) {
        throw r2;
      }, f: F };
    }
    throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
  }
  var o, a = true, u = false;
  return { s: function s() {
    t = t.call(r);
  }, n: function n() {
    var r2 = t.next();
    return a = r2.done, r2;
  }, e: function e2(r2) {
    u = true, o = r2;
  }, f: function f() {
    try {
      a || null == t.return || t.return();
    } finally {
      if (u) throw o;
    }
  } };
}
function _unsupportedIterableToArray3(r, a) {
  if (r) {
    if ("string" == typeof r) return _arrayLikeToArray3(r, a);
    var t = {}.toString.call(r).slice(8, -1);
    return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray3(r, a) : void 0;
  }
}
function _arrayLikeToArray3(r, a) {
  (null == a || a > r.length) && (a = r.length);
  for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e];
  return n;
}
function ownKeys3(e, r) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r && (o = o.filter(function(r2) {
      return Object.getOwnPropertyDescriptor(e, r2).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread3(e) {
  for (var r = 1; r < arguments.length; r++) {
    var t = null != arguments[r] ? arguments[r] : {};
    r % 2 ? ownKeys3(Object(t), true).forEach(function(r2) {
      _defineProperty(e, r2, t[r2]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys3(Object(t)).forEach(function(r2) {
      Object.defineProperty(e, r2, Object.getOwnPropertyDescriptor(t, r2));
    });
  }
  return e;
}
function makeMonitor() {
  var registry = /* @__PURE__ */ new Set();
  var dragging = null;
  function tryAddToActive(monitor) {
    if (!dragging) {
      return;
    }
    if (!monitor.canMonitor || monitor.canMonitor(dragging.canMonitorArgs)) {
      dragging.active.add(monitor);
    }
  }
  function monitorForConsumers(args) {
    var entry = _objectSpread3({}, args);
    registry.add(entry);
    tryAddToActive(entry);
    function cleanup() {
      registry.delete(entry);
      if (dragging) {
        dragging.active.delete(entry);
      }
    }
    return once(cleanup);
  }
  function dispatchEvent(_ref) {
    var eventName = _ref.eventName, payload = _ref.payload;
    if (eventName === "onGenerateDragPreview") {
      dragging = {
        canMonitorArgs: {
          initial: payload.location.initial,
          source: payload.source
        },
        active: /* @__PURE__ */ new Set()
      };
      var _iterator = _createForOfIteratorHelper2(registry), _step;
      try {
        for (_iterator.s(); !(_step = _iterator.n()).done; ) {
          var monitor = _step.value;
          tryAddToActive(monitor);
        }
      } catch (err) {
        _iterator.e(err);
      } finally {
        _iterator.f();
      }
    }
    if (!dragging) {
      return;
    }
    var active = Array.from(dragging.active);
    for (var _i = 0, _active = active; _i < _active.length; _i++) {
      var _monitor = _active[_i];
      if (dragging.active.has(_monitor)) {
        var _monitor$eventName;
        (_monitor$eventName = _monitor[eventName]) === null || _monitor$eventName === void 0 || _monitor$eventName.call(_monitor, payload);
      }
    }
    if (eventName === "onDrop") {
      dragging.active.clear();
      dragging = null;
    }
  }
  return {
    dispatchEvent,
    monitorForConsumers
  };
}

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/make-adapter/make-adapter.js
function makeAdapter(_ref) {
  var typeKey = _ref.typeKey, mount2 = _ref.mount, dispatchEventToSource2 = _ref.dispatchEventToSource, onPostDispatch = _ref.onPostDispatch, defaultDropEffect = _ref.defaultDropEffect;
  var monitorAPI = makeMonitor();
  var dropTargetAPI = makeDropTarget({
    typeKey,
    defaultDropEffect
  });
  function dispatchEvent(args) {
    dispatchEventToSource2 === null || dispatchEventToSource2 === void 0 || dispatchEventToSource2(args);
    dropTargetAPI.dispatchEvent(args);
    monitorAPI.dispatchEvent(args);
    onPostDispatch === null || onPostDispatch === void 0 || onPostDispatch(args);
  }
  function start2(_ref2) {
    var event = _ref2.event, dragType = _ref2.dragType;
    lifecycle.start({
      event,
      dragType,
      getDropTargetsOver: dropTargetAPI.getIsOver,
      dispatchEvent
    });
  }
  function registerUsage2() {
    function mountAdapter() {
      var api = {
        canStart: lifecycle.canStart,
        start: start2
      };
      return mount2(api);
    }
    return register({
      typeKey,
      mount: mountAdapter
    });
  }
  return {
    registerUsage: registerUsage2,
    dropTarget: dropTargetAPI.dropTargetForConsumers,
    monitor: monitorAPI.monitorForConsumers
  };
}

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/util/android.js
var isAndroid = once(function isAndroid2() {
  return navigator.userAgent.toLocaleLowerCase().includes("android");
});
var androidFallbackText = "pdnd:android-fallback";

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/util/media-types/text-media-type.js
var textMediaType = "text/plain";

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/util/media-types/url-media-type.js
var URLMediaType = "text/uri-list";

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/adapter/element-adapter-native-data-key.js
var elementAdapterNativeDataKey = "application/vnd.pdnd";

// node_modules/@atlaskit/pragmatic-drag-and-drop/dist/esm/adapter/element-adapter.js
var draggableRegistry = /* @__PURE__ */ new WeakMap();
function addToRegistry(args) {
  draggableRegistry.set(args.element, args);
  return function cleanup() {
    draggableRegistry.delete(args.element);
  };
}
var honeyPotFix = makeHoneyPotFix();
var adapter = makeAdapter({
  typeKey: "element",
  defaultDropEffect: "move",
  mount: function mount(api) {
    return combine(honeyPotFix.bindEvents(), (0, import_bind_event_listener4.bind)(document, {
      type: "dragstart",
      listener: function listener(event) {
        var _entry$dragHandle, _entry$getInitialData, _entry$getInitialData2, _entry$dragHandle2, _entry$getInitialData3, _entry$getInitialData4;
        if (!api.canStart(event)) {
          return;
        }
        if (event.defaultPrevented) {
          return;
        }
        if (!event.dataTransfer) {
          if (true) {
            console.warn("\n              It appears as though you have are not testing DragEvents correctly.\n\n              - If you are unit testing, ensure you have polyfilled DragEvent.\n              - If you are browser testing, ensure you are dispatching drag events correctly.\n\n              Please see our testing guides for more information:\n              https://atlassian.design/components/pragmatic-drag-and-drop/core-package/testing\n            ".replace(/ {2}/g, ""));
          }
          return;
        }
        var target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        var entry = draggableRegistry.get(target);
        if (!entry) {
          return;
        }
        var input = getInput(event);
        var feedback = {
          element: entry.element,
          dragHandle: (_entry$dragHandle = entry.dragHandle) !== null && _entry$dragHandle !== void 0 ? _entry$dragHandle : null,
          input
        };
        if (entry.canDrag && !entry.canDrag(feedback)) {
          event.preventDefault();
          return;
        }
        if (entry.dragHandle) {
          var over = getElementFromPointWithoutHoneypot({
            x: input.clientX,
            y: input.clientY
          });
          if (!entry.dragHandle.contains(over)) {
            event.preventDefault();
            return;
          }
        }
        var nativeData = (_entry$getInitialData = (_entry$getInitialData2 = entry.getInitialDataForExternal) === null || _entry$getInitialData2 === void 0 ? void 0 : _entry$getInitialData2.call(entry, feedback)) !== null && _entry$getInitialData !== void 0 ? _entry$getInitialData : null;
        if (nativeData) {
          for (var _i = 0, _Object$entries = Object.entries(nativeData); _i < _Object$entries.length; _i++) {
            var _Object$entries$_i = _slicedToArray(_Object$entries[_i], 2), key = _Object$entries$_i[0], data = _Object$entries$_i[1];
            event.dataTransfer.setData(key, data !== null && data !== void 0 ? data : "");
          }
        }
        if (isAndroid() && !event.dataTransfer.types.includes(textMediaType) && !event.dataTransfer.types.includes(URLMediaType)) {
          event.dataTransfer.setData(textMediaType, androidFallbackText);
        }
        event.dataTransfer.setData(elementAdapterNativeDataKey, "");
        var payload = {
          element: entry.element,
          dragHandle: (_entry$dragHandle2 = entry.dragHandle) !== null && _entry$dragHandle2 !== void 0 ? _entry$dragHandle2 : null,
          data: (_entry$getInitialData3 = (_entry$getInitialData4 = entry.getInitialData) === null || _entry$getInitialData4 === void 0 ? void 0 : _entry$getInitialData4.call(entry, feedback)) !== null && _entry$getInitialData3 !== void 0 ? _entry$getInitialData3 : {}
        };
        var dragType = {
          type: "element",
          payload,
          startedFrom: "internal"
        };
        api.start({
          event,
          dragType
        });
      }
    }));
  },
  dispatchEventToSource: function dispatchEventToSource(_ref) {
    var _draggableRegistry$ge, _draggableRegistry$ge2;
    var eventName = _ref.eventName, payload = _ref.payload;
    (_draggableRegistry$ge = draggableRegistry.get(payload.source.element)) === null || _draggableRegistry$ge === void 0 || (_draggableRegistry$ge2 = _draggableRegistry$ge[eventName]) === null || _draggableRegistry$ge2 === void 0 || _draggableRegistry$ge2.call(
      _draggableRegistry$ge,
      // I cannot seem to get the types right here.
      // TS doesn't seem to like that one event can need `nativeSetDragImage`
      // @ts-expect-error
      payload
    );
  },
  onPostDispatch: honeyPotFix.getOnPostDispatch()
});
var dropTargetForElements = adapter.dropTarget;
var monitorForElements = adapter.monitor;
function draggable(args) {
  if (true) {
    if (args.dragHandle && !args.element.contains(args.dragHandle)) {
      console.warn("Drag handle element must be contained in draggable element", {
        element: args.element,
        dragHandle: args.dragHandle
      });
    }
  }
  if (true) {
    var existing = draggableRegistry.get(args.element);
    if (existing) {
      console.warn("You have already registered a `draggable` on the same element", {
        existing,
        proposed: args
      });
    }
  }
  var cleanup = combine(
    // making the draggable register the adapter rather than drop targets
    // this is because you *must* have a draggable element to start a drag
    // but you _might_ not have any drop targets immediately
    // (You might create drop targets async)
    adapter.registerUsage(),
    addToRegistry(args),
    addAttribute(args.element, {
      attribute: "draggable",
      value: "true"
    })
  );
  return once(cleanup);
}

// node_modules/@atlaskit/pragmatic-drag-and-drop-hitbox/dist/esm/closest-edge.js
function ownKeys4(e, r) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r && (o = o.filter(function(r2) {
      return Object.getOwnPropertyDescriptor(e, r2).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread4(e) {
  for (var r = 1; r < arguments.length; r++) {
    var t = null != arguments[r] ? arguments[r] : {};
    r % 2 ? ownKeys4(Object(t), true).forEach(function(r2) {
      _defineProperty(e, r2, t[r2]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys4(Object(t)).forEach(function(r2) {
      Object.defineProperty(e, r2, Object.getOwnPropertyDescriptor(t, r2));
    });
  }
  return e;
}
var getDistanceToEdge = {
  top: function top(rect, client) {
    return Math.abs(client.y - rect.top);
  },
  right: function right(rect, client) {
    return Math.abs(rect.right - client.x);
  },
  bottom: function bottom(rect, client) {
    return Math.abs(rect.bottom - client.y);
  },
  left: function left(rect, client) {
    return Math.abs(client.x - rect.left);
  }
};
var uniqueKey = Symbol("closestEdge");
function attachClosestEdge(userData, _ref) {
  var _entries$sort$0$edge, _entries$sort$;
  var element = _ref.element, input = _ref.input, allowedEdges = _ref.allowedEdges;
  var client = {
    x: input.clientX,
    y: input.clientY
  };
  var rect = element.getBoundingClientRect();
  var entries = allowedEdges.map(function(edge) {
    return {
      edge,
      value: getDistanceToEdge[edge](rect, client)
    };
  });
  var addClosestEdge = (_entries$sort$0$edge = (_entries$sort$ = entries.sort(function(a, b) {
    return a.value - b.value;
  })[0]) === null || _entries$sort$ === void 0 ? void 0 : _entries$sort$.edge) !== null && _entries$sort$0$edge !== void 0 ? _entries$sort$0$edge : null;
  return _objectSpread4(_objectSpread4({}, userData), {}, _defineProperty({}, uniqueKey, addClosestEdge));
}
function extractClosestEdge(userData) {
  var _ref2;
  return (_ref2 = userData[uniqueKey]) !== null && _ref2 !== void 0 ? _ref2 : null;
}
export {
  attachClosestEdge,
  combine,
  draggable,
  dropTargetForElements,
  extractClosestEdge,
  monitorForElements
};

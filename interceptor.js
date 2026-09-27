// Runs in MAIN world at document_start to capture Sportlink auth headers from legitimate requests
(function () {
  'use strict';

  function captureAuth(token, instance, locale) {
    if (token && (token.startsWith('Bearer eyJ') || token.startsWith('bearer eyJ') || token.startsWith('eyJ'))) {
      const cleanToken = token.startsWith('Bearer ') || token.startsWith('bearer ') ? token : `Bearer ${token}`;
      window.postMessage({
        type: 'SL_WP_AUTH_CAPTURED',
        token: cleanToken,
        instance: instance || 'KNZB',
        locale: locale || 'en'
      }, '*');
    }
  }

  // 1. Hook fetch
  const originalFetch = window.fetch;
  window.fetch = function (resource, init) {
    if (init && init.headers) {
      let token = null;
      let instance = null;
      let locale = null;

      if (init.headers instanceof Headers) {
        token = init.headers.get('authorization');
        instance = init.headers.get('x-navajo-instance');
        locale = init.headers.get('x-navajo-locale');
      } else if (typeof init.headers === 'object') {
        for (const [k, v] of Object.entries(init.headers)) {
          const lk = k.toLowerCase();
          if (lk === 'authorization') token = v;
          if (lk === 'x-navajo-instance') instance = v;
          if (lk === 'x-navajo-locale') locale = v;
        }
      }

      if (token) {
        captureAuth(token, instance, locale);
      }
    }
    return originalFetch.apply(this, arguments);
  };

  // 2. Hook XMLHttpRequest
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (header, value) {
    const lk = (header || '').toLowerCase();
    if (lk === 'authorization') {
      captureAuth(value, 'KNZB', 'en');
    }
    return originalSetRequestHeader.apply(this, arguments);
  };
})();

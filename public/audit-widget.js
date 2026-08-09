(function() {
  'use strict';

  const WIDGET_SCRIPT_ID = 'artum8labs-audit-widget-script';
  const WIDGET_CONTAINER_ID = 'artum8labs-audit-widget';

  var settings = window.Artum8LabsAuditSettings || {
    apiUrl: 'https://audit.artum8labs.com/api/audit',
    brandColor: '#4f46e5',
    buttonText: 'Audit My Website',
    placeholderText: 'Enter your website URL',
    calLink: 'https://cal.com/artum8labs'
  };

  if (document.getElementById(WIDGET_CONTAINER_ID)) return;

  var root = document.createElement('div');
  root.id = WIDGET_CONTAINER_ID;
  root.style.fontFamily = 'Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
  root.style.background = '#0f172a';
  root.style.borderRadius = '16px';
  root.style.padding = '24px';
  root.style.maxWidth = '480px';
  root.style.margin = '0 auto';
  root.style.color = '#f1f5f9';
  root.style.border = '1px solid rgba(255,255,255,0.06)';

  root.innerHTML =
    '<style>' +
    '#' + WIDGET_CONTAINER_ID + ' input { width: 100%; padding: 12px 16px; border-radius: 10px; border: 2px solid rgba(255,255,255,0.08); background: #0f172a; color: #f1f5f9; font-size: 0.9rem; margin-bottom: 12px; outline: none; }' +
    '#' + WIDGET_CONTAINER_ID + ' input:focus { border-color: ' + settings.brandColor + '; }' +
    '#' + WIDGET_CONTAINER_ID + ' button { width: 100%; padding: 12px 20px; border-radius: 100px; border: none; background: ' + settings.brandColor + '; color: #fff; font-weight: 600; cursor: pointer; font-size: 0.9rem; }' +
    '#' + WIDGET_CONTAINER_ID + ' button:hover { opacity: 0.9; }' +
    '#' + WIDGET_CONTAINER_ID + ' .result { text-align: center; }' +
    '#' + WIDGET_CONTAINER_ID + ' .score { font-size: 2rem; font-weight: 900; margin: 12px 0; }' +
    '#' + WIDGET_CONTAINER_ID + ' .grade { font-size: 1.5rem; font-weight: 800; }' +
    '#' + WIDGET_CONTAINER_ID + ' .issues { text-align: left; margin-top: 12px; }' +
    '#' + WIDGET_CONTAINER_ID + ' .issue { background: rgba(239,68,68,0.1); border-left: 3px solid #f59e0b; padding: 8px 12px; margin: 6px 0; border-radius: 0 8px 8px 0; font-size: 0.8rem; color: #94a3b8; }' +
    '#' + WIDGET_CONTAINER_ID + ' .cta { margin-top: 16px; }' +
    '#' + WIDGET_CONTAINER_ID + ' .spinner { display: none; width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.2); border-top-color: #fff; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto; }' +
    '@keyframes spin { to { transform: rotate(360deg); } }' +
    '</style>' +
    '<div id="widget-form">' +
      '<input type="url" id="a8l-website-input" placeholder="' + settings.placeholderText + '" autocomplete="off">' +
      '<button id="a8l-audit-btn">' + settings.buttonText + '</button>' +
      '<div id="a8l-spinner" class="spinner"></div>' +
    '</div>' +
    '<div id="a8l-result" class="result" style="display:none">' +
      '<div class="score" id="a8l-score">0</div>' +
      '<div class="grade" id="a8l-grade">Grade: F</div>' +
      '<div class="issues" id="a8l-issues"></div>' +
      '<div class="cta">' +
        '<button onclick="window.open(\'' + settings.calLink + '\', \'_blank\')">Book Free Consultation</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(root);

  document.getElementById('a8l-audit-btn').onclick = function() {
    var input = document.getElementById('a8l-website-input');
    var url = input.value.trim();
    if (!url) {
      alert('Please enter a website URL');
      return;
    }

    var spinner = document.getElementById('a8l-spinner');
    spinner.style.display = 'block';
    var btn = document.getElementById('a8l-audit-btn');
    btn.disabled = true;
    btn.textContent = 'Auditing...';

    fetch(settings.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ website: url })
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.error) throw new Error(data.error);

        document.getElementById('a8l-score').textContent = data.score || 0;
        var grade = data.grade || 'F';
        document.getElementById('a8l-grade').textContent = 'Grade: ' + grade;

        var issuesHtml = (data.outdated_signals || []).map(function(s) {
          return '<div class="issue">⚠ ' + s + '</div>';
        }).join('');
        document.getElementById('a8l-issues').innerHTML = issuesHtml || '<div style="color:#94a3b8">No major issues found</div>';

        document.getElementById('a8l-form').style.display = 'none';
        document.getElementById('a8l-result').style.display = 'block';
      })
      .catch(function(err) {
        alert('Error: ' + err.message);
      })
      .finally(function() {
        spinner.style.display = 'none';
        btn.disabled = false;
        btn.textContent = settings.buttonText;
      });
  };

  window.Artum8LabsAudit = {
    reload: function() {
      var existing = document.getElementById(WIDGET_CONTAINER_ID);
      if (existing) existing.remove();
      window.Artum8LabsAuditSettings = settings;
      injectWidget();
    },
    setSettings: function(newSettings) {
      settings = Object.assign(settings, newSettings);
      window.Artum8LabsAuditSettings = settings;
      this.reload();
    }
  };

  function injectWidget() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        injectWidget();
      });
    } else {
      var s = document.createElement('script');
      s.id = wIDGET_SCRIPT_ID;
      s.text = '(function(){/* widget injected */})();';
      document.head.appendChild(s);

      setTimeout(function() {
        var input = document.getElementById('a8l-website-input');
        if (input) input.focus();
      }, 300);
    }
  }
})();

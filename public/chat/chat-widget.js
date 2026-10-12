/* arbeidsdeskundig.com chat + contactknop (preview). Vanilla JS, geen dependencies, geen cookies
   (sessionStorage voor het gesprek). Naar voorbeeld van de matchvermogen.nl-chat 0.1.2 en contactknop 0.13.1.
   - Contactknop (WhatsApp, mail, bellen) vervangt de oude WhatsApp-knop op dezelfde plek.
   - Chatknop met foto staat 12 px boven de contactknop. Contactmenu open: chatknop weg. Chat open: contactknop weg.
   - Prijzen: de server bepaalt of er contact is gegeven en blokkeert bedragen daarvoor.
   - GA4: alleen als gtag geladen is (na cookietoestemming), anders no-op. Nooit berichtteksten of persoonsgegevens naar GA4.
     Events: chat_open, chat_close, chat_chip, chat_message, chat_price_gate, chat_lead_open, chat_lead_submit,
     chat_error, chat_teaser_view, contact_open, contact_click, generate_lead (eenmaal per sessie). */
(function () {
  'use strict';
  var C = window.AD_CHAT || {};
  if (window.__adChatReady) { return; }
  window.__adChatReady = true;
  var doc = document, html = doc.documentElement;
  var SS = 'ad_chat_v1';
  var OFFSET = typeof C.offset === 'number' ? C.offset : 12;

  function track(name, params) {
    try { if (typeof window.gtag === 'function') { window.gtag('event', name, params || {}); } } catch (e) {}
  }
  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) { n.className = cls; }
    if (text != null) { n.textContent = text; }
    return n;
  }
  function svg(path) {
    return '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
  }
  var ICON = {
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
    wa: '<path fill="currentColor" stroke="none" d="M12 2.2A9.7 9.7 0 0 0 3.7 17l-1.4 4.8 5-1.3A9.7 9.7 0 1 0 12 2.2zm0 17.7a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 19.9zm4.4-6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8 1c-.1.2-.3.2-.5.1a6.5 6.5 0 0 1-3.2-2.8c-.2-.4.2-.4.7-1.2.1-.1 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 0 0-.6.3 2.7 2.7 0 0 0-.9 2c0 1.2.9 2.4 1 2.5.1.2 1.7 2.7 4.2 3.7 1.6.6 2.2.7 3 .6.5-.1 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1l-.6-.4z"/>'
  };

  /* ---------- state ---------- */
  function rid() {
    var a = new Uint8Array(16); (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  var state = null;
  try { state = JSON.parse(sessionStorage.getItem(SS) || 'null'); } catch (e) {}
  if (!state || !state.session) { state = { session: rid(), msgs: [], count: 0, lead: false, leadOpen: false, teaser: 0, genLead: false }; }
  function save() { state.msgs = state.msgs.slice(-40); try { sessionStorage.setItem(SS, JSON.stringify(state)); } catch (e) {} }

  /* ---------- contactknop ---------- */
  var fab = el('div', 'adc-fab'); fab.id = 'adc-fab';
  var items = [
    { key: 'whatsapp', href: C.whatsapp, label: 'WhatsApp', icon: ICON.wa, blank: true },
    { key: 'mail', href: 'mailto:' + (C.email || 'info@arbeidsdeskundig.com'), label: 'Mail ons', icon: ICON.mail },
    { key: 'phone', href: C.phoneHref || 'tel:0850870307', label: 'Bel ' + (C.phone || '085 087 0307'), icon: ICON.phone }
  ];
  var menu = el('ul', 'adc-fab__menu'); menu.id = 'adc-fab-menu'; menu.hidden = true;
  items.forEach(function (it) {
    if (!it.href) { return; }
    var li = el('li'); var a = el('a', 'adc-fab__item adc-fab__item--' + it.key);
    a.href = it.href; a.setAttribute('data-item', it.key); a.setAttribute('aria-label', it.label);
    if (it.blank) { a.target = '_blank'; a.rel = 'noopener'; }
    a.innerHTML = svg(it.icon) + '<span class="adc-fab__tip">' + it.label + '</span>';
    li.appendChild(a); menu.appendChild(li);
  });
  var toggle = el('button', 'adc-fab__toggle'); toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', 'adc-fab-menu'); toggle.setAttribute('aria-label', 'Contact opnemen');
  toggle.innerHTML = '<span class="adc-fab__ico-open">' + svg(ICON.phone) + '</span><span class="adc-fab__ico-close">' + svg(ICON.close) + '</span>';
  fab.appendChild(menu); fab.appendChild(toggle);

  function fabOpen() { return toggle.getAttribute('aria-expanded') === 'true'; }
  function openFab() {
    if (isOpen()) { closeChat(false); }
    menu.hidden = false; toggle.setAttribute('aria-expanded', 'true'); fab.classList.add('is-open');
    root.classList.add('is-fab-open'); hideTeaser(false);
    track('contact_open', {});
  }
  function closeFab() {
    if (!fabOpen()) { return; }
    menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); fab.classList.remove('is-open');
    root.classList.remove('is-fab-open'); place();
  }
  toggle.addEventListener('click', function () { if (fabOpen()) { closeFab(); } else { openFab(); } });
  fab.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[data-item]') : null;
    if (!a) { return; }
    track('contact_click', { channel: a.getAttribute('data-item'), source: 'fab' });
    setTimeout(closeFab, 0);
  });
  doc.addEventListener('pointerdown', function (e) { if (fabOpen() && !fab.contains(e.target)) { closeFab(); } }, true);
  doc.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (fabOpen()) { closeFab(); toggle.focus(); } else if (isOpen()) { closeChat(true); } }
  });

  /* ---------- chat ---------- */
  var root = el('div', 'adc-chat'); root.id = 'adc-chat';
  var name = 'Niels Alderding';
  var launcher = el('button', 'adc-chat__launcher'); launcher.type = 'button';
  launcher.setAttribute('aria-label', 'Open de chat met de digitale assistent'); launcher.setAttribute('aria-haspopup', 'dialog');
  launcher.innerHTML = '<img src="' + (C.avatar || '') + '" alt="" width="56" height="56"><span class="adc-chat__dot" aria-hidden="true"></span>';
  var teaser = el('div', 'adc-chat__teaser'); teaser.hidden = true;
  var tOpen = el('button', 'adc-chat__teaser-open', 'Vraag het Niels'); tOpen.type = 'button';
  var tX = el('button', 'adc-chat__teaser-x', '\u00d7'); tX.type = 'button'; tX.setAttribute('aria-label', 'Sluiten');
  teaser.appendChild(tOpen); teaser.appendChild(tX);

  var panel = el('div', 'adc-chat__panel'); panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'false'); panel.setAttribute('aria-label', 'Chat met de digitale assistent');
  panel.innerHTML = '<div class="adc-chat__head"><img src="' + (C.avatar || '') + '" alt="" width="44" height="44"><div class="adc-chat__head-txt"><p class="adc-chat__title">' + name + '</p><p class="adc-chat__sub">Digitale assistent, meestal direct antwoord</p></div><button type="button" class="adc-chat__close" aria-label="Chat sluiten">\u00d7</button></div>'
    + '<div class="adc-chat__log" aria-live="polite" tabindex="-1"></div><div class="adc-chat__chips"></div>'
    + '<form class="adc-chat__form" novalidate><label class="adc-chat__sr" for="adc-chat-input" style="position:absolute;left:-9999px">Je bericht</label><textarea id="adc-chat-input" class="adc-chat__input" rows="1" maxlength="500" placeholder="Typ je vraag..."></textarea><button type="submit" class="adc-chat__send" aria-label="Versturen">' + svg(ICON.send) + '</button></form>'
    + '<p class="adc-chat__notice">Je gesprek wordt verwerkt door AI (xAI). Deel geen medische gegevens. <a href="' + (C.privacy || '#') + '" target="_blank" rel="noopener">Privacyverklaring</a> \u00b7 <button type="button" class="adc-chat__linkbtn">Liever teruggebeld?</button></p>';
  root.appendChild(teaser); root.appendChild(launcher); root.appendChild(panel);

  var log = panel.querySelector('.adc-chat__log');
  var chips = panel.querySelector('.adc-chat__chips');
  var form = panel.querySelector('.adc-chat__form');
  var input = panel.querySelector('.adc-chat__input');
  var sendBtn = panel.querySelector('.adc-chat__send');
  var busy = false, lastFocus = null, rendered = false;

  var WELCOME = 'Hoi! Ik ben de digitale assistent van arbeidsdeskundig.com. Stel gerust je vraag over arbeidsdeskundig onderzoek, de werkwijze of de tarieven. Wil je een offerte? Dan regel ik dat meteen.';
  var CHIPS = [
    { label: 'Wat kost een arbeidsdeskundig onderzoek?' },
    { label: 'Hoe snel kunnen jullie starten?' },
    { label: 'Ik wil een offerte', lead: true }
  ];

  function isOpen() { return root.classList.contains('is-open'); }
  function mobile() { return window.matchMedia('(max-width: 639px)').matches; }

  /* Markdown-light: [tekst](url), kale urls, alinea's. Alleen eigen site, calendly, tel/mailto en de privacyverklaring. */
  function safeHref(h) {
    if (/^\/(?!\/)/.test(h) || /^(mailto:|tel:)/i.test(h)) { return h; }
    try {
      var u = new URL(h, location.href);
      if (/(^|\.)arbeidsdeskundig\.com$/i.test(u.hostname) || u.hostname === location.hostname || /^calendly\.com$/i.test(u.hostname) || u.href === C.privacy) { return u.href; }
    } catch (e) {}
    return '';
  }
  function renderText(node, text) {
    String(text || '').split(/\n{2,}/).forEach(function (para) {
      var p = el('p'); var re = /\[([^\]]{1,120})\]\(([^)\s]{1,300})\)|(https?:\/\/[^\s)]+[^\s).,!?])/g, last = 0, m;
      while ((m = re.exec(para))) {
        if (m.index > last) { p.appendChild(doc.createTextNode(para.slice(last, m.index))); }
        var href = safeHref(m[2] || m[3]), label = m[1] || m[3];
        if (href) {
          var a = el('a', null, label); a.href = href;
          if (!/^(\/|mailto:|tel:)/.test(href) && href.indexOf(location.origin) !== 0) { a.target = '_blank'; a.rel = 'noopener'; }
          a.addEventListener('click', function () { track('chat_link', {}); });
          p.appendChild(a);
        } else { p.appendChild(doc.createTextNode(label)); }
        last = re.lastIndex;
      }
      if (last < para.length) { p.appendChild(doc.createTextNode(para.slice(last))); }
      node.appendChild(p);
    });
  }
  function addMsg(role, text, persist) {
    var n = el('div', 'adc-chat__msg adc-chat__msg--' + role);
    renderText(n, text); log.appendChild(n); log.scrollTop = log.scrollHeight;
    if (persist && (role === 'user' || role === 'bot')) { state.msgs.push({ role: role === 'bot' ? 'assistant' : 'user', content: text }); save(); }
    return n;
  }
  function renderChips() {
    chips.innerHTML = '';
    if (state.count > 0) { return; }
    CHIPS.forEach(function (c) {
      var b = el('button', 'adc-chat__chip' + (c.lead ? ' adc-chat__chip--lead' : ''), c.label); b.type = 'button';
      b.addEventListener('click', function () {
        track('chat_chip', { chip: c.label.slice(0, 80) });
        if (c.lead) { addMsg('user', c.label, true); state.count++; save(); chips.innerHTML = ''; addMsg('bot', 'Leuk! Laat hieronder je gegevens achter, dan nemen we binnen 24 uur contact met je op.', true); showLead('chip'); }
        else { send(c.label, true); }
      });
      chips.appendChild(b);
    });
  }
  function render() {
    if (rendered) { return; }
    rendered = true;
    addMsg('bot', WELCOME, false);
    state.msgs.forEach(function (m) { addMsg(m.role === 'assistant' ? 'bot' : 'user', m.content, false); });
    if (state.lead) { addMsg('note', 'Je gegevens zijn verstuurd. We nemen binnen 24 uur contact met je op.', false); }
    else if (state.leadOpen) { showLead('restore', true); }
    renderChips();
  }
  function typing() {
    var n = el('div', 'adc-chat__msg adc-chat__msg--bot'); n.innerHTML = '<span class="adc-chat__typing" aria-label="Aan het typen"><i></i><i></i><i></i></span>';
    log.appendChild(n); log.scrollTop = log.scrollHeight; return n;
  }
  function offerBtn() {
    var b = el('button', 'adc-chat__offer', 'Gegevens achterlaten'); b.type = 'button';
    b.addEventListener('click', function () { b.remove(); showLead('offer'); });
    log.appendChild(b); log.scrollTop = log.scrollHeight;
  }
  function fireLead(source) {
    if (state.genLead) { return; }
    state.genLead = true; save();
    track('generate_lead', { value: C.leadValue || 250, currency: 'EUR', source: source });
  }

  function send(text, viaChip) {
    text = String(text || '').trim();
    if (!text || busy) { return; }
    busy = true; sendBtn.disabled = true; chips.innerHTML = '';
    addMsg('user', text, true); state.count++; save();
    track('chat_message', { msg_index: state.count, via: viaChip ? 'chip' : 'typed' });
    var t = typing();
    fetch(C.api || '/api/chat/message', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ session: state.session, messages: state.msgs.slice(-10), page: { title: doc.title, path: location.pathname } })
    }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { r: r, d: d }; }); })
      .then(function (x) {
        t.remove();
        var d = x.d || {};
        if (d.reply) { addMsg('bot', d.reply, true); }
        else { addMsg('bot', 'Sorry, er ging iets mis. Bel ons op ' + (C.phone || '085 087 0307') + '.', false); }
        if (d.lead) { state.contact = true; save(); track('chat_lead_submit', { source: 'chat_message' }); fireLead('chat_message'); }
        if (d.gated) { track('chat_price_gate', {}); }
        if (d.action === 'lead_form') { showLead('model'); }
        else if (d.action === 'lead_offer') { offerBtn(); }
        if (!x.r.ok || d.fallback) { track('chat_error', { reason: String(d.code || x.r.status).slice(0, 40) }); }
      })
      .catch(function () {
        t.remove(); addMsg('bot', 'Sorry, de verbinding lukt even niet. Bel ons op ' + (C.phone || '085 087 0307') + ' of mail naar ' + (C.email || 'info@arbeidsdeskundig.com') + '.', false);
        offerBtn(); track('chat_error', { reason: 'network' });
      })
      .then(function () { busy = false; sendBtn.disabled = false; input.focus(); });
  }

  /* ---------- formulier in de chat: post naar het bestaande /api/offerte (bron chat) ---------- */
  function showLead(trigger, restoring) {
    if (state.lead) { addMsg('note', 'Je gegevens zijn al verstuurd. We nemen binnen 24 uur contact met je op.', false); return; }
    if (log.querySelector('.adc-chat__lead')) { return; }
    state.leadOpen = true; save();
    if (!restoring) { track('chat_lead_open', { trigger: trigger }); }
    var f = el('form', 'adc-chat__lead'); f.noValidate = true;
    f.innerHTML = '<p class="adc-chat__lead-title">Je gegevens</p><div class="adc-chat__lead-grid">'
      + '<label>Naam<input type="text" name="naam" autocomplete="name" required></label>'
      + '<label>Organisatie<input type="text" name="bedrijf" autocomplete="organization"></label>'
      + '<label>E-mail<input type="email" name="email" autocomplete="email" required></label>'
      + '<label>Telefoon<input type="tel" name="telefoon" autocomplete="tel" required></label></div>'
      + '<p class="adc-chat__hp" aria-hidden="true"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label></p>'
      + '<label class="adc-chat__consent"><input type="checkbox" name="akkoord" required><span>Ik ga akkoord dat arbeidsdeskundig.com (Matchvermogen B.V.) mijn gegevens gebruikt om contact met mij op te nemen. Lees de <a href="' + (C.privacy || '#') + '" target="_blank" rel="noopener">privacyverklaring</a>.</span></label>'
      + '<button type="submit" class="adc-chat__lead-submit">Versturen</button><p class="adc-chat__lead-msg" role="status"></p>';
    log.appendChild(f); log.scrollTop = log.scrollHeight;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var msg = f.querySelector('.adc-chat__lead-msg'), btn = f.querySelector('.adc-chat__lead-submit');
      var v = function (n) { return (f.elements[n] && f.elements[n].value || '').trim(); };
      msg.className = 'adc-chat__lead-msg is-error';
      if (!v('naam')) { msg.textContent = 'Vul je naam in.'; return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('email'))) { msg.textContent = 'Vul een geldig e-mailadres in.'; return; }
      if (v('telefoon').replace(/\D/g, '').length < 8) { msg.textContent = 'Vul een geldig telefoonnummer in.'; return; }
      if (!f.elements.akkoord.checked) { msg.textContent = 'Geef akkoord om je gegevens te versturen.'; return; }
      btn.disabled = true; msg.className = 'adc-chat__lead-msg'; msg.textContent = 'Versturen...';
      var summary = state.msgs.filter(function (m) { return m.role === 'user'; }).map(function (m) { return m.content; }).join(' | ').slice(0, 1200);
      track('chat_lead_submit', { source: 'chat_form' });
      fetch(C.lead || '/api/offerte', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({ naam: v('naam'), bedrijf: v('bedrijf'), email: v('email'), telefoon: v('telefoon'), website: v('website'), omschrijving: 'Via de chat op ' + location.pathname + (summary ? '. Vragen: ' + summary : ''), bron: 'chat' })
      }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { r: r, d: d }; }); })
        .then(function (x) {
          if (x.r.ok && x.d.ok !== false) {
            state.lead = true; state.leadOpen = false; save(); fireLead('chat_form');
            f.remove(); addMsg('bot', 'Bedankt! We nemen binnen 24 uur contact met je op.', true);
          } else {
            btn.disabled = false; msg.className = 'adc-chat__lead-msg is-error'; msg.textContent = x.d.error || 'Versturen lukte niet. Probeer het opnieuw of bel ons.';
            track('chat_error', { reason: 'lead_' + x.r.status });
          }
        })
        .catch(function () { btn.disabled = false; msg.className = 'adc-chat__lead-msg is-error'; msg.textContent = 'Geen verbinding. Probeer het opnieuw of bel ' + (C.phone || '085 087 0307') + '.'; track('chat_error', { reason: 'lead_network' }); });
    });
  }

  /* ---------- open/dicht ---------- */
  function openChat(trigger) {
    closeFab(); hideTeaser(false);
    lastFocus = doc.activeElement;
    render();
    panel.hidden = false; root.classList.add('is-open'); html.classList.add('adc-chat-open');
    if (mobile()) { html.classList.add('adc-noscroll'); }
    launcher.setAttribute('aria-expanded', 'true');
    setTimeout(function () { input.focus(); }, 30);
    track('chat_open', { trigger: trigger || 'launcher' });
  }
  function closeChat(returnFocus) {
    if (!isOpen()) { return; }
    panel.hidden = true; root.classList.remove('is-open'); html.classList.remove('adc-chat-open', 'adc-noscroll');
    launcher.setAttribute('aria-expanded', 'false');
    track('chat_close', {});
    place();
    if (returnFocus) { (lastFocus && lastFocus.focus ? lastFocus : launcher).focus(); }
  }
  launcher.addEventListener('click', function () { if (isOpen()) { closeChat(true); } else { openChat('launcher'); } });
  panel.querySelector('.adc-chat__close').addEventListener('click', function () { closeChat(true); });
  panel.querySelector('.adc-chat__linkbtn').addEventListener('click', function () { showLead('terugbellen'); });
  form.addEventListener('submit', function (e) { e.preventDefault(); var v = input.value; input.value = ''; send(v, false); });
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit')); } });

  /* ---------- teaser (alleen desktop, eenmaal per sessie) ---------- */
  function hideTeaser(remember) { if (!teaser.hidden) { teaser.hidden = true; } if (remember) { state.teaser = 1; save(); } }
  tOpen.addEventListener('click', function () { hideTeaser(true); openChat('teaser'); });
  tX.addEventListener('click', function () { hideTeaser(true); });
  setTimeout(function () {
    if (state.teaser || state.count || isOpen() || fabOpen() || mobile() || doc.body.classList.contains('cookie-prompt-open')) { return; }
    teaser.hidden = false; state.teaser = 1; save(); track('chat_teaser_view', {});
  }, 12000);

  /* ---------- positie: chatknop 12 px boven de contactknop ---------- */
  var raf = 0;
  function place() {
    raf = 0;
    var r = toggle.getBoundingClientRect();
    if (!r.height) { return; }
    var top = Math.min(r.top, fabOpen() ? r.top : r.top);
    root.style.setProperty('--adc-b', Math.round(window.innerHeight - top + OFFSET) + 'px');
    root.style.setProperty('--adc-r', Math.round(window.innerWidth - r.right + (r.width - root.offsetWidth) / 2) + 'px');
  }
  function schedule() { if (!raf) { raf = window.requestAnimationFrame(place); } }
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('scroll', schedule, { passive: true });
  fab.addEventListener('transitionend', schedule);
  if (window.MutationObserver) {
    var mo = new MutationObserver(function () { schedule(); setTimeout(schedule, 300); });
    mo.observe(doc.body, { attributes: true, attributeFilter: ['class', 'style'] });
    mo.observe(html, { attributes: true, attributeFilter: ['style', 'class'] });
  }

  html.classList.add('adc-on');
  doc.body.appendChild(fab);
  doc.body.appendChild(root);
  place(); setTimeout(place, 300); window.addEventListener('load', place);
  if (/[?&]ad_chat_test=1(?:&|$)/.test(location.search)) { openChat('test'); }
})();

/* Landing / homepage. */
import { store } from '../store.js';
import { icon, esc } from '../ui.js';

export async function renderLanding(container) {
  const loggedIn = !!store.user;
  const startHref = loggedIn ? '#/dashboard' : '#/signup';
  const startLabel = loggedIn ? 'Dashboard' : 'Get Started';
  const loginHref = loggedIn ? '#/dashboard' : '#/login';
  const loginLabel = loggedIn ? 'My Dashboard' : 'Log In';

  container.innerHTML = `
    <div class="public-page landing">
      <header class="public-nav">
        <button class="brand" data-scroll="top" aria-label="PayClone home">
          <span class="brand-mark">P</span>
          <span class="brand-word">Pay<span>Clone</span></span>
          <span class="brand-demo">DEMO</span>
        </button>
        <nav class="nav-links" aria-label="Landing navigation">
          <button class="nav-link" data-scroll="features">Features</button>
          <button class="nav-link" data-scroll="security">Security</button>
          <button class="nav-link" data-nav="/help" style="display:${loggedIn ? 'inline-flex' : 'none'}">Help</button>
        </nav>
        <div class="row gap-8">
          <a class="btn btn-ghost btn-sm" href="${loginHref}">${esc(loginLabel)}</a>
          <a class="btn btn-primary btn-sm" href="${startHref}">${esc(startLabel)}</a>
        </div>
      </header>

      <div class="demo-strip demo-strip-top">
        ${icon('shieldCheck', 16)}
        Demo payment environment. No real money is transferred. Educational PayPal-inspired clone.
      </div>

      <main class="public-main">
        <!-- HERO -->
        <section class="hero" id="top">
          <div class="hero-grid">
            <div class="hero-copy">
              <span class="eyebrow">${icon('zap', 15)} PayPal-inspired · Educational demo</span>
              <h1 class="hero-title" aria-label="Move money simply, securely.">
                <span class="ht-line" style="--i:0"><span class="ht-word">Move</span> <span class="ht-word">money</span></span>
                <span class="ht-line hl-2" style="--i:1"><span class="ht-word grad">simply,</span> <span class="ht-word grad">securely.</span></span>
              </h1>
              <p class="hero-sub">Send, receive, and manage your digital payments from one secure wallet — with live tracking, receipts and 2FA-style security.</p>
              <div class="hero-ctas">
                <a class="btn btn-primary btn-lg" href="#/signup">Get Started</a>
                <a class="btn btn-outline btn-lg" href="#/login">Log In</a>
              </div>
              <ul class="hero-trust">
                <li>${icon('checkCircle', 16)} Demo wallet &amp; dummy payments</li>
                <li>${icon('checkCircle', 16)} 2FA-ready accounts</li>
                <li>${icon('checkCircle', 16)} Full transaction tracking</li>
              </ul>
            </div>

            <div class="hero-visual" aria-hidden="true">
              <div class="hs-glow"></div>
              <div class="hs-aurora"></div>
              <div class="hs-halo"></div>
              <div class="hs-stage">
                <div class="hs-rain"></div>
                <div class="hs-card">
                  <div class="hs-card-top">
                    <span class="hs-card-brand">Pay<span>Clone</span></span>
                    <span class="hs-card-chip"></span>
                  </div>
                  <div class="hs-balance" data-count="1250">$0.00</div>
                  <div class="hs-balance-label">Available balance · demo funds</div>
                  <div class="hs-num">••••  <span>4242</span></div>
                </div>
                <div class="hs-orbit one"><span class="ho-dot">${icon('send', 14)}</span><span class="ho-label">+$120.00 received</span></div>
                <div class="hs-orbit two"><span class="ho-dot">${icon('shieldCheck', 14)}</span><span class="ho-label">2FA active</span></div>
                <div class="hs-orbit three"><span class="ho-dot">${icon('receive', 14)}</span><span class="ho-label">Request paid · $64.20</span></div>
                <div class="hs-orbit four"><span class="ho-dot">${icon('refresh', 14)}</span><span class="ho-label">Instant transfer · 0.8s</span></div>
                <div class="hs-cash one">+$50.00</div>
                <div class="hs-cash two">−$18.75</div>
                <div class="hs-cash three">+$230.00</div>
                <div class="hs-ring"></div>
                <div class="hs-sparkle">${icon('sparkles', 20)}</div>
              </div>
            </div>
          </div>
        </section>

        <!-- FEATURES -->
        <section class="features" id="features">
          <div class="features-inner">
            <div class="section-head reveal">
              <span class="eyebrow">${icon('sparkles', 15)} Everything you need</span>
              <h2>A complete demo payments platform</h2>
              <p>Every feature below is fully functional inside the demo wallet — no dead buttons, no mockups.</p>
            </div>
            <div class="feature-grid reveal-stagger">
              <article class="feature-card">
                <div class="fc-ico">${icon('send', 26)}</div>
                <h3>SEND MONEY</h3>
                <p>Send demo funds to anyone on the platform using their <strong>email</strong> or <strong>username</strong>, with a confirmation review before every transfer.</p>
                <ul class="feature-list">
                  <li>${icon('check', 13)} By email</li>
                  <li>${icon('check', 13)} By username</li>
                  <li>${icon('check', 13)} Confirm popup</li>
                </ul>
              </article>

              <article class="feature-card green">
                <div class="fc-ico">${icon('receive', 26)}</div>
                <h3>RECEIVE MONEY</h3>
                <p>Create payment requests with a unique reference and a shareable demo payment link anyone can pay from their own demo wallet.</p>
                <ul class="feature-list">
                  <li>${icon('check', 13)} Payment requests</li>
                  <li>${icon('check', 13)} Shareable links</li>
                  <li>${icon('check', 13)} Request status</li>
                </ul>
              </article>

              <article class="feature-card navy">
                <div class="fc-ico">${icon('wallet', 26)}</div>
                <h3>DIGITAL WALLET</h3>
                <p>Manage your demo wallet balance, add demo funds with dummy cards or demo bank transfers, and watch your balance update instantly.</p>
                <ul class="feature-list">
                  <li>${icon('check', 13)} Add demo funds</li>
                  <li>${icon('check', 13)} Live balance</li>
                  <li>${icon('check', 13)} Demo methods</li>
                </ul>
              </article>

              <article class="feature-card amber">
                <div class="fc-ico">${icon('receipt', 26)}</div>
                <h3>TRANSACTION TRACKING</h3>
                <p>Complete history with search, filters and sorting, full transaction details, and a downloadable printable receipt for every entry.</p>
                <ul class="feature-list">
                  <li>${icon('check', 13)} Search</li>
                  <li>${icon('check', 13)} Filters</li>
                  <li>${icon('check', 13)} Sorting</li>
                  <li>${icon('check', 13)} Receipts</li>
                </ul>
              </article>

              <article class="feature-card purple span-3">
                <div class="fc-ico">${icon('shieldCheck', 26)}</div>
                <h3>SECURITY</h3>
                <p>Accounts are protected the professional way — hashed passwords, secure sessions and an optional two-factor login challenge.</p>
                <ul class="feature-list">
                  <li>${icon('lock', 13)} Password protection</li>
                  <li>${icon('key', 13)} Secure authentication</li>
                  <li>${icon('shieldCheck', 13)} 2FA</li>
                  <li>${icon('eye', 13)} Protected financial information</li>
                </ul>
              </article>

              <article class="feature-card green span-3">
                <div class="fc-ico">${icon('bell', 26)}</div>
                <h3>NOTIFICATIONS &amp; INSIGHTS</h3>
                <p>Real-time alerts for payments sent and received, funds added, payment requests and every security change, with a live unread badge.</p>
                <ul class="feature-list">
                  <li>${icon('check', 13)} Payment alerts</li>
                  <li>${icon('check', 13)} Security alerts</li>
                  <li>${icon('check', 13)} Live unread count</li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        <!-- SECURITY -->
        <section class="security-band" id="security">
          <div class="sb-inner">
            <div class="reveal reveal-left">
              <span class="eyebrow">${icon('shield', 15)} Security first</span>
              <h2 style="margin-top:16px">Built like a real fintech product</h2>
              <p class="sb-sub">
                Passwords are hashed with a modern key-derivation function and never stored or displayed in plain text.
                Sessions use secure, HTTP-only cookies, and every payment is validated end-to-end before it is recorded.
              </p>
              <div class="demo-strip-inline mt-16" style="background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.35);color:#ffe6ad">
                ${icon('info', 15)} Demo payment environment. No real money is transferred.
              </div>
            </div>
            <div class="security-points reveal-stagger reveal">
              <div class="security-point">
                <div class="sp-ico">${icon('lock', 20)}</div>
                <h4>Password protection</h4>
                <p>Strong-password rules at signup and salted, hashed storage — plain-text passwords never leave the server.</p>
              </div>
              <div class="security-point">
                <div class="sp-ico">${icon('key', 20)}</div>
                <h4>Secure authentication</h4>
                <p>Cookie-based sessions, generic login errors, and full login-activity history inside your security page.</p>
              </div>
              <div class="security-point">
                <div class="sp-ico">${icon('shieldCheck', 20)}</div>
                <h4>Two-factor authentication</h4>
                <p>An optional 2FA challenge at login (clearly simulated in this demo — no real authenticator provider).</p>
              </div>
              <div class="security-point">
                <div class="sp-ico">${icon('eye', 20)}</div>
                <h4>Protected financial information</h4>
                <p>Only dummy payment data is accepted; card numbers are never stored — just brand and last 4 digits.</p>
              </div>
            </div>
          </div>
        </section>

        <!-- FINAL CTA -->
        <section class="final-cta reveal">
          <h2>Ready to move demo money?</h2>
          <p>Create your free demo account and explore every feature in minutes.</p>
          <div class="hero-ctas">
            <a class="btn btn-primary btn-lg" href="#/signup">Get Started</a>
            <a class="btn btn-outline btn-lg" href="#/login">Log In</a>
          </div>
        </section>
      </main>

      <footer class="public-footer">
        <div class="foot-grid">
          <div style="max-width:320px">
            <div class="brand" style="color:#fff">
              <span class="brand-mark" style="background:linear-gradient(135deg,#0070e0,#009cde)">P</span>
              <span class="brand-word">Pay<span style="color:#8fc9ff">Clone</span></span>
            </div>
            <p style="margin-top:12px;line-height:1.6">
              A fully functional, PayPal-inspired educational demo platform. This is an educational demo platform
              and does not transfer real money.
            </p>
          </div>
          <div>
            <h4>Product</h4>
            <button class="foot-link" data-scroll="features">Features</button>
            <button class="foot-link" data-scroll="security">Security</button>
            <a href="#/login">Log In</a>
            <a href="#/signup">Sign Up</a>
          </div>
          <div>
            <h4>Account</h4>
            <a href="#/forgot">Reset Password</a>
            <button class="foot-link" data-nav="/help">Help &amp; Support</button>
            <button class="foot-link" data-nav="/dashboard">Dashboard</button>
          </div>
          <div>
            <h4>Demo notice</h4>
            <p style="color:#8593ab;line-height:1.6">
              Demo payment environment. No real money is transferred, no banking credentials are requested,
              and no real card data is stored.
            </p>
          </div>
        </div>
        <div class="foot-bottom">
          <span>© ${new Date().getFullYear()} PayClone · Educational demo project</span>
          <span>Built with Node.js — zero dependencies</span>
        </div>
      </footer>
    </div>
  `;

  container.querySelectorAll('[data-scroll]').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-scroll');
      const target = id === 'top' ? container : container.querySelector('#' + id);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else if (id === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  container.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => {
      location.hash = el.getAttribute('data-nav');
    });
  });

  /* ---- 3D hero: word rise, pointer tilt + depth parallax, count-up ---- */
  const stage = container.querySelector('.hs-stage');
  const scene = container.querySelector('.hero-visual');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* headline: give every word its own rise distance + slight roll, and put
     line 2 on a deeper entrance layer once its words have landed */
  container.querySelectorAll('.hero-title .ht-word').forEach((w, i) => {
    w.style.setProperty('--wd', ((i % 2 ? 1 : -1) * (4 + (i % 3) * 5)).toFixed(0) + 'px');
    w.style.setProperty('--rz', ((i % 2 ? -1 : 1) * (2 + (i % 3) * 2)).toFixed(1) + 'deg');
  });
  const line2 = container.querySelector('.hero-title .hl-2');
  if (line2 && reduceMotion) {
    line2.style.animation = 'none'; // CSS entrance is motion; final state is transform: none
  }

  if (stage && scene && !reduceMotion && window.matchMedia('(pointer: fine)').matches) {
    let raf = 0;
    scene.addEventListener('pointermove', (e) => {
      const r = scene.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          stage.style.setProperty('--ry', (px * 15).toFixed(2) + 'deg');
          stage.style.setProperty('--rx', (py * -11).toFixed(2) + 'deg');
          stage.style.setProperty('--mx', ((px + 0.5) * 100).toFixed(1) + '%');
          stage.style.setProperty('--my', ((py + 0.5) * 100).toFixed(1) + '%');
          raf = 0;
        });
      }
    });
    scene.addEventListener('pointerleave', () => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      stage.style.setProperty('--ry', '0deg');
      stage.style.setProperty('--rx', '0deg');
    });
  }

  /* depth parallax: orbit chips sit on different Z planes and shift at
     different rates while the stage tilts */
  if (stage && !reduceMotion) {
    stage.querySelectorAll('.hs-orbit').forEach((el, i) => {
      el.style.setProperty('--pd', (0.6 + i * 0.45).toFixed(2));
    });
  }

  /* sparkle: staggered twinkle loops */
  if (!reduceMotion) {
    container.querySelectorAll('.hs-sparkle').forEach((el, i) => {
      el.style.setProperty('--si', i * 1.1);
    });
  }

  /* money rain: generated bills falling on a negative-Z plane BEHIND the
     card — each flake gets its own size, depth, sway, flip and timing */
  const rain = container.querySelector('.hs-rain');
  if (rain && !reduceMotion) {
    const vw = window.innerWidth;
    const count = vw < 640 ? 13 : vw < 1024 ? 18 : 26;
    const fall = Math.round((stage ? stage.offsetHeight : 340) * 1.35);
    const rnd = (min, max) => min + Math.random() * (max - min);
    for (let i = 0; i < count; i++) {
      const b = document.createElement('span');
      b.className = 'hs-flake' + (Math.random() < 0.24 ? ' gold' : '');
      b.style.setProperty('--l', rnd(0, 96).toFixed(1) + '%');
      b.style.setProperty('--d', (-rnd(0, 9)).toFixed(2) + 's');
      b.style.setProperty('--dur', rnd(5.5, 9.5).toFixed(2) + 's');
      b.style.setProperty('--z', Math.round(rnd(-140, -45)) + 'px');
      b.style.setProperty('--op', rnd(0.35, 0.8).toFixed(2));
      b.style.setProperty('--sway', Math.round(rnd(-34, 34)) + 'px');
      b.style.setProperty('--flip', Math.random() < 0.5 ? '1' : '0.5');
      b.style.setProperty('--tilt', Math.round(rnd(-24, 24)) + 'deg');
      b.style.setProperty('--fall', fall + 'px');
      b.style.setProperty('--size', Math.round(rnd(10, 17)) + 'px');
      rain.appendChild(b);
    }
  }

  /* cash burst: one-shot celebration when the balance finishes counting up.
     Bills spray out of the card, arc outward and fall with a spin. */
  const burstFrom = stage || scene;
  function burstMoney() {
    if (!burstFrom) return;
    const n = window.innerWidth < 640 ? 12 : 18;
    const rnd = (min, max) => min + Math.random() * (max - min);
    for (let i = 0; i < n; i++) {
      const b = document.createElement('span');
      b.className = 'hs-burst' + (Math.random() < 0.32 ? ' gold' : '');
      b.style.setProperty('--bx', Math.round(rnd(-120, 120)) + 'px');
      b.style.setProperty('--by', Math.round(rnd(150, 250)) + 'px');
      b.style.setProperty('--bz', Math.round(rnd(20, 110)) + 'px');
      b.style.setProperty('--br', Math.round(rnd(-220, 220)) + 'deg');
      b.style.setProperty('--bs', rnd(0.8, 1.5).toFixed(2));
      b.style.setProperty('--bd', rnd(0, 0.35).toFixed(2) + 's');
      b.addEventListener('animationend', () => b.remove(), { once: true });
      burstFrom.appendChild(b);
    }
  }

  const balance = container.querySelector('.hs-balance');
  if (balance && !reduceMotion) {
    const target = parseFloat(balance.getAttribute('data-count') || '0');
    const dur = 1300;
    const t0 = performance.now();
    const fmt = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      balance.textContent = fmt(target * eased);
      if (k < 1) requestAnimationFrame(tick);
      else {
        balance.classList.add('done');
        burstMoney();
      }
    };
    requestAnimationFrame(tick);
  } else if (balance) {
    balance.textContent = '$1,250.00';
  }
}

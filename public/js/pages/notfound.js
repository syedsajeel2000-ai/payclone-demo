/* 404 page. */
import { store } from '../store.js';
import { icon } from '../ui.js';

export async function renderNotFound(container) {
  const loggedIn = !!store.user;
  container.innerHTML = `
    <div class="notfound">
      <div>
        <div class="nf-code">404</div>
        <h1>Page Not Found</h1>
        <p>The page you are looking for doesn't exist or may have been moved. Check the URL or head back to safety.</p>
        <div class="nf-actions">
          <button class="btn btn-primary btn-lg" data-nav="/">${icon('home', 17)} Go Home</button>
          ${loggedIn
            ? '<button class="btn btn-outline btn-lg" data-nav="/dashboard">' + icon('activity', 17) + ' Back to Dashboard</button>'
            : '<a class="btn btn-outline btn-lg" href="#/login">' + icon('logout', 17) + ' Log In</a>'}
        </div>
        <div class="demo-strip-inline" style="margin-top:26px;max-width:420px;margin-inline:auto">
          ${icon('info', 15)} PayClone demo payment platform · no real money is transferred.
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => { location.hash = el.getAttribute('data-nav'); });
  });
}

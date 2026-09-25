/* Client-side state store. */
import { api } from './api.js';

export const store = {
  user: null,
  prefs: {
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
    defaultHome: '/dashboard'
  },
  unread: 0,

  async loadMe() {
    try {
      const data = await api('/api/auth/me');
      this.user = data.user || null;
    } catch (e) {
      this.user = null;
    }
    return this.user;
  },

  setUser(user) {
    this.user = user || null;
  },

  setPrefs(prefs) {
    if (prefs) this.prefs = { ...this.prefs, ...prefs };
  },

  setUnread(n) {
    this.unread = Number(n) || 0;
  },

  /* Pull fresh profile + preferences from the server. */
  async sync() {
    try {
      const data = await api('/api/settings');
      if (data.profile) this.user = data.profile;
      if (data.preferences) this.setPrefs(data.preferences);
    } catch (e) { /* non-fatal */ }
  }
};

/* Disposable / temp-mail domain blocklist (client mirror of lib/util.js — kept
   in sync manually; the server always re-checks, this is instant UX feedback). */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com', 'yopmail.com', 'yopmail.fr', 'yopmail.net', 'guerrillamail.com',
  'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com', 'sharklasers.com',
  'grr.la', 'guerrillamail.biz', 'spam4.me', '10minutemail.com', '10minutemail.net',
  '10minutemail.co.uk', '20minutemail.com', 'tempmail.com', 'temp-mail.org', 'temp-mail.io',
  'temp-mailo.com', 'tempmailo.com', 'tempmailo.net', 'tempmail.plus', 'tempmail.dev',
  'tempr.email', 'tmpmail.org', 'tmpmail.net', 'tmpmailcorporation.com', 'throwawaymail.com',
  'throwawaymail.me', 'trashmail.com', 'trash-mail.com', 'trashmail.me', 'trashmail.de',
  'trashmail.net', 'trash-mail.de', 'kurzepost.de', 'objectmail.com', 'proxymail.eu',
  'rcpt.at', 'wegwerfmail.de', 'wegwerfmail.net', 'wegwerfmail.org', 'zero-mail.net',
  'dispostable.com', 'mailnesia.com', 'maildrop.cc', 'mailcatch.com', 'mintemail.com',
  'mohmal.com', 'mohmal.im', 'getnada.com', 'nada.email', 'nada.ltd', 'inboxbear.com',
  'inboxkitten.com', 'incognitomail.com', 'incognitomail.org', 'jetable.org', 'jetable.net',
  'anonbox.net', 'fakeinbox.com', 'fake-mail.net', 'fakemail.net', 'fakemailgenerator.com',
  'emailondeck.com', 'email-fake.com', 'emailfake.com', 'email-fake.net', 'generator.email',
  'grrmail.com', 'harakirimail.com', 'mytemp.email', 'mytempemail.com', 'burnermail.io',
  'mail-temporaire.fr', 'mailtemp.net', 'spamgourmet.com', 'spambog.com', 'spambog.de',
  'spambog.ru', 'mailsac.com', 'inboxalias.com', 'mail7.io', 'mailtemp.info', 'lroid.com',
  'xkx.me', 'vomoto.com', 'instantemailaddress.com', 'instant-mail.de', 'tempinbox.com',
  'tempemail.net', 'tempemail.co', 'tempemailaddress.com', 'deadaddress.com', 'despam.it',
  'discard.email', 'discard.cf', 'discardmail.com', 'discardmail.de', 'one-time.email',
  '1secmail.com', '1secmail.net', '1secmail.org', 'esiix.com', 'wwjmp.com',
  'vjuum.com', 'laafd.com', 'txcct.com', 'kzccv.com', 'qiott.com', 'wuuvo.com', 'icznn.com'
]);

export function isDisposableEmailLocal(v) {
  if (typeof v !== 'string' || !v.includes('@')) return false;
  const domain = v.trim().toLowerCase().split('@').pop();
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return true;
  return [...DISPOSABLE_EMAIL_DOMAINS].some((blocked) => domain.endsWith('.' + blocked));
}

const crypto = require('node:crypto');
const router = require('express').Router();
const User = require('./models/user');
const { HttpError } = require('./errors');

const SESSION_COOKIE = 'jobapp_session';
const STATE_COOKIE = 'jobapp_oauth_state';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

function config() {
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_CALLBACK_URL, SESSION_SECRET } = process.env;
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET || !GITHUB_CALLBACK_URL || !SESSION_SECRET ||
      SESSION_SECRET.length < 32 || SESSION_SECRET.startsWith('REPLACE_')) {
    throw new HttpError(503, 'GitHub OAuth is not configured');
  }
  return {
    clientId: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
    callbackUrl: GITHUB_CALLBACK_URL,
    secret: SESSION_SECRET
  };
}

function cookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' };
}

function readCookie(req, name) {
  const entry = (req.headers.cookie || '')
    .split(';')
    .map(item => item.trim())
    .find(item => item.startsWith(`${name}=`));
  return entry ? entry.slice(name.length + 1) : undefined;
}

function sign(value, secret) {
  const payload = Buffer.from(value).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function unsign(token, secret) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payload, signature] = parts;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  let provided;
  try {
    provided = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) return null;

  try {
    return Buffer.from(payload, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

router.get('/github', (req, res) => {
  const { clientId, callbackUrl, secret } = config();
  const state = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

  res.cookie(
    STATE_COOKIE,
    sign(JSON.stringify({ state, verifier, expiresAt: Date.now() + 10 * 60 * 1000 }), secret),
    { ...cookieOptions(), maxAge: 10 * 60 * 1000, path: '/auth/github/callback' }
  );

  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', callbackUrl);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('scope', 'read:user');
  res.redirect(url.toString());
});

router.get('/github/callback', async (req, res) => {
  const { clientId, clientSecret, callbackUrl, secret } = config();
  let loginAttempt;

  try {
    loginAttempt = JSON.parse(unsign(readCookie(req, STATE_COOKIE), secret));
  } catch {
    loginAttempt = null;
  }

  res.clearCookie(STATE_COOKIE, { ...cookieOptions(), path: '/auth/github/callback' });

  if (!loginAttempt || loginAttempt.expiresAt <= Date.now() ||
      typeof loginAttempt.verifier !== 'string' ||
      typeof req.query.state !== 'string' || loginAttempt.state !== req.query.state ||
      typeof req.query.code !== 'string') {
    throw new HttpError(400, 'Invalid or expired OAuth callback');
  }

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: req.query.code,
      redirect_uri: callbackUrl,
      code_verifier: loginAttempt.verifier
    })
  });

  if (!tokenResponse.ok) throw new HttpError(502, 'GitHub token exchange failed');
  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) throw new HttpError(502, 'GitHub token exchange failed');

  const profileResponse = await fetch('https://api.github.com/user', {
    headers: {
      authorization: `Bearer ${tokenData.access_token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'job-application-tracker'
    }
  });

  if (!profileResponse.ok) throw new HttpError(502, 'GitHub profile lookup failed');
  const profile = await profileResponse.json();
  if (!profile.id || !profile.login) throw new HttpError(502, 'GitHub returned an incomplete profile');

  const user = await User.findOneAndUpdate(
    { githubId: String(profile.id) },
    {
      $set: {
        login: profile.login,
        displayName: profile.name || profile.login,
        avatarUrl: profile.avatar_url || ''
      }
    },
    { upsert: true, new: true, runValidators: true }
  );

  const session = sign(
    JSON.stringify({
      userId: user.id,
      version: user.sessionVersion || 0,
      expiresAt: Date.now() + SESSION_MS
    }),
    secret
  );

  res.cookie(SESSION_COOKIE, session, { ...cookieOptions(), maxAge: SESSION_MS, path: '/' });
  res.redirect('/api-docs/');
});

async function requireAuth(req, _res, next) {
  let secret;
  try {
    secret = config().secret;
  } catch (error) {
    return next(error);
  }

  const payload = unsign(readCookie(req, SESSION_COOKIE), secret);
  let session;
  try {
    session = JSON.parse(payload);
  } catch {
    return next(new HttpError(401, 'Sign in with GitHub first'));
  }

  if (!session || !/^[0-9a-fA-F]{24}$/.test(session.userId) ||
      !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) {
    return next(new HttpError(401, 'Sign in with GitHub first'));
  }

  const user = await User.findById(session.userId);
  if (!user || session.version !== (user.sessionVersion || 0)) {
    return next(new HttpError(401, 'Sign in with GitHub first'));
  }

  req.user = user;
  next();
}

router.get('/me', requireAuth, (req, res) => {
  res.json({
    id: req.user.id,
    login: req.user.login,
    displayName: req.user.displayName,
    avatarUrl: req.user.avatarUrl
  });
});

router.post('/logout', requireAuth, async (req, res) => {
  req.user.sessionVersion = (req.user.sessionVersion || 0) + 1;
  await req.user.save();
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions(), path: '/' });
  res.status(204).send();
});

module.exports = { router, requireAuth, config };
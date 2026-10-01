const fs = require('node:fs');
const path = require('node:path');

const file = path.resolve(process.argv[2] || path.join(__dirname, '..', 'openapi.json'));
const spec = JSON.parse(fs.readFileSync(file, 'utf8'));

spec.info.version = '2.0.0';
spec.info.description = 'Job applications and interviews belonging to the signed-in GitHub user. First GitHub sign-in creates a user account. GitHub OAuth uses PKCE, and sessions use a signed HttpOnly cookie. Logout invalidates prior sessions. Open /auth/github in this browser, then return to Swagger UI to test protected routes. Existing Week 03 documents without an owner are not shown to signed-in users.';

spec.components.securitySchemes = {
  sessionCookie: {
    type: 'apiKey',
    in: 'cookie',
    name: 'jobapp_session',
    description: 'Set automatically after GitHub OAuth login at /auth/github. Swagger UI sends it on same-origin requests.'
  }
};

spec.components.responses.Unauthorized = {
  description: 'Sign in with GitHub first',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/Error' },
      example: { error: 'Sign in with GitHub first' }
    }
  }
};

spec.components.schemas.User = {
  type: 'object',
  required: ['id', 'login', 'displayName', 'avatarUrl'],
  properties: {
    id: { type: 'string', example: '507f1f77bcf86cd799439011' },
    login: { type: 'string', example: 'octocat' },
    displayName: { type: 'string', example: 'The Octocat' },
    avatarUrl: { type: 'string', description: 'GitHub avatar URL, or an empty string if unavailable' }
  }
};

spec.security = [{ sessionCookie: [] }];
spec.paths['/health'].get.security = [];

spec.paths['/auth/github'] = {
  get: {
    tags: ['Authentication'],
    summary: 'Start GitHub login or account creation',
    description: 'Open this URL in a browser. GitHub asks the user to authorize the app. The first successful login creates a user document. Do not use Swagger Execute for this browser redirect.',
    security: [],
    responses: {
      302: { description: 'Redirect to GitHub' },
      503: { description: 'OAuth configuration is missing' }
    }
  }
};

spec.paths['/auth/github/callback'] = {
  get: {
    tags: ['Authentication'],
    summary: 'GitHub OAuth callback',
    description: 'GitHub redirects here with a code and state. The API exchanges the code, creates or updates the user, sets an HttpOnly session cookie, and redirects to Swagger UI.',
    security: [],
    parameters: [
      { name: 'code', in: 'query', required: true, schema: { type: 'string' } },
      { name: 'state', in: 'query', required: true, schema: { type: 'string' } }
    ],
    responses: {
      302: { description: 'Signed in; redirect to API documentation' },
      400: { $ref: '#/components/responses/ValidationError' },
      502: { description: 'GitHub login failed' }
    }
  }
};

spec.paths['/auth/me'] = {
  get: {
    tags: ['Authentication'],
    summary: 'View the signed-in user',
    responses: {
      200: {
        description: 'Current user',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } }
      },
      401: { $ref: '#/components/responses/Unauthorized' }
    }
  }
};

spec.paths['/auth/logout'] = {
  post: {
    tags: ['Authentication'],
    summary: 'Log out',
    description: 'Invalidates the signed-in account sessions and clears the browser cookie.',
    responses: {
      204: { description: 'Logged out; no response body' },
      401: { $ref: '#/components/responses/Unauthorized' }
    }
  }
};

spec.tags = [
  { name: 'Authentication', description: 'GitHub OAuth login, current user, and logout' },
  ...spec.tags.filter(tag => tag.name !== 'Authentication')
];

for (const resource of ['applications', 'interviews']) {
  for (const route of [`/api/${resource}`, `/api/${resource}/{id}`]) {
    for (const operation of Object.values(spec.paths[route])) {
      if (!operation || !operation.responses) continue;

      operation.responses[401] = { $ref: '#/components/responses/Unauthorized' };
      const ownerNote = 'Only the signed-in user’s records are visible and editable.';
      if (!operation.description?.includes(ownerNote)) {
        operation.description = [operation.description, ownerNote].filter(Boolean).join(' ');
      }
    }
  }
}

for (const name of ['Application', 'Interview']) {
  const schema = spec.components.schemas[name];
  if (!schema.required.includes('ownerId')) schema.required.push('ownerId');
  schema.properties.ownerId = {
    type: 'string',
    description: 'MongoDB ID of the signed-in owner',
    example: '507f1f77bcf86cd799439011'
  };
}

fs.writeFileSync(file, JSON.stringify(spec, null, 2) + '\n');
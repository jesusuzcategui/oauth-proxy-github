// src/routes/authRoutes.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

export default (prisma: PrismaClient) => {
  const router = Router();
  const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
  const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
  const JWT_SECRET = process.env.JWT_SECRET;

  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET || !JWT_SECRET) {
    throw new Error('Environment variables GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and JWT_SECRET are required.');
  }

  // GET /auth/github: Iniciar el flujo de autenticación
  router.get('/github', (req, res) => {
    const { wordpress_site } = req.query;
    if (!wordpress_site) {
      return res.status(400).send('wordpress_site query parameter is required.');
    }
    const state = crypto.randomBytes(16).toString('hex');
    const redirectUri = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${process.env.REDIRECT_URI}&state=${state}&scope=repo,read:user,read:org&allow_signup=false`;
    res.cookie('state', state, { httpOnly: true, maxAge: 3600000 });
    res.cookie('wordpress_site', wordpress_site, { httpOnly: true, maxAge: 3600000 });
    res.redirect(redirectUri);
  });

  // GET /auth/github/callback: Manejar el callback de GitHub
  router.get('/github/callback', async (req, res) => {
    const { code, state } = req.query;

    // Ensure the required query parameters exist
    if (!code || !state) {
      return res.status(400).send('Missing "code" or "state" query parameters.');
    }

    const { wordpress_site, state: stateCookie } = req.cookies;

    // Validate state to prevent CSRF and ensure the wordpress_site cookie exists
    if (!stateCookie || state !== stateCookie || !wordpress_site) {
      return res.status(401).send('Invalid or missing state parameter or session data.');
    }

    try {
      // Exchange the code for an access token
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code
        })
      });

      // Handle non-2xx HTTP responses
      if (!response.ok) {
        const errorData = await response.json();
        console.error('GitHub API error:', errorData);
        // Provide a clearer error to the user
        return res.status(401).send('Authentication failed with GitHub API.');
      }

      const data = await response.json();
      console.log('GitHub response data:', data);

      const githubToken = data.access_token;

      if (!githubToken) {
        throw new Error('Failed to get GitHub access token.');
      }

      // Get the authenticated user's info
      const userResponse = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${githubToken}` }
      });
      const githubUser = await userResponse.json();

      // Store the session in the database
      const session = await prisma.userSession.create({
        data: {
          githubToken,
          githubUser,
          wordpressSite: wordpress_site,
          expiresAt: new Date(Date.now() + 3600000) // Expires in 1 hour
        }
      });

      // Redirect back to WordPress with the session token
      const redirectUrl = `${wordpress_site}?session_token=${session.id}`;
      res.redirect(redirectUrl);

    } catch (error) {
      console.error(error);
      res.status(500).send('Authentication failed due to a server error.');
    }
  });

  return router;
};
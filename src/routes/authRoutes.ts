// src/routes/authRoutes.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';
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
  router.get('/github', (req: Request, res: Response) => {
    const { wordpress_site } = req.query;
    if (!wordpress_site || typeof wordpress_site !== 'string') {
      return res.status(400).send('wordpress_site query parameter is required and must be a string.');
    }
    const state = crypto.randomBytes(16).toString('hex');
    const redirectUri = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${process.env.REDIRECT_URI}&state=${state}&scope=repo,admin:org,read:user&allow_signup=false`;
    
    res.cookie('state', state, { httpOnly: true, maxAge: 3600000 });
    res.cookie('wordpress_site', wordpress_site, { httpOnly: true, maxAge: 3600000 });
    
    res.redirect(redirectUri);
  });

  // GET /auth/github/callback: Manejar el callback de GitHub
  router.get('/github/callback', async (req: Request, res: Response) => {
    const { code, state } = req.query;
    const { wordpress_site, state: stateCookie } = req.cookies;
    
    if (!state || !code || !stateCookie || state !== stateCookie || !wordpress_site) {
      return res.status(401).send('Invalid or missing state parameter or session data.');
    }

    try {
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
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('GitHub API error:', errorData);
        return res.status(401).send('Authentication failed with GitHub API.');
      }
    
      const data = await response.json();
      const githubToken = data.access_token;
      
      if (!githubToken) {
        throw new Error('Failed to get GitHub access token.');
      }
      
      const userResponse = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${githubToken}` }
      });
      const githubUser = await userResponse.json();

      const session = await prisma.userSession.create({
        data: {
          githubToken,
          githubUser,
          wordpressSite: wordpress_site,
          expiresAt: new Date(Date.now() + 3600000)
        }
      });

      let redirectUrl = wordpress_site;
      if (redirectUrl.includes('?')) {
        redirectUrl += `&session_token=${session.id}`;
      } else {
        redirectUrl += `?session_token=${session.id}`;
      }
      
      res.clearCookie('state');
      res.clearCookie('wordpress_site');

      res.redirect(redirectUrl);

    } catch (error) {
      console.error(error);
      res.status(500).send('Authentication failed due to a server error.');
    }
  });

  return router;
};
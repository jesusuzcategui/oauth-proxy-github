// src/routes/authRoutes.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';
import { App } from 'octokit';
import { OAuthApp } from '@octokit/oauth-app';
import { Octokit } from '@octokit/rest';

export default (prisma: PrismaClient) => {
  const router = Router();
  const GITHUB_APP_ID = process.env.GITHUB_APP_ID;
  const GITHUB_APP_PRIVATE_KEY = process.env.GITHUB_APP_PRIVATE_KEY;
  const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
  const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

  if (!GITHUB_APP_ID || !GITHUB_APP_PRIVATE_KEY || !GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    throw new Error('Environment variables GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_CLIENT_ID, and GITHUB_CLIENT_SECRET are required.');
  }

  const appId = parseInt(GITHUB_APP_ID, 10);
  
  const app = new App({
    appId: appId,
    privateKey: GITHUB_APP_PRIVATE_KEY,
  });

  const oauthApp = new OAuthApp({
    clientId: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
  });

  // Endpoint de inicio para la instalación de la aplicación
  router.get('/github/install', (req: Request, res: Response) => {
    const { wordpress_site } = req.query;
    if (!wordpress_site || typeof wordpress_site !== 'string') {
      return res.status(400).send('wordpress_site query parameter is required and must be a string.');
    }
    
    // Obtener el protocolo dinámicamente
    const protocol = req.protocol === 'http' ? 'http' : 'https';
    const redirectUri = `${protocol}://${req.get('host')}/auth/github/callback`;

    const installationUrl = `https://github.com/apps/wordpress-theme-versions/installations/new?state=${wordpress_site}&redirect_uri=${redirectUri}`;
    res.redirect(installationUrl);
  });

  // Callback de instalación
  router.get('/github/callback', async (req: Request, res: Response) => {
    const { installation_id, state, code } = req.query;
    const wordpress_site = state as string;

    if (!installation_id || !wordpress_site || !code) {
      return res.status(400).send('Missing installation_id, state, or code parameter.');
    }

    try {
      const installationIdInt = parseInt(installation_id as string, 10);

      // Obtener el protocolo dinámicamente
      const protocol = req.protocol === 'http' ? 'http' : 'https';
      const redirectUri = `${protocol}://${req.get('host')}/auth/github/callback`;
      
      const { authentication } = await oauthApp.createToken({
        code: code as string,
        redirectUrl: redirectUri,
      });
      
      const userToken = authentication.token;

      const userOctokit = new Octokit({ auth: userToken });
      const { data: userData } = await userOctokit.rest.users.getAuthenticated();
      
      const session = await prisma.userSession.create({
        data: {
          installationId: installationIdInt,
          githubUser: userData,
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
      
      res.redirect(redirectUrl);

    } catch (error) {
      console.error(error);
      res.status(500).send('Authentication failed due to a server error.');
    }
  });

  return router;
};
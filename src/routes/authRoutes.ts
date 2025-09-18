// src/routes/authRoutes.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';
import { App } from 'octokit';

export default (prisma: PrismaClient) => {
  const router = Router();
  const GITHUB_APP_ID = process.env.GITHUB_APP_ID;
  const GITHUB_APP_PRIVATE_KEY = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!GITHUB_APP_ID || !GITHUB_APP_PRIVATE_KEY) {
    throw new Error('Environment variables GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are required.');
  }

  const appId = parseInt(GITHUB_APP_ID, 10);
  
  const app = new App({
    appId: appId,
    privateKey: GITHUB_APP_PRIVATE_KEY,
  });

  // Endpoint de inicio para la instalación de la aplicación
  router.get('/github/install', (req: Request, res: Response) => {
    const { wordpress_site } = req.query;
    if (!wordpress_site || typeof wordpress_site !== 'string') {
      return res.status(400).send('wordpress_site query parameter is required and must be a string.');
    }
    
    const redirectUri = `${req.protocol}://${req.get('host')}/auth/github/callback`;
    const installationUrl = `https://github.com/apps/wordpress-theme-versions/installations/new?state=${wordpress_site}&redirect_uri=${redirectUri}`;
    res.redirect(installationUrl);
  });

  // Callback de instalación
  router.get('/github/callback', async (req: Request, res: Response) => {
    const { installation_id, state } = req.query;
    const wordpress_site = state as string;

    if (!installation_id || !wordpress_site) {
      return res.status(400).send('Missing installation_id or state parameter.');
    }

    try {
      const installationIdInt = parseInt(installation_id as string, 10);
      
      const session = await prisma.userSession.create({
        data: {
          installationId: installationIdInt,
          githubUser: {},
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
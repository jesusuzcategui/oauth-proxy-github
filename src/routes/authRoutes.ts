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
  // Nueva variable de entorno
  const REDIRECT_URI = process.env.REDIRECT_URI; 

  if (!GITHUB_APP_ID || !GITHUB_APP_PRIVATE_KEY || !GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET || !REDIRECT_URI) {
    throw new Error('All required environment variables must be set.');
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

    // Ahora usa la variable de entorno para la URL de redirección
    const installationUrl = `https://github.com/apps/wordpress-theme-versions/installations/new?state=${wordpress_site}&redirect_uri=${REDIRECT_URI}`;
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

      const { authentication } = await oauthApp.createToken({
        code: code as string,
        redirectUrl: REDIRECT_URI, // Usa la variable de entorno aquí también
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
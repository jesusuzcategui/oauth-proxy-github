// src/routes/authRoutes.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';
import { App } from 'octokit';
import { Octokit } from '@octokit/rest';

export default (prisma: PrismaClient) => {
  const router = Router();
  const GITHUB_APP_ID = process.env.GITHUB_APP_ID;
  const GITHUB_APP_PRIVATE_KEY = process.env.GITHUB_APP_PRIVATE_KEY;
  const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
  const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
  const REDIRECT_URI = process.env.REDIRECT_URI;

  if (!GITHUB_APP_ID || !GITHUB_APP_PRIVATE_KEY || !GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET || !REDIRECT_URI) {
    throw new Error('All required environment variables must be set.');
  }

  const appId = parseInt(GITHUB_APP_ID, 10);

  const app = new App({
    appId: appId,
    privateKey: GITHUB_APP_PRIVATE_KEY,
  });

  // GET /auth/github/install - Sin cambios
  router.get('/github/install', (req: Request, res: Response) => {
    const { wordpress_site } = req.query;
    if (!wordpress_site || typeof wordpress_site !== 'string') {
      return res.status(400).send('wordpress_site query parameter is required.');
    }

    const installationUrl = `https://github.com/apps/wordpress-theme-versions/installations/new?state=${wordpress_site}`;
    res.redirect(installationUrl);
  });

  router.get('/github/callback', async (req: Request, res: Response) => {
    const { installation_id, state } = req.query;
    const wordpress_site = state as string;

    console.log('Callback received:', { installation_id, state });

    if (!installation_id || !wordpress_site) {
      return res.status(400).send('Missing installation_id or state parameter.');
    }

    try {
      const installationIdInt = parseInt(installation_id as string, 10);

      // ✅ Cambiar esta línea - obtener instalación específica
      const { data: installation } = await app.octokit.rest.apps.getInstallation({
        installation_id: installationIdInt
      });

      console.log('Installation data:', installation);

      // ✅ Validar que account existe
      if (!installation.account) {
        return res.status(400).send('No account information found in installation.');
      }

      const account = installation.account;

      // ✅ Crear objeto con propiedades que existen
      const githubUserData = JSON.parse(JSON.stringify(installation.account));

      console.log('GitHub user data:', githubUserData);

      const session = await prisma.userSession.create({
        data: {
          installationId: installationIdInt,
          githubUser: githubUserData,
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

      console.log('Redirecting to:', redirectUrl);
      res.redirect(redirectUrl);

    } catch (error) {
      console.error('Installation Error:', error);
      res.status(500).send('Installation failed due to a server error.');
    }
  });

  return router;
};
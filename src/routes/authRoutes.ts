// src/routes/authRoutes.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';
import { App } from 'octokit';

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

  // Endpoint de inicio para la instalación de la aplicación
  router.get('/github/install', (req: Request, res: Response) => {
    const { wordpress_site } = req.query;
    if (!wordpress_site || typeof wordpress_site !== 'string') {
      return res.status(400).send('wordpress_site query parameter is required and must be a string.');
    }
    
    const installationUrl = `https://github.com/apps/wordpress-theme-versions/installations/new?state=${wordpress_site}&redirect_uri=${REDIRECT_URI}`;
    res.redirect(installationUrl);
  });

  // Callback de instalación - CORREGIDO con manejo de tipos
  router.get('/github/callback', async (req: Request, res: Response) => {
    const { installation_id, state } = req.query;
    
    console.log('Callback received:', { installation_id, state });

    if (!installation_id) {
      return res.status(400).send('Missing installation_id parameter.');
    }

    try {
      const installationIdInt = parseInt(installation_id as string, 10);
      
      const { data: installation } = await app.octokit.rest.apps.getInstallation({
        installation_id: installationIdInt
      });
      
      if (!installation.account) {
        return res.status(400).send('No account information found in installation.');
      }

      // Type casting seguro para evitar errores de TypeScript
      const account = installation.account as any;
      const githubUserData = {
        id: account.id || 0,
        login: account.login || 'unknown',
        avatar_url: account.avatar_url || '',
        html_url: account.html_url || '',
        type: account.type || 'User',
        node_id: account.node_id || '',
        url: account.url || '',
        name: account.name || account.login || 'Unknown User',
        email: account.email || null,
        gists_url: account.gists_url || '',
        repos_url: account.repos_url || '',
        events_url: account.events_url || '',
        site_admin: account.site_admin || false,
        gravatar_id: account.gravatar_id || '',
        starred_url: account.starred_url || '',
        followers_url: account.followers_url || '',
        following_url: account.following_url || '',
        user_view_type: account.user_view_type || 'public',
        organizations_url: account.organizations_url || '',
        subscriptions_url: account.subscriptions_url || '',
        received_events_url: account.received_events_url || ''
      };
      
      // Si no hay state (instalación directa desde GitHub)
      if (!state) {
        console.log('Direct installation from GitHub for:', account.login);
        
        res.send(`
          <html>
            <head>
              <title>Instalación Exitosa</title>
              <style>
                body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
                .success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 15px; border-radius: 5px; }
              </style>
            </head>
            <body>
              <div class="success">
                <h2>¡Instalación Exitosa!</h2>
                <p>La aplicación <strong>WordPress Theme Versions</strong> se instaló correctamente en <strong>${account.login}</strong>.</p>
                <p>Ahora puedes ir a tu WordPress y conectar con GitHub para usar los repositorios de esta organización.</p>
                <p><a href="https://github.com/settings/installations" target="_blank">Gestionar instalaciones de GitHub</a></p>
              </div>
            </body>
          </html>
        `);
        return;
      }

      // Si hay state (instalación desde WordPress)
      const wordpress_site = state as string;
      
      const session = await prisma.userSession.create({
        data: {
          installationId: installationIdInt,
          githubUser: githubUserData as any, // Type casting para Prisma JSON
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
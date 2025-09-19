// src/routes/apiRoutes.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';
import type { UserSession } from '@prisma/client';

export default (prisma: PrismaClient) => {
  const router = Router();

  const githubApiProxy = async (req: Request, res: Response, apiPath: string) => {
    try {
      const githubToken = req.user?.githubToken;
      if (!githubToken) {
        return res.status(401).send('Unauthorized: GitHub token not available.');
      }

      const response = await fetch(`https://api.github.com/${apiPath}`, {
        headers: { 
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      });
      
      if (!response.ok) {
        return res.status(response.status).json(await response.json());
      }
      
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error(error);
      res.status(500).send('Failed to fetch from GitHub API.');
    }
  };

  // POST /api/user/validate
  router.post('/user/validate', async (req: Request, res: Response) => {
    try {
      const { session_token } = req.body;
      if (!session_token) {
        return res.status(400).send('session_token is required.');
      }
      const session = await prisma.userSession.findUnique({
        where: { id: session_token as string }
      });
      if (!session || session.expiresAt < new Date()) {
        return res.status(401).send('Invalid or expired session.');
      }
      res.json({ valid: true, user: session.githubUser });
    } catch (error) {
      console.error(error);
      res.status(500).send('Error validating session.');
    }
  });

  // GET /api/github/user - Use the stored user info
  router.get('/github/user', (req: Request, res: Response) => {
    const user = req.user?.githubUser;
    if (!user) {
      return res.status(404).send('User not found in session.');
    }
    res.json(user);
  });
  
  // GET /api/github/orgs - CORREGIDO: Manejo seguro de tipos
  router.get('/github/orgs', (req: Request, res: Response) => {
    try {
      // Acceder directamente a la sesión para evitar problemas de tipos
      const session = (req as any).user;
      if (!session || !session.githubUser) {
        return res.status(404).send('User not found in session.');
      }
      
      const user = session.githubUser as any;
      console.log('User data from session:', user);
      
      // Crear array con los datos del usuario, validando cada propiedad
      const accounts = [{
        id: user.id || 0,
        login: user.login || 'unknown',
        type: user.type || 'User',
        avatar_url: user.avatar_url || '',
        html_url: user.html_url || '',
        name: user.name || user.login || 'Unknown User',
        node_id: user.node_id || ''
      }];
      
      console.log('Returning accounts:', accounts);
      res.json(accounts);
    } catch (error) {
      console.error('Error fetching organizations:', error);
      res.status(500).send('Failed to fetch organizations.');
    }
  });

  // GET /api/github/repos/:owner - CORREGIDO para GitHub Apps
  router.get('/github/repos/:owner', async (req: Request, res: Response) => {
    try {
      const { owner } = req.params;
      const githubToken = req.user?.githubToken;
      
      if (!githubToken) {
        return res.status(401).send('Unauthorized: GitHub token not available.');
      }

      // Para GitHub Apps, obtenemos los repositorios de la instalación
      const response = await fetch(`https://api.github.com/installation/repositories`, {
        headers: { 
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        return res.status(response.status).json(errorData);
      }
      
      const data = await response.json();
      
      // Filtrar repositorios por el owner solicitado
      const filteredRepos = data.repositories.filter((repo: any) => 
        repo.owner.login.toLowerCase() === owner.toLowerCase()
      );
      
      res.json(filteredRepos);
    } catch (error) {
      console.error('Error fetching repositories:', error);
      res.status(500).send('Failed to fetch repositories.');
    }
  });

  // GET /api/github/branches/:owner/:repo
  router.get('/github/branches/:owner/:repo', (req: Request, res: Response) => {
    githubApiProxy(req, res, `repos/${req.params.owner}/${req.params.repo}/branches`);
  });

  // POST /api/github/detect-type/:owner/:repo
  router.post('/github/detect-type/:owner/:repo', async (req: Request, res: Response) => {
    try {
      const { owner, repo } = req.params;
      const githubToken = req.user?.githubToken;
      if (!githubToken) {
        return res.status(401).send('Unauthorized: GitHub token not available.');
      }
      
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents`, {
        headers: { 
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        return res.status(response.status).json(errorData);
      }
      
      const contents = await response.json();
      
      // Detectar si es theme o plugin
      const isTheme = contents.some((item: any) => 
        item.name === 'style.css' && item.type === 'file'
      );
      
      const isPlugin = contents.some((item: any) => 
        item.name.endsWith('.php') && item.name === `${repo}.php`
      );
      
      let type = 'other';
      if (isTheme) {
        type = 'theme';
      } else if (isPlugin) {
        type = 'plugin';
      } else {
        // Fallback: detectar por nombre del repositorio
        const repoName = repo.toLowerCase();
        if (repoName.includes('theme') || repoName.includes('tema')) {
          type = 'theme';
        } else {
          type = 'plugin'; // Default a plugin
        }
      }
      
      res.json({ type });
    } catch (error) {
      console.error('Error detecting repository type:', error);
      res.status(500).send('Failed to detect repository type.');
    }
  });

  return router;
};
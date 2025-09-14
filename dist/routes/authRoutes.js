// src/routes/authRoutes.ts
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
export default (prisma) => {
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
        const { wordpress_site } = req.cookies;
        // Validar el estado para prevenir CSRF
        if (state !== req.cookies.state) {
            return res.status(401).send('Invalid state parameter.');
        }
        try {
            // Intercambiar el código por un token de acceso
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
            const data = await response.json();
            const githubToken = data.access_token;
            if (!githubToken) {
                throw new Error('Failed to get GitHub access token.');
            }
            // Obtener la información del usuario de GitHub
            const userResponse = await fetch('https://api.github.com/user', {
                headers: { Authorization: `Bearer ${githubToken}` }
            });
            const githubUser = await userResponse.json();
            // Almacenar la sesión en la base de datos
            const session = await prisma.userSession.create({
                data: {
                    githubToken,
                    githubUser,
                    wordpressSite: wordpress_site,
                    expiresAt: new Date(Date.now() + 3600000) // Expira en 1 hora
                }
            });
            // Redirigir de vuelta al plugin de WordPress con un token de sesión
            const redirectUrl = `${wordpress_site}?session_token=${session.id}`;
            res.redirect(redirectUrl);
        }
        catch (error) {
            console.error(error);
            res.status(500).send('Authentication failed.');
        }
    });
    return router;
};

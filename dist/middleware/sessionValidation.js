import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const sessionValidation = async (req, res, next) => {
    const sessionToken = req.headers['authorization']?.split(' ')[1] || req.query.session_token;
    if (!sessionToken) {
        return res.status(401).send('Unauthorized: No session token provided.');
    }
    try {
        const session = await prisma.userSession.findUnique({
            where: { id: sessionToken }
        });
        if (!session || session.expiresAt < new Date()) {
            return res.status(401).send('Unauthorized: Invalid or expired session token.');
        }
        // Expande la sesión si es válida
        req.user = session;
        next();
    }
    catch (error) {
        console.error(error);
        res.status(500).send('Internal server error during session validation.');
    }
};
export default sessionValidation;

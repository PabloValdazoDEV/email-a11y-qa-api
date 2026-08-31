import { getPrisma } from "../prisma.js";
import { security } from "../config/security.js";
import { AppError } from "../utils/AppError.js";
import { publicUser, publicUserSelect } from "../utils/publicUser.js";
import { verifyAccessToken } from "../services/token.service.js";

async function authenticate(req, next, { allowExpiredPassword }) {
  const token = req.cookies[security.accessCookieName];
  if (!token) {
    next(new AppError(401, "Debes iniciar sesión"));
    return;
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    next(new AppError(401, "La sesión no es válida o ha caducado"));
    return;
  }

  const user = await getPrisma().user.findUnique({
    where: { id: payload.sub },
    select: publicUserSelect,
  });

  if (!user || !user.isActive || !user.emailVerifiedAt) {
    next(new AppError(401, "La cuenta no está disponible"));
    return;
  }

  req.user = publicUser(user);
  if (req.user.passwordChangeRequired && !allowExpiredPassword) {
    next(new AppError(
      403,
      "Debes cambiar tu contraseña para continuar",
      { code: "PASSWORD_CHANGE_REQUIRED" },
    ));
    return;
  }
  req.auth = { userId: user.id, tokenId: payload.jti };
  next();
}

export function authMiddleware(req, _res, next) {
  return authenticate(req, next, { allowExpiredPassword: false });
}

export function authMiddlewareAllowExpired(req, _res, next) {
  return authenticate(req, next, { allowExpiredPassword: true });
}

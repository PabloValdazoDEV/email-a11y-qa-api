import {
  accessCookieOptions,
  clearCookieOptions,
  refreshCookieOptions,
  security,
} from "../config/security.js";
import {
  changePassword,
  loginUser,
  logoutUser,
  refreshUserSession,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  updateProfile,
  verifyEmail,
} from "../services/auth.service.js";

function clearAuthCookies(res) {
  const options = clearCookieOptions();
  res.clearCookie(security.accessCookieName, options);
  res.clearCookie(security.refreshCookieName, options);
}

export async function login(req, res) {
  const result = await loginUser(req.body);
  res.cookie(
    security.accessCookieName,
    result.accessToken,
    accessCookieOptions({ persistent: result.rememberMe }),
  );
  if (result.refreshToken) {
    res.cookie(security.refreshCookieName, result.refreshToken, refreshCookieOptions());
  } else {
    res.clearCookie(security.refreshCookieName, clearCookieOptions());
  }
  res.json({
    message: result.user.passwordChangeRequired
      ? "Debes cambiar tu contraseña para continuar"
      : "Sesión iniciada",
    user: result.user,
  });
}

export async function refresh(req, res) {
  try {
    const result = await refreshUserSession(req.cookies[security.refreshCookieName]);
    res.cookie(
      security.accessCookieName,
      result.accessToken,
      accessCookieOptions({ persistent: true }),
    );
    res.cookie(security.refreshCookieName, result.refreshToken, refreshCookieOptions());
    res.json({ message: "Sesión renovada", user: result.user });
  } catch (error) {
    clearAuthCookies(res);
    throw error;
  }
}

export async function logout(req, res) {
  await logoutUser(req.cookies[security.refreshCookieName]);
  clearAuthCookies(res);
  res.json({ message: "Sesión cerrada" });
}

export function me(req, res) {
  res.json({ user: req.user });
}

export async function forgotPassword(req, res) {
  await requestPasswordReset(req.body.email);
  res.status(202).json({
    message: "Si la cuenta existe, se ha enviado un correo de recuperación.",
  });
}

export async function resetPasswordController(req, res) {
  await resetPassword(req.body);
  clearAuthCookies(res);
  res.json({ message: "Contraseña actualizada. Inicia sesión de nuevo." });
}

export async function verifyEmailController(req, res) {
  const user = await verifyEmail(req.body.token);
  res.json({ message: "Email verificado correctamente", user });
}

export async function resendVerificationController(req, res) {
  await resendVerification(req.body.email);
  res.status(202).json({
    message: "Si la cuenta existe y aún no está verificada, se ha enviado un correo.",
  });
}

export async function updateProfileController(req, res) {
  const result = await updateProfile(req.user.id, req.body);
  if (result.sessionRevoked) clearAuthCookies(res);
  res.json({
    message: result.sessionRevoked
      ? "Perfil actualizado. Verifica tu nuevo email e inicia sesión de nuevo."
      : "Perfil actualizado",
    ...result,
  });
}

export async function changePasswordController(req, res) {
  await changePassword(req.user.id, req.body);
  clearAuthCookies(res);
  res.json({ message: "Contraseña actualizada. Inicia sesión de nuevo." });
}

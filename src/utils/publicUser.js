import {
  isPasswordChangeRequired,
  passwordExpiresAt,
} from "../services/passwordPolicy.service.js";

export const publicUserSelect = Object.freeze({
  id: true,
  name: true,
  lastName: true,
  email: true,
  role: true,
  isActive: true,
  emailVerifiedAt: true,
  passwordChangedAt: true,
  createdAt: true,
  updatedAt: true,
});

export function publicUser(user) {
  const expiresAt = passwordExpiresAt(user.passwordChangedAt);
  return {
    id: user.id,
    name: user.name,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    emailVerifiedAt: user.emailVerifiedAt,
    passwordExpiresAt: expiresAt,
    passwordChangeRequired: isPasswordChangeRequired(user.passwordChangedAt),
    createdAt: user.createdAt,
    ...(user.updatedAt ? { updatedAt: user.updatedAt } : {}),
  };
}

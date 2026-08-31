import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 7;
export const PASSWORD_MAX_LENGTH = 64;
export const PASSWORD_REQUIREMENTS =
  "Debe tener entre minimo 7 caracteres e incluir mayúscula, minúscula, número y símbolo.";

export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export function isValidEmail(email) {
  return z.string().trim().max(254).email().safeParse(email).success;
}

export function isStrongPassword(password) {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

const emailSchema = z
  .string()
  .trim()
  .min(1, "El email es obligatorio")
  .max(254, "El email es demasiado largo")
  .email("Introduce un email válido")
  .transform(normalizeEmail);

const nameSchema = z.string().trim().min(1, "Este campo es obligatorio").max(80);
const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENTS)
  .max(PASSWORD_MAX_LENGTH, PASSWORD_REQUIREMENTS)
  .refine(isStrongPassword, PASSWORD_REQUIREMENTS);

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
    rememberMe: z.boolean().default(false),
  })
  .strict();

export const emailRequestSchema = z.object({ email: emailSchema }).strict();

export const tokenSchema = z
  .object({ token: z.string().regex(/^[a-f0-9]{64}$/i, "Token inválido") })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().regex(/^[a-f0-9]{64}$/i, "Token inválido"),
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .strict()
  .refine((data) => data.password === data.passwordConfirm, {
    message: "Las contraseñas no coinciden",
    path: ["passwordConfirm"],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
    newPassword: passwordSchema,
    newPasswordConfirm: z.string(),
  })
  .strict()
  .refine((data) => data.newPassword === data.newPasswordConfirm, {
    message: "Las contraseñas no coinciden",
    path: ["newPasswordConfirm"],
  });

export const updateProfileSchema = z
  .object({
    name: nameSchema,
    lastName: nameSchema,
    email: emailSchema,
    currentPassword: z.string().max(PASSWORD_MAX_LENGTH).optional(),
  })
  .strict();

export const usersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).default(""),
});

export const createUserSchema = z
  .object({
    name: nameSchema,
    lastName: nameSchema,
    email: emailSchema,
    role: z.enum(["USER", "ADMIN", "SUPERADMIN"]).default("USER"),
  })
  .strict();

export const updateUserSchema = z
  .object({
    role: z.enum(["USER", "ADMIN", "SUPERADMIN"]).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => data.role !== undefined || data.isActive !== undefined, {
    message: "Indica al menos un campo para actualizar",
  });

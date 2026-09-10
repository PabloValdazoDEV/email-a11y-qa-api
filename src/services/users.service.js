import { getPrisma } from "../prisma.js";
import { AppError } from "../utils/AppError.js";
import { publicUser, publicUserSelect } from "../utils/publicUser.js";
import {
  createInvitedAccount,
  deliverInvitationSafely,
  prepareInvitedAccount,
} from "./invitedAccount.service.js";

export async function createUserWithInvitation(currentActor, data) {
  if (currentActor.role !== "SUPERADMIN" && data.role === "SUPERADMIN") {
    throw new AppError(403, "Solo un SUPERADMIN puede crear ese rol");
  }

  const prisma = getPrisma();
  const prepared = await prepareInvitedAccount();

  const user = await prisma.$transaction(async (tx) => {
    return createInvitedAccount(tx, data, prepared);
  });

  const invitationSent = await deliverInvitationSafely(user, prepared.invitationToken);
  return { user: publicUser(user), invitationSent };
}

export async function listUsers({ page, limit, search }) {
  const prisma = getPrisma();
  const textFilter = (value) => ({
    contains: value,
    mode: "insensitive",
  });
  const where = search
    ? {
        OR: [
          { name: textFilter(search) },
          { lastName: textFilter(search) },
          { email: textFilter(search) },
        ],
      }
    : {};

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: publicUserSelect,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: users.map(publicUser),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export async function updateUserByAdmin(currentActor, targetId, changes) {
  const prisma = getPrisma();
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) throw new AppError(404, "Usuario no encontrado");

  if (
    currentActor.role !== "SUPERADMIN" &&
    (target.role === "SUPERADMIN" || changes.role === "SUPERADMIN")
  ) {
    throw new AppError(403, "Solo un SUPERADMIN puede gestionar ese rol");
  }

  if (targetId === currentActor.id) {
    if (changes.isActive === false) {
      throw new AppError(400, "No puedes desactivar tu propia cuenta");
    }
    if (changes.role && changes.role !== target.role) {
      throw new AppError(400, "No puedes cambiar tu propio rol");
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: targetId },
      data: changes,
      select: publicUserSelect,
    });
    if (changes.isActive === false || (changes.role && changes.role !== target.role)) {
      await tx.session.deleteMany({ where: { userId: targetId } });
    }
    return user;
  });

  return publicUser(updated);
}

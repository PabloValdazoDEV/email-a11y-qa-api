export const publicMemberSelect = Object.freeze({
  id: true,
  role: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      name: true,
      lastName: true,
      email: true,
      isActive: true,
      emailVerifiedAt: true,
    },
  },
});

function memberStatus(user) {
  if (!user.isActive) return "INACTIVE";
  if (!user.emailVerifiedAt) return "INVITATION_PENDING";
  return "ACTIVE";
}

export function publicMember(membership) {
  return {
    membershipId: membership.id,
    user: {
      id: membership.user.id,
      name: membership.user.name,
      lastName: membership.user.lastName,
      email: membership.user.email,
    },
    role: membership.role,
    status: memberStatus(membership.user),
    createdAt: membership.createdAt,
  };
}

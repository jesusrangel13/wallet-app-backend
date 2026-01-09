import { AppError } from '../middleware/errorHandler';
import { ErrorCodes } from '../constants/errorCodes';
import * as notificationService from './notification.service';
import { PaginationParams, calculatePagination, calculateSkip } from '../@types/pagination.types';
import { prisma } from '../utils/prisma';

// Helper function to transform group data with expense counts
function transformGroupWithCounts(group: any) {
  if (!group) return group;

  const pendingExpensesCount = group.sharedExpenses
    ? group.sharedExpenses.filter((expense: any) =>
        expense.participants.some((p: any) => !p.isPaid)
      ).length
    : 0;

  const { sharedExpenses, ...groupWithoutExpenses } = group;

  return {
    ...groupWithoutExpenses,
    _count: {
      expenses: group._count?.sharedExpenses || 0,
      pendingExpenses: pendingExpensesCount,
    },
  };
}

interface CreateGroupData {
  name: string;
  description?: string;
  coverImageUrl?: string;
  memberEmails?: string[];
  defaultSplitType?: 'EQUAL' | 'PERCENTAGE' | 'SHARES' | 'EXACT';
  memberSplitSettings?: Array<{
    email: string;
    percentage?: number;
    shares?: number;
    exactAmount?: number;
  }>;
}

interface UpdateGroupData {
  name?: string;
  description?: string;
  coverImageUrl?: string;
}

export const createGroup = async (userId: string, data: CreateGroupData) => {
  // Create the group with the creator as the first member
  const group = await prisma.group.create({
    data: {
      name: data.name,
      description: data.description,
      coverImageUrl: data.coverImageUrl,
      createdBy: userId,
      defaultSplitType: data.defaultSplitType || 'EQUAL',
      members: {
        create: {
          userId,
        },
      },
    },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      },
      defaultSplitSettings: true,
      _count: {
        select: {
          sharedExpenses: true,
        },
      },
      sharedExpenses: {
        select: {
          id: true,
          participants: {
            select: {
              isPaid: true,
            },
          },
        },
      },
    },
  });

  // Add additional members if provided
  const addedMembers: Array<{ email: string; success: boolean; error?: string }> = [];

  if (data.memberEmails && data.memberEmails.length > 0) {
    for (const email of data.memberEmails) {
      try {
        // Find user by email
        const memberUser = await prisma.user.findUnique({
          where: { email },
        });

        if (!memberUser) {
          addedMembers.push({ email, success: false, error: 'User not found' });
          continue;
        }

        // Check if user is already a member (shouldn't be, but just in case)
        if (memberUser.id === userId) {
          addedMembers.push({ email, success: false, error: 'Creator is already a member' });
          continue;
        }

        // Add member to group
        await prisma.groupMember.create({
          data: {
            groupId: group.id,
            userId: memberUser.id,
          },
        });

        // Get group name and creator name for notification
        const creator = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true },
        });

        // Notify the new member
        await notificationService.createNotification({
          userId: memberUser.id,
          type: 'GROUP_MEMBER_ADDED',
          title: 'Agregado a grupo',
          message: `${creator?.name} te agregó al grupo "${group.name}"`,
          data: {
            groupId: group.id,
            addedBy: userId,
          },
        });

        addedMembers.push({ email, success: true });
      } catch (error: any) {
        addedMembers.push({ email, success: false, error: error.message });
      }
    }
  }

  // Create split settings if provided and split type is not EQUAL
  if (
    data.memberSplitSettings &&
    data.memberSplitSettings.length > 0 &&
    data.defaultSplitType &&
    data.defaultSplitType !== 'EQUAL'
  ) {
    // Build a map of email -> userId for all group members
    const allMembers = await prisma.groupMember.findMany({
      where: { groupId: group.id },
      include: {
        user: {
          select: { id: true, email: true },
        },
      },
    });

    const emailToUserId = new Map<string, string>();
    allMembers.forEach((member) => {
      emailToUserId.set(member.user.email.toLowerCase(), member.userId);
    });

    // Create split defaults for each member with settings
    const splitDefaults = data.memberSplitSettings
      .map((setting) => {
        const memberUserId = emailToUserId.get(setting.email.toLowerCase());
        if (!memberUserId) return null;

        return {
          groupId: group.id,
          userId: memberUserId,
          percentage: setting.percentage,
          shares: setting.shares,
          exactAmount: setting.exactAmount,
        };
      })
      .filter((s) => s !== null);

    if (splitDefaults.length > 0) {
      await prisma.groupMemberSplitDefault.createMany({
        data: splitDefaults,
      });
    }
  }

  // Fetch the updated group with all members
  const updatedGroup = await prisma.group.findUnique({
    where: { id: group.id },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      },
      defaultSplitSettings: true,
      _count: {
        select: {
          sharedExpenses: true,
        },
      },
      sharedExpenses: {
        select: {
          id: true,
          participants: {
            select: {
              isPaid: true,
            },
          },
        },
      },
    },
  });

  const transformedGroup = transformGroupWithCounts(updatedGroup);

  return {
    ...transformedGroup,
    memberAddResults: addedMembers.length > 0 ? addedMembers : undefined,
  };
};

export const getGroups = async (userId: string, pagination?: PaginationParams) => {
  const where = {
    members: {
      some: {
        userId,
      },
    },
  };

  // If pagination is provided, use it
  if (pagination) {
    const page = pagination.page || 1;
    const limit = Math.min(pagination.limit || 50, 200); // Max 200 per page
    const skip = calculateSkip(page, limit);

    // Get total count for pagination metadata
    const total = await prisma.group.count({ where });

    // Get paginated groups
    const groups = await prisma.group.findMany({
      where,
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
        defaultSplitSettings: true,
        _count: {
          select: {
            sharedExpenses: true,
          },
        },
        sharedExpenses: {
          select: {
            id: true,
            participants: {
              select: {
                isPaid: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    const transformedGroups = groups.map(transformGroupWithCounts);

    return {
      data: transformedGroups,
      pagination: calculatePagination(page, limit, total),
    };
  }

  // No pagination - return all groups (backwards compatible)
  const groups = await prisma.group.findMany({
    where,
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      },
      defaultSplitSettings: true,
      _count: {
        select: {
          sharedExpenses: true,
        },
      },
      sharedExpenses: {
        select: {
          id: true,
          participants: {
            select: {
              isPaid: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return groups.map(transformGroupWithCounts);
};

export const getGroupById = async (userId: string, groupId: string) => {
  const group = await prisma.group.findFirst({
    where: {
      id: groupId,
      members: {
        some: {
          userId,
        },
      },
    },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      },
      defaultSplitSettings: true,
      sharedExpenses: {
        include: {
          paidBy: {
            select: {
              id: true,
              name: true,
              avatarUrl: true,
            },
          },
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  avatarUrl: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!group) {
    throw new AppError(ErrorCodes.GROUP_NOT_FOUND, 404);
  }

  return group;
};

export const updateGroup = async (
  userId: string,
  groupId: string,
  data: UpdateGroupData
) => {
  // Check if user is the creator
  const group = await prisma.group.findFirst({
    where: {
      id: groupId,
      createdBy: userId,
    },
  });

  if (!group) {
    throw new AppError(ErrorCodes.GROUP_UNAUTHORIZED, 403);
  }

  const updatedGroup = await prisma.group.update({
    where: { id: groupId },
    data,
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
  });

  return updatedGroup;
};

export const deleteGroup = async (userId: string, groupId: string) => {
  // Check if user is the creator
  const group = await prisma.group.findFirst({
    where: {
      id: groupId,
      createdBy: userId,
    },
  });

  if (!group) {
    throw new AppError(ErrorCodes.GROUP_UNAUTHORIZED, 403);
  }

  // Check if there are unsettled expenses
  const unsettledExpenses = await prisma.sharedExpense.count({
    where: { groupId },
  });

  if (unsettledExpenses > 0) {
    throw new AppError(ErrorCodes.BAD_REQUEST, 400);
  }

  await prisma.group.delete({
    where: { id: groupId },
  });

  return { message: 'Group deleted successfully' };
};

export const addMember = async (
  userId: string,
  groupId: string,
  memberEmail: string
) => {
  // Check if user is a member of the group
  const membership = await prisma.groupMember.findFirst({
    where: {
      groupId,
      userId,
    },
  });

  if (!membership) {
    throw new AppError(ErrorCodes.GROUP_NOT_MEMBER, 403);
  }

  // Find user by email
  const newMember = await prisma.user.findUnique({
    where: { email: memberEmail },
  });

  if (!newMember) {
    throw new AppError(ErrorCodes.AUTH_USER_NOT_FOUND, 404);
  }

  // Check if user is already a member
  const existingMembership = await prisma.groupMember.findFirst({
    where: {
      groupId,
      userId: newMember.id,
    },
  });

  if (existingMembership) {
    throw new AppError(ErrorCodes.GROUP_ALREADY_MEMBER, 400);
  }

  // Add member
  await prisma.groupMember.create({
    data: {
      groupId,
      userId: newMember.id,
    },
  });

  // Get group and user who added the member for notification
  const [group, addedByUser] = await Promise.all([
    prisma.group.findUnique({
      where: { id: groupId },
      select: { name: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    }),
  ]);

  // Notify the new member
  await notificationService.createNotification({
    userId: newMember.id,
    type: 'GROUP_MEMBER_ADDED',
    title: 'Agregado a grupo',
    message: `${addedByUser?.name} te agregó al grupo "${group?.name}"`,
    data: {
      groupId,
      addedBy: userId,
    },
  });

  return { message: 'Member added successfully', member: newMember };
};

export const removeMember = async (
  userId: string,
  groupId: string,
  memberId: string
) => {
  // Check if user is the creator
  const group = await prisma.group.findFirst({
    where: {
      id: groupId,
      createdBy: userId,
    },
  });

  if (!group && userId !== memberId) {
    throw new AppError(ErrorCodes.GROUP_UNAUTHORIZED, 403);
  }

  // Check if member has unsettled debts
  const unsettledDebts = await prisma.expenseParticipant.count({
    where: {
      userId: memberId,
      expense: {
        groupId,
      },
      amountOwed: {
        gt: 0,
      },
    },
  });

  if (unsettledDebts > 0) {
    throw new AppError(ErrorCodes.BAD_REQUEST, 400);
  }

  await prisma.groupMember.delete({
    where: {
      groupId_userId: {
        groupId,
        userId: memberId,
      },
    },
  });

  return { message: 'Member removed successfully' };
};

export const getGroupBalances = async (userId: string, groupId: string) => {
  // Verify user is a member
  const membership = await prisma.groupMember.findFirst({
    where: { groupId, userId },
  });

  if (!membership) {
    throw new AppError(ErrorCodes.GROUP_NOT_MEMBER, 403);
  }

  // Get all expenses in the group
  const expenses = await prisma.sharedExpense.findMany({
    where: { groupId },
    include: {
      paidBy: {
        select: { id: true, name: true },
      },
      participants: {
        include: {
          user: {
            select: { id: true, name: true },
          },
        },
      },
    },
  });

  // Calculate balances
  const balances: Record<string, number> = {};

  expenses.forEach((expense) => {
    // Payer gets positive balance
    balances[expense.paidByUserId] =
      (balances[expense.paidByUserId] || 0) + Number(expense.amount);

    // Participants get negative balance
    expense.participants.forEach((participant) => {
      balances[participant.userId] =
        (balances[participant.userId] || 0) - Number(participant.amountOwed);
    });
  });

  // Get payments
  const payments = await prisma.payment.findMany({
    where: { groupId },
  });

  payments.forEach((payment) => {
    balances[payment.fromUserId] =
      (balances[payment.fromUserId] || 0) - Number(payment.amount);
    balances[payment.toUserId] = (balances[payment.toUserId] || 0) + Number(payment.amount);
  });

  // Get user details for balances
  const userIds = Object.keys(balances);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, avatarUrl: true },
  });

  const balanceDetails = users.map((user) => ({
    user,
    balance: balances[user.id] || 0,
  }));

  return balanceDetails;
};

export const updateDefaultSplit = async (
  userId: string,
  groupId: string,
  data: {
    defaultSplitType: string;
    memberSplits: Array<{
      userId: string;
      percentage?: number;
      shares?: number;
      exactAmount?: number;
    }>;
  }
) => {
  // Check if user is a member of the group
  const membership = await prisma.groupMember.findFirst({
    where: {
      groupId,
      userId,
    },
  });

  if (!membership) {
    throw new AppError(ErrorCodes.GROUP_NOT_MEMBER, 403);
  }

  // Update group with default split type
  await prisma.group.update({
    where: { id: groupId },
    data: {
      defaultSplitType: data.defaultSplitType as any,
    },
  });

  // Delete existing split defaults
  await prisma.groupMemberSplitDefault.deleteMany({
    where: { groupId },
  });

  // Create new split defaults for each member
  if (data.memberSplits && data.memberSplits.length > 0) {
    await prisma.groupMemberSplitDefault.createMany({
      data: data.memberSplits.map((split) => ({
        groupId,
        userId: split.userId,
        percentage: split.percentage,
        shares: split.shares,
        exactAmount: split.exactAmount,
      })),
    });
  }

  // Return updated group with split settings
  const updatedGroup = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      },
      defaultSplitSettings: true,
      _count: {
        select: {
          sharedExpenses: true,
        },
      },
      sharedExpenses: {
        select: {
          id: true,
          participants: {
            select: {
              isPaid: true,
            },
          },
        },
      },
    },
  });

  return transformGroupWithCounts(updatedGroup);
};

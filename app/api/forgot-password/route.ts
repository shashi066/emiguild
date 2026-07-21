import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import {
  generateTemporaryPassword,
  getPasswordResetDate,
  hashPassword,
} from '@/lib/password-reset';
import { notifyUserPasswordReset } from '@/lib/notify';

const forgotPasswordSchema = z.object({
  email: z.string().trim().email().max(254),
});

function errorResponse(code: string, error: string, status: number) {
  return NextResponse.json({ success: false, code, error }, { status });
}

export async function POST(req: NextRequest) {
  let parsed: z.infer<typeof forgotPasswordSchema>;

  try {
    const result = forgotPasswordSchema.safeParse(await req.json());
    if (!result.success) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    parsed = result.data;
  } catch {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.email },
    select: {
      id: true,
      name: true,
      email: true,
      password: true,
      lastForgotPasswordDate: true,
    },
  });
  const resetDate = getPasswordResetDate();

  if (!user) {
    return errorResponse(
      'ACCOUNT_NOT_FOUND',
      'No EMI Guild account was found for that email address.',
      404
    );
  }

  if (user.lastForgotPasswordDate === resetDate) {
    return errorResponse(
      'DAILY_LIMIT',
      'A temporary password was already sent today. Check your email or contact the counter.',
      429
    );
  }

  const temporaryPassword = generateTemporaryPassword();
  const temporaryHash = await hashPassword(temporaryPassword);
  const claimed = await prisma.user.updateMany({
    where: {
      id: user.id,
      OR: [
        { lastForgotPasswordDate: null },
        { lastForgotPasswordDate: { not: resetDate } },
      ],
    },
    data: {
      password: temporaryHash,
      lastForgotPasswordDate: resetDate,
    },
  });

  if (claimed.count === 0) {
    return errorResponse(
      'DAILY_LIMIT',
      'A temporary password was already sent today. Check your email or contact the counter.',
      429
    );
  }

  const emailSent = await notifyUserPasswordReset({
    customerName: user.name,
    customerEmail: user.email,
    temporaryPassword,
  });

  if (!emailSent) {
    try {
      const restored = await prisma.user.updateMany({
        where: {
          id: user.id,
          password: temporaryHash,
          lastForgotPasswordDate: resetDate,
        },
        data: {
          password: user.password,
          lastForgotPasswordDate: user.lastForgotPasswordDate,
        },
      });

      if (restored.count !== 1) {
        throw new Error('Password rollback did not update the claimed account.');
      }
    } catch (error) {
      console.error('[forgot-password] Failed to restore password after email failure:', {
        userId: user.id,
        error,
      });

      return errorResponse(
        'RESET_RECOVERY_FAILED',
        'We could not complete the reset safely. Please contact the counter before trying again.',
        500
      );
    }

    return errorResponse(
      'EMAIL_FAILED',
      'We could not send the temporary password. Your password was not changed. Please try again.',
      503
    );
  }

  return NextResponse.json({
    success: true,
    emailSent: true,
    message: 'A temporary password was sent to your email address.',
  });
}

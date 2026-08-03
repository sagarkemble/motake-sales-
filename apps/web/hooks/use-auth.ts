import { useState } from "react";

import { supabaseBrowserClient } from "~/lib/supabase-browser-client";
import { trpc } from "~/trpc/client";

interface UseAuthParams {
  enabled?: boolean;
}

interface EmailAndPasswordCredentials {
  email: string;
  password: string;
}

interface SendOneTimePasscodeParams {
  email?: string;
  phone?: string;
}

interface VerifyOneTimePasscodeParams {
  email?: string;
  phone?: string;
  passcode: string;
}

export function useAuth({ enabled = true }: UseAuthParams = {}) {
  const utils = trpc.useUtils();

  const [oneTimePasscodeError, setOneTimePasscodeError] = useState<Error | null>(null);
  const [isSendingOneTimePasscode, setIsSendingOneTimePasscode] = useState(false);
  const [isVerifyingOneTimePasscode, setIsVerifyingOneTimePasscode] = useState(false);

  const signedInUserQuery = trpc.auth.me.useQuery(undefined, { enabled });
  const createSessionMutation = trpc.auth.createSession.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });

  async function signInWithEmailAndPassword({ email, password }: EmailAndPasswordCredentials) {
    const { data, error } = await supabaseBrowserClient.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.session) {
      throw new Error(error?.message ?? "Sign in failed. Check the email and password.");
    }
    return createSessionMutation.mutateAsync({ accessToken: data.session.access_token });
  }

  async function sendOneTimePasscode({ email, phone }: SendOneTimePasscodeParams) {
    setOneTimePasscodeError(null);
    setIsSendingOneTimePasscode(true);
    try {
      const { error } = email
        ? await supabaseBrowserClient.auth.signInWithOtp({
            email,
            options: { shouldCreateUser: false },
          })
        : await supabaseBrowserClient.auth.signInWithOtp({
            phone: phone!,
            options: { shouldCreateUser: false },
          });
      if (error) throw new Error(error.message);
    } catch (sendError) {
      setOneTimePasscodeError(sendError as Error);
      throw sendError;
    } finally {
      setIsSendingOneTimePasscode(false);
    }
  }

  async function verifyOneTimePasscode({ email, phone, passcode }: VerifyOneTimePasscodeParams) {
    setOneTimePasscodeError(null);
    setIsVerifyingOneTimePasscode(true);
    try {
      const { data, error } = email
        ? await supabaseBrowserClient.auth.verifyOtp({ email, token: passcode, type: "email" })
        : await supabaseBrowserClient.auth.verifyOtp({ phone: phone!, token: passcode, type: "sms" });
      if (error || !data.session) {
        throw new Error(error?.message ?? "Passcode is wrong or expired.");
      }
      return await createSessionMutation.mutateAsync({ accessToken: data.session.access_token });
    } catch (verifyError) {
      setOneTimePasscodeError(verifyError as Error);
      throw verifyError;
    } finally {
      setIsVerifyingOneTimePasscode(false);
    }
  }

  return {
    signedInUser: signedInUserQuery.data?.data ?? null,
    isSignedInUserLoading: signedInUserQuery.isLoading,
    isSignedInUserError: signedInUserQuery.isError,
    refetchSignedInUser: signedInUserQuery.refetch,

    signInWithEmailAndPassword,
    isCreatingSession: createSessionMutation.isPending,
    createSessionError: createSessionMutation.error ?? null,

    sendOneTimePasscode,
    isSendingOneTimePasscode,
    verifyOneTimePasscode,
    isVerifyingOneTimePasscode,
    oneTimePasscodeError,

    logout: logoutMutation.mutate,
    logoutAsync: logoutMutation.mutateAsync,
    isLoggingOut: logoutMutation.isPending,
    logoutError: logoutMutation.error ?? null,
  };
}

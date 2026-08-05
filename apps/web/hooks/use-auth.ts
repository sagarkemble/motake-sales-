import type { Session } from "@supabase/supabase-js";
import { useState } from "react";

import { supabaseBrowserClient } from "~/lib/supabase-browser-client";
import { trpc } from "~/trpc/client";

const MAGIC_LINK_SESSION_WAIT_MS = 5000;

interface UseAuthParams {
  enabled?: boolean;
}

interface EmailAndPasswordCredentials {
  email: string;
  password: string;
}

interface VerifyOneTimePasscodeParams {
  phone: string;
  passcode: string;
}

interface ConfirmPhoneNumberChangeParams {
  phone: string;
  passcode: string;
}

export function useAuth({ enabled = true }: UseAuthParams = {}) {
  const utils = trpc.useUtils();

  const [oneTimePasscodeError, setOneTimePasscodeError] = useState<Error | null>(null);
  const [isSendingOneTimePasscode, setIsSendingOneTimePasscode] = useState(false);
  const [isVerifyingOneTimePasscode, setIsVerifyingOneTimePasscode] = useState(false);

  const [magicLinkError, setMagicLinkError] = useState<Error | null>(null);
  const [isSendingMagicLink, setIsSendingMagicLink] = useState(false);
  const [isCompletingMagicLinkSignIn, setIsCompletingMagicLinkSignIn] = useState(false);

  const [phoneNumberChangeError, setPhoneNumberChangeError] = useState<Error | null>(null);
  const [isRequestingPhoneNumberChange, setIsRequestingPhoneNumberChange] = useState(false);
  const [isConfirmingPhoneNumberChange, setIsConfirmingPhoneNumberChange] = useState(false);

  const signedInUserQuery = trpc.auth.me.useQuery(undefined, { enabled, retry: false });
  const createSessionMutation = trpc.auth.createSession.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });
  const confirmPhoneNumberMutation = trpc.auth.confirmPhoneNumber.useMutation({
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

  async function sendOneTimePasscode(phone: string) {
    setOneTimePasscodeError(null);
    setIsSendingOneTimePasscode(true);
    try {
      const { error } = await supabaseBrowserClient.auth.signInWithOtp({
        phone,
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

  async function verifyOneTimePasscode({ phone, passcode }: VerifyOneTimePasscodeParams) {
    setOneTimePasscodeError(null);
    setIsVerifyingOneTimePasscode(true);
    try {
      const { data, error } = await supabaseBrowserClient.auth.verifyOtp({
        phone,
        token: passcode,
        type: "sms",
      });
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

  async function sendMagicLink(email: string) {
    setMagicLinkError(null);
    setIsSendingMagicLink(true);
    try {
      const { error } = await supabaseBrowserClient.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw new Error(error.message);
    } catch (sendError) {
      setMagicLinkError(sendError as Error);
      throw sendError;
    } finally {
      setIsSendingMagicLink(false);
    }
  }

  async function waitForMagicLinkSession(): Promise<Session> {
    const { data: initialData } = await supabaseBrowserClient.auth.getSession();
    if (initialData.session) return initialData.session;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        authStateSubscription.unsubscribe();
        void supabaseBrowserClient.auth.getSession().then(({ data }) => {
          if (data.session) {
            resolve(data.session);
          } else {
            reject(new Error("The sign-in link is wrong or expired."));
          }
        });
      }, MAGIC_LINK_SESSION_WAIT_MS);

      const {
        data: { subscription: authStateSubscription },
      } = supabaseBrowserClient.auth.onAuthStateChange((event, session) => {
        if (session && event !== "SIGNED_OUT") {
          clearTimeout(timeoutId);
          authStateSubscription.unsubscribe();
          resolve(session);
        }
      });
    });
  }

  async function completeMagicLinkSignIn() {
    setMagicLinkError(null);
    setIsCompletingMagicLinkSignIn(true);
    try {
      const session = await waitForMagicLinkSession();
      return await createSessionMutation.mutateAsync({ accessToken: session.access_token });
    } catch (completeError) {
      setMagicLinkError(completeError as Error);
      throw completeError;
    } finally {
      setIsCompletingMagicLinkSignIn(false);
    }
  }

  async function requestPhoneNumberChange(phone: string) {
    setPhoneNumberChangeError(null);
    setIsRequestingPhoneNumberChange(true);
    try {
      const { error } = await supabaseBrowserClient.auth.updateUser({ phone });
      if (error) throw new Error(error.message);
    } catch (requestError) {
      setPhoneNumberChangeError(requestError as Error);
      throw requestError;
    } finally {
      setIsRequestingPhoneNumberChange(false);
    }
  }

  async function confirmPhoneNumberChange({ phone, passcode }: ConfirmPhoneNumberChangeParams) {
    setPhoneNumberChangeError(null);
    setIsConfirmingPhoneNumberChange(true);
    try {
      const { data, error } = await supabaseBrowserClient.auth.verifyOtp({
        phone,
        token: passcode,
        type: "phone_change",
      });
      if (error || !data.session) {
        throw new Error(error?.message ?? "Passcode is wrong or expired.");
      }
      return await confirmPhoneNumberMutation.mutateAsync({
        accessToken: data.session.access_token,
      });
    } catch (confirmError) {
      setPhoneNumberChangeError(confirmError as Error);
      throw confirmError;
    } finally {
      setIsConfirmingPhoneNumberChange(false);
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

    sendMagicLink,
    isSendingMagicLink,
    completeMagicLinkSignIn,
    isCompletingMagicLinkSignIn,
    magicLinkError,

    logout: logoutMutation.mutate,
    logoutAsync: logoutMutation.mutateAsync,
    isLoggingOut: logoutMutation.isPending,
    logoutError: logoutMutation.error ?? null,

    requestPhoneNumberChange,
    isRequestingPhoneNumberChange,
    confirmPhoneNumberChange,
    isConfirmingPhoneNumberChange,
    phoneNumberChangeError,
  };
}

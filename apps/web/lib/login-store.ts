import { create } from "zustand";

interface PasswordLoginState {
  email: string;
  password: string;
  isPasswordVisible: boolean;
  isSubmitting: boolean;
  formError: string | null;
  setEmail: (email: string) => void;
  setPassword: (password: string) => void;
  toggleIsPasswordVisible: () => void;
  setIsSubmitting: (isSubmitting: boolean) => void;
  setFormError: (formError: string | null) => void;
}

export const usePasswordLoginStore = create<PasswordLoginState>((set) => ({
  email: "",
  password: "",
  isPasswordVisible: false,
  isSubmitting: false,
  formError: null,
  setEmail: (email) => set({ email }),
  setPassword: (password) => set({ password }),
  toggleIsPasswordVisible: () => set((state) => ({ isPasswordVisible: !state.isPasswordVisible })),
  setIsSubmitting: (isSubmitting) => set({ isSubmitting }),
  setFormError: (formError) => set({ formError }),
}));

interface OtpLoginState {
  step: "enter-contact" | "enter-passcode";
  contactValue: string;
  passcode: string;
  isSending: boolean;
  isVerifying: boolean;
  formError: string | null;
  cooldownSeconds: number;
  setContactValue: (contactValue: string) => void;
  setPasscode: (passcode: string) => void;
  setIsSending: (isSending: boolean) => void;
  setIsVerifying: (isVerifying: boolean) => void;
  setFormError: (formError: string | null) => void;
  setCooldownSeconds: (secondsLeft: number | ((secondsLeft: number) => number)) => void;
  goToPasscodeStep: () => void;
  goToContactStep: () => void;
}

export function createOtpLoginStore() {
  return create<OtpLoginState>((set) => ({
    step: "enter-contact",
    contactValue: "",
    passcode: "",
    isSending: false,
    isVerifying: false,
    formError: null,
    cooldownSeconds: 0,
    setContactValue: (contactValue) => set({ contactValue }),
    setPasscode: (passcode) => set({ passcode }),
    setIsSending: (isSending) => set({ isSending }),
    setIsVerifying: (isVerifying) => set({ isVerifying }),
    setFormError: (formError) => set({ formError }),
    setCooldownSeconds: (secondsLeft) =>
      set((state) => ({
        cooldownSeconds:
          typeof secondsLeft === "function" ? secondsLeft(state.cooldownSeconds) : secondsLeft,
      })),
    goToPasscodeStep: () => set({ step: "enter-passcode" }),
    goToContactStep: () => set({ step: "enter-contact", passcode: "", formError: null }),
  }));
}

interface MagicLinkLoginState {
  step: "enter-email" | "link-sent";
  email: string;
  isSending: boolean;
  formError: string | null;
  cooldownSeconds: number;
  setEmail: (email: string) => void;
  setIsSending: (isSending: boolean) => void;
  setFormError: (formError: string | null) => void;
  setCooldownSeconds: (secondsLeft: number | ((secondsLeft: number) => number)) => void;
  goToLinkSentStep: () => void;
  goToEmailStep: () => void;
}

export const useMagicLinkLoginStore = create<MagicLinkLoginState>((set) => ({
  step: "enter-email",
  email: "",
  isSending: false,
  formError: null,
  cooldownSeconds: 0,
  setEmail: (email) => set({ email }),
  setIsSending: (isSending) => set({ isSending }),
  setFormError: (formError) => set({ formError }),
  setCooldownSeconds: (secondsLeft) =>
    set((state) => ({
      cooldownSeconds:
        typeof secondsLeft === "function" ? secondsLeft(state.cooldownSeconds) : secondsLeft,
    })),
  goToLinkSentStep: () => set({ step: "link-sent" }),
  goToEmailStep: () => set({ step: "enter-email", formError: null }),
}));
